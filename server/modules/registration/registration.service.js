import { createHash, randomUUID } from 'node:crypto';
import { auth } from '../../auth/betterAuth.js';
import { conflict, notFound } from '../../utils/httpError.js';
import {
  deleteBetterAuthUser,
  deleteCompatAuthUser,
  findActiveProfileByEmail,
  findActiveProfileByPhone,
  findPlanSnapshot,
  findProfileByUsername,
  findRegistrationStatus,
  insertCompatAuthUser,
  upsertPendingProfile,
} from './registration.repo.js';

const TOKEN_TTL_MS = 60 * 60 * 1000;

function generateRegistrationToken() {
  return `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
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
