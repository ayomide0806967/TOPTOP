import { Hono } from 'hono';
import { getSessionContext, requireSession } from '../auth/requireSession.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import {
  initiatePaystackPayment,
  processPaystackWebhook,
  reconcilePaystackPayments,
  verifyAndActivatePaystackPayment,
} from '../modules/payments/payments.service.js';
import {
  initiatePaystackSchema,
  reconcilePaymentsSchema,
  verifyPaystackSchema,
} from '../modules/payments/payments.schemas.js';

export const paymentsRoutes = new Hono();

function parseBody(schema, body, message) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(message, parsed.error.flatten());
  }
  return parsed.data;
}

paymentsRoutes.post(
  '/payments/paystack/initiate',
  requireSession,
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const input = parseBody(
      initiatePaystackSchema,
      body,
      'Invalid Paystack initiation request.'
    );

    const authContext = c.get('auth') || (await getSessionContext(c));
    const isAdmin = authContext.profile?.role === 'admin';
    if (!isAdmin && input.userId !== authContext.user.id) {
      throw forbidden('You can only initiate payment for your own account.');
    }

    return c.json(await initiatePaystackPayment(input));
  }
);

paymentsRoutes.post('/payments/paystack/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = parseBody(
    verifyPaystackSchema,
    body,
    'Invalid Paystack verification request.'
  );
  return c.json(await verifyAndActivatePaystackPayment(input.reference));
});

paymentsRoutes.post('/webhooks/paystack', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-paystack-signature') || null;
  const result = await processPaystackWebhook(rawBody, signature);
  return c.json(result);
});

paymentsRoutes.post('/jobs/reconcile-payments', requireSession, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = parseBody(
    reconcilePaymentsSchema,
    body,
    'Invalid payment reconciliation request.'
  );

  const authContext = c.get('auth') || (await getSessionContext(c));
  const requestedUserId = input.userId || authContext.user.id;
  const isAdmin = authContext.profile?.role === 'admin';

  if (!isAdmin && requestedUserId !== authContext.user.id) {
    throw forbidden('You can only reconcile your own payment status.');
  }

  return c.json(await reconcilePaystackPayments(requestedUserId));
});
