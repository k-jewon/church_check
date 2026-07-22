import type { Context, Next } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { config } from '../config.js';
import { verifyPassword } from '../util/password.js';

export type Role = 'input' | 'admin';
const COOKIE_NAME = 'session';

// admin implicitly satisfies input-level access.
function satisfies(role: Role, required: Role): boolean {
  if (required === 'input') return role === 'input' || role === 'admin';
  return role === 'admin';
}

export async function currentRole(c: Context): Promise<Role | null> {
  const value = await getSignedCookie(c, config.cookieSecret, COOKIE_NAME);
  if (value === 'input' || value === 'admin') return value;
  return null;
}

// Guard factory: redirects to /login when the session role is insufficient.
export function requireRole(required: Role) {
  return async (c: Context, next: Next) => {
    const role = await currentRole(c);
    if (!role || !satisfies(role, required)) {
      return c.redirect(`/login?next=${encodeURIComponent(c.req.path)}`);
    }
    await next();
  };
}

// Returns the role a password unlocks, or null. Admin password is checked first.
export function roleForPassword(password: string): Role | null {
  if (config.adminPasswordHash && verifyPassword(password, config.adminPasswordHash)) {
    return 'admin';
  }
  if (config.inputPasswordHash && verifyPassword(password, config.inputPasswordHash)) {
    return 'input';
  }
  return null;
}

export async function startSession(c: Context, role: Role): Promise<void> {
  await setSignedCookie(c, COOKIE_NAME, role, config.cookieSecret, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h — covers a Sunday session
  });
}

export function endSession(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}
