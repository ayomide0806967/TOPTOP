import { createHmac, timingSafeEqual } from 'node:crypto';
import { withTransaction } from '../../db/tx.js';
import { badRequest, HttpError, notFound } from '../../utils/httpError.js';
import {
  requirePaystackPublicKey,
  requirePaystackSecretKey,
} from './paystack.config.js';
import { verifyPaystackTransaction } from './paystack.client.js';
import {
  clearPendingCheckout,
  findLatestActiveSubscription,
  findPaymentTransactionByReference,
  findPendingPaymentTargets,
  findPlanForPayment,
  findProfileForPayment,
  findSubscriptionByPaymentTransaction,
  insertSubscription,
  linkTransactionToSubscription,
  refreshProfileSubscriptionStatus,
  resolvePendingPaymentByReference,
  updateDefaultSubscription,
  updateExistingSubscription,
  updateProfilePendingCheckout,
  upsertPendingTransaction,
  upsertSuccessfulTransaction,
} from './payments.repo.js';

function generateReference(userId) {
  return `CBT_${String(userId).slice(0, 8)}_${Date.now()}`;
}

function computeExpiryDate(durationDays, startsAt) {
  if (!durationDays || Number(durationDays) <= 0) return null;
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(durationDays));
  return date.toISOString();
}

function normalizePaystackPayment(data, fallback = {}) {
  const metadata = data?.metadata || {};
  return {
    reference: data?.reference || fallback.reference,
    status: String(data?.status || fallback.status || '').toLowerCase(),
    amountKobo: Number(data?.amount || 0),
    currency: data?.currency || fallback.currency || 'NGN',
    paidAt:
      data?.paid_at ||
      data?.paidAt ||
      fallback.paidAt ||
      new Date().toISOString(),
    metadata,
    userId: metadata.user_id || fallback.userId,
    planId: metadata.plan_id || fallback.planId,
    rawResponse: data || {},
  };
}

async function resolveUserAndPlan(payment, client) {
  if (payment.userId && payment.planId) {
    return { userId: payment.userId, planId: payment.planId };
  }

  const resolved = await resolvePendingPaymentByReference(
    payment.reference,
    client
  );
  return {
    userId: payment.userId || resolved.userId,
    planId: payment.planId || resolved.planId,
  };
}

function verifyAmount(plan, amountKobo) {
  const expectedAmountKobo = Math.round(Number(plan.price || 0) * 100);
  if (!expectedAmountKobo || expectedAmountKobo <= 0) {
    throw badRequest('Plan has invalid price.');
  }
  if (expectedAmountKobo !== amountKobo) {
    throw badRequest('Payment amount does not match the plan price.');
  }
}

async function ensureDefaultSubscriptionIsUseful(
  userId,
  subscriptionId,
  client
) {
  await updateDefaultSubscription(userId, subscriptionId, client);
}

export async function initiatePaystackPayment(input) {
  const publicKey = requirePaystackPublicKey();

  return withTransaction(async (client) => {
    const [plan, profile] = await Promise.all([
      findPlanForPayment(input.planId, client),
      findProfileForPayment(input.userId, client),
    ]);

    if (!plan) throw notFound('Subscription plan not found.');
    if (!profile) throw notFound('User profile not found.');
    if (!profile.email) throw badRequest('User profile has no email address.');

    const amountKobo = Math.round(Number(plan.price || 0) * 100);
    if (!amountKobo || amountKobo <= 0) {
      throw badRequest('Plan has invalid price.');
    }

    const reference = generateReference(input.userId);
    const fullName =
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    const metadata = {
      user_id: input.userId,
      plan_id: plan.id,
      plan_name: plan.name || plan.metadata?.name || 'CBT Practice',
      custom_fields: [
        {
          display_name: 'Plan',
          variable_name: 'plan_name',
          value: plan.name || plan.metadata?.name || 'CBT Practice',
        },
        {
          display_name: 'Full Name',
          variable_name: 'full_name',
          value: fullName,
        },
      ],
    };

    await upsertPendingTransaction(
      {
        userId: input.userId,
        planId: plan.id,
        reference,
        amount: Number(amountKobo / 100),
        currency: plan.currency || 'NGN',
        metadata,
      },
      client
    );
    await updateProfilePendingCheckout(
      { userId: input.userId, planId: plan.id, reference },
      client
    );

    return {
      publicKey,
      email: profile.email,
      amount: amountKobo,
      currency: plan.currency || 'NGN',
      reference,
      metadata,
    };
  });
}

export async function activateSuccessfulPaystackPayment(paymentInput) {
  return withTransaction(async (client) => {
    const existingTransaction = await findPaymentTransactionByReference(
      paymentInput.reference,
      client
    );

    if (existingTransaction?.subscription_id) {
      await ensureDefaultSubscriptionIsUseful(
        existingTransaction.user_id,
        existingTransaction.subscription_id,
        client
      );
      await refreshProfileSubscriptionStatus(
        existingTransaction.user_id,
        client
      );
      await clearPendingCheckout(existingTransaction.user_id, client);
      return {
        subscriptionId: existingTransaction.subscription_id,
        transactionId: existingTransaction.id,
      };
    }

    if (paymentInput.status !== 'success') {
      throw new HttpError(
        202,
        'PAYMENT_NOT_SUCCESSFUL',
        'Transaction is not successful yet.'
      );
    }

    const { userId, planId } = await resolveUserAndPlan(paymentInput, client);
    if (!userId)
      throw badRequest('Transaction metadata missing user information.');
    if (!planId)
      throw badRequest(
        'Transaction metadata missing subscription plan information.'
      );

    const plan = await findPlanForPayment(planId, client);
    if (!plan) throw notFound('Subscription plan not found.');

    verifyAmount(plan, paymentInput.amountKobo);
    const amount = Number(paymentInput.amountKobo / 100);
    const currency = paymentInput.currency || plan.currency || 'NGN';

    const transaction = await upsertSuccessfulTransaction(
      {
        userId,
        planId,
        reference: paymentInput.reference,
        amount,
        currency,
        paidAt: paymentInput.paidAt,
        metadata: paymentInput.metadata,
        rawResponse: paymentInput.rawResponse,
      },
      client
    );

    if (transaction.subscription_id) {
      await ensureDefaultSubscriptionIsUseful(
        userId,
        transaction.subscription_id,
        client
      );
      await refreshProfileSubscriptionStatus(userId, client);
      await clearPendingCheckout(userId, client);
      return {
        subscriptionId: transaction.subscription_id,
        transactionId: transaction.id,
      };
    }

    const existingByTxn = await findSubscriptionByPaymentTransaction(
      transaction.id,
      client
    );
    if (existingByTxn?.id) {
      await linkTransactionToSubscription(
        { transactionId: transaction.id, subscriptionId: existingByTxn.id },
        client
      );
      await ensureDefaultSubscriptionIsUseful(userId, existingByTxn.id, client);
      await refreshProfileSubscriptionStatus(userId, client);
      await clearPendingCheckout(userId, client);
      return {
        subscriptionId: existingByTxn.id,
        transactionId: transaction.id,
      };
    }

    const latestActive = await findLatestActiveSubscription(
      userId,
      planId,
      client
    );
    const paidDate = new Date(paymentInput.paidAt);
    const paidAtDate = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;
    const latestExpiresAt = latestActive?.expires_at
      ? new Date(latestActive.expires_at)
      : null;
    const startAnchor =
      latestExpiresAt &&
      !Number.isNaN(latestExpiresAt.getTime()) &&
      latestExpiresAt > paidAtDate
        ? latestExpiresAt
        : paidAtDate;
    const startsAt = startAnchor.toISOString();
    const expiresAt = computeExpiryDate(plan.duration_days, startsAt);

    let subscriptionId;
    if (latestActive?.id) {
      subscriptionId = latestActive.id;
      await updateExistingSubscription(
        {
          subscriptionId,
          startsAt,
          expiresAt,
          paidAt: paymentInput.paidAt,
          transactionId: transaction.id,
          amount,
          currency,
          quantity: Number(latestActive.quantity || 1) + 1,
        },
        client
      );
    } else {
      const inserted = await insertSubscription(
        {
          userId,
          planId,
          startsAt,
          expiresAt,
          paidAt: paymentInput.paidAt,
          transactionId: transaction.id,
          amount,
          currency,
        },
        client
      );
      subscriptionId = inserted.id;
    }

    await linkTransactionToSubscription(
      { transactionId: transaction.id, subscriptionId },
      client
    );
    await ensureDefaultSubscriptionIsUseful(userId, subscriptionId, client);
    await refreshProfileSubscriptionStatus(userId, client);
    await clearPendingCheckout(userId, client);

    return {
      subscriptionId,
      transactionId: transaction.id,
    };
  });
}

export async function verifyAndActivatePaystackPayment(reference) {
  const data = await verifyPaystackTransaction(reference);
  const payment = normalizePaystackPayment(data, { reference });
  const result = await activateSuccessfulPaystackPayment(payment);

  return {
    status: 'success',
    subscription_id: result.subscriptionId,
    transaction_id: result.transactionId,
  };
}

export function verifyPaystackSignature(rawBody, signature) {
  const secretKey = requirePaystackSecretKey();
  if (!signature) return false;
  const expected = createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function processPaystackWebhook(rawBody, signature) {
  if (!verifyPaystackSignature(rawBody, signature)) {
    throw new HttpError(
      401,
      'INVALID_PAYSTACK_SIGNATURE',
      'Invalid Paystack signature.'
    );
  }

  const payload = JSON.parse(rawBody);
  if (payload?.event !== 'charge.success') {
    return { ok: true, ignored: true };
  }

  const data = payload.data || {};
  const payment = normalizePaystackPayment(data);
  if (!payment.reference) {
    throw badRequest('Webhook payload is missing payment reference.');
  }

  await activateSuccessfulPaystackPayment(payment);
  return { ok: true };
}

export async function reconcilePaystackPayments(userId) {
  const targets = await findPendingPaymentTargets(userId);
  let processed = 0;
  let activated = 0;
  const results = [];

  for (const target of targets) {
    if (!target.pending_checkout_reference || !target.pending_plan_id) continue;
    processed += 1;
    const reference = target.pending_checkout_reference;

    try {
      const data = await verifyPaystackTransaction(reference);
      const payment = normalizePaystackPayment(data, {
        reference,
        userId: target.id,
        planId: target.pending_plan_id,
      });
      if (payment.status !== 'success') {
        results.push({
          userId: target.id,
          reference,
          status: 'not_success',
          paystack: payment.status,
        });
        continue;
      }

      await activateSuccessfulPaystackPayment(payment);
      activated += 1;
      results.push({ userId: target.id, reference, status: 'activated' });
    } catch (error) {
      results.push({
        userId: target.id,
        reference,
        status: 'error',
        error: error?.message || String(error),
      });
    }
  }

  return { processed, activated, results };
}
