import { createHash, randomUUID } from 'node:crypto';
import { hashPassword } from '@better-auth/utils/password';
import { auth } from '../../auth/betterAuth.js';
import { ensureRedisConnected } from '../../redis/client.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import {
  claimMigratedProfileCredentials,
  deleteBetterAuthUser,
  deleteCompatAuthUser,
  findLatestSuccessfulPaymentReference,
  findActiveProfileByEmail,
  findActiveProfileByPhone,
  findMigratedProfileForClaim,
  findPlanSnapshot,
  findProfileByUsername,
  findRegistrationStatus,
  insertCompatAuthUser,
  upsertPendingProfile,
} from './registration.repo.js';

const TOKEN_TTL_MS = 60 * 60 * 1000;
const CLAIM_RATE_LIMIT_TTL_SECONDS = 15 * 60;
const CLAIM_RATE_LIMIT_MAX_ATTEMPTS = 8;

function generateRegistrationToken() {
  return `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeComparable(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-()+]/g, '');
}

function claimError() {
  return badRequest(
    'We could not verify this migrated account. Check the email, username, and phone or payment reference.'
  );
}

async function enforceClaimRateLimit(email) {
  const redis = await ensureRedisConnected().catch(() => null);
  if (!redis) return;

  const key = `account-claim:${createHash('sha256').update(email).digest('hex')}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, CLAIM_RATE_LIMIT_TTL_SECONDS);
  }
  if (attempts > CLAIM_RATE_LIMIT_MAX_ATTEMPTS) {
    throw badRequest('Too many account recovery attempts. Try again later.');
  }
}

export async function createPendingRegistration(input, headers) {
  const existingEmail = await findActiveProfileByEmail(input.email);
  if (existingEmail) {
    throw conflict(
      'An active subscription already exists for this email. Please sign in instead.'
    );
  }

  const existingPhone = await findActiveProfileByPhone(input.phone);
  if (existingPhone) {
    throw conflict(
      'This phone number is already registered to another active account.'
    );
  }

  const usernameOwner = await findProfileByUsername(input.username);
  if (usernameOwner) {
    throw conflict('This username is already taken.');
  }

  const planSnapshot = await findPlanSnapshot(input.planId);
  if (input.planId && !planSnapshot) {
    throw notFound('Selected subscription plan was not found.');
  }

  const name = `${input.firstName} ${input.lastName}`.trim();
  const signUpResult = await auth.api.signUpEmail({
    headers,
    body: {
      name,
      email: input.email,
      password: input.password,
      rememberMe: false,
    },
  });

  const userId = signUpResult?.user?.id;
  if (!userId) {
    throw new Error('Better Auth did not return a user ID.');
  }

  const registrationToken = generateRegistrationToken();
  const registrationTokenHash = hashToken(registrationToken);
  const registrationTokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  try {
    await insertCompatAuthUser({ id: userId, email: input.email });
    const profile = await upsertPendingProfile({
      userId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      username: input.username,
      planId: input.planId,
      planSnapshot,
      registrationTokenHash,
      registrationTokenExpiresAt,
    });

    return {
      userId,
      username: profile.username || input.username,
      registrationToken,
      registrationStage: profile.registration_stage,
      pendingPlanId: profile.pending_plan_id,
      pendingPlanSnapshot: profile.pending_plan_snapshot,
    };
  } catch (error) {
    await deleteBetterAuthUser(userId).catch(() => {});
    await deleteCompatAuthUser(userId).catch(() => {});
    throw error;
  }
}

export async function getRegistrationStatus(userId) {
  if (!userId) return null;
  return findRegistrationStatus(userId);
}

export async function claimMigratedAccount(input) {
  await enforceClaimRateLimit(input.email);

  const profile = await findMigratedProfileForClaim({
    email: input.email,
    username: input.username,
  });
  if (!profile?.id || !profile.email) {
    throw claimError();
  }

  const providedPhone = normalizeComparable(input.phone);
  const storedPhone = normalizeComparable(profile.phone);
  const phoneMatches =
    providedPhone && storedPhone && providedPhone === storedPhone;

  let paymentMatches = false;
  if (input.paymentReference) {
    const latestReference = await findLatestSuccessfulPaymentReference(
      profile.id
    );
    paymentMatches =
      normalizeComparable(input.paymentReference) ===
      normalizeComparable(latestReference);
  }

  if (!phoneMatches && !paymentMatches) {
    throw claimError();
  }

  const passwordHash = await hashPassword(input.password);
  await claimMigratedProfileCredentials({
    profile,
    passwordHash,
  });

  return {
    userId: profile.id,
    email: profile.email,
    username: profile.username,
    claimed: true,
  };
}
