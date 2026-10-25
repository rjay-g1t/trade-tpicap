import { ApiErrorSchema, type ErrorCode, type ErrorDetail } from '@trade-blotter/shared';

export interface Parser<T> {
  parse(data: unknown): T;
}

export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'UNEXPECTED_RESPONSE';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly details: ErrorDetail[];

  constructor(status: number, code: ClientErrorCode, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}

export async function request<T>(
  path: string,
  schema: Parser<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body } = options;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the server. Check that the backend is running.',
    );
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw toApiError(response.status, payload);

  try {
    return schema.parse(payload);
  } catch {
    throw new ApiRequestError(
      response.status,
      'UNEXPECTED_RESPONSE',
      'The server sent a response the app does not recognise.',
    );
  }
}

function toApiError(status: number, payload: unknown): ApiRequestError {
  const parsed = ApiErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return new ApiRequestError(
      status,
      'UNEXPECTED_RESPONSE',
      `Request failed with HTTP ${status}.`,
    );
  }
  const { code, message, details = [] } = parsed.data.error;
  return new ApiRequestError(status, code, message, details);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
