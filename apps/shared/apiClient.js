export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.code = options.code || 'API_ERROR';
    this.details = options.details;
  }
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined && options.body !== null;

  let body = options.body;
  if (hasBody && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set(
      'Content-Type',
      headers.get('Content-Type') || 'application/json'
    );
    body = JSON.stringify(body);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const errorPayload = payload?.error || payload;
    const message =
      errorPayload?.message ||
      errorPayload?.error ||
      response.statusText ||
      'Request failed.';

    throw new ApiError(message, {
      status: response.status,
      code: errorPayload?.code,
      details: errorPayload?.details,
    });
  }

  return payload;
}
