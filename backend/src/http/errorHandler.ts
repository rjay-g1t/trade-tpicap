import type { ApiError, ErrorCode, ErrorDetail } from '@trade-blotter/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { DomainError } from '../trades/errors';

export function apiError(code: ErrorCode, message: string, details?: ErrorDetail[]): ApiError {
  return { error: details ? { code, message, details } : { code, message } };
}

/** Maps every failure to the shared `ApiError` envelope. */
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (hasZodFastifySchemaValidationErrors(error)) {
    const details = error.validation.map((issue) => ({
      path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
      message: issue.message ?? 'Invalid value',
    }));
    const where = error.validationContext ?? 'request';
    return reply.code(400).send(apiError('VALIDATION_ERROR', `Invalid ${where}`, details));
  }

  if (error instanceof DomainError) {
    return reply.code(error.statusCode).send(apiError(error.code, error.message));
  }

  // Fastify's own client errors, e.g. malformed JSON or an unsupported content type.
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return reply.code(error.statusCode).send(apiError('VALIDATION_ERROR', error.message));
  }

  request.log.error({ err: error }, 'Unhandled error');
  return reply.code(500).send(apiError('INTERNAL_ERROR', 'An unexpected error occurred'));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply
    .code(404)
    .send(apiError('NOT_FOUND', `Route ${request.method} ${request.url} not found`));
}
