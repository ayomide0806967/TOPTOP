import { Hono } from 'hono';
import { badRequest } from '../utils/httpError.js';
import {
  checkUserAvailability,
  lookupUsername,
} from '../modules/users/users.service.js';
import {
  userAvailabilitySchema,
  usernameLookupSchema,
} from '../modules/users/users.schemas.js';

export const usersRoutes = new Hono();

function parseLookupInput(input) {
  const parsed = usernameLookupSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest(
      'Invalid username lookup request.',
      parsed.error.flatten()
    );
  }
  return parsed.data;
}

usersRoutes.get('/users/lookup-username', async (c) => {
  const input = parseLookupInput({
    username: c.req.query('username') || '',
  });

  const result = await lookupUsername(input.username);
  return c.json(result);
});

usersRoutes.post('/users/lookup-username', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = parseLookupInput(body);

  const result = await lookupUsername(input.username);
  return c.json(result);
});

usersRoutes.get('/users/availability', async (c) => {
  const parsed = userAvailabilitySchema.safeParse({
    username: c.req.query('username') || undefined,
    email: c.req.query('email') || undefined,
    phone: c.req.query('phone') || undefined,
    allowedProfileId: c.req.query('allowedProfileId') || undefined,
  });
  if (!parsed.success) {
    throw badRequest(
      'Invalid availability lookup request.',
      parsed.error.flatten()
    );
  }

  return c.json(await checkUserAvailability(parsed.data));
});
