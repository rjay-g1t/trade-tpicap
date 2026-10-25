import { SIDES, type CreateTrade, type Trade } from '@trade-blotter/shared';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { ApiRequestError, errorMessage } from '../api/client';
import {
  EMPTY_TRADE_FORM,
  changedFields,
  isFormField,
  toFormValues,
  tradeFormResolver,
  type TradeFormValues,
} from '../trades/tradeForm';
import { TradeHistory } from './TradeHistory';

export interface TradeFormProps {
  /** The trade being amended, kept current by the live stream. Null to book a new trade. */
  trade: Trade | null;
  onCreate: (input: CreateTrade) => Promise<void>;
  onAmend: (changes: Partial<CreateTrade>, expectedVersion: number) => Promise<void>;
  onClose: () => void;
}

export function TradeForm({ trade, onCreate, onAmend, onClose }: TradeFormProps) {
  // The version the user started editing from. Sent as expectedVersion.
  const [baseVersion, setBaseVersion] = useState(trade?.version ?? 0);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<TradeFormValues, unknown, CreateTrade>({
    defaultValues: trade ? toFormValues(trade) : EMPTY_TRADE_FORM,
    resolver: tradeFormResolver,
  });

  const cancelledElsewhere = trade?.status === 'CANCELLED';
  const changedElsewhere = trade !== null && !cancelledElsewhere && trade.version > baseVersion;
  const serverError = errors.root?.server?.message;

  function loadLatest() {
    if (!trade) return;
    reset(toFormValues(trade));
    setBaseVersion(trade.version);
  }

  function showServerError(error: unknown) {
    if (error instanceof ApiRequestError && error.details.length > 0) {
      for (const detail of error.details) {
        if (isFormField(detail.path)) setError(detail.path, { message: detail.message });
        else setError('root.server', { message: detail.message });
      }
      return;
    }
    setError('root.server', { message: errorMessage(error) });
  }

  const submit = handleSubmit(async (input) => {
    try {
      if (trade) await onAmend(changedFields(input, dirtyFields), baseVersion);
      else await onCreate(input);
    } catch (error) {
      showServerError(error);
    }
  });

  return (
    <aside
      className="drawer"
      aria-labelledby="trade-form-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <header className="drawer-header">
        <h2 id="trade-form-title">{trade ? `Amend ${trade.tradeId}` : 'New trade'}</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <form className="drawer-body" onSubmit={submit} noValidate>
        {cancelledElsewhere && (
          <p className="banner banner-error" role="alert">
            This trade has been cancelled and can no longer be amended.
          </p>
        )}
        {changedElsewhere && (
          <div className="banner banner-warning" role="alert">
            <span>Someone else changed this trade (now version {trade?.version}).</span>
            <button type="button" className="btn btn-small" onClick={loadLatest}>
              Load latest
            </button>
          </div>
        )}

        <div className="form-grid">
          <Field id="symbol" label="Symbol" error={errors.symbol?.message}>
            <input id="symbol" className="input" autoComplete="off" {...register('symbol')} />
          </Field>
          <Field id="side" label="Side" error={errors.side?.message}>
            <select id="side" className="input" {...register('side')}>
              {SIDES.map((side) => (
                <option key={side} value={side}>
                  {side}
                </option>
              ))}
            </select>
          </Field>
          <Field id="quantity" label="Quantity" error={errors.quantity?.message}>
            <input
              id="quantity"
              className="input num"
              inputMode="numeric"
              autoComplete="off"
              {...register('quantity')}
            />
          </Field>
          <Field id="price" label="Price" error={errors.price?.message}>
            <input
              id="price"
              className="input num"
              inputMode="decimal"
              autoComplete="off"
              {...register('price')}
            />
          </Field>
          <Field id="trader" label="Trader" error={errors.trader?.message}>
            <input id="trader" className="input" autoComplete="off" {...register('trader')} />
          </Field>
          <Field id="book" label="Book" error={errors.book?.message}>
            <input id="book" className="input" autoComplete="off" {...register('book')} />
          </Field>
          <Field id="counterparty" label="Counterparty" error={errors.counterparty?.message} wide>
            <input
              id="counterparty"
              className="input"
              autoComplete="off"
              {...register('counterparty')}
            />
          </Field>
          <Field
            id="tradeTimestamp"
            label="Trade time"
            error={errors.tradeTimestamp?.message}
            hint={trade ? undefined : 'Leave blank to use the current time.'}
            wide
          >
            <input
              id="tradeTimestamp"
              type="datetime-local"
              step="1"
              className="input"
              {...register('tradeTimestamp')}
            />
          </Field>
        </div>

        {serverError && (
          <p className="banner banner-error" role="alert">
            {serverError}
          </p>
        )}

        <footer className="drawer-footer">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || cancelledElsewhere || (trade !== null && !isDirty)}
          >
            {isSubmitting ? 'Saving…' : trade ? 'Save changes' : 'Book trade'}
          </button>
        </footer>
      </form>

      {trade && <TradeHistory tradeId={trade.tradeId} />}
    </aside>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error: string | undefined;
  hint?: string | undefined;
  wide?: boolean;
  children: ReactNode;
}

function Field({ id, label, error, hint, wide = false, children }: FieldProps) {
  return (
    <div className={wide ? 'field field-wide' : 'field'}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  );
}
