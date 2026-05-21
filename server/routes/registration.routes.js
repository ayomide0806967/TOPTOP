import { Hono } from 'hono';
import { getSessionContext, requireSession } from '../auth/requireSession.js';
import {
  claimMigratedAccount,
  createPendingRegistration,
  getRegistrationStatus,
} from '../modules/registration/registration.service.js';
import {
  claimMigratedAccountSchema,
  createPendingRegistrationSchema,
} from '../modules/registration/registration.schemas.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';

export const registrationRoutes = new Hono();

registrationRoutes.post('/registration/pending', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = createPendingRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    throw badRequest('Invalid registration request.', parsed.error.flatten());
  }

  const result = await createPendingRegistration(
    parsed.data,
    c.req.raw.headers
  );
  return c.json(result);
});

registrationRoutes.post('/registration/claim-migrated-account', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = claimMigratedAccountSchema.safeParse(body);

  if (!parsed.success) {
    throw badRequest(
      'Invalid account recovery request.',
      parsed.error.flatten()
    );
  }

  const result = await claimMigratedAccount(parsed.data);
  return c.json(result);
});

registrationRoutes.get('/registration/status', requireSession, async (c) => {
  const userId = c.req.query('userId');
  if (!userId) {
    throw badRequest('userId is required.');
  }

  const authContext = c.get('auth') || (await getSessionContext(c));
  const isAdmin = authContext.profile?.role === 'admin';
  if (!isAdmin && userId !== authContext.user.id) {
    throw forbidden('You can only check your own registration status.');
  }

  const status = await getRegistrationStatus(userId);
  if (!status) {
    throw notFound('Registration profile was not found.');
  }

  return c.json(status);
});
