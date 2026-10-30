import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { CustomerRecord, ProductRecord, ReceiptPaymentRecord } from '../data/initialDb';
import { getFinancialYearFromDate } from '../utils/formatters';

interface QuickEntryModalProps {
  mode: 'receipt' | 'payment' | 'customer' | 'product' | null;
  onClose: () => void;
  customers: CustomerRecord[];
  nextReceiptNo: number;
  nextPaymentNo: number;
  onAddReceiptPayment: (type: 'rec' | 'pay', entry: ReceiptPaymentRecord) => void;
  onAddCustomer: (cust: CustomerRecord) => void;
  onAddProduct: (prod: ProductRecord) => void;
}

export const QuickEntryModal: React.FC<QuickEntryModalProps> = ({
  mode,
  onClose,
  customers,
  nextReceiptNo,
  nextPaymentNo,
  onAddReceiptPayment,
  onAddCustomer,
  onAddProduct,
}) => {
  const [dt, setDt] = useState('2026-10-21');
  const [party, setParty] = useState('');
  const [bankMode, setBankMode] = useState('KVB');
  const [amt, setAmt] = useState('');
  const [nar, setNar] = useState('Neft');

  const [custName, setCustName] = useState('');
  const [custState, setCustState] = useState('Tamil Nadu');
  const [custGstin, setCustGstin] = useState('');
  const [custMobile, setCustMobile] = useState('');
  const [custAddr, setCustAddr] = useState('');

  const [prodName, setProdName] = useState('');
  const [prodHsn, setProdHsn] = useState('5806');

  if (!mode) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'receipt' || mode === 'payment') {
      if (!party.trim() || !amt) return;
      const fy = getFinancialYearFromDate(dt);
      const entry: ReceiptPaymentRecord = {
        fy,
        no: mode === 'receipt' ? nextReceiptNo : nextPaymentNo,
        dt,
        p: party.trim().toUpperCase(),
        m: bankMode.trim().toUpperCase() || 'KVB',
        amt: Number(parseFloat(amt) || 0),
        nar: nar.trim() || 'Neft',
      };
      onAddReceiptPayment(mode === 'receipt' ? 'rec' : 'pay', entry);
    } else if (mode === 'customer') {
      if (!custName.trim()) return;
      onAddCustomer({
        n: custName.trim().toUpperCase(),
        s: custState.trim(),
        g: custGstin.trim().toUpperCase(),
        m: custMobile.trim(),
        a: custAddr.trim(),
      });
    } else if (mode === 'product') {
      if (!prodName.trim()) return;
      onAddProduct({
        n: prodName.trim(),
        h: prodHsn.trim() || '5806',
      });
    }
    onClose();
  };

  const titles: Record<string, string> = {
    receipt: 'Record Customer Receipt',
    payment: 'Record Payment Voucher',
    customer: 'Add Customer Account',
    product: 'Add Textile Product / HSN',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1e201d] text-stone-900 dark:text-[#ecebe5] p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="text-base font-bold">{titles[mode]}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
          {(mode === 'receipt' || mode === 'payment') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">
                    Voucher No.
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`#${mode === 'receipt' ? nextReceiptNo : nextPaymentNo}`}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 text-stone-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dt}
                    onChange={(e) => setDt(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Party Name
                </label>
                <input
                  type="text"
                  required
                  list="quick-party-list"
                  placeholder="Select or type party..."
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
                <datalist id="quick-party-list">
                  {customers.map((c, i) => (
                    <option key={i} value={c.n} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">
                    Bank / Mode
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="KVB, FEDERAL, CASH..."
                    value={bankMode}
                    onChange={(e) => setBankMode(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={amt}
                    onChange={(e) => setAmt(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Narration / Reference
                </label>
                <input
                  type="text"
                  placeholder="Neft / Cheque No..."
                  value={nar}
                  onChange={(e) => setNar(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
            </>
          )}

          {mode === 'customer' && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Customer / Firm Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SRI MURUGAN TEXTILES"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-3 py-2 uppercase rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={custState}
                    onChange={(e) => setCustState(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    placeholder="98427..."
                    value={custMobile}
                    onChange={(e) => setCustMobile(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  GSTIN
                </label>
                <input
                  type="text"
                  placeholder="33AAAAA0000A1Z5"
                  value={custGstin}
                  onChange={(e) => setCustGstin(e.target.value)}
                  className="w-full px-3 py-2 font-mono uppercase rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Full Billing Address
                </label>
                <input
                  type="text"
                  placeholder="Door No, Street, City - Pincode"
                  value={custAddr}
                  onChange={(e) => setCustAddr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
            </>
          )}

          {mode === 'product' && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Product Description
                </label>
                <input
                  type="text"
                  required
                  placeholder='e.g. 25mm Cotton Twill Tape - Natural'
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  HSN / SAC Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="58061000 or 5607"
                  value={prodHsn}
                  onChange={(e) => setProdHsn(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Save Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
