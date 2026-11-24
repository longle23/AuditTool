import type { BankCode } from './types';

/** Normalize sheet/bank labels for matching. */
export function normKey(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function detectBankFromSheetName(name: string): BankCode | null {
  const n = normKey(name);
  // Never treat BO / VietQR sheets as sao kê
  if (n.startsWith('bo') || n.includes('vietqr')) return null;
  if (!n.includes('sao ke') && !n.includes('saoke') && !n.includes('statement')) {
    if (
      !(
        n.includes('tpb') ||
        n.includes('bidv') ||
        n.includes('ocb') ||
        n.includes('msb') ||
        n.includes('mbb') ||
        n.includes('mb ') ||
        n.endsWith(' mb') ||
        n.includes('klb') ||
        n.includes('agri')
      )
    ) {
      return null;
    }
  }
  if (n.includes('agri')) return 'AGRIBANK';
  if (n.includes('bidv')) return 'BIDV';
  if (n.includes('ocb')) return 'OCB';
  if (n.includes('msb') || n.includes('msbank')) return 'MSB';
  if (n.includes('mbb') || n.includes('mbbank') || /\bmb\b/.test(n) || n.includes('sao ke mb')) return 'MBB';
  if (n.includes('klb') || n.includes('kien long')) return 'KLB';
  if (n.includes('tpb') || n.includes('tpbank')) return 'TPB';
  return null;
}

export function detectBoSheet(name: string): 'bo' | 'vietqr' | 'bo_prev' | null {
  const n = normKey(name);
  if (n.includes('vietqr') || n.includes('viet qr')) return 'vietqr';
  if (!n.startsWith('bo')) return null;
  // BO KLB ngày trước / BO ngày trước — không phải BO kỳ chính
  if (n.includes('klb') || n.includes('ngay truoc') || n.includes('hom truoc')) return 'bo_prev';
  return 'bo';
}

export function normalizeBankCode(raw: string): BankCode | null {
  const n = normKey(raw).replace(/[^a-z0-9]/g, '');
  if (!n || n === '-') return null;
  if (n === 'tpb' || n === 'tpbank') return 'TPB';
  if (n === 'bidv') return 'BIDV';
  if (n === 'ocb') return 'OCB';
  if (n === 'msb' || n === 'msbank') return 'MSB';
  if (n === 'mbb' || n === 'mbbank' || n === 'mb') return 'MBB';
  if (n === 'klb' || n.includes('kienlong')) return 'KLB';
  if (n.includes('agri')) return 'AGRIBANK';
  return null;
}

/** Parse money from number or formatted string like `-51,000,000` / `'-9,050,000` / `(1.234)`. */
export function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/^'+|'+$/g, '').trim();
  if (!s || s === '-') return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\s₫VND]/gi, '').replace(/,/g, '');
  // VN thousands with dots: 1.234.567
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg && n > 0 ? -n : n;
}

export function absoluteDebit(amount: number | null): number | null {
  if (amount === null) return null;
  return Math.abs(amount);
}

/** TPB: "TPB" + 21 digits in diễn giải. */
export function extractTpbMaGd(desc: string): string {
  const m = /TPB(\d{21})/i.exec(desc);
  return m ? m[1] : '';
}

/** BIDV: 10 digits between underscores, typically 28xxxxxxxx. */
export function extractBidvMaGd(desc: string): string {
  const m = /_(\d{10})_/.exec(desc);
  if (m) return m[1];
  const m2 = /\b(28\d{8})\b/.exec(desc);
  return m2 ? m2[1] : '';
}

/** OCB: characters before `\`. */
export function extractOcbMaGd(soGd: string): string {
  const s = String(soGd ?? '').trim();
  if (!s) return '';
  const i = s.indexOf('\\');
  return (i >= 0 ? s.slice(0, i) : s).trim();
}

/** MSB: characters AFTER `/` (Quy tắc mẫu). */
export function extractMsbMaGd(ref: string): string {
  const s = String(ref ?? '').trim();
  if (!s) return '';
  const i = s.lastIndexOf('/');
  return (i >= 0 ? s.slice(i + 1) : s).trim();
}

/** MBB / KLB: use raw reference. */
export function extractRawMaGd(value: string): string {
  const s = String(value ?? '').trim();
  return !s || s === '-' ? '' : s;
}

/**
 * Agribank nội dung thật:
 * `MA_GD:…|VPAYME|{maGd cắt}#STK|Tên|823092 Tên GA…`
 * Khóa đối chiếu = 6 số (Mã GD 2 trên BO) — lấy cụm `|dddddd ` cuối.
 */
export function extractAgriMaGd(noiDung: string): string {
  const s = String(noiDung ?? '');
  const hits = [...s.matchAll(/\|(\d{6})(?=\s)/g)];
  if (hits.length) return hits[hits.length - 1][1];
  const i = s.lastIndexOf('|');
  if (i >= 0) {
    const tail = s.slice(i + 1).replace(/\D/g, '');
    if (tail.length >= 6) return tail.slice(0, 6);
  }
  const magd = /MA_GD:(\d+)/i.exec(s);
  if (magd) return magd[1].slice(-6);
  return '';
}

export function agriMaGd2FromBo(maGd: string): string {
  const digits = String(maGd ?? '').replace(/\D/g, '');
  return digits.slice(-6);
}

export function extractMaGdForBank(bank: BankCode, fields: { desc?: string; ref?: string }): string {
  switch (bank) {
    case 'TPB':
      return extractTpbMaGd(fields.desc ?? '');
    case 'BIDV':
      return extractBidvMaGd(fields.desc ?? '');
    case 'OCB':
      return extractOcbMaGd(fields.ref ?? '');
    case 'MSB':
      return extractMsbMaGd(fields.ref ?? '');
    case 'MBB':
      return extractRawMaGd(fields.ref ?? '');
    case 'KLB':
      return extractRawMaGd(fields.ref ?? '');
    case 'AGRIBANK':
      return extractAgriMaGd(fields.desc ?? '');
  }
}

export function boMatchKey(bank: BankCode, row: { maGd: string; maGdNganHang: string; maGd2: string }): string {
  if (bank === 'TPB') return row.maGd.trim();
  if (bank === 'AGRIBANK') return row.maGd2.trim() || agriMaGd2FromBo(row.maGd);
  const nh = row.maGdNganHang.trim();
  return nh && nh !== '-' ? nh : '';
}

export function isPayoutMethod(phuongThuc: string): boolean {
  const n = normKey(phuongThuc);
  return n === 'bank' || n.includes('ngan hang');
}

export function isSucceeded(trangThai: string): boolean {
  return normKey(trangThai) === 'succeeded';
}

export function looksLikeRefund(desc: string): boolean {
  const n = normKey(desc);
  return n.includes('hoan tien') || n.includes('refund');
}

export function looksLikePayinDebitReversal(debit: number | null, credit: number | null): boolean {
  // Negative debit line that is actually a reversal / credit-like
  if (debit !== null && debit < 0) return true;
  if ((debit === null || debit === 0) && credit !== null && credit > 0) return true;
  return false;
}

export const RULES_TABLE: { bank: string; maSk: string; cotBo: string; cotTien: string; note: string }[] = [
  {
    bank: 'TPB',
    maSk: 'Cột Diễn giải: chuỗi TPB + 21 số',
    cotBo: 'Mã giao dịch',
    cotTien: 'Ghi Nợ (Debit)',
    note: 'Dòng có mã 24 số (chuyển nội bộ) không khớp mẫu nên không tách mã',
  },
  {
    bank: 'BIDV',
    maSk: 'Cột Diễn giải: dãy 10 số nằm giữa hai dấu "_"',
    cotBo: 'Mã GD ngân hàng',
    cotTien: 'Phát sinh nợ (Debit amount)',
    note: '',
  },
  {
    bank: 'OCB',
    maSk: 'Cột Số GD: ký tự trước dấu "\\"',
    cotBo: 'Mã GD ngân hàng',
    cotTien: 'PS giảm (Nợ)/ Debit',
    note: '',
  },
  {
    bank: 'MSB',
    maSk: 'Cột Số bút toán: ký tự SAU dấu "/"',
    cotBo: 'Mã GD ngân hàng',
    cotTien: 'Nợ/Debit',
    note: 'Lấy phần sau dấu "/" vì phần trước chỉ là tiền tố',
  },
  {
    bank: 'MBB',
    maSk: 'Cột BÚT TOÁN (nguyên giá trị)',
    cotBo: 'Mã GD ngân hàng',
    cotTien: 'PHÁT SINH NỢ',
    note: '',
  },
  {
    bank: 'KLB',
    maSk: 'Cột Mã giao dịch; fallback BO VietQRPay (Mã Ngân Hàng)',
    cotBo: 'Mã GD ngân hàng',
    cotTien: 'Số tiền giảm (-)',
    note: '',
  },
  {
    bank: 'AGRIBANK',
    maSk: 'Cột Nội dung: 6 ký tự sau dấu "|" cuối',
    cotBo: 'Mã GD 2 (6 số cuối Mã giao dịch)',
    cotTien: 'Số tiền giao dịch (đảo dấu)',
    note: '',
  },
];
