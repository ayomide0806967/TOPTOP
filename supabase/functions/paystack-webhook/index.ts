import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import {
  upsertPaymentAndSubscription,
  verifyPaystackSignature,
  getServiceClient,
} from '../_shared/paystack.ts';
import { getPaystackForwardUrl } from '../_shared/paystackConfig.ts';

const PAYSTACK_FORWARD_URL = getPaystackForwardUrl();

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
    const seatUpgradeId = metadata.seat_upgrade_id as string | undefined;
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

    if (seatUpgradeId && reference) {
      const admin = getServiceClient();
      try {
        const { data: existing, error: existingError } = await admin
          .from('quiz_seat_transactions')
          .select('id, metadata, seat_subscription_id, additional_seats')
          .eq('id', seatUpgradeId)
          .single();

        if (existingError || !existing) {
          console.error('[Paystack webhook] Seat transaction not found', existingError);
        }

        const { data: transaction, error: txnError } = await admin
          .from('quiz_seat_transactions')
          .update({
            status: 'paid',
            paystack_reference: reference,
            metadata: {
              ...(existing?.metadata ?? {}),
              ...(metadata || {}),
              paystack_payload: data,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', seatUpgradeId)
          .select('*')
          .single();

        if (txnError || !transaction) {
          console.error('[Paystack webhook] Failed to update seat transaction', txnError);
        } else {
          const additionalSeats = Number(
            transaction.additional_seats ??
              existing?.additional_seats ??
              metadata.additional_seats ??
              0
          );
          if (additionalSeats > 0) {
            const { error: creditError } = await admin.rpc('apply_quiz_seat_credit', {
              p_subscription_id: transaction.seat_subscription_id,
              p_additional: additionalSeats,
            });
            if (creditError) {
              console.error('[Paystack webhook] Failed to credit seats', creditError);
            }
          }
        }
      } catch (error) {
        console.error('[Paystack webhook] Seat upgrade handling failed', error);
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
