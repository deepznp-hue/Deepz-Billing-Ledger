import React, { useState, useMemo } from 'react';
import { X, Download, Search } from 'lucide-react';
import { InvoiceRecord } from '../data/initialDb';
import { dfmt, downloadCsv, fm2, fmt, fyl } from '../utils/formatters';

interface ProductLinesModalProps {
  productName: string | null;
  invoices: InvoiceRecord[];
  onClose: () => void;
  onSelectInvoice: (inv: InvoiceRecord) => void;
  onSelectCustomer: (customerName: string) => void;
}

interface ProductLineEntry {
  invoice: InvoiceRecord;
  fy: string;
  billNo: number;
  date: string;
  customer: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  value: number;
}

export const ProductLinesModal: React.FC<ProductLinesModalProps> = ({
  productName,
  invoices,
  onClose,
  onSelectInvoice,
  onSelectCustomer,
}) => {
  const [viewMode, setViewMode] = useState<'lines' | 'customers'>('lines');
  const [filterText, setFilterText] = useState('');

  const lineEntries = useMemo(() => {
    if (!productName) return [];
    const results: ProductLineEntry[] = [];
    invoices.forEach((inv) => {
      inv.L.forEach((l) => {
        if (l[0] === productName) {
          results.push({
            invoice: inv,
            fy: inv.fy,
            billNo: inv.no,
            date: inv.dt,
            customer: inv.c,
            hsn: l[1] || '5806',
            qty: Number(l[2]) || 0,
            unit: l[3] || 'Mtr',
            rate: Number(l[4]) || 0,
            value: Number(l[5]) || 0,
          });
        }
      });
    });
    return results;
  }, [productName, invoices]);

  const filteredEntries = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return lineEntries;
    return lineEntries.filter((e) =>
      `${e.customer} ${e.billNo} ${dfmt(e.date)}`.toLowerCase().includes(q)
    );
  }, [lineEntries, filterText]);

  const customerSummary = useMemo(() => {
    const map: Record<
      string,
      { billsCount: number; billNos: number[]; qtyByUnit: Record<string, number>; totalValue: number }
    > = {};
    filteredEntries.forEach((e) => {
      const c =
        map[e.customer] ||
        (map[e.customer] = { billsCount: 0, billNos: [], qtyByUnit: {}, totalValue: 0 });
      c.billsCount++;
      if (!c.billNos.includes(e.billNo)) c.billNos.push(e.billNo);
      c.qtyByUnit[e.unit] = (c.qtyByUnit[e.unit] || 0) + e.qty;
      c.totalValue += e.value;
    });
    return Object.entries(map).sort((a, b) => b[1].totalValue - a[1].totalValue);
  }, [filteredEntries]);

  if (!productName) return null;

  const totalValue = filteredEntries.reduce((s, e) => s + e.value, 0);
  const totalQtyByUnit: Record<string, number> = {};
  filteredEntries.forEach((e) => {
    totalQtyByUnit[e.unit] = (totalQtyByUnit[e.unit] || 0) + e.qty;
  });

  const handleExport = () => {
    downloadCsv(
      `Product_${productName.replace(/[^a-z0-9]/gi, '_')}_Bills.csv`,
      ['Bill No', 'Date', 'FY', 'Customer Name', 'HSN', 'Quantity', 'Unit', 'Rate (₹)', 'Value (₹)'],
      filteredEntries.map((e) => [
        e.billNo,
        dfmt(e.date),
        fyl(e.fy),
        e.customer,
        e.hsn,
        e.qty,
        e.unit,
        e.rate,
        e.value,
      ])
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1e201d] text-stone-900 dark:text-[#ecebe5] p-6 shadow-xl my-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 mb-5 border-b border-stone-200 dark:border-stone-800">
          <div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">
              Product Line-Item Breakdown · HSN {lineEntries[0]?.hsn || '5806'}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-[#0f5c4d] dark:text-[#4fb59f]">
              {productName}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
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

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-[#151614]">
            <div className="text-xs text-stone-500">Total Bill Lines</div>
            <div className="text-lg font-bold font-mono mt-0.5 tabular-nums">
              {fmt(filteredEntries.length)}
            </div>
          </div>
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-[#151614]">
            <div className="text-xs text-stone-500">Total Quantity Sold</div>
            <div className="text-lg font-bold font-mono mt-0.5 tabular-nums">
              {Object.entries(totalQtyByUnit)
                .map(([u, q]) => `${fmt(q)} ${u}`)
                .join(' · ') || '0'}
            </div>
          </div>
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-[#151614]">
            <div className="text-xs text-stone-500">Total Taxable Value</div>
            <div className="text-lg font-bold font-mono mt-0.5 text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums">
              ₹{fm2(totalValue)}
            </div>
          </div>
        </div>

        {/* Filter & View Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-stone-100 dark:bg-[#151614] border border-stone-200/70 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setViewMode('lines')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'lines'
                  ? 'bg-[#0f5c4d] text-white'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Individual Bill Lines ({filteredEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('customers')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'customers'
                  ? 'bg-[#0f5c4d] text-white'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              By Customer ({customerSummary.length})
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              placeholder="Filter by customer or bill no..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151614]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="max-h-96 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800">
          {viewMode === 'lines' ? (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-stone-100 dark:bg-[#272a25] text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Customer Name</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Bill No.</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Quantity</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Rate ₹</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Value ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-400">
                      No matching bill lines found
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry, idx) => (
                    <tr
                      key={`${entry.fy}-${entry.billNo}-${idx}`}
                      className="hover:bg-stone-100/80 dark:hover:bg-stone-800/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectCustomer(entry.customer);
                          }}
                          className="text-left hover:text-[#0f5c4d] dark:hover:text-[#4fb59f] hover:underline cursor-pointer"
                        >
                          {entry.customer}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectInvoice(entry.invoice);
                          }}
                          className="font-semibold text-[#0f5c4d] dark:text-[#4fb59f] hover:underline cursor-pointer"
                        >
                          #{entry.billNo}
                        </button>
                        <span className="ml-1.5 text-[11px] text-stone-400">
                          · {fyl(entry.fy).replace('FY ', '')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-stone-600 dark:text-stone-400">
                        {dfmt(entry.date)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                        {fmt(entry.qty)} {entry.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                        {fm2(entry.rate)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                        {fm2(entry.value)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-stone-100 dark:bg-[#272a25] text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">Customer Name</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Bill Numbers</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Lines</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Total Qty</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Total Value ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {customerSummary.map(([cName, info]) => (
                  <tr
                    key={cName}
                    onClick={() => {
                      onClose();
                      onSelectCustomer(cName);
                    }}
                    className="hover:bg-stone-100/80 dark:hover:bg-stone-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium">{cName}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-stone-500 max-w-xs truncate">
                      {info.billNos.map((n) => `#${n}`).join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {info.billsCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                      {Object.entries(info.qtyByUnit)
                        .map(([u, q]) => `${fmt(q)} ${u}`)
                        .join(' · ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                      {fm2(info.totalValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
