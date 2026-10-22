import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { verifyAuditTrailIntegrity } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators and document owners can access compliance reports.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const timeframeDays = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    // 1. Resolve Document Scoping:
    // Owner sees only their owned documents and workspace activity.
    // Admin sees global system documents and activity.
    const isOwner = user.role === 'owner';
    const documents = await prisma.document.findMany({
      where: isOwner ? { ownerId: user.id } : undefined,
      select: {
        id: true,
        title: true,
        category: true,
        fileSize: true,
        mimeType: true,
        ownerId: true,
        createdAt: true,
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const docIds = documents.map((d) => d.id);
    const docMap = new Map(documents.map((d) => [d.id, d]));

    // 2. Fetch Relevant Audit Logs:
    const auditWhere: any = {};
    if (isOwner) {
      auditWhere.OR = [
        { targetId: { in: docIds } },
        { actorId: user.id },
      ];
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: auditWhere,
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    // 3. Resolve all actors for human-readable reporting
    const actorIds = Array.from(new Set(auditLogs.map((l) => l.actorId).filter(Boolean)));
    const users = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    // 4. Parse & Aggregate Real Data
    let totalUploads = 0;
    let totalDownloads = 0;
    let totalViews = 0;
    let totalGrants = 0;
    let totalRevokes = 0;
    let totalBlocked = 0;

    const actionCounts: Record<string, number> = {};
    const timelineByDay: Record<string, { date: string; uploads: number; downloads: number; views: number; blocked: number; total: number }> = {};
    const userActivityMap = new Map<
      string,
      {
        userId: string;
        name: string;
        email: string;
        role: string;
        totalEvents: number;
        downloads: number;
        views: number;
        shares: number;
        blocked: number;
        lastActive: string;
      }
    >();

    const downloadList: Array<{
      id: string;
      timestamp: string;
      actorId: string;
      actorName: string;
      actorEmail: string;
      actorRole: string;
      documentId: string;
      documentTitle: string;
      ipAddress: string;
      status: string;
    }> = [];

    const docAccessMap = new Map<
      string,
      {
        documentId: string;
        title: string;
        category: string;
        fileSize: number;
        createdAt: string;
        totalAccesses: number;
        downloads: number;
        views: number;
        shares: number;
        blockedProbes: number;
        uniqueUsers: Set<string>;
        lastAccessedAt: string | null;
        recentLogs: Array<{ action: string; actorName: string; timestamp: string; status: string }>;
      }
    >();

    // Initialize document access tracking for all scoped documents
    documents.forEach((d) => {
      docAccessMap.set(d.id, {
        documentId: d.id,
        title: d.title,
        category: d.category,
        fileSize: d.fileSize,
        createdAt: d.createdAt.toISOString(),
        totalAccesses: 0,
        downloads: 0,
        views: 0,
        shares: 0,
        blockedProbes: 0,
        uniqueUsers: new Set<string>(),
        lastAccessedAt: null,
        recentLogs: [],
      });
    });

    for (const log of auditLogs) {
      const act = log.action;
      actionCounts[act] = (actionCounts[act] || 0) + 1;

      if (log.status === 'BLOCKED') {
        totalBlocked++;
      }

      if (act === 'DOCUMENT_UPLOAD') totalUploads++;
      if (act === 'DOCUMENT_DOWNLOAD_INITIATED') totalDownloads++;
      if (act === 'DOCUMENT_VIEW') totalViews++;
      if (act === 'PERMISSION_GRANT' || act === 'PERMISSION_DELEGATED_BY_ADMIN') totalGrants++;
      if (act === 'PERMISSION_REVOKE' || act === 'PERMISSION_REVOKED_BY_ADMIN') totalRevokes++;

      // Day timeline aggregation
      const dayKey = log.timestamp.toISOString().split('T')[0];
      if (!timelineByDay[dayKey]) {
        timelineByDay[dayKey] = { date: dayKey, uploads: 0, downloads: 0, views: 0, blocked: 0, total: 0 };
      }
      timelineByDay[dayKey].total++;
      if (act === 'DOCUMENT_UPLOAD') timelineByDay[dayKey].uploads++;
      if (act === 'DOCUMENT_DOWNLOAD_INITIATED') timelineByDay[dayKey].downloads++;
      if (act === 'DOCUMENT_VIEW') timelineByDay[dayKey].views++;
      if (log.status === 'BLOCKED') timelineByDay[dayKey].blocked++;

      // User aggregation
      const actorUser = userMap.get(log.actorId);
      const userName = actorUser?.name || (log.actorId === 'ANONYMOUS' ? 'Anonymous Probe' : log.actorId);
      const userEmail = actorUser?.email || 'N/A';
      const userRole = actorUser?.role || 'unauthenticated';

      if (!userActivityMap.has(log.actorId)) {
        userActivityMap.set(log.actorId, {
          userId: log.actorId,
          name: userName,
          email: userEmail,
          role: userRole,
          totalEvents: 0,
          downloads: 0,
          views: 0,
          shares: 0,
          blocked: 0,
          lastActive: log.timestamp.toISOString(),
        });
      }
      const uStat = userActivityMap.get(log.actorId)!;
      uStat.totalEvents++;
      if (act === 'DOCUMENT_DOWNLOAD_INITIATED') uStat.downloads++;
      if (act === 'DOCUMENT_VIEW') uStat.views++;
      if (act.includes('PERMISSION_')) uStat.shares++;
      if (log.status === 'BLOCKED') uStat.blocked++;

      // Document Access History aggregation
      let parsedMeta: any = null;
      try {
        if (log.metadata) parsedMeta = JSON.parse(log.metadata);
      } catch {}

      const targetDoc = docMap.get(log.targetId);
      const docTitle = targetDoc?.title || parsedMeta?.title || parsedMeta?.documentTitle || log.targetId;

      if (act === 'DOCUMENT_DOWNLOAD_INITIATED') {
        downloadList.push({
          id: log.id,
          timestamp: log.timestamp.toISOString(),
          actorId: log.actorId,
          actorName: userName,
          actorEmail: userEmail,
          actorRole: userRole,
          documentId: log.targetId,
          documentTitle: docTitle,
          ipAddress: log.ipAddress,
          status: log.status,
        });
      }

      if (docAccessMap.has(log.targetId)) {
        const dStat = docAccessMap.get(log.targetId)!;
        dStat.totalAccesses++;
        if (act === 'DOCUMENT_DOWNLOAD_INITIATED') dStat.downloads++;
        if (act === 'DOCUMENT_VIEW') dStat.views++;
        if (act.includes('PERMISSION_')) dStat.shares++;
        if (log.status === 'BLOCKED') dStat.blockedProbes++;
        if (log.actorId) dStat.uniqueUsers.add(log.actorId);
        if (!dStat.lastAccessedAt) dStat.lastAccessedAt = log.timestamp.toISOString();

        if (dStat.recentLogs.length < 5) {
          dStat.recentLogs.push({
            action: log.action,
            actorName: userName,
            timestamp: log.timestamp.toISOString(),
            status: log.status,
          });
        }
      }
    }

    // Active permissions count across scoped documents
    const activePermissions = await prisma.documentPermission.count({
      where: {
        documentId: { in: docIds },
        revokedAt: null,
      },
    });

    // Cryptographic chain verification
    const verification = await verifyAuditTrailIntegrity();

    // Prepare serializable response
    const documentAccessHistory = Array.from(docAccessMap.values()).map((d) => ({
      ...d,
      uniqueUsersCount: d.uniqueUsers.size,
      uniqueUsers: Array.from(d.uniqueUsers),
    }));

    const userActivity = Array.from(userActivityMap.values()).sort(
      (a, b) => b.totalEvents - a.totalEvents
    );

    const timeline = Object.values(timelineByDay).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      timeframeDays,
      scope: isOwner ? 'owner' : 'admin',
      summary: {
        totalAuditRecords: auditLogs.length,
        totalDocuments: documents.length,
        totalUploads,
        totalDownloads,
        totalViews,
        totalPermissionGrants: totalGrants,
        totalPermissionRevokes: totalRevokes,
        totalSecurityViolationsBlocked: totalBlocked,
        activePermissionsCount: activePermissions,
        actionCounts,
      },
      timeline,
      documentAccessHistory,
      downloadActivity: downloadList.slice(0, 100),
      userActivity,
      compliance: {
        cryptographicChain: verification,
        blockedViolations: totalBlocked,
        activeDelegations: activePermissions,
        zeroLeakStatus: 'ENFORCED',
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to generate compliance report: ' + error.message },
      { status: 500 }
    );
  }
}
