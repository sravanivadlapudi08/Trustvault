import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { verifyAuditTrailIntegrity } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators and document owners can verify cryptographic audit compliance.' },
        { status: 403 }
      );
    }

    const verification = await verifyAuditTrailIntegrity();

    return NextResponse.json({
      success: true,
      verification,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error during cryptographic verification: ' + error.message },
      { status: 500 }
    );
  }
}

// Allow GET for quick inspection if authenticated
export async function GET(req: NextRequest) {
  return POST(req);
}
