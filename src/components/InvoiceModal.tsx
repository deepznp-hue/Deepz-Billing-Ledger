import React from 'react';
import { Printer, X, Copy, FileText } from 'lucide-react';
import { CompanyInfo, InvoiceRecord } from '../data/initialDb';
import { dfmt, fm2, fmt, fyl } from '../utils/formatters';

interface InvoiceModalProps {
  invoice: InvoiceRecord | null;
  company: CompanyInfo;
  onClose: () => void;
  onDuplicate: (inv: InvoiceRecord) => void;
  onFilterCustomer: (customerName: string) => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  invoice,
  company,
  onClose,
  onDuplicate,
  onFilterCustomer,
}) => {
  if (!invoice) return null;

  const isIgst = invoice.ig > 0;
  const totalQtyByUnit: Record<string, number> = {};
  invoice.L.forEach((l) => {
    const unit = l[3] || 'Unit';
    totalQtyByUnit[unit] = (totalQtyByUnit[unit] || 0) + (Number(l[2]) || 0);
  });

  const handlePrint = () => {
    try {
      window.print();
    } catch {
      // Ignore print errors in restricted frames
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 print-only-container"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1e201d] text-stone-900 dark:text-[#ecebe5] p-6 sm:p-8 shadow-xl my-auto print-invoice-sheet">
        {/* Top Action Bar (Hidden in Print) */}
        <div className="flex items-center justify-between gap-3 pb-5 mb-5 border-b border-stone-200 dark:border-stone-800 no-print">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            <FileText className="w-4 h-4 text-[#0f5c4d] dark:text-[#4fb59f]" />
            <span>Tax Invoice Record</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{fyl(invoice.fy)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDuplicate(invoice)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Duplicate this bill into a new invoice"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate Bill
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Invoice
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Close
            </button>
          </div>
        </div>

        {/* Invoice Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 mb-5 border-b-2 border-[#0f5c4d] dark:border-[#4fb59f]">
          <div>
            <div className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-0.5">
              Tax Invoice
            </div>
            <h2 className="text-2xl font-bold tracking-tight font-mono">
              #{invoice.no}
            </h2>
            <div className="mt-1 text-xs text-stone-600 dark:text-stone-400 font-mono">
              Date: {dfmt(invoice.dt)} <span aria-hidden="true">·</span> {fyl(invoice.fy)}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-base font-bold tracking-tight text-[#0f5c4d] dark:text-[#4fb59f]">
              {company.n}
            </div>
            <div className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
              {company.a}
              <br />
              Phone: {company.ph} <span aria-hidden="true">·</span> {company.em}
              <br />
              <span className="font-mono font-medium text-stone-800 dark:text-stone-200">
                GSTIN: {company.g}
              </span>{' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="font-mono">PAN: {company.pan}</span>
            </div>
          </div>
        </div>

        {/* Billed To & Transport Metadata */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 p-4 rounded-lg bg-stone-50 dark:bg-[#151614] border border-stone-200/80 dark:border-stone-800">
          <div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">
              Billed To
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onFilterCustomer(invoice.c);
              }}
              className="text-left font-bold text-sm text-stone-900 dark:text-white hover:text-[#0f5c4d] dark:hover:text-[#4fb59f] hover:underline cursor-pointer"
            >
              {invoice.c}
            </button>
            <div className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
              {invoice.a.filter(Boolean).join(', ')}
              {invoice.st && (
                <>
                  <br />
                  State: <span className="font-medium text-stone-800 dark:text-stone-200">{invoice.st}</span>
                </>
              )}
            </div>
          </div>
          <div className="sm:text-right flex flex-col justify-between text-xs text-stone-600 dark:text-stone-400">
            <div className="space-y-1">
              {invoice.gst && (
                <div>
                  Party GSTIN:{' '}
                  <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                    {invoice.gst}
                  </span>
                </div>
              )}
              {invoice.dc && (
                <div>
                  Delivery Challan (DC):{' '}
                  <span className="font-mono font-medium text-stone-800 dark:text-stone-200">
                    {invoice.dc}
                  </span>
                </div>
              )}
              {invoice.veh && (
                <div>
                  Vehicle No:{' '}
                  <span className="font-mono font-medium text-stone-800 dark:text-stone-200">
                    {invoice.veh}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-stone-200/60 dark:border-stone-800 font-mono">
              Tax Regime: {isIgst ? `Interstate (IGST ${invoice.gp}%)` : `Intrastate (CGST+SGST ${invoice.gp}%)`}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800 mb-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-stone-100/70 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400">
                <th className="py-2.5 px-3 text-left font-semibold w-10">#</th>
                <th className="py-2.5 px-3 text-left font-semibold">Description of Goods</th>
                <th className="py-2.5 px-3 text-left font-semibold">HSN/SAC</th>
                <th className="py-2.5 px-3 text-right font-semibold">Quantity</th>
                <th className="py-2.5 px-3 text-right font-semibold">Rate ₹</th>
                <th className="py-2.5 px-3 text-right font-semibold">Amount ₹</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {invoice.L.map((line, idx) => (
                <tr key={idx} className="hover:bg-stone-50/80 dark:hover:bg-stone-800/30">
                  <td className="py-2.5 px-3 text-xs text-stone-400 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium text-stone-900 dark:text-stone-100">
                    {line[0]}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-stone-600 dark:text-stone-400">
                    {line[1]}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {fmt(line[2])} <span className="text-xs text-stone-500">{line[3]}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {fm2(line[4])}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-medium tabular-nums">
                    {fm2(line[5])}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50 dark:bg-[#151614] border-t border-stone-200 dark:border-stone-800 text-xs font-medium text-stone-600 dark:text-stone-400">
                <td colSpan={3} className="py-2 px-3">
                  Total Quantity
                </td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-stone-900 dark:text-stone-200">
                  {Object.entries(totalQtyByUnit)
                    .map(([u, q]) => `${fmt(q)} ${u}`)
                    .join(' · ')}
                </td>
                <td className="py-2 px-3 text-right">Subtotal</td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
                  {fm2(invoice.tx + (invoice.disc || 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Summary & Totals Split */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
          <div className="sm:col-span-7 space-y-3 text-xs text-stone-600 dark:text-stone-400">
            <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-[#151614] border border-stone-200/80 dark:border-stone-800">
              <div className="text-[11px] text-stone-400 dark:text-stone-500 mb-1">
                Amount Chargeable (in words)
              </div>
              <div className="font-semibold text-stone-800 dark:text-stone-200 tracking-wide">
                {invoice.w}
              </div>
              {invoice.nar && (
                <div className="mt-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                  Note: {invoice.nar}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-stone-200/80 dark:border-stone-800 space-y-1">
              <div className="font-medium text-stone-700 dark:text-stone-300">
                Account Running Balance Summary
              </div>
              <div className="flex justify-between font-mono pt-1">
                <span>Previous Balance:</span>
                <span>₹{fm2(invoice.pre)}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span>Current Bill (#{invoice.no}):</span>
                <span>+ ₹{fm2(invoice.net)}</span>
              </div>
              <div className="flex justify-between font-mono font-semibold text-stone-900 dark:text-stone-100 pt-1 border-t border-stone-200 dark:border-stone-800">
                <span>Closing Net Balance:</span>
                <span>₹{fm2(invoice.bal)}</span>
              </div>
            </div>
          </div>

          <div className="sm:col-span-5 rounded-lg border border-stone-200 dark:border-stone-800 p-4 bg-stone-50/50 dark:bg-[#151614] space-y-2 text-sm">
            {invoice.disc > 0 && (
              <div className="flex justify-between text-stone-600 dark:text-stone-400 font-mono text-xs">
                <span>Discount</span>
                <span>- {fm2(invoice.disc)}</span>
              </div>
            )}
            <div className="flex justify-between text-stone-700 dark:text-stone-300 font-mono">
              <span className="font-sans text-xs text-stone-500">Taxable Value</span>
              <span>{fm2(invoice.tx)}</span>
            </div>
            {isIgst ? (
              <div className="flex justify-between text-stone-700 dark:text-stone-300 font-mono text-xs">
                <span className="font-sans text-stone-500">IGST @ {invoice.gp}%</span>
                <span>{fm2(invoice.ig)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-stone-700 dark:text-stone-300 font-mono text-xs">
                  <span className="font-sans text-stone-500">CGST @ {invoice.gp / 2}%</span>
                  <span>{fm2(invoice.cg)}</span>
                </div>
                <div className="flex justify-between text-stone-700 dark:text-stone-300 font-mono text-xs">
                  <span className="font-sans text-stone-500">SGST @ {invoice.gp / 2}%</span>
                  <span>{fm2(invoice.sg)}</span>
                </div>
              </>
            )}
            {invoice.ro !== 0 && (
              <div className="flex justify-between text-stone-600 dark:text-stone-400 font-mono text-xs">
                <span className="font-sans text-stone-500">Round Off</span>
                <span>{invoice.ro > 0 ? `+${fm2(invoice.ro)}` : fm2(invoice.ro)}</span>
              </div>
            )}
            <div className="pt-2.5 mt-2 border-t-2 border-stone-300 dark:border-stone-700 flex justify-between items-baseline">
              <span className="font-bold text-stone-900 dark:text-white">Invoice Total</span>
              <span className="text-lg font-bold font-mono text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums">
                ₹{fm2(invoice.net)}
              </span>
            </div>
          </div>
        </div>

        {/* Print Footer Signature */}
        <div className="mt-8 pt-4 border-t border-stone-200 dark:border-stone-800 flex justify-between items-end text-xs text-stone-500">
          <div>
            Subject to Namakkal / Komarapalayam Jurisdiction.
            <br />
            Goods once sold will not be taken back.
          </div>
          <div className="text-right">
            <div className="font-semibold text-stone-800 dark:text-stone-200 mb-6">
              For {company.n}
            </div>
            <div>Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
};
