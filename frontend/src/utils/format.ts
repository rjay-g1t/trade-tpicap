const quantityFormat = new Intl.NumberFormat('en-US');
const priceFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
const notionalFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const timestampFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export const formatQuantity = (value: number) => quantityFormat.format(value);
export const formatPrice = (value: number) => priceFormat.format(value);
export const formatNotional = (value: number) => notionalFormat.format(value);
/** Large numbers as "182.4M", for summary figures. */
export const formatCompact = (value: number) => compactFormat.format(value);
export const formatTimestamp = (iso: string) => timestampFormat.format(new Date(iso));

export const formatSigned = (value: number, format: (value: number) => string) =>
  value > 0 ? `+${format(value)}` : format(value);
