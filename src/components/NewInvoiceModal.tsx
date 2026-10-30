import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, X, Check } from 'lucide-react';
import { CustomerRecord, InvoiceRecord, ProductRecord } from '../data/initialDb';
import { fm2, getFinancialYearFromDate, numberToIndianWords } from '../utils/formatters';

interface NewInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newInv: InvoiceRecord) => void;
  customers: CustomerRecord[];
  products: ProductRecord[];
  invoices: InvoiceRecord[];
  initialTemplate?: InvoiceRecord | null;
  defaultCustomerName?: string;
}

interface DraftLine {
  product: string;
  hsn: string;
  qty: string;
  unit: string;
  rate: string;
}

export const NewInvoiceModal: React.FC<NewInvoiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  customers,
  products,
  invoices,
  initialTemplate,
  defaultCustomerName,
}) => {
  const todayStr = '2026-10-21';

  const [dt, setDt] = useState(todayStr);
  const [billNo, setBillNo] = useState<number>(203);
  const [customerName, setCustomerName] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [addressLines, setAddressLines] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [dcNo, setDcNo] = useState('');
  const [gstPercent, setGstPercent] = useState<number>(5);
  const [discount, setDiscount] = useState<string>('0');
  const [prevBalance, setPrevBalance] = useState<string>('0');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { product: '1"Brown Tape Of Tanishq', hsn: '58061000', qty: '1000', unit: 'Mtr', rate: '4.35' },
  ]);

  // Build product defaults (HSN + last used unit and rate from historical invoices)
  const productDefaults = useMemo(() => {
    const map: Record<string, { hsn: string; unit: string; rate: number }> = {};
    products.forEach((p) => {
      map[p.n] = { hsn: p.h || '5806', unit: 'Mtr', rate: 0 };
    });
    // Scan invoices oldest to newest so latest rate wins
    [...invoices].reverse().forEach((inv) => {
      inv.L.forEach((l) => {
        if (l[0]) {
          map[l[0]] = {
            hsn: l[1] || map[l[0]]?.hsn || '5806',
            unit: l[3] || 'Mtr',
            rate: Number(l[4]) || 0,
          };
        }
      });
    });
    return map;
  }, [products, invoices]);

  const fy = useMemo(() => getFinancialYearFromDate(dt), [dt]);

  // Calculate next bill number for selected FY
  useEffect(() => {
    if (!isOpen) return;
    const fyInvoices = invoices.filter((i) => i.fy === fy);
    const maxNo = fyInvoices.reduce((max, i) => Math.max(max, i.no), 0);
    setBillNo(maxNo + 1);
  }, [fy, invoices, isOpen]);

  // Populate from template or defaultCustomerName
  useEffect(() => {
    if (!isOpen) return;
    if (initialTemplate) {
      setDt(todayStr);
      setCustomerName(initialTemplate.c);
      setGstin(initialTemplate.gst);
      setStateName(initialTemplate.st || 'Tamil Nadu');
      setAddressLines(initialTemplate.a.filter(Boolean).join(', '));
      setVehicle(initialTemplate.veh || '');
      setDcNo('');
      setGstPercent(initialTemplate.gp || 5);
      setDiscount(String(initialTemplate.disc || 0));
      // Find latest balance for this customer
      const latestForCust = invoices.find((i) => i.c === initialTemplate.c);
      setPrevBalance(String(latestForCust ? latestForCust.bal : initialTemplate.bal || 0));
      setNarration(initialTemplate.nar || '');
      setLines(
        initialTemplate.L.map((l) => ({
          product: l[0],
          hsn: l[1],
          qty: String(l[2]),
          unit: l[3],
          rate: String(l[4]),
        }))
      );
    } else if (defaultCustomerName) {
      handleSelectCustomer(defaultCustomerName);
    } else {
      setCustomerName('');
      setGstin('');
      setStateName('Tamil Nadu');
      setAddressLines('');
      setVehicle('');
      setDcNo('');
      setGstPercent(5);
      setDiscount('0');
      setPrevBalance('0');
      setNarration('');
      setLines([
        { product: '1"Brown Tape Of Tanishq', hsn: '58061000', qty: '1000', unit: 'Mtr', rate: '4.35' },
      ]);
    }
  }, [isOpen, initialTemplate, defaultCustomerName]);

  const handleSelectCustomer = (name: string) => {
    setCustomerName(name);
    const foundCust = customers.find((c) => c.n.toLowerCase() === name.toLowerCase());
    const latestInv = invoices.find((i) => i.c.toLowerCase() === name.toLowerCase());

    if (foundCust) {
      setGstin(foundCust.g || latestInv?.gst || '');
      setStateName(foundCust.s || latestInv?.st || 'Tamil Nadu');
      setAddressLines(foundCust.a ? foundCust.a.replace(/,,/g, ',') : latestInv?.a.join(', ') || '');
    } else if (latestInv) {
      setGstin(latestInv.gst || '');
      setStateName(latestInv.st || 'Tamil Nadu');
      setAddressLines(latestInv.a.filter(Boolean).join(', '));
    }

    if (latestInv) {
      setPrevBalance(String(latestInv.bal || 0));
    }
  };

  const handleLineProductChange = (idx: number, prodName: string) => {
    const next = [...lines];
    next[idx].product = prodName;
    const def = productDefaults[prodName];
    if (def) {
      next[idx].hsn = def.hsn;
      next[idx].unit = def.unit;
      if (def.rate > 0) {
        next[idx].rate = String(def.rate);
      }
    }
    setLines(next);
  };

  const updateLine = (idx: number, field: keyof DraftLine, val: string) => {
    const next = [...lines];
    next[idx] = { ...next[idx], [field]: val };
    setLines(next);
  };

  const addLine = () => {
    setLines([...lines, { product: '', hsn: '5806', qty: '1000', unit: 'Mtr', rate: '1.00' }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  // Determine Intrastate (Tamil Nadu) vs Interstate
  const isInterstate = useMemo(() => {
    const stClean = stateName.trim().toLowerCase();
    const gstClean = gstin.trim();
    if (gstClean.length >= 2 && !gstClean.startsWith('33')) return true;
    if (
      stClean &&
      !stClean.includes('tamil') &&
      stClean !== 'tn' &&
      !stClean.includes('tammil')
    ) {
      return true;
    }
    return false;
  }, [stateName, gstin]);

  // Financial math
  const subtotal = useMemo(() => {
    return lines.reduce((acc, l) => {
      const q = parseFloat(l.qty) || 0;
      const r = parseFloat(l.rate) || 0;
      return acc + q * r;
    }, 0);
  }, [lines]);

  const discNum = parseFloat(discount) || 0;
  const taxableValue = Math.max(0, Number((subtotal - discNum).toFixed(2)));
  const totalGst = Number(((taxableValue * gstPercent) / 100).toFixed(2));
  const cgst = isInterstate ? 0 : Number((totalGst / 2).toFixed(2));
  const sgst = isInterstate ? 0 : Number((totalGst / 2).toFixed(2));
  const igst = isInterstate ? totalGst : 0;

  const exactNet = taxableValue + cgst + sgst + igst;
  const roundedNet = Math.round(exactNet);
  const roundOff = Number((roundedNet - exactNet).toFixed(2));
  const prevBalNum = parseFloat(prevBalance) || 0;
  const closingBalance = Number((prevBalNum + roundedNet).toFixed(2));
  const amountWords = useMemo(() => numberToIndianWords(roundedNet), [roundedNet]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    const formattedLines: [string, string, number, string, number, number][] = lines.map((l) => {
      const q = Number(parseFloat(l.qty) || 0);
      const r = Number(parseFloat(l.rate) || 0);
      const amt = Number((q * r).toFixed(2));
      return [l.product.trim() || 'Textile Goods', l.hsn.trim() || '5806', q, l.unit.trim() || 'Mtr', r, amt];
    });

    const addrParts = addressLines
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const newInvoice: InvoiceRecord = {
      fy,
      no: Number(billNo) || 1,
      dt,
      c: customerName.trim().toUpperCase(),
      gst: gstin.trim().toUpperCase(),
      st: stateName.trim(),
      veh: vehicle.trim().toUpperCase(),
      tx: taxableValue,
      cg: cgst,
      sg: sgst,
      ig: igst,
      gp: gstPercent,
      ro: roundOff,
      net: roundedNet,
      pre: prevBalNum,
      bal: closingBalance,
      disc: discNum,
      nar: narration.trim(),
      w: amountWords,
      a: addrParts.length > 0 ? addrParts : ['', '', ''],
      dc: dcNo.trim(),
      L: formattedLines,
    };

    onSave(newInvoice);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1e201d] text-stone-900 dark:text-[#ecebe5] p-6 shadow-xl my-auto">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              Create GST Tax Invoice
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Auto-computes HSN totals, CGST/SGST vs IGST, round-off, and running party balance
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Row 1: Bill No, Date, Customer, GSTIN */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Invoice No.
              </label>
              <input
                type="number"
                required
                value={billNo}
                onChange={(e) => setBillNo(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                required
                value={dt}
                onChange={(e) => setDt(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Customer / Party Name
              </label>
              <input
                type="text"
                required
                list="mp-customer-list"
                placeholder="Select or type customer..."
                value={customerName}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
              <datalist id="mp-customer-list">
                {customers.map((c, i) => (
                  <option key={i} value={c.n}>
                    {c.s ? `${c.s} · ${c.g}` : c.g}
                  </option>
                ))}
              </datalist>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Party GSTIN
              </label>
              <input
                type="text"
                placeholder="33AABFJ2836N1ZA"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
            </div>
          </div>

          {/* Row 2: Address, State, DC, Vehicle */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Billing Address
              </label>
              <input
                type="text"
                placeholder="Street, Area, City - Pincode"
                value={addressLines}
                onChange={(e) => setAddressLines(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                State
              </label>
              <input
                type="text"
                placeholder="Tamil Nadu"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                DC No.
              </label>
              <input
                type="text"
                placeholder="e.g. 1469"
                value={dcNo}
                onChange={(e) => setDcNo(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Vehicle No.
              </label>
              <input
                type="text"
                placeholder="TN34..."
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
              />
            </div>
          </div>

          {/* Line Items Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                Line Items (Tapes, Ropes & Yarn)
              </label>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-stone-100 dark:bg-stone-800 text-[#0f5c4d] dark:text-[#4fb59f] hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item Line
              </button>
            </div>

            <datalist id="mp-product-list">
              {Object.keys(productDefaults).map((pName, i) => (
                <option key={i} value={pName}>
                  HSN {productDefaults[pName].hsn} · ₹{productDefaults[pName].rate}/{productDefaults[pName].unit}
                </option>
              ))}
            </datalist>

            <div className="rounded-lg border border-stone-200 dark:border-stone-800 overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-stone-50 dark:bg-[#151614] border-b border-stone-200 dark:border-stone-800 text-xs text-stone-500">
                    <th className="py-2 px-3 text-left font-medium">Product Description</th>
                    <th className="py-2 px-2 text-left font-medium w-28">HSN</th>
                    <th className="py-2 px-2 text-right font-medium w-28">Qty</th>
                    <th className="py-2 px-2 text-left font-medium w-24">Unit</th>
                    <th className="py-2 px-2 text-right font-medium w-28">Rate ₹</th>
                    <th className="py-2 px-3 text-right font-medium w-32">Amount ₹</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                  {lines.map((line, idx) => {
                    const amt = (parseFloat(line.qty) || 0) * (parseFloat(line.rate) || 0);
                    return (
                      <tr key={idx}>
                        <td className="p-2">
                          <input
                            type="text"
                            required
                            list="mp-product-list"
                            placeholder="Product description..."
                            value={line.product}
                            onChange={(e) => handleLineProductChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151614]"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.hsn}
                            onChange={(e) => updateLine(idx, 'hsn', e.target.value)}
                            className="w-full px-2 py-1.5 text-xs font-mono rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151614]"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            required
                            value={line.qty}
                            onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm font-mono text-right rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151614]"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={line.unit}
                            onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                            className="w-full px-2 py-1.5 text-xs rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151614]"
                          >
                            <option value="Mtr">Mtr</option>
                            <option value="Kg">Kg</option>
                            <option value="No">No</option>
                            <option value="Bag">Bag</option>
                            <option value="Roll">Roll</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            required
                            value={line.rate}
                            onChange={(e) => updateLine(idx, 'rate', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm font-mono text-right rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#151614]"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium tabular-nums">
                          {fm2(amt)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            disabled={lines.length <= 1}
                            className="p-1 text-stone-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tax & Balance Configuration + Live Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2">
            <div className="sm:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  GST Rate (%)
                </label>
                <select
                  value={gstPercent}
                  onChange={(e) => setGstPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                >
                  <option value={5}>5% (Standard Textile)</option>
                  <option value={12}>12% (Synthetic/Yarn)</option>
                  <option value={18}>18%</option>
                  <option value={0}>0% (Exempt)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Discount (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Previous Balance (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={prevBalance}
                  onChange={(e) => setPrevBalance(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                  Narration / Notes (optional)
                </label>
                <input
                  type="text"
                  placeholder="Optional dispatch or billing notes..."
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151614]"
                />
              </div>
              <div className="sm:col-span-3 p-3 rounded-lg bg-stone-50 dark:bg-[#151614] border border-stone-200/80 dark:border-stone-800 text-xs">
                <span className="text-stone-400">Amount in Words: </span>
                <span className="font-semibold text-stone-800 dark:text-stone-200">{amountWords}</span>
              </div>
            </div>

            <div className="sm:col-span-5 rounded-lg border border-stone-200 dark:border-stone-800 p-4 bg-stone-50/60 dark:bg-[#151614] space-y-2 text-xs">
              <div className="flex justify-between font-mono">
                <span className="font-sans text-stone-500">Taxable Value</span>
                <span className="font-medium text-stone-900 dark:text-stone-100">₹{fm2(taxableValue)}</span>
              </div>
              {isInterstate ? (
                <div className="flex justify-between font-mono">
                  <span className="font-sans text-stone-500">IGST ({gstPercent}%)</span>
                  <span>₹{fm2(igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between font-mono">
                    <span className="font-sans text-stone-500">CGST ({gstPercent / 2}%)</span>
                    <span>₹{fm2(cgst)}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="font-sans text-stone-500">SGST ({gstPercent / 2}%)</span>
                    <span>₹{fm2(sgst)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-mono">
                <span className="font-sans text-stone-500">Round Off</span>
                <span>{roundOff >= 0 ? `+${fm2(roundOff)}` : fm2(roundOff)}</span>
              </div>
              <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex justify-between items-baseline text-sm">
                <span className="font-bold">Net Invoice Total</span>
                <span className="text-base font-bold font-mono text-[#0f5c4d] dark:text-[#4fb59f]">
                  ₹{fm2(roundedNet)}
                </span>
              </div>
              <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex justify-between font-mono text-stone-600 dark:text-stone-400">
                <span className="font-sans">Closing Party Balance</span>
                <span className="font-semibold text-stone-900 dark:text-stone-200">₹{fm2(closingBalance)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Save Tax Invoice #{billNo}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
