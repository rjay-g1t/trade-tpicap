import { formatNotional, formatQuantity, formatSigned } from '../utils/format';
import { usePositions } from '../trades/queries';

const signClass = (value: number) =>
  value > 0 ? 'num positive' : value < 0 ? 'num negative' : 'num';

export function PositionsPanel() {
  const positions = usePositions();

  return (
    <section className="panel" aria-labelledby="positions-title">
      <h2 id="positions-title">Net positions</h2>
      <p className="muted">Active trades only</p>
      {positions.isPending && <p className="muted">Loading positions…</p>}
      {positions.isError && <p className="field-error">Could not load positions.</p>}
      {positions.data && (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="num">Net qty</th>
              <th className="num">Net notional</th>
            </tr>
          </thead>
          <tbody>
            {positions.data.map((position) => (
              <tr key={position.symbol}>
                <td>{position.symbol}</td>
                <td className={signClass(position.netQuantity)}>
                  {formatSigned(position.netQuantity, formatQuantity)}
                </td>
                <td className={signClass(position.netNotional)}>
                  {formatSigned(position.netNotional, formatNotional)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}