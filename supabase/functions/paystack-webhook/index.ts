import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import {
  upsertPaymentAndSubscription,
  verifyPaystackSignature,
} from '../_shared/paystack.ts';

const PAYSTACK_FORWARD_URL =
  Deno.env.get('PAYSTACK_FORWARD_URL') ??
  Deno.env.get('PAYSTACK_WEBHOOK_FORWARD_URL');

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const signature = req.headers.get('x-paystack-signature');
  const body = await req.text();

  const valid = await verifyPaystackSignature(body, signature);
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch (_error) {
    return new Response('Invalid JSON payload', { status: 400 });
  }

  const event = (payload?.event as string) || '';
  const data = payload?.data ?? {};

  if (event === 'charge.success') {
    const metadata = data.metadata ?? {};
    const userId = metadata.user_id as string | undefined;
    const planId = metadata.plan_id as string | undefined;
    const reference =
      (data.reference as string) ||
      metadata.reference ||
      payload?.data?.reference;
    const amountKobo = Number(data.amount ?? 0);
    const currency = (data.currency as string) || 'NGN';
    const paidAt = (data.paid_at as string) || new Date().toISOString();

    if (userId && planId && reference) {
      try {
        await upsertPaymentAndSubscription({
          userId,
          planId,
          reference,
          status: 'success',
          amountKobo,
          currency,
          paidAt,
          metadata,
          rawResponse: data,
        });
      } catch (error) {
        console.error(
          '[Paystack webhook] Failed to upsert subscription',
          error
        );
        return new Response('Failed to record transaction', { status: 500 });
      }
    }
  }

  if (PAYSTACK_FORWARD_URL) {
    try {
      await fetch(PAYSTACK_FORWARD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch (error) {
      console.warn('[Paystack webhook] Forward failed', error);
    }
  }

  return new Response('ok', { status: 200 });
});
