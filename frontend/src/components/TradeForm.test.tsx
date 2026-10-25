import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../api/client';
import { aTrade } from '../test/fixtures';
import { TradeForm, type TradeFormProps } from './TradeForm';

type User = ReturnType<typeof userEvent.setup>;

function renderForm(props: Partial<TradeFormProps> = {}) {
  const onCreate = vi.fn<TradeFormProps['onCreate']>().mockResolvedValue(undefined);
  const onAmend = vi.fn<TradeFormProps['onAmend']>().mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (overrides: Partial<TradeFormProps>) => (
    <QueryClientProvider client={queryClient}>
      <TradeForm
        trade={null}
        onCreate={onCreate}
        onAmend={onAmend}
        onClose={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>
  );
  const view = render(ui(props));
  return {
    onCreate,
    onAmend,
    user: userEvent.setup(),
    rerender: (overrides: Partial<TradeFormProps>) => view.rerender(ui(overrides)),
  };
}

async function fillIn(user: User, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, value);
  }
}

const validTrade = {
  Symbol: 'aapl',
  Quantity: '1500',
  Price: '189.25',
  Trader: 'jsmith',
  Book: 'eq_us_tech',
  Counterparty: 'Goldman Sachs',
};

describe('TradeForm', () => {
  // The amend form loads the trade's history; answer with an empty one.
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a message for each missing field and does not submit', async () => {
    const { user, onCreate } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Book trade' }));

    expect(await screen.findByText('Symbol is required')).toBeInTheDocument();
    expect(screen.getByText('Price is required')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('books a trade with normalised values', async () => {
    const { user, onCreate } = renderForm();

    await fillIn(user, validTrade);
    await user.selectOptions(screen.getByLabelText('Side'), 'SELL');
    await user.click(screen.getByRole('button', { name: 'Book trade' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        symbol: 'AAPL',
        side: 'SELL',
        quantity: 1500,
        price: 189.25,
        trader: 'JSMITH',
        book: 'EQ_US_TECH',
        counterparty: 'Goldman Sachs',
      }),
    );
  });

  it('shows server validation errors next to the field', async () => {
    const { user, onCreate } = renderForm();
    onCreate.mockRejectedValue(
      new ApiRequestError(400, 'VALIDATION_ERROR', 'Invalid body', [
        { path: 'price', message: 'Price cannot exceed 1,000,000' },
      ]),
    );

    await fillIn(user, validTrade);
    await user.click(screen.getByRole('button', { name: 'Book trade' }));

    expect(await screen.findByText('Price cannot exceed 1,000,000')).toBeInTheDocument();
  });

  it('sends only the edited fields when amending', async () => {
    const { user, onAmend } = renderForm({ trade: aTrade({ version: 3 }) });

    await fillIn(user, { Price: '190.5' });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onAmend).toHaveBeenCalledWith({ price: 190.5 }, 3));
  });

  it('offers to load the latest version when the trade changes while editing', async () => {
    const trade = aTrade({ version: 1, price: 100 });
    const { user, rerender } = renderForm({ trade });

    rerender({ trade: { ...trade, version: 2, price: 105 } });
    await user.click(screen.getByRole('button', { name: 'Load latest' }));

    expect(screen.getByLabelText('Price')).toHaveValue('105');
  });
});
