import type { TradeHistoryEntry } from '@trade-blotter/shared';
import { formatTimestamp } from '../utils/format';
import { useTradeHistory } from '../trades/queries';

const KIND_LABEL: Record<TradeHistoryEntry['kind'], string> = {
  CREATED: 'Booked',
  AMENDED: 'Amended',
  CANCELLED: 'Cancelled',
};

export function TradeHistory({ tradeId }: { tradeId: string }) {
  const history = useTradeHistory(tradeId);

  return (
    <section className="history" aria-labelledby="history-title">
      <h3 id="history-title">History</h3>
      {history.isPending && <p className="muted">Loading history…</p>}
      {history.isError && (
        <p className="field-error">Could not load history: {history.error.message}</p>
      )}
      {history.data && (
        <ol>
          {history.data.toReversed().map((entry) => (
            <li key={entry.eventId}>
              <div className="history-head">
                <strong>{KIND_LABEL[entry.kind]}</strong>
                <span className="muted">v{entry.trade.version}</span>
                <time dateTime={entry.occurredAt}>{formatTimestamp(entry.occurredAt)}</time>
              </div>
              <ul>
                {describeChanges(entry).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** One line per amended field, e.g. "price: 101.2 → 101.5". */
function describeChanges({ before, trade, changedFields }: TradeHistoryEntry): string[] {
  if (!before) return [];
  return changedFields
    .filter((field) => field !== 'status')
    .map((field) => `${field}: ${String(before[field])} → ${String(trade[field])}`);
}
