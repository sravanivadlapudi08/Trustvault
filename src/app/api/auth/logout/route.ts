import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/lib/auth';
import { createAuditLogEntry } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const user = await getSessionUser(req);

  if (user) {
    await createAuditLogEntry({
      actorId: user.id,
      action: 'AUTH_LOGOUT',
      targetId: user.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: { email: user.email },
    });
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
