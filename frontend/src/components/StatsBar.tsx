import type { TradeSummary } from '../trades/summary';
import type { ConnectionStatus } from '../trades/useTradeStream';
import { formatCompact, formatQuantity } from '../utils/format';

export interface StatsBarProps {
  summary: TradeSummary;
  connection: ConnectionStatus;
}

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
};

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

/** Thin strip of headline figures above the navigation, plus the live-connection status. */
export function StatsBar({ summary, connection }: StatsBarProps) {
  return (
    <div className="statsbar">
      <div className="container statsbar-inner">
        <Stat label="Trades" value={formatQuantity(summary.total)} />
        <Stat label="Active" value={formatQuantity(summary.active)} />
        <Stat label="Symbols" value={formatQuantity(summary.symbols)} />
        <Stat label="Gross notional" value={formatCompact(summary.grossNotional)} />
        <span className="stat">
          <span className="stat-label">Buy / Sell</span>
          <span className="stat-value">
            <span className="positive">{percent.format(summary.buyShare)}</span>
            {' / '}
            <span className="negative">
              {percent.format(summary.grossNotional === 0 ? 0 : 1 - summary.buyShare)}
            </span>
          </span>
        </span>
        <span className="spacer" />
        <span className={`connection connection-${connection}`} role="status">
          <span className="connection-dot" aria-hidden="true" />
          {CONNECTION_LABEL[connection]}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </span>
  );
}
