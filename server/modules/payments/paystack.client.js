import { requirePaystackSecretKey } from './paystack.config.js';
import { HttpError } from '../../utils/httpError.js';

export async function verifyPaystackTransaction(reference) {
  const secretKey = requirePaystackSecretKey();
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
      },
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.status) {
    throw new HttpError(
      502,
      'PAYSTACK_VERIFY_FAILED',
      payload?.message || 'Unable to verify Paystack transaction.',
      { details: payload }
    );
  }

  return payload.data || {};
}
