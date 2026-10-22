import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, createSessionToken, SESSION_COOKIE_NAME, SessionUser } from '@/lib/auth';
import { createAuditLogEntry } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Log failed authentication attempt
      await createAuditLogEntry({
        actorId: 'ANONYMOUS',
        action: 'AUTH_LOGIN_FAILURE',
        targetId: normalizedEmail,
        ipAddress: ip,
        status: 'BLOCKED',
        metadata: { reason: 'User not found', attemptedEmail: normalizedEmail },
      });

      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      // Log failed authentication attempt with bad credentials
      await createAuditLogEntry({
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILURE',
        targetId: user.id,
        ipAddress: ip,
        status: 'BLOCKED',
        metadata: { reason: 'Password mismatch', email: user.email },
      });

      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const sessionPayload: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
    };

    const token = await createSessionToken(sessionPayload);

    // Record successful login in immutable audit trail
    await createAuditLogEntry({
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      targetId: user.id,
      ipAddress: ip,
      status: 'SUCCESS',
      metadata: { role: user.role, email: user.email },
    });

    const response = NextResponse.json({
      success: true,
      user: sessionPayload,
    });

    // Set secure HttpOnly session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error during authentication: ' + error.message },
      { status: 500 }
    );
  }
}
