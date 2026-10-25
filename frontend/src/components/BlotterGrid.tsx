import type { Trade } from '@trade-blotter/shared';
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GetRowIdParams,
  type ICellRendererParams,
  type RowClassRules,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useMemo } from 'react';
import { formatNotional, formatPrice, formatQuantity, formatTimestamp } from '../utils/format';

ModuleRegistry.registerModules([AllCommunityModule]);

export interface BlotterGridProps {
  trades: Trade[];
  quickFilter: string;
  onAmend: (trade: Trade) => void;
  onCancel: (trade: Trade) => void;
}

const getRowId = ({ data }: GetRowIdParams<Trade>) => data.tradeId;

const rowClassRules: RowClassRules<Trade> = {
  'row-cancelled': ({ data }) => data?.status === 'CANCELLED',
};

const defaultColDef: ColDef<Trade> = {
  sortable: true,
  filter: true,
  resizable: true,
  enableCellChangeFlash: true,
};

/** Date filter compares calendar days, so "equals 24 Oct" matches every trade that day. */
function compareDay(filterDate: Date, cellValue: Date | null): number {
  if (!cellValue) return -1;
  const day = new Date(cellValue.getFullYear(), cellValue.getMonth(), cellValue.getDate());
  return day.getTime() - filterDate.getTime();
}

export function BlotterGrid({ trades, quickFilter, onAmend, onCancel }: BlotterGridProps) {
  const columnDefs = useMemo<ColDef<Trade>[]>(
    () => [
      { field: 'tradeId', headerName: 'Trade ID', width: 130, pinned: 'left' },
      {
        field: 'tradeTimestamp',
        headerName: 'Time',
        width: 200,
        initialSort: 'desc',
        cellDataType: false,
        valueFormatter: ({ value }) => formatTimestamp(value),
        filter: 'agDateColumnFilter',
        filterValueGetter: ({ data }) => (data ? new Date(data.tradeTimestamp) : null),
        filterParams: { comparator: compareDay },
      },
      { field: 'symbol', width: 110 },
      {
        field: 'side',
        width: 90,
        cellClass: ({ value }) => (value === 'BUY' ? 'side-buy' : 'side-sell'),
      },
      {
        field: 'quantity',
        type: 'rightAligned',
        width: 120,
        filter: 'agNumberColumnFilter',
        valueFormatter: ({ value }) => formatQuantity(value),
      },
      {
        field: 'price',
        type: 'rightAligned',
        width: 120,
        filter: 'agNumberColumnFilter',
        valueFormatter: ({ value }) => formatPrice(value),
      },
      {
        colId: 'notional',
        headerName: 'Notional',
        type: 'rightAligned',
        width: 140,
        filter: 'agNumberColumnFilter',
        valueGetter: ({ data }) => (data ? data.quantity * data.price : null),
        valueFormatter: ({ value }) => (value == null ? '' : formatNotional(value)),
      },
      { field: 'trader', width: 120 },
      { field: 'book', width: 140 },
      { field: 'counterparty', flex: 1, minWidth: 160 },
      { field: 'status', width: 120, cellRenderer: StatusCell },
      { field: 'version', headerName: 'Ver', type: 'rightAligned', width: 80, filter: false },
      {
        colId: 'actions',
        headerName: '',
        width: 170,
        pinned: 'right',
        sortable: false,
        filter: false,
        resizable: false,
        cellRenderer: ({ data }: ICellRendererParams<Trade>) =>
          data ? <RowActions trade={data} onAmend={onAmend} onCancel={onCancel} /> : null,
      },
    ],
    [onAmend, onCancel],
  );

  return (
    <div className="grid">
      <AgGridReact<Trade>
        rowData={trades}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={getRowId}
        rowClassRules={rowClassRules}
        quickFilterText={quickFilter}
        onRowDoubleClicked={({ data }) => {
          if (data?.status === 'ACTIVE') onAmend(data);
        }}
        overlayNoRowsTemplate="No trades match the current filters."
      />
    </div>
  );
}

function StatusCell({ value }: ICellRendererParams<Trade, Trade['status']>) {
  if (!value) return null;
  return <span className={`status status-${value.toLowerCase()}`}>{value}</span>;
}

interface RowActionsProps {
  trade: Trade;
  onAmend: (trade: Trade) => void;
  onCancel: (trade: Trade) => void;
}

function RowActions({ trade, onAmend, onCancel }: RowActionsProps) {
  const cancelled = trade.status === 'CANCELLED';
  return (
    <div className="row-actions">
      <button
        type="button"
        className="btn btn-small"
        disabled={cancelled}
        onClick={() => onAmend(trade)}
      >
        Amend
      </button>
      <button
        type="button"
        className="btn btn-small btn-danger"
        disabled={cancelled}
        onClick={() => onCancel(trade)}
      >
        Cancel
      </button>
    </div>
  );
}