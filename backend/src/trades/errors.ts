import type { ErrorCode } from '@trade-blotter/shared';

/** An expected business-rule failure, mapped to an HTTP status by the error handler. */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly statusCode: number;
}

export class TradeNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor(tradeId: string) {
    super(`Trade ${tradeId} not found`);
  }
}

export class TradeCancelledError extends DomainError {
  readonly code = 'TRADE_CANCELLED';
  readonly statusCode = 409;

  constructor(tradeId: string) {
    super(`Trade ${tradeId} is cancelled and can no longer be changed`);
  }
}

export class StaleVersionError extends DomainError {
  readonly code = 'STALE_VERSION';
  readonly statusCode = 409;

  constructor(tradeId: string, expectedVersion: number, currentVersion: number) {
    super(
      `Trade ${tradeId} was modified by someone else ` +
        `(you have version ${expectedVersion}, latest is ${currentVersion}). Reload and try again.`,
    );
  }
}
