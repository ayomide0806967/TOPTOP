import { auth } from './betterAuth.js';
import { getProfileForUser } from '../modules/profiles/profiles.service.js';
import { forbidden, unauthorized } from '../utils/httpError.js';

export async function getSessionContext(c) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session?.user) {
    return null;
  }

  const profile = await getProfileForUser(session.user.id);

  return {
    session: session.session,
    user: session.user,
    profile,
  };
}

export async function requireSession(c, next) {
  const context = await getSessionContext(c);
  if (!context) {
    throw unauthorized();
  }
  c.set('auth', context);
  await next();
}

export async function requireAdmin(c, next) {
  const context = c.get('auth') || (await getSessionContext(c));
  if (!context) {
    throw unauthorized();
  }
  if (context.profile?.role !== 'admin') {
    throw forbidden('Admin access required.');
  }
  c.set('auth', context);
  await next();
}
