import type { Position } from '@trade-blotter/shared';
import { usePositions } from '../trades/queries';
import { formatCompact, formatQuantity, formatSigned } from '../utils/format';
import { SymbolBadge } from './SymbolBadge';

const TOP = 3;

interface Highlight {
  title: string;
  rows: (positions: Position[]) => Position[];
  value: (position: Position) => string;
  tone: (position: Position) => 'positive' | 'negative' | '';
}

const signTone = (value: number) => (value > 0 ? 'positive' : value < 0 ? 'negative' : '');

const HIGHLIGHTS: Highlight[] = [
  {
    title: 'Largest long positions',
    rows: (positions) =>
      positions
        .filter((p) => p.netNotional > 0)
        .toSorted((a, b) => b.netNotional - a.netNotional)
        .slice(0, TOP),
    value: (p) => formatSigned(p.netNotional, formatCompact),
    tone: (p) => signTone(p.netNotional),
  },
  {
    title: 'Largest short positions',
    rows: (positions) =>
      positions
        .filter((p) => p.netNotional < 0)
        .toSorted((a, b) => a.netNotional - b.netNotional)
        .slice(0, TOP),
    value: (p) => formatSigned(p.netNotional, formatCompact),
    tone: (p) => signTone(p.netNotional),
  },
  {
    title: 'Most traded',
    rows: (positions) => positions.toSorted((a, b) => b.tradeCount - a.tradeCount).slice(0, TOP),
    value: (p) => `${formatQuantity(p.tradeCount)} trades`,
    tone: () => '',
  },
];

/** Net positions from active trades, shown as highlight cards above the blotter. */
export function PositionsPanel() {
  const positions = usePositions();

  return (
    <section className="highlights" aria-label="Net positions, active trades only">
      {HIGHLIGHTS.map((highlight) => (
        <article key={highlight.title} className="card">
          <h2 className="card-title">{highlight.title}</h2>
          {positions.isPending && <p className="muted">Loading positions…</p>}
          {positions.isError && <p className="field-error">Could not load positions.</p>}
          {positions.data && (
            <ol className="card-list">
              {highlight.rows(positions.data).map((position, index) => (
                <li key={position.symbol}>
                  <span className="card-rank">{index + 1}</span>
                  <SymbolBadge symbol={position.symbol} />
                  <span className={`card-value num ${highlight.tone(position)}`}>
                    {highlight.value(position)}
                  </span>
                </li>
              ))}
              {highlight.rows(positions.data).length === 0 && (
                <li className="muted">No positions yet</li>
              )}
            </ol>
          )}
        </article>
      ))}
    </section>
  );
}
