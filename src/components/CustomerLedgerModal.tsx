import React, { useState, useMemo } from 'react';
import { X, Download, Plus, ArrowUpRight, Printer } from 'lucide-react';
import { CustomerRecord, InvoiceRecord, ReceiptPaymentRecord } from '../data/initialDb';
import { dfmt, downloadCsv, fm2, fyl } from '../utils/formatters';

interface CustomerLedgerModalProps {
  customerName: string | null;
  customerMeta?: CustomerRecord;
  invoices: InvoiceRecord[];
  receipts: ReceiptPaymentRecord[];
  payments: ReceiptPaymentRecord[];
  onClose: () => void;
  onSelectInvoice: (inv: InvoiceRecord) => void;
  onNewInvoiceForCustomer: (name: string) => void;
  onFilterInInvoicesTab: (name: string) => void;
}

export interface BalanceSheetEntry {
  sortDate: string;
  fy: string;
  billNo: string;
  billDate: string;
  netAmount: number;
  recoveryDate: string;
  paymentType: string;
  receivedAmount: number;
  runningBalance: number;
  invoiceRef?: InvoiceRecord;
}

export function buildCustomerBalanceSheet(
  custInvoices: InvoiceRecord[],
  custReceipts: ReceiptPaymentRecord[],
  custPayments: ReceiptPaymentRecord[]
): BalanceSheetEntry[] {
  // Combine invoices and receipts chronologically (oldest to newest) to compute running balance
  interface RawLedgerEvent {
    dt: string;
    fy: string;
    kind: 'bill' | 'rec' | 'pay';
    inv?: InvoiceRecord;
    rec?: ReceiptPaymentRecord;
  }

  const rawEvents: RawLedgerEvent[] = (
    [
      ...custInvoices.map((i): RawLedgerEvent => ({ dt: i.dt, fy: i.fy, kind: 'bill', inv: i })),
      ...custReceipts.map((r): RawLedgerEvent => ({ dt: r.dt, fy: r.fy, kind: 'rec', rec: r })),
      ...custPayments.map((p): RawLedgerEvent => ({ dt: p.dt, fy: p.fy, kind: 'pay', rec: p })),
    ] as RawLedgerEvent[]
  ).sort((a, b) => {
    const cmp = a.dt.localeCompare(b.dt);
    if (cmp !== 0) return cmp;
    if (a.kind === 'bill' && b.kind === 'bill') {
      return (a.inv?.no || 0) - (b.inv?.no || 0);
    }
    if (a.kind === 'bill' && b.kind !== 'bill') return -1;
    if (a.kind !== 'bill' && b.kind === 'bill') return 1;
    return (a.rec?.no || 0) - (b.rec?.no || 0);
  });

  let running = 0;
  const rows: BalanceSheetEntry[] = rawEvents.map((ev) => {
    if (ev.kind === 'bill' && ev.inv) {
      if (
        ev.inv.bal !== undefined &&
        (ev.inv.bal !== 0 || ev.inv.pre !== 0 || running === 0)
      ) {
        running = ev.inv.bal;
      } else {
        running += ev.inv.net;
      }
      return {
        sortDate: ev.dt,
        fy: ev.fy,
        billNo: `#${ev.inv.no}`,
        billDate: dfmt(ev.inv.dt),
        netAmount: ev.inv.net,
        recoveryDate: '–',
        paymentType: '–',
        receivedAmount: 0,
        runningBalance: running,
        invoiceRef: ev.inv,
      };
    } else {
      const r = ev.rec!;
      const isPay = ev.kind === 'pay';
      running = isPay ? running + r.amt : running - r.amt;
      const pType = [r.m, r.nar].filter(Boolean).join(' · ') || 'NEFT';
      return {
        sortDate: ev.dt,
        fy: ev.fy,
        billNo: '–',
        billDate: '–',
        netAmount: 0,
        recoveryDate: dfmt(r.dt),
        paymentType: isPay ? `${pType} (Dr)` : pType,
        receivedAmount: r.amt,
        runningBalance: running,
      };
    }
  });

  // Return newest first for display
  return rows.reverse();
}

export function computeCustomerCurrentBalance(
  custInvoices: InvoiceRecord[],
  custReceipts: ReceiptPaymentRecord[],
  custPayments: ReceiptPaymentRecord[]
): number {
  const rows = buildCustomerBalanceSheet(custInvoices, custReceipts, custPayments);
  return rows.length > 0 ? rows[0].runningBalance : 0;
}

export const CustomerLedgerModal: React.FC<CustomerLedgerModalProps> = ({
  customerName,
  customerMeta,
  invoices,
  receipts,
  payments,
  onClose,
  onSelectInvoice,
  onNewInvoiceForCustomer,
  onFilterInInvoicesTab,
}) => {
  const [subTab, setSubTab] = useState<'balancesheet' | 'invoices' | 'receipts'>('balancesheet');

  const custInvoices = useMemo(
    () => (customerName ? invoices.filter((i) => i.c === customerName) : []),
    [customerName, invoices]
  );
  const custReceipts = useMemo(
    () => (customerName ? receipts.filter((r) => r.p === customerName) : []),
    [customerName, receipts]
  );
  const custPayments = useMemo(
    () => (customerName ? payments.filter((p) => p.p === customerName) : []),
    [customerName, payments]
  );

  const balanceSheetRows = useMemo(
    () => buildCustomerBalanceSheet(custInvoices, custReceipts, custPayments),
    [custInvoices, custReceipts, custPayments]
  );

  if (!customerName) return null;

  const totalBilled = custInvoices.reduce((s, i) => s + i.net, 0);
  const totalReceived = custReceipts.reduce((s, r) => s + r.amt, 0);
  const latestInvoice = custInvoices[0];
  const currentBalance =
    balanceSheetRows.length > 0
      ? balanceSheetRows[0].runningBalance
      : latestInvoice?.bal ?? 0;

  const handleExportLedger = () => {
    downloadCsv(
      `${customerName.replace(/[^a-z0-9]/gi, '_')}_Balance_Sheet.csv`,
      [
        'FY',
        'Bill No.',
        'Bill Date',
        'Net Bill Amount (₹)',
        'Payment Recovery Date',
        'Payment Type',
        'Received Amount (₹)',
        'Balance (₹)',
      ],
      balanceSheetRows.map((r) => [
        fyl(r.fy),
        r.billNo,
        r.billDate,
        r.netAmount || '',
        r.recoveryDate,
        r.paymentType,
        r.receivedAmount || '',
        r.runningBalance,
      ])
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 print-only-container"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1e201d] text-stone-900 dark:text-[#ecebe5] p-6 shadow-xl my-auto print-invoice-sheet">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 mb-5 border-b border-stone-200 dark:border-stone-800">
          <div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">
              Customer Balance Sheet & Date-Wise Recovery Statement
            </div>
            <h2 className="text-xl font-bold tracking-tight">{customerName}</h2>
            <div className="text-xs text-stone-600 dark:text-stone-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {customerMeta?.s && <span>{customerMeta.s}</span>}
              {customerMeta?.g && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">GSTIN {customerMeta.g}</span>
                </>
              )}
              {customerMeta?.m && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">Tel {customerMeta.m}</span>
                </>
              )}
            </div>
            {customerMeta?.a && (
              <div className="text-xs text-stone-500 mt-0.5">
                {customerMeta.a.replace(/,,/g, ',')}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 no-print">
            <button
              type="button"
              onClick={() => {
                onClose();
                onFilterInInvoicesTab(customerName);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer whitespace-nowrap"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Filter in Invoices
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  window.print();
                } catch {
                  // ignore
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={handleExportLedger}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNewInvoiceForCustomer(customerName);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Bill
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-[#151614]">
            <div className="text-xs text-stone-500">Total Bills</div>
            <div className="text-lg font-bold font-mono mt-0.5 tabular-nums">
              {custInvoices.length}
            </div>
          </div>
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-[#151614]">
            <div className="text-xs text-stone-500">Total Net Billed</div>
            <div className="text-lg font-bold font-mono mt-0.5 tabular-nums">
              ₹{fm2(totalBilled)}
            </div>
          </div>
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-[#151614]">
            <div className="text-xs text-stone-500">Total Payment Recovered</div>
            <div className="text-lg font-bold font-mono mt-0.5 text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums">
              ₹{fm2(totalReceived)}
            </div>
          </div>
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-[#151614]">
            <div className="text-xs text-stone-500">Current Balance</div>
            <div className="text-lg font-bold font-mono mt-0.5 text-[#d98324] dark:text-[#e8a455] tabular-nums">
              ₹{fm2(currentBalance)}
            </div>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3 no-print">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-stone-100 dark:bg-[#151614] border border-stone-200/70 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setSubTab('balancesheet')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'balancesheet'
                  ? 'bg-[#0f5c4d] text-white'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Date-Wise Balance Sheet ({balanceSheetRows.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('invoices')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'invoices'
                  ? 'bg-[#0f5c4d] text-white'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Invoices Only ({custInvoices.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('receipts')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'receipts'
                  ? 'bg-[#0f5c4d] text-white'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Receipts Only ({custReceipts.length + custPayments.length})
            </button>
          </div>
          <div className="text-xs text-stone-500">
            Date-wise Bill No., Bill Date, Net Amount & Payment Recovery Date, Payment Type, Received Amount
          </div>
        </div>

        {/* Table Content */}
        <div className="max-h-[440px] overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800">
          {subTab === 'balancesheet' && (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-stone-100 dark:bg-[#272a25] text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Bill No.</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Bill Date</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Net Amount ₹</th>
                  <th className="py-2.5 px-3 text-left font-semibold border-l border-stone-200 dark:border-stone-700">
                    Payment Recover Date
                  </th>
                  <th className="py-2.5 px-3 text-left font-semibold">Payment Type</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Received Amount ₹</th>
                  <th className="py-2.5 px-3 text-right font-semibold border-l border-stone-200 dark:border-stone-700">
                    Balance ₹
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {balanceSheetRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-stone-400">
                      No transactions found for this customer
                    </td>
                  </tr>
                ) : (
                  balanceSheetRows.map((row, idx) => (
                    <tr
                      key={idx}
                      onClick={() => {
                        if (row.invoiceRef) {
                          onClose();
                          onSelectInvoice(row.invoiceRef);
                        }
                      }}
                      className={`${
                        row.invoiceRef
                          ? 'hover:bg-stone-100/80 dark:hover:bg-stone-800/50 cursor-pointer'
                          : 'bg-[#f6f5f1]/50 dark:bg-[#151614]/40'
                      } transition-colors`}
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#0f5c4d] dark:text-[#4fb59f]">
                        {row.billNo}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-stone-600 dark:text-stone-400">
                        {row.billDate}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                        {row.netAmount > 0 ? fm2(row.netAmount) : '–'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-stone-600 dark:text-stone-400 border-l border-stone-200/70 dark:border-stone-800">
                        {row.recoveryDate}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-stone-700 dark:text-stone-300">
                        {row.paymentType}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums">
                        {row.receivedAmount > 0 ? fm2(row.receivedAmount) : '–'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-stone-600 dark:text-stone-400 tabular-nums border-l border-stone-200/70 dark:border-stone-800">
                        {fm2(row.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {subTab === 'invoices' && (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-stone-100 dark:bg-[#272a25] text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">No.</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Items Summary</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Taxable ₹</th>
                  <th className="py-2.5 px-3 text-right font-semibold">GST ₹</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Net ₹</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Balance ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {custInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-stone-400">
                      No invoices found for this customer
                    </td>
                  </tr>
                ) : (
                  custInvoices.map((inv) => (
                    <tr
                      key={`${inv.fy}-${inv.no}`}
                      onClick={() => {
                        onClose();
                        onSelectInvoice(inv);
                      }}
                      className="hover:bg-stone-100/80 dark:hover:bg-stone-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-medium">#{inv.no}</td>
                      <td className="py-2.5 px-3 font-mono text-xs text-stone-600 dark:text-stone-400">
                        {dfmt(inv.dt)}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-stone-600 dark:text-stone-300 max-w-xs truncate">
                        {inv.L.map((l) => l[0]).join(', ')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {fm2(inv.tx)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-stone-500 tabular-nums">
                        {fm2(inv.cg + inv.sg + inv.ig)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                        {fm2(inv.net)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-stone-500 tabular-nums">
                        {fm2(inv.bal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {subTab === 'receipts' && (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-stone-100 dark:bg-[#272a25] text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">No.</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Recover Date</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Type</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Payment Mode</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Narration</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Received Amount ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {custReceipts.length === 0 && custPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-400">
                      No receipts or payments recorded for this party
                    </td>
                  </tr>
                ) : (
                  [
                    ...custReceipts.map((r) => ({ ...r, _type: 'Receipt' as const })),
                    ...custPayments.map((p) => ({ ...p, _type: 'Payment' as const })),
                  ]
                    .sort((a, b) => b.dt.localeCompare(a.dt))
                    .map((entry, idx) => (
                      <tr key={idx} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                        <td className="py-2.5 px-3 font-mono">#{entry.no}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-stone-600 dark:text-stone-400">
                          {dfmt(entry.dt)}
                        </td>
                        <td className="py-2.5 px-3 text-xs font-medium">
                          {entry._type}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-stone-600 dark:text-stone-400">
                          {entry.m}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-stone-600 dark:text-stone-400">
                          {entry.nar}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                          {fm2(entry.amt)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
