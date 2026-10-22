import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { createAuditLogEntry } from './audit';

export type UserRole = 'admin' | 'owner' | 'viewer';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'trustvault-ultra-secure-default-development-secret-key-32chars!';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);
export const SESSION_COOKIE_NAME = 'trustvault_session';

/**
 * Hashes plaintext password using strong salted bcrypt hashing.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Validates candidate password against stored hash using constant-time comparison.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Signs a JWT session token for the authenticated user.
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  return new jose.SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT session token and returns decoded claims.
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });

    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the current session from incoming request cookies or next/headers.
 */
export async function getSessionUser(req?: any): Promise<SessionUser | null> {
  try {
    // 1. Check from passed request if available (for route handlers and tests)
    if (req?.cookies?.get) {
      const cookie = req.cookies.get(SESSION_COOKIE_NAME);
      if (cookie?.value) {
        return verifySessionToken(cookie.value);
      }
    }

    // Check header cookie string if present
    if (req?.headers?.get) {
      const cookieHeader = req.headers.get('cookie') || req.headers.get('Cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
        if (match && match[1]) {
          return verifySessionToken(decodeURIComponent(match[1]));
        }
      }
    }

    // 2. Check from next/headers cookies()
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) {
      return null;
    }
    return verifySessionToken(sessionCookie.value);
  } catch {
    return null;
  }
}

/**
 * Guard that enforces an active, verified session. Throws 401 if unauthenticated.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new SecurityException('Authentication required to access this resource.', 401);
  }
  return user;
}

/**
 * Guard that enforces specific role permissions. Logs violation and throws 403 if unauthorized.
 */
export async function requireRole(allowedRoles: UserRole[], actionContext: string = 'RBAC_ACCESS'): Promise<SessionUser> {
  const user = await requireAuth();

  if (!allowedRoles.includes(user.role)) {
    // Record security violation to immutable audit trail
    await createAuditLogEntry({
      actorId: user.id,
      action: 'ROLE_AUTHORIZATION_VIOLATION',
      targetId: actionContext,
      status: 'BLOCKED',
      metadata: {
        attemptedRole: user.role,
        requiredRoles: allowedRoles,
        context: actionContext,
      },
    });

    throw new SecurityException(
      `Forbidden: Your role (${user.role}) is not authorized for this operation. Required: ${allowedRoles.join(', ')}.`,
      403
    );
  }

  return user;
}

export class SecurityException extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'SecurityException';
    this.statusCode = statusCode;
  }
}
