import type { TradeRepository } from '../trades/tradeRepository';
import { generateTrades, type GenerateTradesOptions } from './generateTrades';

/**
 * Populates an empty database with generated trades. Each trade gets the same
 * audit trail the API would produce: CREATED, then CANCELLED for cancelled ones.
 *
 * @returns the number of trades inserted (0 if the database already had data).
 */
export async function seedIfEmpty(
  repository: TradeRepository,
  options: GenerateTradesOptions,
): Promise<number> {
  if ((await repository.count()) > 0) return 0;

  const trades = generateTrades(options);
  await repository.transaction(async (writer) => {
    for (const { status, ...fields } of trades) {
      const created = await writer.insert({ ...fields, status: 'ACTIVE' });
      await writer.appendEvent({
        kind: 'CREATED',
        before: null,
        after: created,
        changedFields: [],
      });

      if (status === 'CANCELLED') {
        const cancelled = await writer.update(created.tradeId, { status: 'CANCELLED' });
        await writer.appendEvent({
          kind: 'CANCELLED',
          before: created,
          after: cancelled,
          changedFields: ['status'],
        });
      }
    }
  });
  return trades.length;
}
