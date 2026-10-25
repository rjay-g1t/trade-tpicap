export interface Instrument {
  symbol: string;
  /** Approximate price used as the centre of the generated price range. */
  referencePrice: number;
  /** Books this instrument is plausibly traded in. */
  books: readonly string[];
}

export const INSTRUMENTS: readonly Instrument[] = [
  { symbol: 'AAPL', referencePrice: 227.45, books: ['EQUITIES_US', 'TECH_GROWTH'] },
  { symbol: 'MSFT', referencePrice: 534.22, books: ['EQUITIES_US', 'TECH_GROWTH'] },
  { symbol: 'TSLA', referencePrice: 341.75, books: ['TECH_GROWTH'] },
  { symbol: 'NVDA', referencePrice: 182.3, books: ['EQUITIES_US', 'TECH_GROWTH'] },
  { symbol: 'AMZN', referencePrice: 228.6, books: ['EQUITIES_US', 'TECH_GROWTH'] },
  { symbol: 'GOOGL', referencePrice: 204.9, books: ['EQUITIES_US', 'TECH_GROWTH'] },
  { symbol: 'META', referencePrice: 761.4, books: ['TECH_GROWTH'] },
  { symbol: 'JPM', referencePrice: 294.8, books: ['EQUITIES_US'] },
  { symbol: 'BRK.B', referencePrice: 486.2, books: ['EQUITIES_US'] },
  { symbol: 'XOM', referencePrice: 111.9, books: ['EQUITIES_US'] },
  { symbol: 'KO', referencePrice: 69.85, books: ['EQUITIES_US'] },
  { symbol: 'JNJ', referencePrice: 177.6, books: ['EQUITIES_US'] },
  { symbol: 'HSBA.L', referencePrice: 9.85, books: ['EQUITIES_UK'] },
  { symbol: 'AZN.L', referencePrice: 120.5, books: ['EQUITIES_UK'] },
  { symbol: 'SHEL.L', referencePrice: 27.4, books: ['EQUITIES_UK'] },
  { symbol: 'BP.L', referencePrice: 4.31, books: ['EQUITIES_UK'] },
  { symbol: 'VOD.L', referencePrice: 0.72, books: ['EQUITIES_UK'] },
];

export const TRADERS = ['JSMITH', 'ABROWN', 'MJONES', 'KPATEL', 'LCHEN', 'RGARCIA', 'SWILSON'];

export const COUNTERPARTIES = [
  'Goldman Sachs',
  'JP Morgan',
  'Morgan Stanley',
  'Barclays',
  'Citigroup',
  'UBS',
  'BNP Paribas',
  'Deutsche Bank',
  'HSBC',
  'Bank of America',
];
