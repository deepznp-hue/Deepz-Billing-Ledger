export const fmt = (n: number | null | undefined): string =>
  (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const fm2 = (n: number | null | undefined): string =>
  (n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const cr = (n: number): string => {
  const abs = Math.abs(n || 0);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} L`;
  return `${sign}₹${fmt(abs)}`;
};

export const fyl = (y: string | number): string => {
  const num = Number(y);
  if (!num || Number.isNaN(num)) return String(y);
  return `FY ${num - 1}–${String(num).slice(2)}`;
};

export const dfmt = (d: string): string => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

export function getFinancialYearFromDate(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  if (!y || !m) return '2027';
  return m >= 4 ? String(y + 1) : String(y);
}

const ONES = [
  '',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
];

const TENS = [
  '',
  '',
  'TWENTY',
  'THIRTY',
  'FORTY',
  'FIFTY',
  'SIXTY',
  'SEVENTY',
  'EIGHTY',
  'NINETY',
];

function twoDigitsToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o > 0 ? ' ' + ONES[o] : ''}`;
}

export function numberToIndianWords(amount: number): string {
  const num = Math.round(Math.abs(amount || 0));
  if (num === 0) return 'RUPEES ZERO ONLY';

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = Math.floor((num % 1000) / 100);
  const rest = num % 100;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${twoDigitsToWords(crore)} CRORE`);
  if (lakh > 0) parts.push(`${twoDigitsToWords(lakh)} LAKH`);
  if (thousand > 0) parts.push(`${twoDigitsToWords(thousand)} THOUSAND`);
  if (hundred > 0) parts.push(`${ONES[hundred]} HUNDRED`);
  if (rest > 0) parts.push(twoDigitsToWords(rest));

  return `RUPEES ${parts.join(' ')} ONLY`;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCsv = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
