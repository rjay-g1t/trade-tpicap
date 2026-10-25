import type { ConnectionStatus } from '../trades/useTradeStream';

export interface ToolbarProps {
  quickFilter: string;
  onQuickFilterChange: (value: string) => void;
  showCancelled: boolean;
  onShowCancelledChange: (value: boolean) => void;
  tradeCount: number;
  connection: ConnectionStatus;
  isRefreshing: boolean;
  onRefresh: () => void;
  onNewTrade: () => void;
}

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
};

export function Toolbar({
  quickFilter,
  onQuickFilterChange,
  showCancelled,
  onShowCancelledChange,
  tradeCount,
  connection,
  isRefreshing,
  onRefresh,
  onNewTrade,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <input
        type="search"
        id="quick-filter"
        className="input quick-filter"
        placeholder="Filter trades…"
        aria-label="Filter trades"
        value={quickFilter}
        onChange={(event) => onQuickFilterChange(event.target.value)}
      />
      <label className="toggle">
        <input
          type="checkbox"
          id="show-cancelled"
          checked={showCancelled}
          onChange={(event) => onShowCancelledChange(event.target.checked)}
        />
        Show cancelled
      </label>
      <span className="muted">{tradeCount} trades</span>
      <span className="spacer" />
      <span className={`connection connection-${connection}`} role="status">
        {CONNECTION_LABEL[connection]}
      </span>
      <button type="button" className="btn" onClick={onRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <button type="button" className="btn btn-primary" onClick={onNewTrade}>
        New trade
      </button>
    </div>
  );
}