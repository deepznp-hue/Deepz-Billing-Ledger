/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Download,
  Upload,
  Sun,
  Moon,
  Printer,
  ArrowUpDown,
  Lock,
  LogOut,
  Database,
  Calendar,
} from 'lucide-react';
import {
  BillingDatabase,
  InvoiceRecord,
  CustomerRecord,
  ProductRecord,
  ReceiptPaymentRecord,
} from './data/initialDb';
import { cr, dfmt, downloadCsv, fm2, fmt, fyl } from './utils/formatters';
import { InvoiceModal } from './components/InvoiceModal';
import { NewInvoiceModal } from './components/NewInvoiceModal';
import {
  CustomerLedgerModal,
  buildCustomerBalanceSheet,
  computeCustomerCurrentBalance,
} from './components/CustomerLedgerModal';
import { QuickEntryModal } from './components/QuickEntryModal';
import { PasswordLockScreen } from './components/PasswordLockScreen';
import { ProductLinesModal } from './components/ProductLinesModal';
import { BackupModal, CompanySlot } from './components/BackupModal';
import { Building2 } from 'lucide-react';

type TabKey = 'dashboard' | 'invoices' | 'customers' | 'products' | 'receipts';

const TABS: [TabKey, string][] = [
  ['dashboard', 'Dashboard'],
  ['invoices', 'Invoices'],
  ['customers', 'Customers'],
  ['products', 'Products'],
  ['receipts', 'Receipts & Payments'],
];

const MONTHS_LIST: { code: string; name: string; short: string }[] = [
  { code: '04', name: 'April', short: 'Apr' },
  { code: '05', name: 'May', short: 'May' },
  { code: '06', name: 'June', short: 'Jun' },
  { code: '07', name: 'July', short: 'Jul' },
  { code: '08', name: 'August', short: 'Aug' },
  { code: '09', name: 'September', short: 'Sep' },
  { code: '10', name: 'October', short: 'Oct' },
  { code: '11', name: 'November', short: 'Nov' },
  { code: '12', name: 'December', short: 'Dec' },
  { code: '01', name: 'January', short: 'Jan' },
  { code: '02', name: 'February', short: 'Feb' },
  { code: '03', name: 'March', short: 'Mar' },
];

const MONTH_NAMES_BY_NUM: Record<string, string> = {
  '01': 'January',
  '02': 'February',
  '03': 'March',
  '04': 'April',
  '05': 'May',
  '06': 'June',
  '07': 'July',
  '08': 'August',
  '09': 'September',
  '10': 'October',
  '11': 'November',
  '12': 'December',
};

const STORAGE_KEY = 'mp_textiles_custom_entries_v1';
const UPLOADED_DB_KEY = 'mp_textiles_uploaded_db_v1';
const COMPANIES_LIST_KEY = 'mp_textiles_companies_list_v2';
const ACTIVE_COMPANY_ID_KEY = 'mp_textiles_active_company_id_v2';
const UNLOCK_SESSION_KEY = 'mp_textiles_unlocked_session';
const DEFAULT_COMPANY_ID = 'company_1_default';

const EMPTY_DB: BillingDatabase = {
  co: {
    n: 'TEXTILE BILLING APP',
    a: '',
    ph: '',
    em: '',
    g: '',
    pan: '',
  },
  inv: [],
  cust: [],
  prod: [],
  rec: [],
  pay: [],
};

interface CustomEntriesStore {
  inv: InvoiceRecord[];
  cust: CustomerRecord[];
  prod: ProductRecord[];
  rec: ReceiptPaymentRecord[];
  pay: ReceiptPaymentRecord[];
}

const clearPersistedStorage = () => {
  try {
    localStorage.removeItem(UPLOADED_DB_KEY);
    localStorage.removeItem(COMPANIES_LIST_KEY);
    localStorage.removeItem(ACTIVE_COMPANY_ID_KEY);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(UNLOCK_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
};

export default function App() {
  // Always clear all previously stored data whenever the application is opened
  useEffect(() => {
    clearPersistedStorage();
  }, []);

  // Password Lock State (PIN: 3210) — always locked & cleared on open
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  const handleUnlock = () => {
    setIsUnlocked(true);
  };

  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [darkMode]);

  // Companies start completely empty on open; data is only populated after uploading a backup file
  const [companies, setCompanies] = useState<CompanySlot[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string>('');
  const [customStoreByCompany, setCustomStoreByCompany] = useState<
    Record<string, CustomEntriesStore>
  >({});

  const hasLoadedBackup = companies.length > 0;

  const activeCompanySlot = useMemo<CompanySlot>(() => {
    return (
      companies.find((c) => c.id === activeCompanyId) ||
      companies[0] || {
        id: DEFAULT_COMPANY_ID,
        name: EMPTY_DB.co.n,
        db: EMPTY_DB,
        updatedAt: '',
      }
    );
  }, [companies, activeCompanyId]);

  const baseDb = activeCompanySlot.db;

  const customStore = useMemo<CustomEntriesStore>(() => {
    return (
      customStoreByCompany[activeCompanySlot.id] || {
        inv: [],
        cust: [],
        prod: [],
        rec: [],
        pay: [],
      }
    );
  }, [customStoreByCompany, activeCompanySlot.id]);

  const setCustomStore = (
    updater: CustomEntriesStore | ((prev: CustomEntriesStore) => CustomEntriesStore)
  ) => {
    setCustomStoreByCompany((prevMap) => {
      const current = prevMap[activeCompanySlot.id] || {
        inv: [],
        cust: [],
        prod: [],
        rec: [],
        pay: [],
      };
      const next = typeof updater === 'function' ? updater(current) : updater;
      return {
        ...prevMap,
        [activeCompanySlot.id]: next,
      };
    });
  };

  // Merged Database for the Active Company
  const db = useMemo<BillingDatabase>(() => {
    if (!hasLoadedBackup) {
      return EMPTY_DB;
    }

    const invMap = new Map<string, InvoiceRecord>();
    customStore.inv.forEach((i) => invMap.set(`${i.fy}-${i.no}`, i));
    baseDb.inv.forEach((i) => {
      const k = `${i.fy}-${i.no}`;
      if (!invMap.has(k)) invMap.set(k, i);
    });

    const custMap = new Map<string, CustomerRecord>();
    customStore.cust.forEach((c) => custMap.set(c.n, c));
    baseDb.cust.forEach((c) => {
      if (!custMap.has(c.n)) custMap.set(c.n, c);
    });

    const prodMap = new Map<string, ProductRecord>();
    customStore.prod.forEach((p) => prodMap.set(p.n, p));
    baseDb.prod.forEach((p) => {
      if (!prodMap.has(p.n)) prodMap.set(p.n, p);
    });

    const recMap = new Map<string, ReceiptPaymentRecord>();
    customStore.rec.forEach((r, idx) => recMap.set(`${r.fy}-${r.no}-${r.dt}-${idx}`, r));
    baseDb.rec.forEach((r, idx) => {
      const k = `${r.fy}-${r.no}-${r.dt}-base-${idx}`;
      recMap.set(k, r);
    });

    const payMap = new Map<string, ReceiptPaymentRecord>();
    customStore.pay.forEach((p, idx) => payMap.set(`${p.fy}-${p.no}-${p.dt}-${idx}`, p));
    baseDb.pay.forEach((p, idx) => {
      const k = `${p.fy}-${p.no}-${p.dt}-base-${idx}`;
      payMap.set(k, p);
    });

    return {
      co: baseDb.co || EMPTY_DB.co,
      inv: [...invMap.values()].sort((a, b) => b.dt.localeCompare(a.dt) || b.no - a.no),
      cust: [...custMap.values()],
      prod: [...prodMap.values()],
      rec: [...recMap.values()].sort((a, b) => b.dt.localeCompare(a.dt) || b.no - a.no),
      pay: [...payMap.values()].sort((a, b) => b.dt.localeCompare(a.dt) || b.no - a.no),
    };
  }, [hasLoadedBackup, baseDb, customStore]);

  // Switch between loaded companies
  const handleSwitchCompany = (companyId: string) => {
    const target = companies.find((c) => c.id === companyId);
    if (!target) return;
    setActiveCompanyId(companyId);
    setFy('all');
    setMonthFilter('all');
    setSearchQuery('');
    const firstCust =
      target.db.cust.find((c) => c.n && c.n !== 'OPENING BALANCE')?.n ||
      target.db.inv[0]?.c ||
      '';
    setBalanceSheetCustomer(firstCust);
  };

  const handleDeleteCompany = (companyId: string) => {
    setCompanies((prev) => {
      const next = prev.filter((c) => c.id !== companyId);
      if (activeCompanyId === companyId) {
        const nextActive = next[0];
        setActiveCompanyId(nextActive ? nextActive.id : '');
        const firstCust =
          nextActive?.db.cust.find((c) => c.n && c.n !== 'OPENING BALANCE')?.n ||
          nextActive?.db.inv[0]?.c ||
          '';
        setBalanceSheetCustomer(firstCust);
      }
      return next;
    });
  };

  // Restore / Upload Backup Handler
  const handleRestoreDatabase = (
    uploaded: BillingDatabase,
    mode: 'new_company' | 'replace' | 'merge',
    customCompanyName?: string
  ) => {
    const companyTitle = (customCompanyName || uploaded.co?.n || 'COMPANY 1').trim().toUpperCase();
    const normalizedUploaded: BillingDatabase = {
      ...uploaded,
      co: {
        ...uploaded.co,
        n: companyTitle,
      },
    };

    // Reset filters so all newly uploaded bills are immediately visible
    setFy('all');
    setMonthFilter('all');
    setSearchQuery('');
    const topCust =
      normalizedUploaded.cust.find((c) => c.n && c.n !== 'OPENING BALANCE')?.n ||
      normalizedUploaded.inv[0]?.c ||
      '';
    setBalanceSheetCustomer(topCust);

    const slug = companyTitle.replace(/[^A-Z0-9]+/g, '_').toLowerCase() || 'uploaded';
    const targetId = `company_${slug}`;

    if (companies.length === 0 || mode === 'new_company') {
      setCompanies((prev) => {
        const existingIdx = prev.findIndex(
          (c) => c.id === targetId || c.name.toUpperCase() === companyTitle
        );
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            name: companyTitle,
            db: normalizedUploaded,
            updatedAt: new Date().toISOString(),
          };
          setActiveCompanyId(updated[existingIdx].id);
          return updated;
        }
        const nextSlot: CompanySlot = {
          id: targetId,
          name: companyTitle,
          db: normalizedUploaded,
          updatedAt: new Date().toISOString(),
        };
        setActiveCompanyId(targetId);
        return [...prev, nextSlot];
      });
      setCustomStoreByCompany((prev) => ({
        ...prev,
        [targetId]: { inv: [], cust: [], prod: [], rec: [], pay: [] },
      }));
    } else if (mode === 'replace') {
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === activeCompanySlot.id
            ? {
                ...c,
                name: companyTitle,
                db: normalizedUploaded,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
      setCustomStore({ inv: [], cust: [], prod: [], rec: [], pay: [] });
    } else {
      // Merge uploaded into current active company
      const mergedInvMap = new Map<string, InvoiceRecord>();
      normalizedUploaded.inv.forEach((i) => mergedInvMap.set(`${i.fy}-${i.no}`, i));
      baseDb.inv.forEach((i) => {
        const k = `${i.fy}-${i.no}`;
        if (!mergedInvMap.has(k)) mergedInvMap.set(k, i);
      });

      const mergedCustMap = new Map<string, CustomerRecord>();
      normalizedUploaded.cust.forEach((c) => mergedCustMap.set(c.n, c));
      baseDb.cust.forEach((c) => {
        if (!mergedCustMap.has(c.n)) mergedCustMap.set(c.n, c);
      });

      const mergedProdMap = new Map<string, ProductRecord>();
      normalizedUploaded.prod.forEach((p) => mergedProdMap.set(p.n, p));
      baseDb.prod.forEach((p) => {
        if (!mergedProdMap.has(p.n)) mergedProdMap.set(p.n, p);
      });

      const mergedRecMap = new Map<string, ReceiptPaymentRecord>();
      normalizedUploaded.rec.forEach((r) => mergedRecMap.set(`${r.fy}-${r.no}-${r.dt}-${r.amt}`, r));
      baseDb.rec.forEach((r) => {
        const k = `${r.fy}-${r.no}-${r.dt}-${r.amt}`;
        if (!mergedRecMap.has(k)) mergedRecMap.set(k, r);
      });

      const mergedPayMap = new Map<string, ReceiptPaymentRecord>();
      normalizedUploaded.pay.forEach((p) => mergedPayMap.set(`${p.fy}-${p.no}-${p.dt}-${p.amt}`, p));
      baseDb.pay.forEach((p) => {
        const k = `${p.fy}-${p.no}-${p.dt}-${p.amt}`;
        if (!mergedPayMap.has(k)) mergedPayMap.set(k, p);
      });

      const nextBase: BillingDatabase = {
        co: normalizedUploaded.co || baseDb.co,
        inv: [...mergedInvMap.values()],
        cust: [...mergedCustMap.values()],
        prod: [...mergedProdMap.values()],
        rec: [...mergedRecMap.values()],
        pay: [...mergedPayMap.values()],
      };
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === activeCompanySlot.id
            ? {
                ...c,
                name: nextBase.co.n,
                db: nextBase,
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
    }
  };

  // Clear all loaded data
  const handleResetToFactory = () => {
    setCompanies([]);
    setActiveCompanyId('');
    setCustomStoreByCompany({});
    setFy('all');
    setMonthFilter('all');
    setSearchQuery('');
    setBalanceSheetCustomer('');
    setSelectedInvoice(null);
    setIsNewInvoiceOpen(false);
    setSelectedCustomerLedger(null);
    setSelectedProductLines(null);
    setQuickEntryMode(null);
    clearPersistedStorage();
  };

  // Logout: clear all data and return to PIN Lock Screen
  const handleLogout = () => {
    handleResetToFactory();
    setIsBackupModalOpen(false);
    setIsUnlocked(false);
  };

  // Navigation & Filter State
  const [tab, setTab] = useState<TabKey>(() => {
    const h = (window.location.hash || '').slice(1) as TabKey;
    return TABS.some((t) => t[0] === h) ? h : 'dashboard';
  });
  const [fy, setFy] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all'); // 'all' or '01'..'12' or 'YYYY-MM'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [limit, setLimit] = useState<number>(200);

  // Sub-filters
  const [invoiceViewMode, setInvoiceViewMode] = useState<'list' | 'monthly'>('list');
  const [gstFilter, setGstFilter] = useState<'all' | 'intra' | 'inter'>('all');
  const [invoiceSort, setInvoiceSort] = useState<'date' | 'net_desc' | 'no_desc'>('date');
  const [customerViewMode, setCustomerViewMode] = useState<'directory' | 'currentbalance' | 'balancesheet'>('directory');
  const [currentBalanceFilter, setCurrentBalanceFilter] = useState<'all' | 'pending' | 'cleared'>('all');
  const [currentBalanceSort, setCurrentBalanceSort] = useState<'balance_desc' | 'balance_asc' | 'latest_bill' | 'name_asc'>('balance_desc');
  const currentBalTopScrollRef = useRef<HTMLDivElement>(null);
  const currentBalTableWrapRef = useRef<HTMLDivElement>(null);
  const [balanceSheetCustomer, setBalanceSheetCustomer] = useState<string>('');
  const [productViewMode, setProductViewMode] = useState<'products' | 'hsn'>('products');
  const [rpMode, setRpMode] = useState<'rec' | 'pay'>('rec');
  const [rpBankFilter, setRpBankFilter] = useState<string>('all');

  // Modals State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState<boolean>(false);
  const [duplicateTemplate, setDuplicateTemplate] = useState<InvoiceRecord | null>(null);
  const [defaultCustomerForBill, setDefaultCustomerForBill] = useState<string | undefined>(undefined);
  const [selectedCustomerLedger, setSelectedCustomerLedger] = useState<string | null>(null);
  const [selectedProductLines, setSelectedProductLines] = useState<string | null>(null);
  const [quickEntryMode, setQuickEntryMode] = useState<'receipt' | 'payment' | 'customer' | 'product' | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);

  const fys = useMemo(() => {
    return [...new Set(db.inv.map((i) => i.fy))].sort().reverse();
  }, [db.inv]);

  // Period matching helper (checks both FY and Month filter)
  const inPeriod = (item: { fy: string; dt: string }) => {
    if (fy !== 'all' && item.fy !== fy) return false;
    if (monthFilter !== 'all') {
      if (monthFilter.length === 7) {
        // 'YYYY-MM'
        if (!item.dt.startsWith(monthFilter)) return false;
      } else {
        // '01' .. '12'
        const m = item.dt.slice(5, 7);
        if (m !== monthFilter) return false;
      }
    }
    return true;
  };

  const switchTab = (nextTab: TabKey, initialSearch = '') => {
    setTab(nextTab);
    setSearchQuery(initialSearch);
    setLimit(200);
    try {
      window.history.replaceState(null, '', `#${nextTab}`);
    } catch {
      // ignore history error
    }
  };

  // Handlers for adding new records
  const handleSaveNewInvoice = (newInv: InvoiceRecord) => {
    setCustomStore((prev) => ({
      ...prev,
      inv: [newInv, ...prev.inv],
    }));
    setSelectedInvoice(newInv);
  };

  const handleAddReceiptPayment = (type: 'rec' | 'pay', entry: ReceiptPaymentRecord) => {
    setCustomStore((prev) => ({
      ...prev,
      [type]: [entry, ...prev[type]],
    }));
  };

  const handleAddCustomer = (cust: CustomerRecord) => {
    setCustomStore((prev) => ({
      ...prev,
      cust: [cust, ...prev.cust],
    }));
  };

  const handleAddProduct = (prod: ProductRecord) => {
    setCustomStore((prev) => ({
      ...prev,
      prod: [prod, ...prev.prod],
    }));
  };

  // ==================== 1. DASHBOARD COMPUTATIONS ====================
  const dashboardStats = useMemo(() => {
    const L = db.inv.filter(inPeriod);
    const R = db.rec.filter(inPeriod);
    const tx = L.reduce((a, i) => a + i.tx, 0);
    const g = L.reduce((a, i) => a + i.cg + i.sg + i.ig, 0);
    const ig = L.reduce((a, i) => a + i.ig, 0);
    const net = L.reduce((a, i) => a + i.net, 0);
    const recTotal = R.reduce((a, r) => a + r.amt, 0);

    let bars: { label: string; value: number; fyKey?: string; monthCode?: string }[] = [];
    if (fy === 'all') {
      bars = fys
        .slice()
        .reverse()
        .map((y) => ({
          label: fyl(Number(y)).replace('FY ', ''),
          value: db.inv
            .filter((i) => i.fy === y && (monthFilter === 'all' || i.dt.slice(5, 7) === monthFilter))
            .reduce((a, i) => a + i.tx, 0),
          fyKey: y,
        }));
    } else {
      const fyOnlyInvoices = db.inv.filter((i) => i.fy === fy);
      bars = MONTHS_LIST.map((mObj) => {
        const sum = fyOnlyInvoices
          .filter((i) => i.dt.slice(5, 7) === mObj.code)
          .reduce((a, i) => a + i.tx, 0);
        return { label: mObj.short, value: sum, monthCode: mObj.code };
      });
    }

    const maxBar = Math.max(...bars.map((b) => b.value), 1);

    const custTotals: Record<string, number> = {};
    const prodTotals: Record<string, number> = {};
    L.forEach((i) => {
      custTotals[i.c] = (custTotals[i.c] || 0) + i.tx;
      i.L.forEach((l) => {
        prodTotals[l[0]] = (prodTotals[l[0]] || 0) + (l[5] || 0);
      });
    });

    const topCustomers = Object.entries(custTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const topProducts = Object.entries(prodTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return {
      count: L.length,
      tx,
      g,
      ig,
      cgSg: g - ig,
      net,
      recTotal,
      recCount: R.length,
      bars,
      maxBar,
      topCustomers,
      topProducts,
      latestInvoice: db.inv[0],
    };
  }, [db.inv, db.rec, fy, monthFilter, fys]);

  // ==================== 2. INVOICES & MONTHLY SALES COMPUTATIONS ====================
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = db.inv.filter((i) => {
      if (!inPeriod(i)) return false;
      if (gstFilter === 'intra' && i.ig > 0) return false;
      if (gstFilter === 'inter' && i.ig === 0) return false;
      if (!q) return true;
      const haystack = `${i.c} ${i.no} ${i.gst} ${i.dc} ${i.veh} ${i.L.map((l) => l[0]).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });

    if (invoiceSort === 'net_desc') {
      return [...list].sort((a, b) => b.net - a.net);
    }
    if (invoiceSort === 'no_desc') {
      return [...list].sort((a, b) => b.no - a.no);
    }
    return list;
  }, [db.inv, fy, monthFilter, searchQuery, gstFilter, invoiceSort]);

  // Monthly Sales Breakdown across selected FY
  const monthlySalesBreakdown = useMemo(() => {
    const map: Record<
      string,
      { ym: string; fy: string; count: number; tx: number; cgSg: number; ig: number; net: number }
    > = {};
    db.inv
      .filter((i) => fy === 'all' || i.fy === fy)
      .forEach((i) => {
        const ym = i.dt.slice(0, 7); // YYYY-MM
        const entry =
          map[ym] || (map[ym] = { ym, fy: i.fy, count: 0, tx: 0, cgSg: 0, ig: 0, net: 0 });
        entry.count++;
        entry.tx += i.tx;
        entry.cgSg += i.cg + i.sg;
        entry.ig += i.ig;
        entry.net += i.net;
      });
    return Object.values(map).sort((a, b) => b.ym.localeCompare(a.ym));
  }, [db.inv, fy]);

  // ==================== 3. CUSTOMERS & BALANCE SHEET COMPUTATIONS ====================
  const customerData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const statsByCust: Record<string, { n: number; v: number }> = {};
    const allInvByCust: Record<string, InvoiceRecord[]> = {};
    const allRecByCust: Record<string, ReceiptPaymentRecord[]> = {};
    const allPayByCust: Record<string, ReceiptPaymentRecord[]> = {};

    db.inv.forEach((i) => {
      (allInvByCust[i.c] || (allInvByCust[i.c] = [])).push(i);
      if (inPeriod(i)) {
        const c = statsByCust[i.c] || (statsByCust[i.c] = { n: 0, v: 0 });
        c.n++;
        c.v += i.net;
      }
    });

    const recByCust: Record<string, number> = {};
    const latestReceiptByCust: Record<string, ReceiptPaymentRecord> = {};
    db.rec.forEach((r) => {
      (allRecByCust[r.p] || (allRecByCust[r.p] = [])).push(r);
      if (!latestReceiptByCust[r.p]) latestReceiptByCust[r.p] = r;
      if (inPeriod(r)) {
        recByCust[r.p] = (recByCust[r.p] || 0) + r.amt;
      }
    });

    db.pay.forEach((p) => {
      (allPayByCust[p.p] || (allPayByCust[p.p] = [])).push(p);
    });

    const latestBillByCust: Record<string, InvoiceRecord> = {};
    db.inv.forEach((i) => {
      if (!latestBillByCust[i.c]) latestBillByCust[i.c] = i;
    });

    const metaByCust: Record<string, CustomerRecord> = {};
    db.cust.forEach((c) => {
      metaByCust[c.n] = c;
    });

    const allCustomerNames = [
      ...new Set([
        ...Object.keys(allInvByCust),
        ...Object.keys(allRecByCust),
        ...db.cust.map((c) => c.n),
      ]),
    ]
      .filter((n) => n && n !== 'OPENING BALANCE')
      .sort((a, b) => (statsByCust[b]?.v || 0) - (statsByCust[a]?.v || 0));

    const currentBalanceByCust: Record<string, number> = {};
    allCustomerNames.forEach((name) => {
      currentBalanceByCust[name] = computeCustomerCurrentBalance(
        allInvByCust[name] || [],
        allRecByCust[name] || [],
        allPayByCust[name] || []
      );
    });

    const filteredNames = allCustomerNames.filter((n) => {
      if (!q) return true;
      const m = metaByCust[n];
      return `${n} ${m?.g || ''} ${m?.s || ''} ${m?.m || ''}`.toLowerCase().includes(q);
    });

    const currentBalanceRows = filteredNames
      .map((name) => {
        const m = metaByCust[name];
        const c = statsByCust[name] || { n: 0, v: 0 };
        const rec = recByCust[name] || 0;
        const latestBill = latestBillByCust[name];
        const latestRec = latestReceiptByCust[name];
        const curBal = currentBalanceByCust[name] ?? (latestBill ? latestBill.bal : 0);
        return {
          name,
          state: m?.s || latestBill?.st || '',
          gst: m?.g || latestBill?.gst || '',
          mobile: m?.m || '',
          billsCount: c.n,
          totalBilled: c.v,
          totalReceived: rec,
          latestBill,
          latestRec,
          currentBalance: curBal,
        };
      })
      .filter((row) => {
        if (currentBalanceFilter === 'pending') return Math.round(row.currentBalance) > 0;
        if (currentBalanceFilter === 'cleared') return Math.round(row.currentBalance) <= 0;
        return true;
      })
      .sort((a, b) => {
        if (currentBalanceSort === 'balance_asc') {
          return a.currentBalance - b.currentBalance || a.name.localeCompare(b.name);
        }
        if (currentBalanceSort === 'latest_bill') {
          const dtA = a.latestBill?.dt || '';
          const dtB = b.latestBill?.dt || '';
          return dtB.localeCompare(dtA) || (b.latestBill?.no || 0) - (a.latestBill?.no || 0);
        }
        if (currentBalanceSort === 'name_asc') {
          return a.name.localeCompare(b.name);
        }
        return b.currentBalance - a.currentBalance || b.totalBilled - a.totalBilled;
      });

    const totalReceivableBalance = currentBalanceRows.reduce(
      (sum, r) => sum + (r.currentBalance > 0 ? r.currentBalance : 0),
      0
    );
    const pendingCustomersCount = currentBalanceRows.filter(
      (r) => Math.round(r.currentBalance) > 0
    ).length;

    return {
      allCustomerNames,
      names: filteredNames,
      statsByCust,
      recByCust,
      latestBillByCust,
      latestReceiptByCust,
      currentBalanceByCust,
      currentBalanceRows,
      totalReceivableBalance,
      pendingCustomersCount,
      metaByCust,
    };
  }, [db.inv, db.rec, db.pay, db.cust, fy, monthFilter, searchQuery, currentBalanceFilter, currentBalanceSort]);

  const inlineBalanceSheetData = useMemo(() => {
    const cInv = db.inv.filter((i) => i.c === balanceSheetCustomer && inPeriod(i));
    const cRec = db.rec.filter((r) => r.p === balanceSheetCustomer && inPeriod(r));
    const cPay = db.pay.filter((p) => p.p === balanceSheetCustomer && inPeriod(p));
    const rows = buildCustomerBalanceSheet(cInv, cRec, cPay);
    const totalBilled = cInv.reduce((s, i) => s + i.net, 0);
    const totalReceived = cRec.reduce((s, r) => s + r.amt, 0);
    const latestInv = db.inv.find((i) => i.c === balanceSheetCustomer);
    const currentBal = rows.length > 0 ? rows[0].runningBalance : latestInv?.bal;
    return {
      rows,
      totalBilled,
      totalReceived,
      billsCount: cInv.length,
      receiptsCount: cRec.length,
      latestBalance: currentBal,
    };
  }, [db.inv, db.rec, db.pay, balanceSheetCustomer, fy, monthFilter]);

  // ==================== 4. PRODUCTS & HSN COMPUTATIONS ====================
  const productData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const prodMap: Record<string, { h: string; q: Record<string, number>; v: number; n: number }> = {};
    const hsnMap: Record<string, { q: Record<string, number>; tx: number; cg: number; sg: number; ig: number; n: number }> = {};

    const periodInvoices = db.inv.filter(inPeriod);

    periodInvoices.forEach((i) => {
      const invTaxable = i.tx || 1;
      i.L.forEach((l) => {
        const pName = l[0];
        const hsn = (l[1] || '5806').trim();
        const qty = Number(l[2]) || 0;
        const unit = l[3] || 'Mtr';
        const val = Number(l[5]) || 0;

        const p = prodMap[pName] || (prodMap[pName] = { h: hsn, q: {}, v: 0, n: 0 });
        p.v += val;
        p.n++;
        p.q[unit] = (p.q[unit] || 0) + qty;

        const hEntry =
          hsnMap[hsn] || (hsnMap[hsn] = { q: {}, tx: 0, cg: 0, sg: 0, ig: 0, n: 0 });
        hEntry.tx += val;
        hEntry.n++;
        hEntry.q[unit] = (hEntry.q[unit] || 0) + qty;
        const ratio = val / invTaxable;
        hEntry.cg += i.cg * ratio;
        hEntry.sg += i.sg * ratio;
        hEntry.ig += i.ig * ratio;
      });
    });

    db.prod.forEach((p) => {
      if (!prodMap[p.n]) {
        prodMap[p.n] = { h: p.h, q: {}, v: 0, n: 0 };
      }
    });

    const filteredNames = Object.keys(prodMap)
      .filter((n) => !q || `${n} ${prodMap[n].h}`.toLowerCase().includes(q))
      .sort((a, b) => prodMap[b].v - prodMap[a].v);

    const hsnRows = Object.entries(hsnMap)
      .filter(([h]) => !q || h.toLowerCase().includes(q))
      .sort((a, b) => b[1].tx - a[1].tx);

    return { prodMap, filteredNames, hsnRows, periodInvoices };
  }, [db.inv, db.prod, fy, monthFilter, searchQuery]);

  // ==================== 5. RECEIPTS & PAYMENTS COMPUTATIONS ====================
  const rpData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const src = db[rpMode];
    const modesSet = new Set<string>();
    src.forEach((r) => {
      if (r.m) modesSet.add(r.m);
    });

    const filtered = src.filter((r) => {
      if (!inPeriod(r)) return false;
      if (rpBankFilter !== 'all' && r.m !== rpBankFilter) return false;
      if (!q) return true;
      return `${r.p} ${r.nar} ${r.m} ${r.no}`.toLowerCase().includes(q);
    });

    return {
      entries: filtered,
      totalAmt: filtered.reduce((a, r) => a + r.amt, 0),
      availableModes: [...modesSet].slice(0, 12),
    };
  }, [db, rpMode, fy, monthFilter, searchQuery, rpBankFilter]);

  // Format readable Month label
  const activeMonthLabel = useMemo(() => {
    if (monthFilter === 'all') return null;
    if (monthFilter.length === 7) {
      const [y, m] = monthFilter.split('-');
      return `${MONTH_NAMES_BY_NUM[m] || m} ${y}`;
    }
    return MONTH_NAMES_BY_NUM[monthFilter] || monthFilter;
  }, [monthFilter]);

  // Export current view to CSV
  const handleExportCurrentView = () => {
    if (tab === 'invoices' || tab === 'dashboard') {
      downloadCsv(
        `MP_Textiles_Invoices_${fy}_${monthFilter}.csv`,
        ['FY', 'Invoice No', 'Date', 'Customer', 'GSTIN', 'State', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Net Total', 'Running Balance'],
        filteredInvoices.map((i) => [
          fyl(i.fy),
          i.no,
          dfmt(i.dt),
          i.c,
          i.gst,
          i.st,
          i.tx,
          i.cg,
          i.sg,
          i.ig,
          i.net,
          i.bal,
        ])
      );
    } else if (tab === 'customers') {
      if (customerViewMode === 'balancesheet') {
        downloadCsv(
          `${balanceSheetCustomer.replace(/[^a-z0-9]/gi, '_')}_Balance_Sheet.csv`,
          ['FY', 'Bill No.', 'Bill Date', 'Net Bill Amount (₹)', 'Payment Recover Date', 'Payment Type', 'Received Amount (₹)', 'Balance (₹)'],
          inlineBalanceSheetData.rows.map((r) => [
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
      } else if (customerViewMode === 'currentbalance') {
        downloadCsv(
          `Customer_Current_Balances_${fy}.csv`,
          ['Customer', 'State', 'GSTIN', 'Bills Count', 'Last Bill No', 'Last Bill Date', 'Total Billed (₹)', 'Total Received (₹)', 'Current Balance (₹)'],
          customerData.currentBalanceRows.map((r) => [
            r.name,
            r.state,
            r.gst,
            r.billsCount,
            r.latestBill ? `#${r.latestBill.no}` : '',
            r.latestBill ? dfmt(r.latestBill.dt) : '',
            r.totalBilled,
            r.totalReceived,
            r.currentBalance,
          ])
        );
      } else {
        downloadCsv(
          `MP_Textiles_Customers_${fy}.csv`,
          ['Customer', 'State', 'GSTIN', 'Mobile', 'Bills Count', 'Billed Amount', 'Received Amount', 'Current Balance'],
          customerData.names.map((n) => {
            const m = customerData.metaByCust[n];
            const c = customerData.statsByCust[n] || { n: 0, v: 0 };
            const rec = customerData.recByCust[n] || 0;
            const curBal = customerData.currentBalanceByCust[n] ?? 0;
            return [n, m?.s || '', m?.g || '', m?.m || '', c.n, c.v, rec, curBal];
          })
        );
      }
    } else if (tab === 'products') {
      downloadCsv(
        `MP_Textiles_Products_${fy}.csv`,
        ['Product', 'HSN/SAC', 'Quantity Sold', 'Lines', 'Taxable Sales Value'],
        productData.filteredNames.map((n) => {
          const p = productData.prodMap[n];
          const qStr = Object.entries(p.q)
            .map(([u, v]) => `${v} ${u}`)
            .join('; ');
          return [n, p.h, qStr, p.n, p.v];
        })
      );
    } else if (tab === 'receipts') {
      downloadCsv(
        `MP_Textiles_${rpMode === 'rec' ? 'Receipts' : 'Payments'}_${fy}.csv`,
        ['FY', 'Voucher No', 'Date', 'Party', 'Mode', 'Narration', 'Amount'],
        rpData.entries.map((r) => [fyl(r.fy), r.no, dfmt(r.dt), r.p, r.m, r.nar, r.amt])
      );
    }
  };

  // Show Password Lock Screen if locked
  if (!isUnlocked) {
    return <PasswordLockScreen company={db.co} onUnlock={handleUnlock} />;
  }

  return (
    <div className="min-h-screen bg-[#f6f5f1] dark:bg-[#151614] text-[#1d1d1b] dark:text-[#ecebe5] transition-colors">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-30 bg-white dark:bg-[#1e201d] border-b border-[#e3e1d9] dark:border-[#33352f] px-4 sm:px-6 py-3.5 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title, One Line */}
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              switchTab('dashboard');
            }}
            className="text-lg font-bold tracking-tight text-[#0f5c4d] dark:text-[#4fb59f] whitespace-nowrap shrink-0"
          >
            {db.co.n || 'M.P. Textiles'}
          </a>

          {/* Zone 2: 5 Concise Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {TABS.map(([key, label]) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchTab(key)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    active
                      ? 'border-[#0f5c4d] dark:border-[#4fb59f] text-[#0f5c4d] dark:text-[#4fb59f] font-semibold'
                      : 'border-transparent text-[#6b6a64] dark:text-[#9a988f] hover:text-[#1d1d1b] dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {hasLoadedBackup ? (
              <button
                type="button"
                onClick={() => {
                  setDuplicateTemplate(null);
                  setDefaultCustomerForBill(undefined);
                  setIsNewInvoiceOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0f5c4d] hover:bg-[#0b463b] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Invoice
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0f5c4d] hover:bg-[#0b463b] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Backup (.bak)
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Logout & Clear All Data"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>

        {/* Mobile Navigation Strip */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto pt-2.5 mt-2.5 border-t border-[#e3e1d9] dark:border-[#33352f]">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                tab === key
                  ? 'bg-[#0f5c4d] text-white'
                  : 'text-[#6b6a64] dark:text-[#9a988f]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* WORKSPACE SUBHEADER & CONTROLS TOOLBAR */}
      <div className="border-b border-[#e3e1d9] dark:border-[#33352f] bg-[#f0eee6]/60 dark:bg-[#1a1c19] px-4 sm:px-6 py-2.5 no-print">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-[#6b6a64] dark:text-[#9a988f]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {hasLoadedBackup ? (
              <>
                {/* Active Company Switcher */}
                <div className="inline-flex items-center gap-1.5 mr-1">
                  <Building2 className="w-3.5 h-3.5 text-[#0f5c4d] dark:text-[#4fb59f]" />
                  <select
                    aria-label="Select Active Company"
                    value={activeCompanySlot.id}
                    onChange={(e) => handleSwitchCompany(e.target.value)}
                    className="px-2 py-1 text-xs font-bold rounded-md border border-[#0f5c4d]/40 dark:border-[#4fb59f]/40 bg-white dark:bg-[#1e201d] text-[#0f5c4d] dark:text-[#4fb59f] cursor-pointer"
                  >
                    {companies.map((c, idx) => (
                      <option key={c.id} value={c.id}>
                        Co {idx + 1}: {c.db.co.n} ({fmt(c.db.inv.length)} bills)
                      </option>
                    ))}
                  </select>
                </div>
                {db.co.a && (
                  <>
                    <span className="font-medium text-[#1d1d1b] dark:text-[#ecebe5]">
                      {db.co.a}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                {db.co.g && <span className="font-mono">GSTIN {db.co.g}</span>}
                {db.co.pan && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">PAN {db.co.pan}</span>
                  </>
                )}
              </>
            ) : (
              <span className="font-medium text-[#6b6a64] dark:text-[#9a988f]">
                No backup loaded — upload a .bak backup file to view company records
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasLoadedBackup && (
              <>
                {/* Financial Year Selector */}
                <select
                  id="fy-select"
                  aria-label="Financial year"
                  value={fy}
                  onChange={(e) => {
                    setFy(e.target.value);
                    if (monthFilter.length === 7) setMonthFilter('all');
                    setLimit(200);
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] text-[#1d1d1b] dark:text-[#ecebe5] cursor-pointer"
                >
                  <option value="all">All Financial Years</option>
                  {fys.map((y) => (
                    <option key={y} value={y}>
                      {fyl(Number(y))}
                    </option>
                  ))}
                </select>

                {/* Month Filter Selector */}
                <div className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#0f5c4d] dark:text-[#4fb59f]" />
                  <select
                    aria-label="Filter by month"
                    value={monthFilter.length === 2 || monthFilter === 'all' ? monthFilter : 'all'}
                    onChange={(e) => {
                      setMonthFilter(e.target.value);
                      setLimit(200);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] text-[#1d1d1b] dark:text-[#ecebe5] cursor-pointer"
                  >
                    <option value="all">All Months</option>
                    {MONTHS_LIST.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Upload Backup Button */}
            <button
              type="button"
              onClick={() => setIsBackupModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#0f5c4d]/40 dark:border-[#4fb59f]/40 bg-white dark:bg-[#1e201d] text-[#0f5c4d] dark:text-[#4fb59f] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Upload or Download .bak Backup File"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload .bak Backup
            </button>

            {hasLoadedBackup && (
              <button
                type="button"
                onClick={handleExportCurrentView}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] text-[#1d1d1b] dark:text-[#ecebe5] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Export current view as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="p-1.5 rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] text-[#1d1d1b] dark:text-[#ecebe5] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] transition-colors cursor-pointer"
              aria-label="Toggle color theme"
              title="Toggle Dark / Light Mode"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            {/* Logout & Clear Data Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 bg-white dark:bg-[#1e201d] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Logout & Clear All Data"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* ACTIVE MONTH FILTER BANNER (When viewing a specific month) */}
      {hasLoadedBackup && activeMonthLabel && (
        <div className="bg-[#0f5c4d]/10 dark:bg-[#4fb59f]/10 border-b border-[#0f5c4d]/20 dark:border-[#4fb59f]/20 px-4 sm:px-6 py-2.5 no-print">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-[#0f5c4d] dark:text-[#4fb59f]">
                Monthly Sales Filter: {activeMonthLabel}{' '}
                {fy !== 'all' && monthFilter.length === 2 ? `(${fyl(Number(fy))})` : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                Bills: <b>{fmt(dashboardStats.count)}</b>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                Taxable Sales: <b>₹{fm2(dashboardStats.tx)}</b>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                GST: <b>₹{fm2(dashboardStats.g)}</b>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[#0f5c4d] dark:text-[#4fb59f]">
                Net Month Total: <b>₹{fm2(dashboardStats.net)}</b>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMonthFilter('all')}
              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] hover:bg-stone-100 cursor-pointer"
            >
              Clear Month Filter
            </button>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 no-print">
        {!hasLoadedBackup ? (
          <div className="max-w-xl mx-auto my-12 bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-2xl p-8 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#0f5c4d]/10 dark:bg-[#4fb59f]/10 flex items-center justify-center text-[#0f5c4d] dark:text-[#4fb59f]">
              <Database className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-[#1d1d1b] dark:text-[#ecebe5] mb-2">
              Upload Backup File to View Billing Data
            </h2>
            <p className="text-xs text-[#6b6a64] dark:text-[#9a988f] leading-relaxed mb-6">
              All billing data is cleared whenever the application opens or when you log out. Upload your company{' '}
              <span className="font-mono font-semibold text-[#1d1d1b] dark:text-[#ecebe5]">.bak</span> backup file to load invoices, customer balance sheets, product lines, monthly sales, and receipts.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#0f5c4d] hover:bg-[#0b463b] rounded-xl transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Upload .bak Backup File
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/50 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* ==================== TAB 1: DASHBOARD ==================== */}
        {tab === 'dashboard' && (
          <div className="space-y-5">
            {/* 5 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[#6b6a64] dark:text-[#9a988f] mb-1.5">
                  Invoices
                </h3>
                <div className="text-2xl font-bold font-mono tabular-nums">
                  {fmt(dashboardStats.count)}
                </div>
                <div className="text-xs text-[#6b6a64] dark:text-[#9a988f] mt-1">
                  {activeMonthLabel ? activeMonthLabel : fy === 'all' ? 'All years (FY 21–27)' : fyl(Number(fy))}
                </div>
              </div>

              <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[#6b6a64] dark:text-[#9a988f] mb-1.5">
                  Taxable Sales
                </h3>
                <div className="text-2xl font-bold font-mono tabular-nums">
                  {cr(dashboardStats.tx)}
                </div>
                <div className="text-xs text-[#6b6a64] dark:text-[#9a988f] mt-1 font-mono">
                  ₹{fmt(dashboardStats.tx)} before GST
                </div>
              </div>

              <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[#6b6a64] dark:text-[#9a988f] mb-1.5">
                  GST Charged
                </h3>
                <div className="text-2xl font-bold font-mono tabular-nums">
                  {cr(dashboardStats.g)}
                </div>
                <div className="text-xs text-[#6b6a64] dark:text-[#9a988f] mt-1">
                  IGST {cr(dashboardStats.ig)} · CGST+SGST {cr(dashboardStats.cgSg)}
                </div>
              </div>

              <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[#6b6a64] dark:text-[#9a988f] mb-1.5">
                  Total Billed
                </h3>
                <div className="text-2xl font-bold font-mono text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums">
                  {cr(dashboardStats.net)}
                </div>
                <div className="text-xs text-[#6b6a64] dark:text-[#9a988f] mt-1">
                  Incl. GST & round-off
                </div>
              </div>

              <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[#6b6a64] dark:text-[#9a988f] mb-1.5">
                  Receipts Collected
                </h3>
                <div className="text-2xl font-bold font-mono text-[#d98324] dark:text-[#e8a455] tabular-nums">
                  {cr(dashboardStats.recTotal)}
                </div>
                <div className="text-xs text-[#6b6a64] dark:text-[#9a988f] mt-1">
                  {fmt(dashboardStats.recCount)} bank & cash receipts
                </div>
              </div>
            </div>

            {/* Interactive Bar Chart */}
            <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#1d1d1b] dark:text-[#ecebe5]">
                    Taxable Sales {fy === 'all' ? 'by Financial Year' : `by Month (${fyl(Number(fy))})`}
                  </h3>
                  <p className="text-xs text-[#6b6a64] dark:text-[#9a988f]">
                    {fy === 'all'
                      ? 'Click any financial year bar to drill down into monthly sales'
                      : 'Click any month bar to filter bills and see total sales for that month'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('invoices');
                      setInvoiceViewMode('monthly');
                    }}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-[#e3e1d9] dark:border-[#33352f] text-[#0f5c4d] dark:text-[#4fb59f] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer"
                  >
                    View Monthly Sales Table →
                  </button>
                  {fy !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        setFy('all');
                        setMonthFilter('all');
                      }}
                      className="px-3 py-1 text-xs font-medium rounded-lg border border-[#e3e1d9] dark:border-[#33352f] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer"
                    >
                      Back to All Years
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-end gap-2 sm:gap-3 h-48 pt-6 px-1">
                {dashboardStats.bars.map((b, idx) => {
                  const pct = Math.max((b.value / dashboardStats.maxBar) * 82, b.value > 0 ? 3 : 0);
                  const isSelectedMonth = b.monthCode && monthFilter === b.monthCode;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (b.fyKey) {
                          setFy(b.fyKey);
                        } else if (b.monthCode) {
                          setMonthFilter(monthFilter === b.monthCode ? 'all' : b.monthCode);
                        }
                      }}
                      title={`${b.label}: ₹${fmt(b.value)}`}
                      className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                    >
                      <span className="text-[11px] font-mono text-[#6b6a64] dark:text-[#9a988f] mb-1.5 group-hover:text-[#1d1d1b] dark:group-hover:text-white transition-colors tabular-nums">
                        {b.value ? cr(b.value).replace('₹', '') : ''}
                      </span>
                      <div
                        style={{ height: `${pct}%` }}
                        className={`w-full max-w-[56px] rounded-t-md transition-colors min-h-[2px] ${
                          isSelectedMonth
                            ? 'bg-[#d98324] dark:bg-[#e8a455]'
                            : 'bg-[#0f5c4d] dark:bg-[#4fb59f] group-hover:bg-[#d98324] dark:group-hover:bg-[#e8a455]'
                        }`}
                      />
                      <span
                        className={`mt-2 text-xs font-medium ${
                          isSelectedMonth
                            ? 'text-[#d98324] dark:text-[#e8a455] font-bold'
                            : 'text-[#6b6a64] dark:text-[#9a988f] group-hover:text-[#1d1d1b] dark:group-hover:text-white'
                        }`}
                      >
                        {b.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Customers & Top Products Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Customers */}
              <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#1d1d1b] dark:text-[#ecebe5]">
                    Top Customers (Click for Balance Sheet)
                  </h3>
                  <button
                    type="button"
                    onClick={() => switchTab('customers')}
                    className="text-xs font-medium text-[#0f5c4d] dark:text-[#4fb59f] hover:underline cursor-pointer"
                  >
                    View all {db.cust.length} →
                  </button>
                </div>
                <div className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                  {dashboardStats.topCustomers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#6b6a64]">No data for selected period</div>
                  ) : (
                    dashboardStats.topCustomers.map(([name, val]) => {
                      const maxVal = dashboardStats.topCustomers[0][1] || 1;
                      const widthPct = (val / maxVal) * 100;
                      return (
                        <div
                          key={name}
                          onClick={() => setSelectedCustomerLedger(name)}
                          className="py-2.5 cursor-pointer group"
                        >
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="font-medium group-hover:text-[#0f5c4d] dark:group-hover:text-[#4fb59f] transition-colors truncate">
                              {name}
                            </span>
                            <span className="font-mono font-semibold text-xs tabular-nums shrink-0">
                              {cr(val)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#f0eee6] dark:bg-[#272a25] rounded-full mt-1.5 overflow-hidden">
                            <div
                              style={{ width: `${widthPct}%` }}
                              className="h-full bg-[#d98324] dark:bg-[#e8a455] rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Top Products */}
              <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#1d1d1b] dark:text-[#ecebe5]">
                    Top Products (Click for Customer & Bill Breakdown)
                  </h3>
                  <button
                    type="button"
                    onClick={() => switchTab('products')}
                    className="text-xs font-medium text-[#0f5c4d] dark:text-[#4fb59f] hover:underline cursor-pointer"
                  >
                    View all products →
                  </button>
                </div>
                <div className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                  {dashboardStats.topProducts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#6b6a64]">No data for selected period</div>
                  ) : (
                    dashboardStats.topProducts.map(([name, val]) => {
                      const maxVal = dashboardStats.topProducts[0][1] || 1;
                      const widthPct = (val / maxVal) * 100;
                      return (
                        <div
                          key={name}
                          onClick={() => setSelectedProductLines(name)}
                          className="py-2.5 cursor-pointer group"
                        >
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="font-medium group-hover:text-[#0f5c4d] dark:group-hover:text-[#4fb59f] transition-colors truncate">
                              {name}
                            </span>
                            <span className="font-mono font-semibold text-xs tabular-nums shrink-0">
                              {cr(val)}
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#f0eee6] dark:bg-[#272a25] rounded-full mt-1.5 overflow-hidden">
                            <div
                              style={{ width: `${widthPct}%` }}
                              className="h-full bg-[#0f5c4d] dark:bg-[#4fb59f] rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Latest Invoice Footer Callout */}
            {dashboardStats.latestInvoice && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-[#6b6a64] dark:text-[#9a988f]">
                <div>
                  Latest invoice in backup:{' '}
                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(dashboardStats.latestInvoice)}
                    className="font-mono font-semibold text-[#1d1d1b] dark:text-[#ecebe5] hover:underline cursor-pointer"
                  >
                    #{dashboardStats.latestInvoice.no}
                  </button>{' '}
                  on {dfmt(dashboardStats.latestInvoice.dt)} to{' '}
                  <button
                    type="button"
                    onClick={() => setSelectedCustomerLedger(dashboardStats.latestInvoice.c)}
                    className="font-semibold text-[#1d1d1b] dark:text-[#ecebe5] hover:underline cursor-pointer"
                  >
                    {dashboardStats.latestInvoice.c}
                  </button>{' '}
                  (₹{fm2(dashboardStats.latestInvoice.net)})
                </div>
                <div>
                  Active Vault: {fmt(db.inv.length)} Invoices · {fmt(db.cust.length)} Customers · {fmt(db.rec.length)} Receipts
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 2: INVOICES & MONTHLY BILL SUMMARY ==================== */}
        {tab === 'invoices' && (
          <div className="space-y-4">
            {/* Top Mode Switch: Individual Bills vs Monthly Sales Summary */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#f0eee6] dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f]">
                <button
                  type="button"
                  onClick={() => setInvoiceViewMode('list')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    invoiceViewMode === 'list'
                      ? 'bg-[#0f5c4d] text-white'
                      : 'text-[#6b6a64] dark:text-[#9a988f] hover:text-[#1d1d1b] dark:hover:text-white'
                  }`}
                >
                  All Invoices ({fmt(filteredInvoices.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceViewMode('monthly')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    invoiceViewMode === 'monthly'
                      ? 'bg-[#0f5c4d] text-white'
                      : 'text-[#6b6a64] dark:text-[#9a988f] hover:text-[#1d1d1b] dark:hover:text-white'
                  }`}
                >
                  Monthly Sales Summary ({monthlySalesBreakdown.length} Months)
                </button>
              </div>

              {invoiceViewMode === 'list' && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Segmented Tax Type Filter */}
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#f0eee6] dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f]">
                    {(
                      [
                        ['all', 'All Bills'],
                        ['intra', 'CGST+SGST (TN)'],
                        ['inter', 'IGST (Interstate)'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setGstFilter(k);
                          setLimit(200);
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          gstFilter === k
                            ? 'bg-[#0f5c4d] text-white'
                            : 'text-[#6b6a64] dark:text-[#9a988f] hover:text-[#1d1d1b] dark:hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Sort Selector */}
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-[#6b6a64]" />
                    <select
                      value={invoiceSort}
                      onChange={(e) => setInvoiceSort(e.target.value as 'date' | 'net_desc' | 'no_desc')}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] cursor-pointer"
                    >
                      <option value="date">Sort: Latest Date</option>
                      <option value="net_desc">Sort: Highest Amount</option>
                      <option value="no_desc">Sort: Invoice No.</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {invoiceViewMode === 'monthly' ? (
              <div className="space-y-3">
                <p className="text-xs text-[#6b6a64] dark:text-[#9a988f]">
                  Month-wise total sales summary ({fy === 'all' ? 'All Financial Years' : fyl(Number(fy))}) · Click any month row to view all bills for that month.
                </p>
                <div className="overflow-x-auto bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl">
                  <table className="w-full border-collapse min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f] bg-stone-50/60 dark:bg-[#151614]/50">
                        <th className="py-2.5 px-3 text-left font-semibold">Month</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Financial Year</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Total Bills</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Taxable Sales ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">CGST + SGST ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">IGST ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Total Net Sales ₹</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                      {monthlySalesBreakdown.map((mRow) => {
                        const [yStr, mStr] = mRow.ym.split('-');
                        const readableMonth = `${MONTH_NAMES_BY_NUM[mStr] || mStr} ${yStr}`;
                        return (
                          <tr
                            key={mRow.ym}
                            onClick={() => {
                              setMonthFilter(mRow.ym);
                              setInvoiceViewMode('list');
                            }}
                            className="hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 font-semibold text-[#0f5c4d] dark:text-[#4fb59f]">
                              {readableMonth}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs text-[#6b6a64] dark:text-[#9a988f]">
                              {fyl(mRow.fy)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {fmt(mRow.count)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {fm2(mRow.tx)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                              {fm2(mRow.cgSg)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                              {fm2(mRow.ig)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                              {fm2(mRow.net)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <>
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-[#6b6a64] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Search by customer, bill no., GSTIN, DC no., or product..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setLimit(200);
                    }}
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] focus:outline-none focus:border-[#0f5c4d]"
                  />
                </div>

                {/* Summary Line */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b6a64] dark:text-[#9a988f]">
                  <div>
                    Showing <span className="font-mono font-semibold text-[#1d1d1b] dark:text-white">{fmt(filteredInvoices.length)}</span> invoices
                    <span aria-hidden="true"> · </span>
                    Taxable <span className="font-mono font-semibold text-[#1d1d1b] dark:text-white">₹{fm2(filteredInvoices.reduce((a, i) => a + i.tx, 0))}</span>
                    <span aria-hidden="true"> · </span>
                    Net Total <span className="font-mono font-semibold text-[#0f5c4d] dark:text-[#4fb59f]">₹{fm2(filteredInvoices.reduce((a, i) => a + i.net, 0))}</span>
                  </div>
                  <div>Click any invoice row to inspect & print GST tax invoice</div>
                </div>

                {/* Invoices Table */}
                <div className="overflow-x-auto bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl">
                  <table className="w-full border-collapse min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f] bg-stone-50/60 dark:bg-[#151614]/50">
                        <th className="py-2.5 px-3 text-left font-semibold">No.</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Customer</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Items</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Taxable ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">GST ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Net ₹</th>
                        <th className="py-2.5 px-3 text-center font-semibold w-14">Print</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                      {filteredInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-[#6b6a64]">
                            No invoices match your search criteria
                          </td>
                        </tr>
                      ) : (
                        filteredInvoices.slice(0, limit).map((inv) => (
                          <tr
                            key={`${inv.fy}-${inv.no}-${inv.dt}`}
                            onClick={() => setSelectedInvoice(inv)}
                            className="hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 font-mono font-medium whitespace-nowrap">
                              #{inv.no}
                              <span className="ml-1.5 text-[11px] text-[#6b6a64] dark:text-[#9a988f]">
                                · {fyl(inv.fy).replace('FY ', '')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                              {dfmt(inv.dt)}
                            </td>
                            <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                              {inv.c}
                              {inv.st && (
                                <span className="ml-1.5 text-xs font-normal text-[#6b6a64] dark:text-[#9a988f]">
                                  · {inv.st}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-[#6b6a64] dark:text-[#9a988f] max-w-[240px] truncate">
                              {inv.L.map((l) => l[0]).join(', ')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {fm2(inv.tx)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-[#6b6a64] dark:text-[#9a988f] tabular-nums whitespace-nowrap">
                              {fm2(inv.cg + inv.sg + inv.ig)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                              {fm2(inv.net)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedInvoice(inv);
                                }}
                                className="p-1 text-[#6b6a64] hover:text-[#0f5c4d] dark:hover:text-[#4fb59f] cursor-pointer"
                                title="View & Print Tax Invoice"
                              >
                                <Printer className="w-4 h-4 inline" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredInvoices.length > limit && (
                  <button
                    type="button"
                    onClick={() => setLimit((l) => l + 300)}
                    className="mx-auto block px-5 py-2 text-xs font-semibold rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer"
                  >
                    Show more ({filteredInvoices.length - limit} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ==================== TAB 3: CUSTOMERS & BALANCE SHEET ==================== */}
        {tab === 'customers' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Switch between Customer Directory, Customer Current Balance, and Customer Balance Sheet */}
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#f0eee6] dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f]">
                <button
                  type="button"
                  onClick={() => setCustomerViewMode('directory')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    customerViewMode === 'directory'
                      ? 'bg-[#0f5c4d] text-white'
                      : 'text-[#6b6a64] dark:text-[#9a988f]'
                  }`}
                >
                  Customer Directory ({customerData.names.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerViewMode('currentbalance')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    customerViewMode === 'currentbalance'
                      ? 'bg-[#0f5c4d] text-white'
                      : 'text-[#6b6a64] dark:text-[#9a988f]'
                  }`}
                >
                  Customer Current Balance ({customerData.pendingCustomersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerViewMode('balancesheet')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    customerViewMode === 'balancesheet'
                      ? 'bg-[#0f5c4d] text-white'
                      : 'text-[#6b6a64] dark:text-[#9a988f]'
                  }`}
                >
                  Customer Balance Sheet (Date-Wise)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setQuickEntryMode('customer')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Customer
              </button>
            </div>

            {customerViewMode === 'directory' ? (
              <>
                <div className="relative">
                  <Search className="w-4 h-4 text-[#6b6a64] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Search customers, state, mobile, or GSTIN..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setLimit(200);
                    }}
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] focus:outline-none focus:border-[#0f5c4d]"
                  />
                </div>

                <p className="text-xs text-[#6b6a64] dark:text-[#9a988f]">
                  {customerData.names.length} customers · Click any customer row to open their Date-Wise Customer Balance Sheet (Bill No, Bill Date, Net Amount, Payment Recover Date, Payment Type & Received Amount).
                </p>

                <div className="overflow-x-auto bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl">
                  <table className="w-full border-collapse min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f] bg-stone-50/60 dark:bg-[#151614]/50">
                        <th className="py-2.5 px-3 text-left font-semibold">Customer</th>
                        <th className="py-2.5 px-3 text-left font-semibold">State</th>
                        <th className="py-2.5 px-3 text-left font-semibold">GSTIN</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Mobile</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Bills</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Billed ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Received ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Current Balance ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                      {customerData.names.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-[#6b6a64]">
                            No customers found
                          </td>
                        </tr>
                      ) : (
                        customerData.names.slice(0, limit).map((name) => {
                          const m = customerData.metaByCust[name];
                          const c = customerData.statsByCust[name] || { n: 0, v: 0 };
                          const rec = customerData.recByCust[name] || 0;
                          const latest = customerData.latestBillByCust[name];
                          const curBal = customerData.currentBalanceByCust[name] ?? (latest ? latest.bal : 0);
                          return (
                            <tr
                              key={name}
                              onClick={() => setSelectedCustomerLedger(name)}
                              className="hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer transition-colors"
                            >
                              <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                                {name}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-[#6b6a64] dark:text-[#9a988f] whitespace-nowrap">
                                {m?.s || latest?.st || ''}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-xs text-[#6b6a64] dark:text-[#9a988f] whitespace-nowrap">
                                {m?.g || latest?.gst || ''}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-xs text-[#6b6a64] dark:text-[#9a988f] whitespace-nowrap">
                                {m?.m || ''}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {c.n}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap">
                                {fm2(c.v)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-xs text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums whitespace-nowrap">
                                {rec > 0 ? fm2(rec) : '–'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap text-[#d98324] dark:text-[#e8a455]">
                                {fm2(curBal)}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBalanceSheetCustomer(name);
                                    setCustomerViewMode('balancesheet');
                                  }}
                                  className="text-xs font-semibold text-[#0f5c4d] dark:text-[#4fb59f] hover:underline cursor-pointer"
                                >
                                  Balance Sheet →
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : customerViewMode === 'currentbalance' ? (
              /* CUSTOMER CURRENT BALANCE VIEW */
              <div className="space-y-3">
                {/* Summary KPI Strip (Compact so table is immediately visible at top) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold text-[#6b6a64] dark:text-[#9a988f]">
                      Customers with Pending Balance
                    </div>
                    <div className="text-lg font-bold font-mono mt-0.5 tabular-nums">
                      {fmt(customerData.pendingCustomersCount)}{' '}
                      <span className="text-xs font-normal text-[#6b6a64] dark:text-[#9a988f]">
                        / {fmt(customerData.names.length)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold text-[#6b6a64] dark:text-[#9a988f]">
                      Total Receivable Current Balance
                    </div>
                    <div className="text-lg font-bold font-mono mt-0.5 text-[#d98324] dark:text-[#e8a455] tabular-nums">
                      ₹{fm2(customerData.totalReceivableBalance)}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold text-[#6b6a64] dark:text-[#9a988f]">
                      Total Net Billed (Selected Period)
                    </div>
                    <div className="text-lg font-bold font-mono mt-0.5 tabular-nums">
                      ₹{fm2(customerData.currentBalanceRows.reduce((s, r) => s + r.totalBilled, 0))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold text-[#6b6a64] dark:text-[#9a988f]">
                      Total Payments Recovered
                    </div>
                    <div className="text-lg font-bold font-mono mt-0.5 text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums">
                      ₹{fm2(customerData.currentBalanceRows.reduce((s, r) => s + r.totalReceived, 0))}
                    </div>
                  </div>
                </div>

                {/* Search & Status Filter */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-4 h-4 text-[#6b6a64] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      placeholder="Search customer current balance by name, GSTIN, or state..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setLimit(200);
                      }}
                      className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] focus:outline-none focus:border-[#0f5c4d]"
                    />
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#f0eee6] dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f]">
                    {(
                      [
                        ['all', 'All Customers'],
                        ['pending', 'Pending Balance (> ₹0)'],
                        ['cleared', 'Zero / Cleared'],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setCurrentBalanceFilter(k)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          currentBalanceFilter === k
                            ? 'bg-[#0f5c4d] text-white'
                            : 'text-[#6b6a64] dark:text-[#9a988f]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl overflow-hidden">
                  {/* Top Bar: Order / Reverse Toggle & Scroll to Top */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[#e3e1d9] dark:border-[#33352f] bg-stone-50/80 dark:bg-[#151614]/70 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[#6b6a64] dark:text-[#9a988f] mr-1">
                        Show on Top:
                      </span>
                      {(
                        [
                          ['balance_desc', 'Highest Balance'],
                          ['balance_asc', 'Bottom / Lowest Balance'],
                          ['latest_bill', 'Latest Bill Date'],
                          ['name_asc', 'Customer A–Z'],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => {
                            setCurrentBalanceSort(k);
                            if (currentBalTableWrapRef.current) {
                              currentBalTableWrapRef.current.scrollTop = 0;
                            }
                          }}
                          className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                            currentBalanceSort === k
                              ? 'bg-[#0f5c4d] text-white'
                              : 'bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] text-[#6b6a64] dark:text-[#9a988f] hover:text-[#1d1d1b] dark:hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (currentBalTableWrapRef.current) {
                          currentBalTableWrapRef.current.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                        }
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold bg-[#0f5c4d]/10 dark:bg-[#4fb59f]/15 text-[#0f5c4d] dark:text-[#4fb59f] hover:bg-[#0f5c4d] hover:text-white transition-colors cursor-pointer"
                    >
                      ↑ Scroll to Top
                    </button>
                  </div>

                  {/* Top Horizontal Scrollbar (Synced with Table Below) */}
                  <div
                    ref={currentBalTopScrollRef}
                    onScroll={(e) => {
                      if (currentBalTableWrapRef.current) {
                        currentBalTableWrapRef.current.scrollLeft = e.currentTarget.scrollLeft;
                      }
                    }}
                    className="overflow-x-auto border-b border-[#e3e1d9] dark:border-[#33352f] bg-[#f6f5f1]/60 dark:bg-[#151614]/40"
                  >
                    <div className="h-3 min-w-[1280px]" />
                  </div>

                  {/* Scrollable Table Container with Sticky Header */}
                  <div
                    ref={currentBalTableWrapRef}
                    onScroll={(e) => {
                      if (currentBalTopScrollRef.current) {
                        currentBalTopScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                      }
                    }}
                    className="overflow-auto max-h-[68vh]"
                  >
                    <table className="w-full border-collapse min-w-[920px] text-sm">
                      <thead className="sticky top-0 z-20 bg-stone-100 dark:bg-[#252823] shadow-xs">
                        <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f]">
                          <th className="py-2.5 px-3 text-left font-semibold">Customer Name</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Current Balance ₹</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Total Billed ₹</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Total Received ₹</th>
                          <th className="py-2.5 px-3 text-left font-semibold">Last Bill No & Date</th>
                          <th className="py-2.5 px-3 text-left font-semibold">Last Payment Received</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Bills</th>
                          <th className="py-2.5 px-3 text-left font-semibold">State / GSTIN</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                        {customerData.currentBalanceRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-10 text-center text-[#6b6a64]">
                              No customers match the selected balance filter
                            </td>
                          </tr>
                        ) : (
                          customerData.currentBalanceRows.slice(0, limit).map((row) => (
                            <tr
                              key={row.name}
                              onClick={() => setSelectedCustomerLedger(row.name)}
                              className="hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer transition-colors"
                            >
                              <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                                {row.name}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                                  Math.round(row.currentBalance) > 0
                                    ? 'text-[#d98324] dark:text-[#e8a455]'
                                    : 'text-[#0f5c4d] dark:text-[#4fb59f]'
                                }`}
                              >
                                ₹{fm2(row.currentBalance)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {fm2(row.totalBilled)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums whitespace-nowrap">
                                {row.totalReceived > 0 ? fm2(row.totalReceived) : '–'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                                {row.latestBill ? (
                                  <span>
                                    <b>#{row.latestBill.no}</b> · {dfmt(row.latestBill.dt)}
                                  </span>
                                ) : (
                                  '–'
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-xs text-[#0f5c4d] dark:text-[#4fb59f] whitespace-nowrap">
                                {row.latestRec ? (
                                  <span>
                                    {dfmt(row.latestRec.dt)} · ₹{fm2(row.latestRec.amt)}
                                  </span>
                                ) : (
                                  '–'
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {row.billsCount}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-[#6b6a64] dark:text-[#9a988f] whitespace-nowrap">
                                <div>{row.state || '–'}</div>
                                {row.gst && <div className="font-mono text-[11px]">{row.gst}</div>}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBalanceSheetCustomer(row.name);
                                    setCustomerViewMode('balancesheet');
                                  }}
                                  className="text-xs font-semibold text-[#0f5c4d] dark:text-[#4fb59f] hover:underline cursor-pointer"
                                >
                                  Balance Sheet →
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* INLINE DATE-WISE CUSTOMER BALANCE SHEET VIEW */
              <div className="space-y-4">
                <div className="bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
                    <label htmlFor="bs-customer-select" className="text-xs font-semibold text-[#6b6a64] dark:text-[#9a988f]">
                      Select Customer Account:
                    </label>
                    <select
                      id="bs-customer-select"
                      value={balanceSheetCustomer}
                      onChange={(e) => setBalanceSheetCustomer(e.target.value)}
                      className="flex-1 max-w-md px-3 py-2 text-sm font-semibold rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-[#f6f5f1] dark:bg-[#151614] cursor-pointer"
                    >
                      {customerData.allCustomerNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="font-sans text-[#6b6a64] dark:text-[#9a988f]">Total Net Billed: </span>
                      <span className="font-bold">₹{fm2(inlineBalanceSheetData.totalBilled)}</span>
                    </div>
                    <div>
                      <span className="font-sans text-[#6b6a64] dark:text-[#9a988f]">Total Recovered: </span>
                      <span className="font-bold text-[#0f5c4d] dark:text-[#4fb59f]">
                        ₹{fm2(inlineBalanceSheetData.totalReceived)}
                      </span>
                    </div>
                    <div>
                      <span className="font-sans text-[#6b6a64] dark:text-[#9a988f]">Current Balance: </span>
                      <span className="font-bold text-[#d98324] dark:text-[#e8a455]">
                        {inlineBalanceSheetData.latestBalance !== undefined
                          ? `₹${fm2(inlineBalanceSheetData.latestBalance)}`
                          : '–'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl">
                  <table className="w-full border-collapse min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f] bg-stone-50/60 dark:bg-[#151614]/50">
                        <th className="py-2.5 px-3 text-left font-semibold">Bill No.</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Bill Date</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Net Amount ₹</th>
                        <th className="py-2.5 px-3 text-left font-semibold border-l border-[#e3e1d9] dark:border-[#33352f]">
                          Payment Recover Date
                        </th>
                        <th className="py-2.5 px-3 text-left font-semibold">Payment Type</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Received Amount ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold border-l border-[#e3e1d9] dark:border-[#33352f]">
                          Running Balance ₹
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                      {inlineBalanceSheetData.rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-[#6b6a64]">
                            No bills or payment recoveries found for {balanceSheetCustomer} in the selected period
                          </td>
                        </tr>
                      ) : (
                        inlineBalanceSheetData.rows.map((row, idx) => (
                          <tr
                            key={idx}
                            onClick={() => {
                              if (row.invoiceRef) setSelectedInvoice(row.invoiceRef);
                            }}
                            className={`${
                              row.invoiceRef
                                ? 'hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer'
                                : 'bg-[#f6f5f1]/50 dark:bg-[#151614]/40'
                            } transition-colors`}
                          >
                            <td className="py-2.5 px-3 font-mono font-semibold text-[#0f5c4d] dark:text-[#4fb59f]">
                              {row.billNo}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs">
                              {row.billDate}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                              {row.netAmount > 0 ? fm2(row.netAmount) : '–'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs border-l border-[#e3e1d9] dark:border-[#33352f]">
                              {row.recoveryDate}
                            </td>
                            <td className="py-2.5 px-3 text-xs">
                              {row.paymentType}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#0f5c4d] dark:text-[#4fb59f] tabular-nums">
                              {row.receivedAmount > 0 ? fm2(row.receivedAmount) : '–'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-[#6b6a64] dark:text-[#9a988f] tabular-nums border-l border-[#e3e1d9] dark:border-[#33352f]">
                              {fm2(row.runningBalance)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: PRODUCTS & HSN ==================== */}
        {tab === 'products' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-[#6b6a64] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search products or HSN code (e.g. 5806, 5607, Tanishq, Twill)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setLimit(200);
                  }}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] focus:outline-none focus:border-[#0f5c4d]"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#f0eee6] dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f]">
                  <button
                    type="button"
                    onClick={() => setProductViewMode('products')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      productViewMode === 'products'
                        ? 'bg-[#0f5c4d] text-white'
                        : 'text-[#6b6a64] dark:text-[#9a988f]'
                    }`}
                  >
                    Product Catalog ({productData.filteredNames.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductViewMode('hsn')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      productViewMode === 'hsn'
                        ? 'bg-[#0f5c4d] text-white'
                        : 'text-[#6b6a64] dark:text-[#9a988f]'
                    }`}
                  >
                    HSN GST Summary ({productData.hsnRows.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setQuickEntryMode('product')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Product
                </button>
              </div>
            </div>

            {productViewMode === 'products' ? (
              <>
                <p className="text-xs text-[#6b6a64] dark:text-[#9a988f]">
                  {productData.filteredNames.length} products (sales value before GST) · Click the <b>Lines</b> number on any product to view its separate Customer Name, Bill Number, and Value breakdown.
                </p>
                <div className="overflow-x-auto bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl">
                  <table className="w-full border-collapse min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f] bg-stone-50/60 dark:bg-[#151614]/50">
                        <th className="py-2.5 px-3 text-left font-semibold">Product</th>
                        <th className="py-2.5 px-3 text-left font-semibold">HSN/SAC</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Quantity Sold</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Lines (Click to View Bills)</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Value ₹</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                      {productData.filteredNames.slice(0, limit).map((name) => {
                        const p = productData.prodMap[name];
                        const qtyStr = Object.entries(p.q)
                          .map(([u, v]) => `${fmt(v)} ${u}`)
                          .join(' · ');
                        return (
                          <tr
                            key={name}
                            onClick={() => setSelectedProductLines(name)}
                            className="hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3 font-medium whitespace-nowrap">{name}</td>
                            <td className="py-2.5 px-3 font-mono text-xs text-[#6b6a64] dark:text-[#9a988f] whitespace-nowrap">
                              {p.h}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                              {qtyStr || '–'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductLines(name);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono font-bold text-xs bg-[#0f5c4d]/10 dark:bg-[#4fb59f]/15 text-[#0f5c4d] dark:text-[#4fb59f] hover:bg-[#0f5c4d] hover:text-white transition-colors cursor-pointer"
                                title="Click to see Customer Name, Bill Number, and Value for this product"
                              >
                                {p.n}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                              {fm2(p.v)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {productData.filteredNames.length > limit && (
                  <button
                    type="button"
                    onClick={() => setLimit((l) => l + 300)}
                    className="mx-auto block px-5 py-2 text-xs font-semibold rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer"
                  >
                    Show more ({productData.filteredNames.length - limit} remaining)
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-[#6b6a64] dark:text-[#9a988f]">
                  HSN-wise summary for GSTR-1 return filing ({fy === 'all' ? 'All years' : fyl(Number(fy))})
                </p>
                <div className="overflow-x-auto bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl">
                  <table className="w-full border-collapse min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f] bg-stone-50/60 dark:bg-[#151614]/50">
                        <th className="py-2.5 px-3 text-left font-semibold">HSN Code</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Total Quantity</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Line Items</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Taxable Value ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">CGST ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">SGST ₹</th>
                        <th className="py-2.5 px-3 text-right font-semibold">IGST ₹</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                      {productData.hsnRows.map(([hsn, data]) => (
                        <tr key={hsn} className="hover:bg-[#f0eee6] dark:hover:bg-[#272a25]">
                          <td className="py-2.5 px-3 font-mono font-semibold">{hsn}</td>
                          <td className="py-2.5 px-3 font-mono text-xs">
                            {Object.entries(data.q)
                              .map(([u, v]) => `${fmt(v)} ${u}`)
                              .join(' · ')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{data.n}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                            {fm2(data.tx)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                            {fm2(data.cg)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                            {fm2(data.sg)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                            {fm2(data.ig)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== TAB 5: RECEIPTS & PAYMENTS ==================== */}
        {tab === 'receipts' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Segmented Receipts vs Payments Switch */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#f0eee6] dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f]">
                <button
                  type="button"
                  onClick={() => {
                    setRpMode('rec');
                    setRpBankFilter('all');
                    setLimit(200);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    rpMode === 'rec'
                      ? 'bg-[#0f5c4d] text-white'
                      : 'text-[#6b6a64] dark:text-[#9a988f]'
                  }`}
                >
                  Receipts ({db.rec.filter(inPeriod).length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRpMode('pay');
                    setRpBankFilter('all');
                    setLimit(200);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    rpMode === 'pay'
                      ? 'bg-[#0f5c4d] text-white'
                      : 'text-[#6b6a64] dark:text-[#9a988f]'
                  }`}
                >
                  Payments ({db.pay.filter(inPeriod).length})
                </button>
              </div>

              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-[#6b6a64] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search party, bank mode, or narration..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setLimit(200);
                  }}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] focus:outline-none focus:border-[#0f5c4d]"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={rpBankFilter}
                  onChange={(e) => {
                    setRpBankFilter(e.target.value);
                    setLimit(200);
                  }}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] cursor-pointer"
                >
                  <option value="all">All Modes</option>
                  {rpData.availableModes.map((m) => (
                    <option key={m} value={m}>
                      Mode: {m}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setQuickEntryMode(rpMode === 'rec' ? 'receipt' : 'payment')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0f5c4d] text-white hover:bg-[#0b463b] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Record {rpMode === 'rec' ? 'Receipt' : 'Payment'}
                </button>
              </div>
            </div>

            <p className="text-xs text-[#6b6a64] dark:text-[#9a988f]">
              {fmt(rpData.entries.length)} entries · Total{' '}
              <span className="font-mono font-semibold text-[#1d1d1b] dark:text-white">
                {cr(rpData.totalAmt)}
              </span>{' '}
              (₹{fm2(rpData.totalAmt)})
            </p>

            <div className="overflow-x-auto bg-white dark:bg-[#1e201d] border border-[#e3e1d9] dark:border-[#33352f] rounded-xl">
              <table className="w-full border-collapse min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[#e3e1d9] dark:border-[#33352f] text-xs text-[#6b6a64] dark:text-[#9a988f] bg-stone-50/60 dark:bg-[#151614]/50">
                    <th className="py-2.5 px-3 text-left font-semibold">No.</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Party</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Mode · Narration</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Amount ₹</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3e1d9] dark:divide-[#33352f]">
                  {rpData.entries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[#6b6a64]">
                        Nothing found
                      </td>
                    </tr>
                  ) : (
                    rpData.entries.slice(0, limit).map((r, idx) => (
                      <tr
                        key={`${r.fy}-${r.no}-${idx}`}
                        onClick={() => setSelectedCustomerLedger(r.p)}
                        className="hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                          #{r.no}
                          <span className="ml-1.5 text-[11px] text-[#6b6a64] dark:text-[#9a988f]">
                            · {fyl(r.fy).replace('FY ', '')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                          {dfmt(r.dt)}
                        </td>
                        <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                          {r.p}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-[#6b6a64] dark:text-[#9a988f] whitespace-nowrap">
                          <span className="font-mono font-medium text-[#1d1d1b] dark:text-[#ecebe5]">
                            {r.m}
                          </span>
                          {r.nar && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{r.nar}</span>
                            </>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                          {fm2(r.amt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {rpData.entries.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + 300)}
                className="mx-auto block px-5 py-2 text-xs font-semibold rounded-lg border border-[#e3e1d9] dark:border-[#33352f] bg-white dark:bg-[#1e201d] hover:bg-[#f0eee6] dark:hover:bg-[#272a25] cursor-pointer"
              >
                Show more ({rpData.entries.length - limit} remaining)
              </button>
            )}
          </div>
        )}
          </>
        )}
      </main>

      {/* MODALS */}
      <InvoiceModal
        invoice={selectedInvoice}
        company={db.co}
        onClose={() => setSelectedInvoice(null)}
        onDuplicate={(inv) => {
          setSelectedInvoice(null);
          setDuplicateTemplate(inv);
          setIsNewInvoiceOpen(true);
        }}
        onFilterCustomer={(cName) => switchTab('invoices', cName)}
      />

      <NewInvoiceModal
        isOpen={isNewInvoiceOpen}
        onClose={() => {
          setIsNewInvoiceOpen(false);
          setDuplicateTemplate(null);
          setDefaultCustomerForBill(undefined);
        }}
        onSave={handleSaveNewInvoice}
        customers={db.cust}
        products={db.prod}
        invoices={db.inv}
        initialTemplate={duplicateTemplate}
        defaultCustomerName={defaultCustomerForBill}
      />

      <CustomerLedgerModal
        customerName={selectedCustomerLedger}
        customerMeta={
          selectedCustomerLedger
            ? db.cust.find((c) => c.n === selectedCustomerLedger)
            : undefined
        }
        invoices={db.inv}
        receipts={db.rec}
        payments={db.pay}
        onClose={() => setSelectedCustomerLedger(null)}
        onSelectInvoice={(inv) => setSelectedInvoice(inv)}
        onNewInvoiceForCustomer={(name) => {
          setDuplicateTemplate(null);
          setDefaultCustomerForBill(name);
          setIsNewInvoiceOpen(true);
        }}
        onFilterInInvoicesTab={(name) => switchTab('invoices', name)}
      />

      <ProductLinesModal
        productName={selectedProductLines}
        invoices={productData.periodInvoices}
        onClose={() => setSelectedProductLines(null)}
        onSelectInvoice={(inv) => setSelectedInvoice(inv)}
        onSelectCustomer={(cName) => setSelectedCustomerLedger(cName)}
      />

      <QuickEntryModal
        mode={quickEntryMode}
        onClose={() => setQuickEntryMode(null)}
        customers={db.cust}
        nextReceiptNo={(db.rec[0]?.no || 116) + 1}
        nextPaymentNo={(db.pay[0]?.no || 97) + 1}
        onAddReceiptPayment={handleAddReceiptPayment}
        onAddCustomer={handleAddCustomer}
        onAddProduct={handleAddProduct}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        currentDb={db}
        companies={companies}
        activeCompanyId={activeCompanySlot.id}
        onSwitchCompany={handleSwitchCompany}
        onDeleteCompany={handleDeleteCompany}
        onRestoreDatabase={handleRestoreDatabase}
        onResetToFactory={handleResetToFactory}
      />
    </div>
  );
}
