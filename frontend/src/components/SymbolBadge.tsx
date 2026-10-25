/** Symbol with a round initial badge; the colour is derived from the symbol so it stays stable. */
export function SymbolBadge({ symbol }: { symbol: string }) {
  return (
    <span className="symbol">
      <span
        className="symbol-icon"
        style={{ backgroundColor: `hsl(${hueOf(symbol)} 62% 48%)` }}
        aria-hidden="true"
      >
        {symbol.charAt(0)}
      </span>
      <span className="symbol-name">{symbol}</span>
    </span>
  );
}

function hueOf(symbol: string): number {
  let hue = 0;
  for (const char of symbol) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return hue;
}
