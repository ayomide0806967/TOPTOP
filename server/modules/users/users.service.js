import { notFound } from '../../utils/httpError.js';
import {
  findProfileByEmail,
  findProfileByPhone,
  findLatestSuccessfulPaystackReference,
  findProfileByLoginIdentifier,
  findProfileByUsername,
} from './users.repo.js';

const RESUMABLE_STATUSES = new Set(['pending_payment', 'awaiting_setup']);

export async function lookupUsername(username) {
  const profile = await findProfileByUsername(username);

  if (!profile?.email) {
    throw notFound(
      'Username not found. Please check your username and try again.'
    );
  }

  const latestReference = await findLatestSuccessfulPaystackReference(
    profile.id
  );
  const subscriptionStatus = profile.subscription_status || null;

  return {
    email: profile.email,
    userId: profile.id,
    username: profile.username,
    subscriptionStatus,
    pendingRegistration: subscriptionStatus
      ? RESUMABLE_STATUSES.has(subscriptionStatus)
      : false,
    needsSupport: subscriptionStatus === 'suspended',
    latestReference,
  };
}

export async function resolveLoginIdentifier(identifier) {
  const profile = await findProfileByLoginIdentifier(identifier);

  if (!profile?.id) {
    throw notFound(
      'Account not found. Check your username, phone, or email and try again.'
    );
  }

  const subscriptionStatus = profile.subscription_status || null;
  const hasPassword = Boolean(profile.has_password && profile.email);

  return {
    email: profile.email || null,
    userId: profile.id,
    username: profile.username || null,
    subscriptionStatus,
    registrationStage: profile.registration_stage || null,
    pendingRegistration: subscriptionStatus
      ? RESUMABLE_STATUSES.has(subscriptionStatus)
      : false,
    needsSupport: subscriptionStatus === 'suspended',
    identifierType: profile.identifier_type || 'unknown',
    hasPassword,
    needsPasswordSetup: !hasPassword,
  };
}

function availabilityFromProfile(profile, allowedProfileId) {
  if (!profile) return { available: true };
  if (allowedProfileId && profile.id === allowedProfileId) {
    return { available: true, reused: true };
  }
  return {
    available: false,
    profileId: profile.id,
    username: profile.username || null,
    subscriptionStatus: profile.subscription_status || null,
  };
}

export async function checkUserAvailability({
  username,
  email,
  phone,
  allowedProfileId,
}) {
  const checks = {};

  if (username) {
    checks.username = availabilityFromProfile(
      await findProfileByUsername(username.toLowerCase()),
      allowedProfileId
    );
  }

  if (email) {
    checks.email = availabilityFromProfile(
      await findProfileByEmail(email.toLowerCase()),
      allowedProfileId
    );
  }

  if (phone) {
    checks.phone = availabilityFromProfile(
      await findProfileByPhone(phone),
      allowedProfileId
    );
  }

  return checks;
}
