import { findProfileById } from './profiles.repo.js';

export async function getProfileForUser(userId) {
  if (!userId) return null;
  return findProfileById(userId);
}
