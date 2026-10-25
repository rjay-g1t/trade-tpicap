export interface ToolbarProps {
  quickFilter: string;
  onQuickFilterChange: (value: string) => void;
  showCancelled: boolean;
  onShowCancelledChange: (value: boolean) => void;
  tradeCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  onNewTrade: () => void;
}

const VIEWS = [
  { label: 'All trades', showCancelled: true },
  { label: 'Active only', showCancelled: false },
] as const;

export function Toolbar({
  quickFilter,
  onQuickFilterChange,
  showCancelled,
  onShowCancelledChange,
  tradeCount,
  isRefreshing,
  onRefresh,
  onNewTrade,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="tabs" role="group" aria-label="Which trades to show">
        {VIEWS.map((view) => (
          <button
            key={view.label}
            type="button"
            className="tab"
            aria-pressed={showCancelled === view.showCancelled}
            onClick={() => onShowCancelledChange(view.showCancelled)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <span className="muted toolbar-count">{tradeCount} trades</span>
      <span className="spacer" />
      <label className="search">
        <SearchIcon />
        <input
          type="search"
          id="quick-filter"
          className="search-input"
          placeholder="Search trades"
          aria-label="Search trades"
          value={quickFilter}
          onChange={(event) => onQuickFilterChange(event.target.value)}
        />
      </label>
      <button type="button" className="btn" onClick={onRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Refreshing…' : 'Refresh'}
      </button>
      <button type="button" className="btn btn-primary" onClick={onNewTrade}>
        New trade
      </button>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
