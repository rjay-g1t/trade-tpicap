import type { CreateTrade, Trade } from '@trade-blotter/shared';
import { useCallback, useMemo, useState } from 'react';
import { errorMessage } from './api/client';
import { BlotterGrid } from './components/BlotterGrid';
import { ConfirmCancel } from './components/ConfirmCancel';
import { PositionsPanel } from './components/PositionsPanel';
import { StatsBar } from './components/StatsBar';
import { ToastList, useToasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { TradeForm } from './components/TradeForm';
import { useAmendTrade, useCancelTrade, useCreateTrade, useTrades } from './trades/queries';
import { summarizeTrades } from './trades/summary';
import { useTradeStream } from './trades/useTradeStream';
import { formatCompact } from './utils/format';
import { useTheme } from './utils/theme';

type Drawer = { mode: 'create' } | { mode: 'amend'; tradeId: string };

const NO_TRADES: Trade[] = [];

export function App() {
  const tradesQuery = useTrades();
  const connection = useTradeStream(tradesQuery.data?.lastEventId);
  const createTrade = useCreateTrade();
  const amendTrade = useAmendTrade();
  const cancelTrade = useCancelTrade();
  const { toasts, notify, dismiss } = useToasts();
  const { theme, toggleTheme } = useTheme();

  const [quickFilter, setQuickFilter] = useState('');
  const [showCancelled, setShowCancelled] = useState(true);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const trades = tradesQuery.data?.trades ?? NO_TRADES;
  const visibleTrades = useMemo(
    () => (showCancelled ? trades : trades.filter((trade) => trade.status === 'ACTIVE')),
    [trades, showCancelled],
  );
  const summary = useMemo(() => summarizeTrades(trades), [trades]);

  // Look trades up by id on every render, so open dialogs show live changes.
  const findTrade = (tradeId: string | null) =>
    trades.find((trade) => trade.tradeId === tradeId) ?? null;
  const amending = drawer?.mode === 'amend' ? findTrade(drawer.tradeId) : null;
  const cancelling = findTrade(cancellingId);

  // Stable callbacks, so the grid doesn't rebuild its columns on every render.
  const openAmend = useCallback(
    (trade: Trade) => setDrawer({ mode: 'amend', tradeId: trade.tradeId }),
    [],
  );
  const openCancel = useCallback((trade: Trade) => setCancellingId(trade.tradeId), []);

  async function bookTrade(input: CreateTrade) {
    const trade = await createTrade.mutateAsync(input);
    notify('success', `Booked ${trade.tradeId}`);
    setDrawer(null);
  }

  async function saveAmendment(changes: Partial<CreateTrade>, expectedVersion: number) {
    if (drawer?.mode !== 'amend') return;
    const trade = await amendTrade.mutateAsync({
      tradeId: drawer.tradeId,
      input: { ...changes, expectedVersion },
    });
    notify('success', `Amended ${trade.tradeId} (now version ${trade.version})`);
    setDrawer(null);
  }

  async function confirmCancel() {
    if (!cancelling) return;
    try {
      const trade = await cancelTrade.mutateAsync(cancelling);
      notify('success', `Cancelled ${trade.tradeId}`);
    } catch (error) {
      notify('error', errorMessage(error));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="app">
      <StatsBar summary={summary} connection={connection} />

      <header className="navbar">
        <div className="container navbar-inner">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Trade Blotter
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <main className="container page">
        <section className="page-head">
          <h1>Today’s trades</h1>
          <p className="muted">
            {summary.active} active trades across {summary.symbols} symbols, with a gross notional
            of {formatCompact(summary.grossNotional)}.{' '}
            {summary.cancelled > 0 && `${summary.cancelled} cancelled.`}
          </p>
        </section>

        <PositionsPanel />

        <Toolbar
          quickFilter={quickFilter}
          onQuickFilterChange={setQuickFilter}
          showCancelled={showCancelled}
          onShowCancelledChange={setShowCancelled}
          tradeCount={visibleTrades.length}
          isRefreshing={tradesQuery.isFetching}
          onRefresh={() => void tradesQuery.refetch()}
          onNewTrade={() => setDrawer({ mode: 'create' })}
        />

        <div className="blotter">
          {tradesQuery.isPending && <p className="placeholder">Loading trades…</p>}
          {tradesQuery.isError && (
            <div className="placeholder" role="alert">
              <p>Could not load trades: {tradesQuery.error.message}</p>
              <button type="button" className="btn" onClick={() => void tradesQuery.refetch()}>
                Try again
              </button>
            </div>
          )}
          {tradesQuery.isSuccess && (
            <BlotterGrid
              trades={visibleTrades}
              quickFilter={quickFilter}
              onAmend={openAmend}
              onCancel={openCancel}
            />
          )}
        </div>
      </main>

      {drawer && (drawer.mode === 'create' || amending) && (
        <TradeForm
          key={drawer.mode === 'amend' ? drawer.tradeId : 'new'}
          trade={amending}
          onCreate={bookTrade}
          onAmend={saveAmendment}
          onClose={() => setDrawer(null)}
        />
      )}

      {cancelling && (
        <ConfirmCancel
          trade={cancelling}
          isPending={cancelTrade.isPending}
          onConfirm={() => void confirmCancel()}
          onClose={() => setCancellingId(null)}
        />
      )}

      <ToastList toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
