const STORAGE_KEY = 'an.sessionFingerprint';

function getCrypto() {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  return null;
}

function getLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

export async function deriveSessionFingerprint(token) {
  if (!token) return null;
  const cryptoSubtle = getCrypto();
  if (!cryptoSubtle) {
    console.warn(
      '[SessionFingerprint] Web Crypto not available to derive fingerprint.'
    );
    return token;
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await cryptoSubtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.warn(
      '[SessionFingerprint] Failed to derive fingerprint, falling back to raw token.',
      error
    );
    return token;
  }
}

export function storeSessionFingerprint(fingerprint) {
  if (!fingerprint) return;
  try {
    const storage = getLocalStorage();
    storage?.setItem(STORAGE_KEY, fingerprint);
  } catch (error) {
    console.warn('[SessionFingerprint] Failed to store fingerprint', error);
  }
}

export function readSessionFingerprint() {
  try {
    const storage = getLocalStorage();
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch (error) {
    console.warn('[SessionFingerprint] Failed to read fingerprint', error);
    return null;
  }
}

export function clearSessionFingerprint() {
  try {
    const storage = getLocalStorage();
    storage?.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[SessionFingerprint] Failed to clear fingerprint', error);
  }
}

export const SESSION_FINGERPRINT_STORAGE_KEY = STORAGE_KEY;
