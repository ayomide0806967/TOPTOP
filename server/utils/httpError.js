export class HttpError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (options.cause) this.cause = options.cause;
    if (options.details) this.details = options.details;
  }
}

export function unauthorized(message = 'Authentication required.') {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function badRequest(message = 'Invalid request.', details) {
  return new HttpError(400, 'BAD_REQUEST', message, { details });
}

export function conflict(message = 'Resource already exists.') {
  return new HttpError(409, 'CONFLICT', message);
}

export function forbidden(message = 'You do not have permission to do that.') {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Resource not found.') {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function toErrorResponse(error) {
  const status = Number(error?.status || error?.statusCode || 500);
  const code = error?.code || 'INTERNAL_SERVER_ERROR';
  const message =
    status >= 500
      ? 'Unexpected server error.'
      : error?.message || error?.body?.message || 'Request failed.';

  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(error?.details ? { details: error.details } : {}),
      },
    },
  };
}
