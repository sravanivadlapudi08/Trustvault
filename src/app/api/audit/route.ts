import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Role-Based Access Control:
    // Only Administrators and Document Owners are authorized to inspect audit logs.
    // Ordinary viewers are strictly denied (403 Forbidden).
    if (user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators and document owners can inspect audit trails.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    const filterConditions: any = {};
    if (action && action !== 'ALL') {
      filterConditions.action = action;
    }
    if (status && status !== 'ALL') {
      filterConditions.status = status;
    }
    if (search) {
      filterConditions.OR = [
        { actorId: { contains: search } },
        { targetId: { contains: search } },
        { metadata: { contains: search } },
      ];
    }

    // Scoping Rule:
    // - Admin: Full visibility into the system audit trail.
    // - Owner: Strictly scoped to their own workspace and documents.
    //   An Owner sees events targeting their owned documents, OR actions performed by themselves.
    //   Private documents and audit records of other Owners are strictly isolated.
    let where: any;
    if (user.role === 'owner') {
      const ownedDocs = await prisma.document.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      });
      const ownedDocIds = ownedDocs.map((d) => d.id);

      const ownerScope = {
        OR: [
          { targetId: { in: ownedDocIds } },
          { actorId: user.id },
        ],
      };

      where = {
        AND: [ownerScope, filterConditions],
      };
    } else {
      where = filterConditions;
    }

    const rawLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Enrich logs with user details and document names for human-readable audit reporting
    const actorIds = Array.from(new Set(rawLogs.map((l) => l.actorId).filter(Boolean)));
    const targetIds = Array.from(new Set(rawLogs.map((l) => l.targetId).filter(Boolean)));

    const [actors, documents] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true, role: true },
      }),
      prisma.document.findMany({
        where: { id: { in: targetIds } },
        select: { id: true, title: true, category: true, ownerId: true },
      }),
    ]);

    const actorMap = new Map(actors.map((a) => [a.id, a]));
    const documentMap = new Map(documents.map((d) => [d.id, d]));

    const enrichedLogs = rawLogs.map((log) => {
      let parsedMeta: Record<string, any> | null = null;
      try {
        if (log.metadata) {
          parsedMeta = JSON.parse(log.metadata);
        }
      } catch {
        parsedMeta = null;
      }

      const doc = documentMap.get(log.targetId);
      const actor = actorMap.get(log.actorId);

      const documentTitle =
        doc?.title ||
        parsedMeta?.title ||
        parsedMeta?.documentTitle ||
        (log.targetId.startsWith('doc_') || log.targetId.startsWith('doc-') ? log.targetId : null);

      return {
        ...log,
        actorUser: actor
          ? { id: actor.id, name: actor.name, email: actor.email, role: actor.role }
          : null,
        document: doc
          ? { id: doc.id, title: doc.title, category: doc.category, ownerId: doc.ownerId }
          : null,
        documentTitle: documentTitle || 'System Resource / Auth',
        parsedMetadata: parsedMeta,
      };
    });

    return NextResponse.json({ logs: enrichedLogs, total: enrichedLogs.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve audit trail: ' + error.message },
      { status: 500 }
    );
  }
}
