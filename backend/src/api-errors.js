export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Return stable public errors without serializing internal or credential data. */
export function configureApiErrors(app) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    }
    if (error.validation || error.statusCode === 400) {
      return reply.code(400).send({ code: 'invalid_request', message: 'Check the submitted values' });
    }
    if (error.statusCode === 413 || error.statusCode === 415) {
      return reply.code(error.statusCode).send({ code: 'invalid_request', message: 'Unsupported request body' });
    }
    request.log.error({ code: error.code }, 'API request failed');
    return reply.code(500).send({ code: 'internal_error', message: 'The request could not be completed' });
  });
}
