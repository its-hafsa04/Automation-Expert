class AppError extends Error {
  constructor(message, { code = 'INTERNAL_ERROR', retryable = false, status = 500, cause } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.cause = cause;
  }
}

function externalError(error, service) {
  const message = error.message || `${service} request failed`;
  const status = error.status || Number(message.match(/\b([45]\d{2})\b/)?.[1]);
  const timedOut = /timeout|timed out|aborted/i.test(message);

  return new AppError(message, {
    code: timedOut ? `${service.toUpperCase()}_TIMEOUT` : `${service.toUpperCase()}_ERROR`,
    retryable: Boolean(timedOut || (status && status >= 500)),
    status: status && status >= 400 ? status : 502,
    cause: error
  });
}

module.exports = { AppError, externalError };