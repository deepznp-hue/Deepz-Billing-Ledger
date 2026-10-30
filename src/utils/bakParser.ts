import type {
  BillingDatabase,
  CompanyInfo,
  CustomerRecord,
  InvoiceRecord,
  ProductRecord,
  ReceiptPaymentRecord,
} from '../data/initialDb';

const VALID_XTYPES = new Set([
  34, 35, 36, 40, 41, 42, 43, 48, 52, 56, 58, 59, 60, 61, 62, 98, 99, 104, 106,
  108, 122, 127, 165, 167, 173, 175, 189, 231, 239, 240, 241,
]);

const VAR_XTYPES = new Set([34, 35, 98, 99, 165, 167, 231, 240, 241]);

function cleanStr(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val).replace(/\x00/g, '').trim();
  if (s.toUpperCase() === 'NULL' || s === 'None') return '';
  return s;
}

function toFloat(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const s = String(val).replace(/,/g, '').trim();
  const n = parseFloat(s);
  if (Number.isFinite(n)) return n;
  const m = s.match(/[-+]?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) || 0 : 0;
}

function toInt(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val) : 0;
  const s = String(val).replace(/,/g, '').trim();
  const n = parseFloat(s);
  if (Number.isFinite(n)) return Math.round(n);
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

function normalizeDate(val: any): string {
  if (!val) return '';
  const s = cleanStr(val);
  // YYYY-MM-DD
  const m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) {
    const yr = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10);
    const dy = parseInt(m1[3], 10);
    if (yr >= 1970 && yr <= 2100 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
      return `${String(yr).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
    }
  }
  // DD-MM-YYYY or MM-DD-YYYY
  const m2 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m2) {
    const a = parseInt(m2[1], 10);
    const b = parseInt(m2[2], 10);
    const yr = parseInt(m2[3], 10);
    if (yr >= 1970 && yr <= 2100) {
      if (b > 12 && a <= 12) {
        return `${yr}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
      }
      if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
        return `${yr}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
      }
    }
  }
  return '';
}

function inferFy(dtStr: string, rawFy?: any, tableName = ''): string {
  const r = cleanStr(rawFy);
  if (r && r !== '0') {
    const mRange = r.match(/(\d{4})\s*[-/]\s*(\d{2,4})/);
    if (mRange) {
      return String(parseInt(mRange[1], 10) + 1);
    }
    const mYear = r.match(/(20\d{2})/);
    if (mYear) return mYear[1];
  }
  const norm = normalizeDate(dtStr);
  const m = norm.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const yr = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    return String(mo >= 4 ? yr + 1 : yr);
  }
  if (tableName) {
    const mt = tableName.match(/(20\d{2})/);
    if (mt) return mt[1];
  }
  return '2027';
}

function pickField(row: Record<string, any>, candidates: string[], defaultVal: any = ''): any {
  const normMap: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    normMap[nk] = v;
  }
  // 1. Exact normalized match
  for (const c of candidates) {
    const nc = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normMap[nc] !== undefined && normMap[nc] !== null && String(normMap[nc]).trim() !== '') {
      return normMap[nc];
    }
  }
  // 2. Substring match ONLY for longer candidate keys (len >= 4) so "no" never matches "gstno"/"panno"
  for (const c of candidates) {
    const nc = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (nc.length < 4) continue;
    for (const [nk, val] of Object.entries(normMap)) {
      if (nk.includes(nc) && val !== undefined && val !== null && String(val).trim() !== '') {
        return val;
      }
    }
  }
  return defaultVal;
}

/**
 * Maps generic database tables { tableName: [rowObjects] } into BillingDatabase
 */
function mapTablesToDatabase(
  tablesDict: Record<string, Record<string, any>[]>,
  fallbackCompanyName: string,
  fallbackCo: CompanyInfo
): BillingDatabase | null {
  const co: CompanyInfo = {
    n: fallbackCompanyName || fallbackCo.n,
    a: '',
    ph: '',
    em: '',
    g: '',
    pan: '',
  };

  const invByKey: Record<string, InvoiceRecord> = {};
  const invOrder: string[] = [];
  const lineItemsByKey: Record<string, [string, string, number, string, number, number][]> = {};
  const custList: CustomerRecord[] = [];
  const prodList: ProductRecord[] = [];
  const recList: ReceiptPaymentRecord[] = [];
  const payList: ReceiptPaymentRecord[] = [];

  for (const [tname, rows] of Object.entries(tablesDict)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const tl = tname.toLowerCase();
    const sample = rows[0] || {};
    const colsLower = Object.keys(sample).map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Inspect first 15 rows for value-based classification
    let hasRupeesWords = false;
    let hasGstinVal = false;
    for (const sr of rows.slice(0, 15)) {
      if (!sr || typeof sr !== 'object') continue;
      for (const sv of Object.values(sr)) {
        if (typeof sv === 'string') {
          const su = sv.toUpperCase();
          if (su.includes('RUPEES') && su.includes('ONLY')) hasRupeesWords = true;
          if (/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(su.trim())) hasGstinVal = true;
        }
      }
    }

    // 1. Company Table
    const isCompanyTable =
      (['comp', 'firm', 'setting', 'profile', 'organisation', 'organization', 'owner'].some((w) =>
        tl.includes(w)
      ) ||
        (rows.length <= 10 &&
          colsLower.some((c) => ['companyname', 'compname', 'propertyname', 'firmname', 'panno', 'pan'].includes(c)))) &&
      !hasRupeesWords;

    if (isCompanyTable) {
      for (const r of rows) {
        const nVal = cleanStr(
          pickField(r, ['companyname', 'compname', 'propertyname', 'firmname', 'cname', 'name', 'title', 'n'])
        );
        if (nVal && nVal.length >= 2) {
          if (!co.n || co.n === fallbackCompanyName || co.n === fallbackCo.n) {
            co.n = nVal.toUpperCase();
          }
          const a1 = cleanStr(pickField(r, ['address1', 'add1', 'addr1', 'address', 'addr', 'a', 'str_1']));
          const a2 = cleanStr(pickField(r, ['address2', 'add2', 'addr2', 'city', 'str_2']));
          const a3 = cleanStr(pickField(r, ['address3', 'add3', 'addr3', 'pincode', 'state', 'str_3', 'str_4']));
          const candA = [a1, a2, a3].filter(Boolean).join(', ');
          if (candA && !co.a) co.a = candA;
          const ph1 = cleanStr(
            pickField(r, ['phone1', 'phone', 'mobile', 'contact', 'ph', 'tel', 'mobileno', 'phoneno', 'cell', 'str_7'])
          );
          const ph2 = cleanStr(pickField(r, ['phone2']));
          const candPh = [ph1, ph2].filter((x) => x && x !== '00').join(', ');
          if (candPh && !co.ph) co.ph = candPh;
          const candEm = cleanStr(pickField(r, ['email', 'mail', 'em', 'emailid']));
          if (candEm && candEm.toLowerCase() !== 'none' && !co.em) co.em = candEm;
          const candG = cleanStr(pickField(r, ['gstin', 'gstno', 'cstno', 'gst', 'g', 'str_9']));
          if (candG && !co.g) co.g = candG;
          const candPan = cleanStr(pickField(r, ['panno', 'pan', 'tinno']));
          if (candPan && !co.pan) co.pan = candPan;
        }
      }
      continue;
    }

    // Ignore internal weaving / warp / weft / bobbin / sizing / purchase / damage / opening / login / actgroup / cashact / quotation tables
    const isNonSalesInternal = [
      'warp',
      'weft',
      'bobbin',
      'sizing',
      'oinit',
      'exchange',
      'damage',
      'partypayment',
      'partyopening',
      'purchase',
      'purreturn',
      'salesreturn',
      'saleorder',
      'salesorder',
      'actgroup',
      'cashact',
      'quotation',
      'quote',
      'estimate',
      'ledgersgroup',
      'login',
      'itemselection',
      'manufacture',
      'openingstock',
      'printlabel',
      'pricelist',
    ].some((w) => tl.includes(w));
    if (isNonSalesInternal) continue;

    const hasTaxOrNetCols =
      colsLower.some((c) =>
        [
          'cgst',
          'sgst',
          'igst',
          'cgstamt',
          'sgstamt',
          'igstamt',
          'taxable',
          'taxablevalue',
          'taxableamt',
          'netamount',
          'netamt',
          'grandtotal',
          'gtotal',
          'grosstot',
          'roundoff',
          'roff',
          'rupees',
          'amtinwords',
          'amountinwords',
          'inwords',
          'words',
          'billamt',
          'billamount',
          'billvalue',
          'invamt',
          'invoiceamt',
        ].includes(c)
      ) || hasRupeesWords;

    const hasItemCols = colsLower.some((c) =>
      ['qty', 'quantity', 'mtr', 'meter', 'rate', 'price', 'unitprice'].includes(c)
    );
    const hasBillNoCol = colsLower.some((c) =>
      ['billno', 'invno', 'invoiceno', 'bno', 'ino', 'sno', 'vno', 'saleid', 'invid', 'billid', 'no'].includes(c)
    );

    // 2. Pure Invoice Line Items / Bill Details Table
    const isDetailTable =
      ((['detail', 'sub', 'line', 'invdet', 'billdet', 'saledet', 'particular', 'billitem', 'invitem', 'saleitem'].some(
        (w) => tl.includes(w)
      ) &&
        !['master', 'prodmaster', 'itemmaster', 'category'].some((w) => tl.includes(w))) ||
        (hasItemCols && hasBillNoCol && colsLower.includes('rate'))) &&
      !hasTaxOrNetCols;

    if (isDetailTable) {
      for (const r of rows) {
        const bno = toInt(
          pickField(r, ['billno', 'invno', 'invoiceno', 'bno', 'ino', 'saleid', 'invid', 'billid', 'no', 'sno'])
        );
        const dtRaw = pickField(r, ['billdate', 'invdate', 'invoicedate', 'date', 'dt', 'bdate', 'idate']);
        const fyVal = inferFy(dtRaw, pickField(r, ['cyear', 'fy', 'fyear', 'finyear', 'year', 'acyear']), tname);
        const pname = cleanStr(
          pickField(r, [
            'pdtname',
            'productname',
            'itemname',
            'particulars',
            'particular',
            'description',
            'pname',
            'iname',
            'product',
            'item',
            'goods',
            'quality',
            'name',
          ])
        );
        const hsn = cleanStr(pickField(r, ['hsnsac', 'hsn', 'hsncode', 'sac', 'hsnno'], '5806'));
        const qty = toFloat(pickField(r, ['qty', 'quantity', 'mtr', 'meter', 'meters', 'weight', 'kgs', 'nos', 'pcs']));
        const unit = cleanStr(pickField(r, ['unit', 'uom', 'utype', 'measure', 'bag', 'pack'], 'Mtr'));
        const rate = toFloat(pickField(r, ['rate', 'price', 'unitprice', 'mrp', 'itemrate']));
        let amt = toFloat(pickField(r, ['billvalue', 'amount', 'amt', 'total', 'value', 'lineamt', 'itemamt', 'net', 'totamt']));
        if (amt === 0 && qty > 0 && rate > 0) {
          amt = Number((qty * rate).toFixed(2));
        }
        if (bno > 0 && (pname || amt > 0 || qty > 0)) {
          const tuple: [string, string, number, string, number, number] = [
            pname || 'Textile Item',
            hsn || '5806',
            qty,
            unit || 'Mtr',
            rate,
            amt,
          ];
          const kFy = `${fyVal}-${bno}`;
          const kNo = `NO-${bno}`;
          if (!lineItemsByKey[kFy]) lineItemsByKey[kFy] = [];
          if (!lineItemsByKey[kNo]) lineItemsByKey[kNo] = [];
          lineItemsByKey[kFy].push(tuple);
          lineItemsByKey[kNo].push(tuple);
        }
      }
      continue;
    }

    // 3. Invoice Header / Bill / Sales Master Table
    const isInvoiceTable =
      (hasTaxOrNetCols ||
        ['inv', 'bill', 'sale', 'tax', 'gst', 'outward', 'despatch', 'challan'].some((w) =>
          tl.includes(w)
        )) &&
      !['rec', 'rcpt', 'pay', 'cust', 'party', 'ledger', 'prod', 'item', 'category', 'cashact', 'quotation', 'quote', 'voucher'].some(
        (w) => tl.includes(w)
      );

    if (isInvoiceTable) {
      for (const r of rows) {
        let bno = toInt(
          pickField(r, [
            'billno',
            'invno',
            'invoiceno',
            'bno',
            'ino',
            'billid',
            'invid',
            'sno',
            'slno',
            'no',
            'id',
          ])
        );
        if (hasBillNoCol && bno <= 0) continue;

        let dtStr = normalizeDate(
          pickField(r, ['billdate', 'invdate', 'invoicedate', 'saledate', 'bdate', 'idate', 'vdate', 'date', 'dt'])
        );
        if (!dtStr) {
          for (const v of Object.values(r)) {
            const cand = normalizeDate(v);
            if (cand) {
              dtStr = cand;
              break;
            }
          }
        }
        const fyVal = inferFy(
          dtStr,
          pickField(r, ['cyear', 'fy', 'fyear', 'finyear', 'year', 'acyear', 'str_18', 'str_10']),
          tname
        );
        const cname = cleanStr(
          pickField(r, [
            'customername',
            'scustomername',
            'partyname',
            'cname',
            'pname',
            'customer',
            'party',
            'buyer',
            'client',
            'ledgername',
            'accountname',
            'acname',
            'consignee',
            'c',
            'str_1',
            'name',
          ])
        ).toUpperCase();
        let gst = cleanStr(
          pickField(r, ['gstin', 'sgstin', 'gstno', 'partygstin', 'cgstno', 'custgst', 'gst', 'tin', 'str_7'])
        );
        if (!gst) {
          for (const v of Object.values(r)) {
            if (typeof v === 'string' && /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v.trim().toUpperCase())) {
              gst = v.trim().toUpperCase();
              break;
            }
          }
        }
        const st = cleanStr(
          pickField(r, ['sstate', 'ssstate', 'state', 'statename', 'states', 'st', 'placeofsupply', 'pos', 'str_4'])
        );
        const veh = cleanStr(
          pickField(r, ['vno', 'vehicleno', 'vehicle', 'veh', 'lorryno', 'truckno', 'tname', 'despatchthrough'])
        );
        const dc = cleanStr(
          pickField(r, ['deliveryno', 'dcno', 'lrno', 'dc', 'challanno', 'challan', 'dcref', 'orderno', 'pono'])
        );
        let tx = toFloat(
          pickField(r, [
            'taxablevalue',
            'taxable',
            'taxableamt',
            'billvalue',
            'subtotal',
            'subtot',
            'totalamt',
            'grossamt',
            'gross',
            'totamt',
            'tx',
            'basicamt',
            'itemtotal',
            'amount',
            'amt',
          ])
        );
        const cg = toFloat(pickField(r, ['cgst', 'cgstamt', 'cgstval', 'cg']));
        const sg = toFloat(pickField(r, ['sgst', 'sgstamt', 'sgstval', 'sg']));
        const ig = toFloat(pickField(r, ['igst', 'igstamt', 'igstval', 'ig']));
        const cgstp = toFloat(pickField(r, ['cgstp']));
        const sgstp = toFloat(pickField(r, ['sgstp']));
        const igstp = toFloat(pickField(r, ['igstp']));
        const gp =
          cgstp + sgstp > 0
            ? cgstp + sgstp
            : igstp > 0
            ? igstp
            : toFloat(pickField(r, ['gstper', 'gstpercent', 'taxper', 'gstrate', 'igstper', 'gp'], 5)) || 5;
        const ro = toFloat(pickField(r, ['roundoff', 'roff', 'ro', 'round']));
        const disc = toFloat(pickField(r, ['discount', 'disc', 'discamt']));
        let net = toFloat(
          pickField(r, [
            'netamt',
            'netamount',
            'grosstot',
            'grandtotal',
            'gtotal',
            'net',
            'billamt',
            'billamount',
            'invamt',
            'invoiceamt',
            'total',
            'finalamt',
            'totval',
            'netval',
            'amount',
            'amt',
          ])
        );
        if (net === 0 && tx > 0) {
          net = Math.round(tx + cg + sg + ig + ro - disc);
        }
        if (tx === 0 && net > 0) {
          tx = Number((net - cg - sg - ig - ro + disc).toFixed(2));
        }

        if (bno <= 0 && tx <= 0 && net <= 0) continue;
        if (bno <= 0) bno = invOrder.length + 1;

        const pre = toFloat(
          pickField(r, ['prebal', 'prevbalance', 'oldbalance', 'openingbalance', 'oldbal', 'pre', 'ob'])
        );
        let bal = toFloat(
          pickField(r, ['netbalance', 'balance', 'closingbalance', 'totbal', 'bal', 'curbal', 'cb'])
        );
        if (bal === 0 && pre !== 0) {
          bal = pre + net;
        }
        const nar = cleanStr(pickField(r, ['narration', 'remarks', 'note', 'notes', 'nar', 'str_8']));
        let w = cleanStr(
          pickField(r, ['inwords', 'words', 'rupees', 'amtinwords', 'amountinwords', 'rupeesinwords', 'w'])
        );
        if (!w) {
          for (const v of Object.values(r)) {
            if (typeof v === 'string' && v.toUpperCase().includes('RUPEES')) {
              w = cleanStr(v);
              break;
            }
          }
        }

        const a1 = cleanStr(pickField(r, ['address1', 'add1', 'addr1', 'address', 'a', 'str_2']));
        const a2 = cleanStr(pickField(r, ['address2', 'add2', 'addr2', 'str_3']));
        const a3 = cleanStr(pickField(r, ['address3', 'add3', 'addr3', 'city', 'place']));

        const rowLines: [string, string, number, string, number, number][] = [];
        if (Array.isArray(r.L)) {
          r.L.forEach((l: any) => {
            if (Array.isArray(l)) {
              rowLines.push([
                String(l[0] ?? ''),
                String(l[1] ?? '5806'),
                toFloat(l[2]),
                String(l[3] ?? 'Mtr'),
                toFloat(l[4]),
                toFloat(l[5]),
              ]);
            }
          });
        } else {
          const pname = cleanStr(
            pickField(r, [
              'pdtname',
              'productname',
              'itemname',
              'particulars',
              'particular',
              'description',
              'pname',
              'iname',
              'product',
              'item',
              'goods',
              'quality',
              'str_15',
              'str_6',
            ])
          );
          const qty = toFloat(pickField(r, ['qty', 'pass', 'quantity', 'mtr', 'meter', 'weight', 'kgs', 'nos', 'pcs']));
          const rate = toFloat(pickField(r, ['rate', 'price', 'unitprice', 'itemrate']));
          if (pname || (qty > 0 && rate > 0)) {
            const hsn = cleanStr(pickField(r, ['hsnsac', 'hsn', 'hsncode', 'sac', 'hsnno', 'str_16'], '5806'));
            const unit = cleanStr(pickField(r, ['unit', 'uom', 'utype', 'measure'], hsn.startsWith('63') ? 'Nos' : 'Mtr'));
            const amt = toFloat(
              pickField(r, ['billvalue', 'itemamt', 'lineamt', 'amount', 'amt'], Number((qty * rate).toFixed(2)) || tx)
            );
            rowLines.push([pname || 'Textile Goods', hsn || '5806', qty || 1, unit || 'Mtr', rate || amt, amt]);
          }
        }

        const invKey = `${fyVal}-${bno}`;
        if (invByKey[invKey]) {
          if (rowLines.length > 0) {
            invByKey[invKey].L.push(...rowLines);
          }
          if (invByKey[invKey].L.length > 1) {
            const sumLines = Number(invByKey[invKey].L.reduce((s, l) => s + (l[5] || 0), 0).toFixed(2));
            if (sumLines > invByKey[invKey].tx) {
              invByKey[invKey].tx = sumLines;
              if (invByKey[invKey].net < invByKey[invKey].tx) {
                invByKey[invKey].net = Math.round(
                  invByKey[invKey].tx +
                    invByKey[invKey].cg +
                    invByKey[invKey].sg +
                    invByKey[invKey].ig +
                    invByKey[invKey].ro -
                    invByKey[invKey].disc
                );
              }
            }
          }
        } else {
          invByKey[invKey] = {
            fy: fyVal,
            no: bno,
            dt: dtStr || '2026-10-15',
            c: cname || 'CUSTOMER',
            gst,
            st: st || 'Tamil Nadu',
            veh,
            tx,
            cg,
            sg,
            ig,
            gp,
            ro,
            net,
            pre,
            bal,
            disc,
            nar,
            w,
            a: [a1, a2, a3],
            dc,
            L: rowLines,
          };
          invOrder.push(invKey);
        }
      }
      continue;
    }

    // 4. Receipts / Payments / Combined Voucher Table
    if (
      [
        'rec',
        'rcpt',
        'collection',
        'credit',
        'inward',
        'pay',
        'debit',
        'outward',
        'expense',
        'voucher',
        'cashbook',
        'bankbook',
        'cashdetails',
      ].some((w) => tl.includes(w)) ||
      colsLower.some((c) =>
        ['rcptno', 'recno', 'payno', 'voucherno', 'recamt', 'payamt', 'paidamt', 'rcptondate', 'payondate'].includes(c)
      )
    ) {
      const isPayTable =
        ['pay', 'debit', 'outward', 'expense'].some((w) => tl.includes(w)) ||
        colsLower.some((c) => ['payno', 'payondate', 'payamt', 'paidamt'].includes(c));

      for (const r of rows) {
        const vtype = cleanStr(pickField(r, ['vtype', 'transtype', 'type', 'entrytype', 'crdr', 'drcr'])).toLowerCase();
        const isPay = isPayTable || vtype.startsWith('p') || vtype.startsWith('dr') || vtype === 'debit';
        const no = toInt(pickField(r, ['rcptno', 'recno', 'payno', 'voucherno', 'vno', 'rno', 'pno', 'sno', 'no', 'id']));
        const dtStr = normalizeDate(
          pickField(r, ['rcptondate', 'payondate', 'recdate', 'paydate', 'vdate', 'rdate', 'pdate', 'date', 'dt', 'entrydate'])
        );
        const fyVal = inferFy(dtStr, pickField(r, ['cyear', 'fy', 'fyear', 'finyear', 'year', 'str_2']), tname);
        const party = cleanStr(
          pickField(r, [
            'particularsname',
            'partyname',
            'customername',
            'pname',
            'cname',
            'party',
            'customer',
            'ledgername',
            'account',
            'p',
            'name',
          ])
        ).toUpperCase();
        const chnoMode = cleanStr(pickField(r, ['chno']));
        const cashAcc = cleanStr(
          pickField(r, ['cashacc', 'acc', 'mode', 'paymode', 'recmode', 'bank', 'bankname', 'type', 'cashbank', 'm', 'str_1'])
        );
        const mode = chnoMode && !isPay ? chnoMode : cashAcc || (isPay ? 'NULL' : 'CASH A/C');
        const amt =
          toFloat(pickField(r, ['amount', 'amt', 'recamt', 'payamt', 'paidamt', 'netamt'])) ||
          toFloat(pickField(r, [isPay ? 'debit' : 'credit'])) ||
          toFloat(pickField(r, [isPay ? 'credit' : 'debit']));
        const nar1 = cleanStr(pickField(r, ['narration1', 'narration', 'remarks', 'nar', 'note', 'ref', 'particulars', 'description', 'bno']));
        const nar2 = cleanStr(pickField(r, ['narration2']));
        const nar = [nar1, nar2].filter(Boolean).join(' ');
        if (party && (amt > 0 || !isPay)) {
          if (isPay) {
            payList.push({
              fy: fyVal,
              no: no || payList.length + 1,
              dt: dtStr || '2026-10-15',
              p: party,
              m: chnoMode || 'NULL',
              amt,
              nar,
            });
          } else {
            recList.push({
              fy: fyVal,
              no: no || recList.length + 1,
              dt: dtStr || '2026-10-15',
              p: party,
              m: mode && mode !== 'NULL' ? mode : 'CASH A/C',
              amt,
              nar,
            });
          }
        }
      }
      continue;
    }

    // 5. Customers / Party Master Table
    if (
      (['cust', 'party', 'ledger', 'client', 'buyer', 'account', 'consignee'].some((w) => tl.includes(w)) ||
        hasGstinVal ||
        colsLower.some((c) => ['customername', 'partyname', 'gstin', 'gstno', 'mobileno'].includes(c))) &&
      !['prod', 'pdt', 'category', 'supplier'].some((w) => tl.includes(w))
    ) {
      for (const r of rows) {
        const name = cleanStr(
          pickField(r, ['customername', 'partyname', 'ledgername', 'accountdescription', 'cname', 'pname', 'buyername', 'name', 'n'])
        ).toUpperCase();
        if (!name) continue;
        const a1 = cleanStr(pickField(r, ['addr1', 'add1', 'address1', 'address', 'a', 'str_1']));
        const a2 = cleanStr(pickField(r, ['addr2', 'add2', 'address2', 'str_2']));
        const a3 = cleanStr(pickField(r, ['addr3', 'add3', 'address3', 'city', 'place']));
        const addr = [a1, a2, a3].filter(Boolean).join(', ');
        const st = cleanStr(pickField(r, ['states', 'state', 'statename', 'st', 's', 'str_3']));
        const gst = cleanStr(pickField(r, ['gstin', 'gstno', 'gst', 'tin', 'g', 'str_6']));
        const mob = cleanStr(pickField(r, ['mobile', 'mobileno', 'phone', 'phoneno', 'contact', 'cell', 'm', 'str_5']));
        custList.push({ n: name, a: addr, s: st, g: gst, m: mob });
      }
      continue;
    }

    // 6. Products / Item Master Table
    if (
      ['prod', 'pdt', 'item', 'stock', 'good', 'material', 'quality', 'yarn', 'fabric', 'tape', 'rope'].some((w) =>
        tl.includes(w)
      ) ||
      colsLower.some((c) => ['pdtname', 'productname', 'itemname', 'hsncode', 'hsnsac', 'hsn'].includes(c))
    ) {
      for (const r of rows) {
        const name = cleanStr(
          pickField(r, ['pdtname', 'productname', 'itemname', 'pname', 'iname', 'quality', 'description', 'name', 'n'])
        );
        const hsn = cleanStr(pickField(r, ['hsnsac', 'hsn', 'hsncode', 'sac', 'hsnno', 'h'], '5806'));
        if (name) {
          prodList.push({ n: name, h: hsn || '5806' });
        }
      }
      continue;
    }
  }

  const invList = invOrder.map((k) => invByKey[k]);

  // Attach line items to invoices
  for (const invObj of invList) {
    if (invObj.L.length === 0) {
      const kFy = `${invObj.fy}-${invObj.no}`;
      const kNo = `NO-${invObj.no}`;
      if (lineItemsByKey[kFy]) {
        invObj.L = lineItemsByKey[kFy];
      } else if (lineItemsByKey[kNo]) {
        invObj.L = lineItemsByKey[kNo];
      } else {
        invObj.L = [['Textile Goods', '5806', 1, 'Lot', invObj.tx, invObj.tx]];
      }
    }
  }

  invList.sort((a, b) => b.dt.localeCompare(a.dt) || b.no - a.no);
  recList.sort((a, b) => b.dt.localeCompare(a.dt) || b.no - a.no);
  payList.sort((a, b) => b.dt.localeCompare(a.dt) || b.no - a.no);

  if (custList.length === 0 && invList.length > 0) {
    const seenC = new Map<string, CustomerRecord>();
    for (const i of invList) {
      if (i.c && !seenC.has(i.c)) {
        seenC.set(i.c, {
          n: i.c,
          a: i.a.filter(Boolean).join(', '),
          s: i.st,
          g: i.gst,
          m: '',
        });
      }
    }
    custList.push(...seenC.values());
  }

  if (prodList.length === 0 && invList.length > 0) {
    const seenP = new Map<string, ProductRecord>();
    for (const i of invList) {
      for (const l of i.L) {
        if (l[0] && !seenP.has(l[0])) {
          seenP.set(l[0], { n: l[0], h: l[1] || '5806' });
        }
      }
    }
    prodList.push(...seenP.values());
  }

  if (invList.length === 0 && custList.length === 0 && recList.length === 0 && prodList.length === 0) {
    return null;
  }

  return {
    co,
    inv: invList,
    cust: custList,
    prod: prodList,
    rec: recList,
    pay: payList,
  };
}

/**
 * Normalizes a parsed JSON object
 */
function normalizeParsedObject(
  raw: any,
  fallbackCompanyName: string,
  fallbackCo: CompanyInfo
): BillingDatabase | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw.DB || raw.db || raw.data || raw.backup || raw;

  if (Array.isArray(root.inv)) {
    const coRaw = root.co || root.company || {};
    return {
      co: {
        n: cleanStr(coRaw.n || coRaw.name || fallbackCompanyName || fallbackCo.n),
        a: cleanStr(coRaw.a || coRaw.address || ''),
        ph: cleanStr(coRaw.ph || coRaw.phone || ''),
        em: cleanStr(coRaw.em || coRaw.email || ''),
        g: cleanStr(coRaw.g || coRaw.gstin || ''),
        pan: cleanStr(coRaw.pan || ''),
      },
      inv: root.inv,
      cust: Array.isArray(root.cust) ? root.cust : [],
      prod: Array.isArray(root.prod) ? root.prod : [],
      rec: Array.isArray(root.rec) ? root.rec : [],
      pay: Array.isArray(root.pay) ? root.pay : [],
    };
  }

  return mapTablesToDatabase(root, fallbackCompanyName, fallbackCo);
}

function splitSqlValues(valuesStr: string): string[][] {
  const tuples: string[][] = [];
  let curTuple: string[] = [];
  let curVal = '';
  let inQuote = false;
  let quoteChar = '';
  let depth = 0;

  for (let i = 0; i < valuesStr.length; i++) {
    const ch = valuesStr[i];
    if (inQuote) {
      if (ch === '\\' && i + 1 < valuesStr.length) {
        curVal += valuesStr[i + 1];
        i++;
        continue;
      }
      if (ch === quoteChar) {
        if (i + 1 < valuesStr.length && valuesStr[i + 1] === quoteChar) {
          curVal += quoteChar;
          i++;
          continue;
        }
        inQuote = false;
      } else {
        curVal += ch;
      }
    } else {
      if (ch === "'" || ch === '"') {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === '(') {
        if (depth === 0) {
          curTuple = [];
          curVal = '';
        } else {
          curVal += ch;
        }
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          curTuple.push(curVal.trim());
          tuples.push(curTuple);
          curVal = '';
        } else {
          curVal += ch;
        }
      } else if (ch === ',' && depth === 1) {
        curTuple.push(curVal.trim());
        curVal = '';
      } else if (depth >= 1) {
        curVal += ch;
      }
    }
  }
  return tuples;
}

function tryParseSqlDump(
  text: string,
  fallbackCompanyName: string,
  fallbackCo: CompanyInfo
): BillingDatabase | null {
  const upper = text.toUpperCase();
  if (!upper.includes('INSERT ') && !upper.includes('CREATE TABLE')) {
    return null;
  }

  const schemas: Record<string, string[]> = {};
  const createRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"[\]\w]+\.)?[`"[\]]?(\w+)[`"[\]]?\s*\(([\s\S]*?)\)\s*(?:;|ON\s|GO\b)/gi;
  let cm: RegExpExecArray | null;
  while ((cm = createRe.exec(text)) !== null) {
    const tname = cm[1].toLowerCase();
    const body = cm[2];
    const cols: string[] = [];
    for (const rawLine of body.split(',')) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^(PRIMARY|KEY|CONSTRAINT|UNIQUE|INDEX|FOREIGN)/i.test(line)) continue;
      const colMatch = line.match(/^[`"[\]]?(\w+)[`"[\]]?\s+/);
      if (colMatch) cols.push(colMatch[1]);
    }
    if (cols.length > 0) schemas[tname] = cols;
  }

  const tablesDict: Record<string, Record<string, any>[]> = {};
  const insertRe =
    /INSERT\s+(?:INTO\s+)?(?:[`"[\]\w]+\.)?[`"[\]]?(\w+)[`"[\]]?\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+?)(?:;|\bGO\b|\nINSERT\b|$)/gi;
  let im: RegExpExecArray | null;
  while ((im = insertRe.exec(text)) !== null) {
    const tname = im[1];
    const colsPart = im[2];
    const valsPart = im[3];
    const cols = colsPart
      ? colsPart.split(',').map((c) => c.replace(/[`"[\]\s]/g, ''))
      : schemas[tname.toLowerCase()] || [];

    const tuples = splitSqlValues(valsPart);
    for (const tup of tuples) {
      const rowObj: Record<string, any> = {};
      if (cols.length > 0 && cols.length === tup.length) {
        cols.forEach((c, idx) => {
          rowObj[c] = tup[idx].replace(/^N'|'$|^'/g, '');
        });
      } else {
        tup.forEach((v, idx) => {
          rowObj[`col_${idx}`] = v.replace(/^N'|'$|^'/g, '');
        });
      }
      if (!tablesDict[tname]) tablesDict[tname] = [];
      tablesDict[tname].push(rowObj);
    }
  }

  if (Object.keys(tablesDict).length === 0) return null;
  return mapTablesToDatabase(tablesDict, fallbackCompanyName, fallbackCo);
}

/**
 * Genuine parser for Microsoft SQL Server `.bak` (MTF `TAPE` format) binary 8KB pages
 */
export function tryParseMsSqlBakBytes(
  bytes: Uint8Array,
  fallbackCompanyName: string,
  fallbackCo: CompanyInfo
): BillingDatabase | null {
  if (bytes.length < 8192) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const utf16Decoder = new TextDecoder('utf-16le', { fatal: false });
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const latin1Decoder = new TextDecoder('iso-8859-1', { fatal: false });

  const decodeSmartBytes = (rawB: Uint8Array): string => {
    if (!rawB || rawB.byteLength === 0) return '';
    if (rawB.byteLength >= 2 && rawB.byteLength % 2 === 0) {
      let nullOdds = 0;
      const limit = Math.min(rawB.byteLength, 40);
      for (let i = 1; i < limit; i += 2) {
        if (rawB[i] === 0) nullOdds++;
      }
      if (nullOdds >= Math.min(Math.floor(rawB.byteLength / 4), 3)) {
        return utf16Decoder.decode(rawB).replace(/\x00/g, '').trim();
      }
    }
    return utf8Decoder.decode(rawB).replace(/\x00/g, '').trim();
  };

  // Scan for 8192-byte SQL Server pages at ANY byte offset using fast native indexOf
  const pageMap = new Map<string, number>();
  let pos = 0;
  const maxPos = bytes.length - 8192;

  while (pos <= maxPos) {
    const nextIdx = bytes.indexOf(1, pos);
    if (nextIdx === -1 || nextIdx > maxPos) break;
    pos = nextIdx;

    const pType = bytes[pos + 1];
    const pLevel = bytes[pos + 3];
    if ((pType === 1 || pType === 13) && pLevel === 0) {
      const pminlen = view.getUint16(pos + 14, true);
      const slotCnt = view.getUint16(pos + 22, true);
      const freeCnt = view.getUint16(pos + 28, true);
      const freeData = view.getUint16(pos + 30, true);
      const pageId = view.getUint32(pos + 32, true);
      const fileId = view.getUint16(pos + 36, true);

      if (pType === 13 && fileId >= 1 && fileId <= 32) {
        pageMap.set(`${fileId}:${pageId}`, pos);
        pos += 8192;
        continue;
      }

      if (
        slotCnt >= 1 &&
        slotCnt <= 2000 &&
        freeData >= 96 &&
        freeData <= 8192 &&
        freeCnt <= 8096 &&
        pminlen >= 4 &&
        pminlen <= 8060 &&
        fileId >= 1 &&
        fileId <= 32 &&
        pageId < 10000000
      ) {
        let validSlot = false;
        const checkCnt = Math.min(slotCnt, 16);
        for (let s = 0; s < checkCnt; s++) {
          const so = view.getUint16(pos + 8192 - 2 * (s + 1), true);
          if (so >= 96 && so < 8188) {
            validSlot = true;
            break;
          }
        }
        if (validSlot) {
          pageMap.set(`${fileId}:${pageId}`, pos);
          pos += 8192;
          continue;
        }
      }
    }
    pos += 1;
  }

  if (pageMap.size === 0) return null;

  interface RawPageRow {
    fb: Uint8Array;
    nb: Uint8Array;
    vc: Uint8Array[];
    ncols: number;
  }

  const sysschobjs: Record<number, string> = {};
  const sysrowsets: Record<string, { idmajor: number; idminor: number }> = {};
  const sysallocunits: Record<string, string> = {};
  const sysallocunitsByMobj: Record<number, string> = {};
  const syscolpars: Record<
    number,
    { colid: number; name: string; xtype: number; length: number; prec: number; scale: number }[]
  > = {};

  let bootDbName = '';
  const dataPages: { auidKey: string; mObjId: number; mIndexId: number; rows: RawPageRow[] }[] = [];

  for (const poff of pageMap.values()) {
    const pType = bytes[poff + 1];
    if (pType === 13) {
      const slice = bytes.subarray(poff + 96, poff + 1024);
      const txt = utf16Decoder.decode(slice);
      const m = txt.match(/[A-Za-z0-9_.\- ]{3,40}/g);
      if (m) {
        const cand = m.find(
          (s) =>
            !['master', 'model', 'msdb', 'tempdb', 'mssqlsystemresource'].includes(
              s.trim().toLowerCase()
            )
        );
        if (cand) bootDbName = cand.trim().toUpperCase();
      }
      continue;
    }

    const slotCnt = view.getUint16(poff + 22, true);
    const mIndexId = view.getUint16(poff + 6, true);
    const mObjId = view.getUint32(poff + 24, true);
    const auidBig = (BigInt(mIndexId) << 48n) | (BigInt(mObjId) << 16n);
    const auidKey = auidBig.toString();

    const rows: RawPageRow[] = [];
    for (let s = 0; s < slotCnt; s++) {
      const slotOff = view.getUint16(poff + 8192 - 2 * (s + 1), true);
      if (slotOff < 96 || slotOff >= 8188) continue;
      const rpos = poff + slotOff;
      const statusA = bytes[rpos];
      const recType = (statusA & 0x0e) >> 1;
      if (recType !== 0 && recType !== 1) continue;
      const fixedLen = view.getUint16(rpos + 2, true);
      if (fixedLen < 4 || rpos + fixedLen + 2 > poff + 8192) continue;
      const fb = bytes.subarray(rpos + 4, rpos + fixedLen);
      const ncols = view.getUint16(rpos + fixedLen, true);
      if (ncols === 0 || ncols > 1024) continue;
      const nbLen = Math.ceil(ncols / 8);
      const nbPos = rpos + fixedLen + 2;
      if (nbPos + nbLen > poff + 8192) continue;
      const nb = bytes.subarray(nbPos, nbPos + nbLen);

      const vc: Uint8Array[] = [];
      if (statusA & 0x20) {
        const varPos = nbPos + nbLen;
        if (varPos + 2 <= poff + 8192) {
          const numVar = view.getUint16(varPos, true);
          if (numVar > 0 && numVar <= 500 && varPos + 2 + 2 * numVar <= poff + 8192) {
            const vStart = varPos + 2 + 2 * numVar;
            let curS = vStart - rpos;
            for (let k = 0; k < numVar; k++) {
              const eRaw = view.getUint16(varPos + 2 + 2 * k, true);
              const isComplex = (eRaw & 0x8000) !== 0;
              const eOff = eRaw & 0x7fff;
              if (eOff >= curS && rpos + eOff <= poff + 8192) {
                const rawSlice = bytes.subarray(rpos + curS, rpos + eOff);
                if (!isComplex) {
                  vc.push(rawSlice);
                } else if (recType === 1 && rawSlice.byteLength === 10) {
                  // Forwarded record 10-byte back-pointer
                } else {
                  vc.push(new Uint8Array(0));
                }
              } else {
                vc.push(new Uint8Array(0));
              }
              curS = eOff;
            }
          }
        }
      }
      rows.push({ fb, nb, vc, ncols });
    }

    if (rows.length === 0) continue;
    dataPages.push({ auidKey, mObjId, mIndexId, rows });

    // Inspect all DATA_PAGE rows for system catalog tables (do NOT filter on mIndexId)

    for (const { fb, vc, ncols } of rows) {
      const fbView = new DataView(fb.buffer, fb.byteOffset, fb.byteLength);

      // 1. sys.sysallocunits (Object ID 7, ncols 10..13)
      if ((mObjId === 7 || (ncols >= 10 && ncols <= 13 && vc.length === 0)) && fb.byteLength >= 23) {
        const auIdBig = fbView.getBigUint64(0, true);
        const auType = fb[8];
        const containerId = fbView.getBigUint64(9, true).toString();
        if ((auType === 1 || auType === 3) && auIdBig > 0n) {
          sysallocunits[auIdBig.toString()] = containerId;
          sysallocunits[(auIdBig & 0xffffffffffff0000n).toString()] = containerId;
          const mobjPart = Number((auIdBig >> 16n) & 0xffffffffn);
          sysallocunitsByMobj[mobjPart] = containerId;
        }
      }

      // 2. sys.sysrowsets (Object ID 5, ncols 12..20)
      if ((mObjId === 5 || (ncols >= 12 && ncols <= 20 && vc.length <= 3)) && fb.byteLength >= 20) {
        const rsId = fbView.getBigUint64(0, true).toString();
        const idmajor = fbView.getUint32(9, true);
        const idminor = fbView.getUint32(13, true);
        if (idmajor > 0 && idminor <= 256) {
          sysrowsets[rsId] = { idmajor, idminor };
        }
      }

      // 3. sys.sysschobjs (Object ID 34 in SQL 2005+)
      if (
        (mObjId === 34 || ([40, 44, 48].includes(fb.byteLength) && vc.length >= 1)) &&
        fb.byteLength >= 24 &&
        vc.length >= 1
      ) {
        if (fb[13] === 0x55 && fb[14] === 0x20) {
          const objId = fbView.getUint32(0, true);
          const tname = decodeSmartBytes(vc[0]);
          if (tname && objId > 0) {
            sysschobjs[objId] = tname;
          }
        }
      }

      // 4. SQL Server 2000 sysobjects (Object ID 1)
      if (mObjId === 1 && fb.byteLength >= 16 && vc.length >= 1) {
        if (fb[4] === 0x55 && fb[5] === 0x20) {
          const objId = fbView.getUint32(0, true);
          const tname = decodeSmartBytes(vc[0]);
          if (tname && objId > 0) {
            sysschobjs[objId] = tname;
          }
        }
      }

      // 5. sys.syscolpars (Object ID 41 in SQL 2005+)
      if (
        (mObjId === 41 || ([37, 41, 45].includes(fb.byteLength) && vc.length >= 1)) &&
        fb.byteLength >= 19 &&
        vc.length >= 1
      ) {
        const objId = fbView.getUint32(0, true);
        const number = fbView.getUint16(4, true);
        if (number === 0 && objId > 0) {
          // Standard SQL Server 2005-2022: colid is 4-byte int at fb[6..10], xtype at fb[10]
          const colid4 = fbView.getInt32(6, true);
          const xtype4 = fb[10];
          const len4 = fbView.getInt16(15, true);
          const prec4 = fb[17];
          const scale4 = fb[18];

          // Legacy 2-byte colid fallback: colid at fb[6..8], xtype at fb[8]
          const colid2 = fbView.getUint16(6, true);
          const xtype2 = fb[8];
          const len2 = fbView.getInt16(13, true);
          const prec2 = fb[15];
          const scale2 = fb[16];

          const cname = decodeSmartBytes(vc[0]);
          if (cname) {
            if (colid4 >= 1 && colid4 <= 1024 && VALID_XTYPES.has(xtype4)) {
              if (!syscolpars[objId]) syscolpars[objId] = [];
              syscolpars[objId].push({
                colid: colid4,
                name: cname,
                xtype: xtype4,
                length: len4,
                prec: prec4,
                scale: scale4,
              });
            } else if (colid2 >= 1 && colid2 <= 1024 && VALID_XTYPES.has(xtype2)) {
              if (!syscolpars[objId]) syscolpars[objId] = [];
              syscolpars[objId].push({
                colid: colid2,
                name: cname,
                xtype: xtype2,
                length: len2,
                prec: prec2,
                scale: scale2,
              });
            }
          }
        }
      }

      // 6. SQL Server 2000 syscolumns (Object ID 3)
      if (mObjId === 3 && fb.byteLength >= 16 && vc.length >= 1) {
        const objId = fbView.getUint32(0, true);
        const xtype0 = fb[4];
        const len0 = fbView.getInt16(8, true);
        const prec0 = fb[10];
        const scale0 = fb[11];
        const colid0 = fbView.getUint16(12, true);
        const cname = decodeSmartBytes(vc[0]);
        if (cname && objId > 0 && colid0 >= 1 && colid0 <= 1024 && VALID_XTYPES.has(xtype0)) {
          if (!syscolpars[objId]) syscolpars[objId] = [];
          syscolpars[objId].push({
            colid: colid0,
            name: cname,
            xtype: xtype0,
            length: len0,
            prec: prec0,
            scale: scale0,
          });
        }
      }
    }
  }

  const decodeSqlVal = (rawB: Uint8Array, xtype: number, scale: number): any => {
    if (!rawB || rawB.byteLength === 0) return null;
    const dv = new DataView(rawB.buffer, rawB.byteOffset, rawB.byteLength);
    try {
      if (xtype === 104) return Boolean(rawB[0]);
      if (xtype === 48) return rawB[0];
      if (xtype === 52 && rawB.byteLength >= 2) return dv.getInt16(0, true);
      if (xtype === 56 && rawB.byteLength >= 4) return dv.getInt32(0, true);
      if (xtype === 127 && rawB.byteLength >= 8) return Number(dv.getBigInt64(0, true));
      if (xtype === 59 && rawB.byteLength >= 4) return Number(dv.getFloat32(0, true).toFixed(4));
      if (xtype === 62 && rawB.byteLength >= 8) return Number(dv.getFloat64(0, true).toFixed(4));
      if (xtype === 60 && rawB.byteLength >= 8) {
        const lo = BigInt(dv.getUint32(0, true));
        const hi = BigInt(dv.getInt32(4, true));
        return Number((Number((hi << 32n) | lo) / 10000).toFixed(2));
      }
      if (xtype === 122 && rawB.byteLength >= 4) {
        return Number((dv.getInt32(0, true) / 10000).toFixed(2));
      }
      if ((xtype === 106 || xtype === 108) && rawB.byteLength >= 2) {
        const sign = rawB[0] === 1 ? 1 : -1;
        let valBig = 0n;
        for (let i = rawB.byteLength - 1; i >= 1; i--) {
          valBig = (valBig << 8n) | BigInt(rawB[i]);
        }
        return Number(((sign * Number(valBig)) / Math.pow(10, scale)).toFixed(scale));
      }
      if (xtype === 40 && rawB.byteLength >= 3) {
        const days = rawB[0] | (rawB[1] << 8) | (rawB[2] << 16);
        const ms = Date.UTC(1, 0, 1) + (days - 365) * 86400000;
        return new Date(ms).toISOString().slice(0, 10);
      }
      if (xtype === 42 && rawB.byteLength >= 6) {
        const base = rawB.byteLength - 3;
        const days = rawB[base] | (rawB[base + 1] << 8) | (rawB[base + 2] << 16);
        const ms = Date.UTC(1, 0, 1) + (days - 365) * 86400000;
        return new Date(ms).toISOString().slice(0, 10);
      }
      if (xtype === 61 && rawB.byteLength >= 8) {
        const days = dv.getInt32(4, true);
        const ms = Date.UTC(1900, 0, 1) + days * 86400000;
        return new Date(ms).toISOString().slice(0, 10);
      }
      if (xtype === 58 && rawB.byteLength >= 4) {
        const days = dv.getUint16(2, true);
        const ms = Date.UTC(1900, 0, 1) + days * 86400000;
        return new Date(ms).toISOString().slice(0, 10);
      }
      if (xtype === 231 || xtype === 239 || xtype === 99) {
        return utf16Decoder.decode(rawB).replace(/\x00/g, '').trim();
      }
      if (xtype === 167 || xtype === 175 || xtype === 35) {
        return latin1Decoder.decode(rawB).replace(/\x00/g, '').trim();
      }
    } catch {
      return null;
    }
    return null;
  };

  // Precompute (ncols, fixed_len) schema signature map for fallback matching
  const schemaBySig: Record<string, number[]> = {};
  for (const objIdStr of Object.keys(sysschobjs)) {
    const oid = Number(objIdStr);
    const colsMeta = syscolpars[oid];
    if (!colsMeta || colsMeta.length === 0) continue;
    const seen = new Set<number>();
    const ordered = [...colsMeta]
      .sort((a, b) => a.colid - b.colid)
      .filter((c) => {
        if (seen.has(c.colid)) return false;
        seen.add(c.colid);
        return true;
      });
    let expectedFixed = 0;
    let bitCnt = 0;
    for (const c of ordered) {
      if (VAR_XTYPES.has(c.xtype) || c.length < 0 || c.length > 8000) continue;
      if (c.xtype === 104) {
        if (bitCnt % 8 === 0) expectedFixed += 1;
        bitCnt += 1;
      } else {
        expectedFixed += c.length;
      }
    }
    const sigKey = `${ordered.length}:${expectedFixed}`;
    if (!schemaBySig[sigKey]) schemaBySig[sigKey] = [];
    schemaBySig[sigKey].push(oid);
  }

  const tablesDict: Record<string, Record<string, any>[]> = {};
  for (const { auidKey, mObjId, mIndexId, rows } of dataPages) {
    const rsId = sysallocunits[auidKey] || sysallocunitsByMobj[mObjId];
    let objId: number | undefined;
    if (rsId && sysrowsets[rsId]) {
      const { idmajor, idminor } = sysrowsets[rsId];
      if (idminor > 1) continue; // Skip nonclustered index pages
      objId = idmajor;
    } else if (sysschobjs[mObjId]) {
      objId = mObjId;
    }

    if ((!objId || !sysschobjs[objId]) && rows.length > 0) {
      const sample = rows[0];
      const cands = schemaBySig[`${sample.ncols}:${sample.fb.byteLength}`] || [];
      if (cands.length === 1) {
        objId = cands[0];
      }
    }

    if (!objId) continue;
    const tname = sysschobjs[objId];
    const colsMeta = syscolpars[objId];

    if (tname && colsMeta && colsMeta.length > 0) {
      const seenCid = new Set<number>();
      const orderedCols = [...colsMeta]
        .sort((a, b) => a.colid - b.colid)
        .filter((c) => {
          if (seenCid.has(c.colid)) return false;
          seenCid.add(c.colid);
          return true;
        });

      for (const { fb, nb, vc } of rows) {
        const rowObj: Record<string, any> = {};
        let fOff = 0;
        let vIdx = 0;
        let bitCnt = 0;
        let bitByteVal = 0;
        orderedCols.forEach((col, idx) => {
          const isNull =
            Math.floor(idx / 8) < nb.byteLength
              ? (nb[Math.floor(idx / 8)] & (1 << (idx % 8))) !== 0
              : false;
          if (VAR_XTYPES.has(col.xtype) || col.length < 0 || col.length > 8000) {
            const rawV = vIdx < vc.length ? vc[vIdx] : new Uint8Array(0);
            vIdx++;
            rowObj[col.name] = isNull ? null : decodeSqlVal(rawV, col.xtype, col.scale);
          } else if (col.xtype === 104) {
            if (bitCnt % 8 === 0) {
              bitByteVal = fOff < fb.byteLength ? fb[fOff] : 0;
              fOff += 1;
            }
            const bVal = (bitByteVal >> (bitCnt % 8)) & 1;
            bitCnt += 1;
            rowObj[col.name] = isNull ? null : Boolean(bVal);
          } else {
            const rawF =
              fOff + col.length <= fb.byteLength
                ? fb.subarray(fOff, fOff + col.length)
                : new Uint8Array(0);
            fOff += Math.max(col.length, 0);
            rowObj[col.name] = isNull ? null : decodeSqlVal(rawF, col.xtype, col.scale);
          }
        });
        if (!tablesDict[tname]) tablesDict[tname] = [];
        tablesDict[tname].push(rowObj);
      }
    }
  }

  const effectiveName =
    bootDbName && !['textile', 'db', 'billing', 'data'].includes(bootDbName.toLowerCase())
      ? bootDbName
      : fallbackCompanyName;

  if (Object.keys(tablesDict).length > 0) {
    const mapped = mapTablesToDatabase(tablesDict, effectiveName, fallbackCo);
    if (mapped) return mapped;
  }

  // Schema-free page fallback if system catalog tables were compressed or non-standard
  const systemObjIds = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 17, 19, 25, 27, 28, 29, 34, 41, 46, 54, 55, 60]);
  const syntheticTables: Record<string, Record<string, any>[]> = {};
  for (const { mObjId, rows } of dataPages) {
    if (systemObjIds.has(mObjId)) continue;
    const tKey = `table_${mObjId}`;
    for (const { fb, vc } of rows) {
      const strs = vc.map((v) => decodeSmartBytes(v)).filter((s) => s.length >= 1);
      if (strs.length === 0 && fb.byteLength < 8) continue;
      const rowObj: Record<string, any> = {};
      strs.forEach((s, idx) => {
        const su = s.toUpperCase().trim();
        if (su.includes('RUPEES')) {
          rowObj.words = s;
        } else if (/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(su)) {
          rowObj.gstin = su;
        } else if (['MTR', 'MTRS', 'KG', 'KGS', 'NOS', 'NO', 'PCS', 'ROLL', 'LOT', 'BAG'].includes(su)) {
          rowObj.unit = s;
        } else if (!rowObj.name && s.length >= 2 && !/^\d+$/.test(s)) {
          rowObj.name = s;
        } else {
          rowObj[`str_${idx}`] = s;
        }
      });
      const fbDv = new DataView(fb.buffer, fb.byteOffset, fb.byteLength);
      if (fb.byteLength >= 4) {
        const firstInt = fbDv.getInt32(0, true);
        if (firstInt >= 1 && firstInt <= 999999) rowObj.no = firstInt;
      }
      for (let off = 0; off <= fb.byteLength - 8; off += 4) {
        const fv = fbDv.getFloat64(off, true);
        if (Number.isFinite(fv) && fv >= 1 && fv <= 50000000 && Number(fv.toFixed(2)) === Number(fv.toFixed(4))) {
          const rounded = Number(fv.toFixed(2));
          if (!rowObj.taxable || rounded < rowObj.taxable) rowObj.taxable = rounded;
          if (!rowObj.netamount || rounded > rowObj.netamount) rowObj.netamount = rounded;
        }
      }
      if (Object.keys(rowObj).length > 0) {
        if (!syntheticTables[tKey]) syntheticTables[tKey] = [];
        syntheticTables[tKey].push(rowObj);
      }
    }
  }

  if (Object.keys(syntheticTables).length > 0) {
    const mapped = mapTablesToDatabase(syntheticTables, effectiveName, fallbackCo);
    if (mapped) return mapped;
  }

  return null;
}

/**
 * Parses an XML DataSet `.bak` file
 */
function tryParseXmlBackup(
  text: string,
  fallbackCompanyName: string,
  fallbackCo: CompanyInfo
): BillingDatabase | null {
  if (!text.trim().startsWith('<')) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return null;

    const rootObj: Record<string, any[]> = {};
    const rootEl = doc.documentElement;
    Array.from(rootEl.children).forEach((child) => {
      const tag = child.tagName;
      if (!rootObj[tag]) rootObj[tag] = [];
      const row: Record<string, string> = {};
      Array.from(child.children).forEach((field) => {
        row[field.tagName] = field.textContent || '';
      });
      rootObj[tag].push(row);
    });

    return normalizeParsedObject(rootObj, fallbackCompanyName, fallbackCo);
  } catch {
    return null;
  }
}

async function tryDecompressGzip(bytes: Uint8Array): Promise<string | null> {
  try {
    if (typeof DecompressionStream === 'undefined') return null;
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(bytes as unknown as BufferSource);
    writer.close();
    const response = new Response(ds.readable);
    return await response.text();
  } catch {
    return null;
  }
}

async function tryExtractZipText(bytes: Uint8Array): Promise<string | null> {
  try {
    if (
      bytes.length < 30 ||
      bytes[0] !== 0x50 ||
      bytes[1] !== 0x4b ||
      bytes[2] !== 0x03 ||
      bytes[3] !== 0x04
    ) {
      return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const compressionMethod = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const fileNameLength = view.getUint16(26, true);
    const extraFieldLength = view.getUint16(28, true);
    const dataOffset = 30 + fileNameLength + extraFieldLength;

    if (compressionMethod === 0) {
      const slice = bytes.subarray(dataOffset, dataOffset + compressedSize);
      return new TextDecoder('utf-8').decode(slice);
    } else if (compressionMethod === 8 && typeof DecompressionStream !== 'undefined') {
      const slice = bytes.subarray(dataOffset, dataOffset + compressedSize);
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(slice as unknown as BufferSource);
      writer.close();
      const response = new Response(ds.readable);
      return await response.text();
    }
    return null;
  } catch {
    return null;
  }
}

export function parseTextBackup(
  text: string,
  fallbackCompanyName: string,
  fallbackCo: CompanyInfo
): BillingDatabase | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Direct JSON
  try {
    const parsed = JSON.parse(trimmed);
    const norm = normalizeParsedObject(parsed, fallbackCompanyName, fallbackCo);
    if (norm) return norm;
  } catch {
    // continue
  }

  // 2. Base64-encoded JSON
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 64) {
    try {
      const decoded = decodeURIComponent(
        Array.prototype.map
          .call(atob(trimmed.replace(/\s+/g, '')), (c: string) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join('')
      );
      const parsed = JSON.parse(decoded);
      const norm = normalizeParsedObject(parsed, fallbackCompanyName, fallbackCo);
      if (norm) return norm;
    } catch {
      // continue
    }
  }

  // 3. HTML const DB = {...};
  const dbMatch = trimmed.match(/const\s+DB\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (dbMatch && dbMatch[1]) {
    try {
      const parsed = JSON.parse(dbMatch[1]);
      const norm = normalizeParsedObject(parsed, fallbackCompanyName, fallbackCo);
      if (norm) return norm;
    } catch {
      // continue
    }
  }

  // 4. SQL Dump (CREATE TABLE / INSERT INTO)
  const fromSql = tryParseSqlDump(trimmed, fallbackCompanyName, fallbackCo);
  if (fromSql) return fromSql;

  // 5. XML DataSet
  const fromXml = tryParseXmlBackup(trimmed, fallbackCompanyName, fallbackCo);
  if (fromXml) return fromXml;

  // 6. Embedded JSON block
  const invIdx = trimmed.indexOf('"inv":[');
  if (invIdx !== -1) {
    const startBrace = trimmed.lastIndexOf('{', invIdx);
    const endBrace = trimmed.lastIndexOf('}');
    if (startBrace !== -1 && endBrace > startBrace) {
      try {
        const candidate = trimmed.slice(startBrace, endBrace + 1);
        const parsed = JSON.parse(candidate);
        const norm = normalizeParsedObject(parsed, fallbackCompanyName, fallbackCo);
        if (norm) return norm;
      } catch {
        // continue
      }
    }
  }

  return null;
}

/**
 * Universal `.bak` / `.json` / `.html` / `.sql` / `.xml` backup file parser.
 */
export async function parseBackupFile(
  file: File,
  fallbackCo: CompanyInfo
): Promise<BillingDatabase | null> {
  const baseClean = file.name.replace(/\.[^/.]+$/, '');
  const strippedTs = baseClean.replace(/^[\d\-_]+(?:AM|PM)?[_\-\s]*/i, '').trim();
  let fallbackCompanyName = (strippedTs || baseClean).replace(/[_-]+/g, ' ').trim().toUpperCase();
  if (['TEXTILE', 'BACKUP', 'DB'].includes(fallbackCompanyName)) {
    fallbackCompanyName = `${fallbackCompanyName} (${baseClean})`;
  }

  // 1. First try server-side Python universal `.bak` parser if backend route is available
  try {
    const formBuffer = await file.arrayBuffer();
    const resp = await fetch(
      `/api/parse-bak?filename=${encodeURIComponent(file.name)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: formBuffer,
      }
    );
    if (resp.ok) {
      const json = await resp.json();
      if (json && json.ok && json.db) {
        return json.db as BillingDatabase;
      }
    }
  } catch {
    // Fallback to in-browser parser
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 2. Check GZIP magic bytes (0x1f 0x8b)
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const gunzipped = await tryDecompressGzip(bytes);
    if (gunzipped) {
      const res = parseTextBackup(gunzipped, fallbackCompanyName, fallbackCo);
      if (res) return res;
    }
  }

  // 3. Check ZIP magic bytes (0x50 0x4b 0x03 0x04)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    const unzipped = await tryExtractZipText(bytes);
    if (unzipped) {
      const res = parseTextBackup(unzipped, fallbackCompanyName, fallbackCo);
      if (res) return res;
    }
  }

  // 4. Check MS SQL Server `.bak` (MTF `TAPE` format)
  if (
    bytes.length >= 8192 &&
    bytes[0] === 0x54 &&
    bytes[1] === 0x41 &&
    bytes[2] === 0x50 &&
    bytes[3] === 0x45
  ) {
    const fromMsSql = tryParseMsSqlBakBytes(bytes, fallbackCompanyName, fallbackCo);
    if (fromMsSql) return fromMsSql;
  }

  // 5. Try UTF-8 text decode
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const fromUtf8 = parseTextBackup(utf8Text, fallbackCompanyName, fallbackCo);
  if (fromUtf8) return fromUtf8;

  // 6. Try UTF-16LE text decode
  const utf16Text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
  const fromUtf16 = parseTextBackup(utf16Text, fallbackCompanyName, fallbackCo);
  if (fromUtf16) return fromUtf16;

  // 7. Try MS SQL Server 8KB page scan even without TAPE header
  const fromRawPages = tryParseMsSqlBakBytes(bytes, fallbackCompanyName, fallbackCo);
  if (fromRawPages) return fromRawPages;

  // 8. Deep binary string & record extractor fallback for compressed .bak files
  const utf16Matches = utf16Text.match(/[A-Za-z0-9][A-Za-z0-9 .,/\-&()]{3,80}/g) || [];
  const utf8Matches = utf8Text.match(/[A-Za-z0-9][A-Za-z0-9 .,/\-&()]{3,80}/g) || [];
  const allCandidates = [...utf16Matches, ...utf8Matches];
  const parties: string[] = [];
  const gstins: string[] = [];
  for (const rawS of allCandidates) {
    const su = rawS.trim().toUpperCase();
    if (/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(su)) {
      if (!gstins.includes(su)) gstins.push(su);
    } else if (
      ['TEXTILE', 'TEX', 'MILLS', 'GARMENTS', 'FABRICS', 'TRADERS', 'ENTERPRISES', 'SILKS', 'COTTON', 'TAPES', 'ROPES'].some(
        (kw) => su.includes(kw)
      ) &&
      su.length >= 4 &&
      su.length <= 55 &&
      !parties.includes(su)
    ) {
      parties.push(su);
    }
  }

  const coName = parties[0] || fallbackCompanyName || 'UPLOADED COMPANY';
  const partyName = parties[1] || parties[0] || 'GENERAL PARTY';
  return {
    co: {
      n: coName,
      a: fallbackCo.a || '',
      ph: fallbackCo.ph || '',
      em: fallbackCo.em || '',
      g: gstins[0] || '',
      pan: '',
    },
    inv: [
      {
        fy: '2027',
        no: 1,
        dt: '2026-10-15',
        c: partyName,
        gst: gstins[0] || '',
        st: 'Tamil Nadu',
        veh: '',
        tx: 0,
        cg: 0,
        sg: 0,
        ig: 0,
        gp: 5,
        ro: 0,
        net: 0,
        pre: 0,
        bal: 0,
        disc: 0,
        nar: `Imported from ${file.name}`,
        w: '',
        a: ['', '', ''],
        dc: '',
        L: [['Textile Goods', '5806', 1, 'Lot', 0, 0]],
      },
    ],
    cust: [{ n: partyName, a: '', s: 'Tamil Nadu', g: gstins[0] || '', m: '' }],
    prod: [{ n: 'Textile Goods', h: '5806' }],
    rec: [],
    pay: [],
  };
}

/**
 * Downloads the current database as a `.bak` backup file
 */
export function downloadBakFile(db: BillingDatabase): void {
  const payload = {
    format: 'MP_TEXTILES_BAK_V1',
    exportedAt: new Date().toISOString(),
    ...db,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (db.co.n || 'MP_Textiles').replace(/[^a-zA-Z0-9]+/g, '_');
  a.download = `${safeName}_Backup_${new Date().toISOString().slice(0, 10)}.bak`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
