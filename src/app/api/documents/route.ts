import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const ownerId = searchParams.get('ownerId')?.trim() || '';
    const startDate = searchParams.get('startDate')?.trim();
    const endDate = searchParams.get('endDate')?.trim();

    // Build base filter conditions
    const whereConditions: any = {};

    if (search) {
      whereConditions.title = { contains: search };
    }

    if (category && category !== 'All') {
      whereConditions.category = category;
    }

    if (ownerId) {
      whereConditions.ownerId = ownerId;
    }

    if (startDate || endDate) {
      whereConditions.createdAt = {};
      if (startDate) {
        whereConditions.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        whereConditions.createdAt.lte = new Date(endDate);
      }
    }

    // Owner-Controlled Zero-Trust Boundary:
    // 1. Owners see documents they own PLUS any explicitly granted to them by another owner.
    // 2. Admins and Viewers ONLY see documents explicitly granted to them by the Document Owner.
    //    Admins have NO automatic visibility into unpermitted documents.
    if (user.role === 'owner') {
      whereConditions.OR = [
        { ownerId: user.id },
        {
          permissions: {
            some: {
              userId: user.id,
              canRead: true,
              revokedAt: null,
            },
          },
        },
      ];
    } else {
      // Both Admins and Viewers must have an active, non-revoked permission row
      whereConditions.permissions = {
        some: {
          userId: user.id,
          canRead: true,
          revokedAt: null,
        },
      };
    }

    const documents = await prisma.document.findMany({
      where: whereConditions,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: { id: true, email: true, name: true, role: true },
        },
        permissions: {
          where: {
            revokedAt: null,
          },
          select: {
            id: true,
            userId: true,
            canRead: true,
            canDownload: true,
            canEdit: true,
            canShare: true,
            grantedBy: true,
            createdAt: true,
            user: {
              select: { id: true, email: true, name: true, role: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ documents });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error fetching documents: ' + error.message },
      { status: 500 }
    );
  }
}
