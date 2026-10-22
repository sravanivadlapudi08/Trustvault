import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Return all users with safe public fields
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch users: ' + error.message },
      { status: 500 }
    );
  }
}
