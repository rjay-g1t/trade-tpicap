import { TradeSchema } from '@trade-blotter/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aTrade } from '../test/fixtures';
import { ApiRequestError, request } from './client';

function respondWith(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Awaits a request that must fail and returns its ApiRequestError. */
async function failureOf(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error = await promise.then(
    () => {
      throw new Error('Expected the request to fail');
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiRequestError);
  return error as ApiRequestError;
}

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls the API under /api and returns the validated body', async () => {
    const fetchMock = respondWith(200, aTrade());

    await expect(request('/trades/TRD-100001', TradeSchema)).resolves.toEqual(aTrade());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trades/TRD-100001',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends the body as JSON', async () => {
    const fetchMock = respondWith(201, aTrade());

    await request('/trades', TradeSchema, { method: 'POST', body: { symbol: 'AAPL' } });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trades',
      expect.objectContaining({
        method: 'POST',
        body: '{"symbol":"AAPL"}',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('turns the API error envelope into an ApiRequestError', async () => {
    respondWith(409, {
      error: { code: 'STALE_VERSION', message: 'Trade TRD-100001 was changed by someone else.' },
    });

    const error = await failureOf(request('/trades/TRD-100001', TradeSchema));

    expect(error).toMatchObject({
      status: 409,
      code: 'STALE_VERSION',
      message: 'Trade TRD-100001 was changed by someone else.',
      details: [],
    });
  });

  it('keeps field-level details from validation errors', async () => {
    const details = [{ path: 'price', message: 'Price must be positive' }];
    respondWith(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid body', details } });

    const error = await failureOf(request('/trades', TradeSchema, { method: 'POST', body: {} }));

    expect(error.details).toEqual(details);
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await failureOf(request('/trades', TradeSchema));

    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('rejects a response that does not match the schema', async () => {
    respondWith(200, { tradeId: 'not a trade' });

    const error = await failureOf(request('/trades/TRD-100001', TradeSchema));

    expect(error.code).toBe('UNEXPECTED_RESPONSE');
  });
});