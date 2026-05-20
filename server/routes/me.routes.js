import { Hono } from 'hono';
import { requireSession } from '../auth/requireSession.js';
import { updateProfileById } from '../modules/profiles/profiles.repo.js';
import { badRequest } from '../utils/httpError.js';

export const meRoutes = new Hono();

meRoutes.get('/me', requireSession, async (c) => {
  const context = c.get('auth');

  return c.json({
    user: {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      emailVerified: context.user.emailVerified,
      image: context.user.image,
    },
    profile: context.profile,
  });
});

meRoutes.patch('/me/profile', requireSession, async (c) => {
  const context = c.get('auth');
  const body = await c.req.json().catch(() => ({}));
  const fullName = String(body.fullName || body.full_name || '').trim();
  const schoolName = String(body.schoolName || body.school_name || '').trim();

  if (!fullName) {
    throw badRequest('Full name is required.');
  }

  const [firstName, ...rest] = fullName.split(/\s+/);
  const profile = await updateProfileById(context.user.id, {
    full_name: fullName,
    first_name: firstName || null,
    last_name: rest.join(' ').trim() || null,
    school_name: schoolName || null,
  });

  return c.json({ profile });
});
