import type { Trade } from '@trade-blotter/shared';
import { formatPrice, formatQuantity } from '../utils/format';

export interface ConfirmCancelProps {
  trade: Trade;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmCancel({ trade, isPending, onConfirm, onClose }: ConfirmCancelProps) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-description"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id="cancel-title">Cancel {trade.tradeId}?</h2>
        <p id="cancel-description">
          {trade.side} {formatQuantity(trade.quantity)} {trade.symbol} @ {formatPrice(trade.price)}{' '}
          with {trade.counterparty}. The trade stays on the blotter as cancelled and can no longer
          be amended.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose} autoFocus>
            Keep trade
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Cancelling…' : 'Cancel trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
