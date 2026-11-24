import { noteGroup, type PivotGroup } from './reconcile';
import type {
  BalanceCheck,
  BoRow,
  ParsedSk,
  PivotBankStats,
  SkRow,
  VietQrRow,
} from './types';

/** Cột nhóm trên sheet Tong hop (mẫu DOI_SOAT) — mỗi nhóm = Số GD + Số tiền. */
const GROUP_ORDER: { key: PivotGroup; label: string }[] = [
  { key: 'khop', label: 'Giao dịch khớp' },
  { key: 'review', label: 'Giao dịch Review\n(Sao kê đã báo nợ, BO đang review)' },
  { key: 'khop_khac_ngay', label: 'Giao dịch khớp \n(Báo nợ  trong tháng, khác ngày báo cáo)' },
  { key: 'khop_refund', label: 'Giao dịch khớp (Refund) (Báo nợ khác ngày báo cáo)' },
  { key: 'bo_review_thieu_sk', label: 'Giao dịch chưa khớp \n(BO có-REVIEW, Sao kê chưa cắt tiền)' },
  { key: 'sk_thieu_bo', label: 'Giao dịch chưa khớp \n(Sao kê có, BO chưa có)' },
  { key: 'bo_thieu_sk', label: 'Đơn hàng chưa có trên sao kê\n(BO có, sao kê không có GD báo nợ)' },
  { key: 'khac_ngay', label: 'Sao kê báo nợ khác ngày BO' },
  { key: 'lech_tien', label: 'Giao dịch khớp mã nhưng LỆCH số tiền' },
  { key: 'failed', label: 'BO FAILED\n(Sao kê không ghi nợ – đúng)' },
];

export { GROUP_ORDER };

function emptyGroups(): Record<string, { count: number; amount: number }> {
  const g: Record<string, { count: number; amount: number }> = {};
  for (const { key } of GROUP_ORDER) g[key] = { count: 0, amount: 0 };
  g.other = { count: 0, amount: 0 };
  return g;
}

function add(g: Record<string, { count: number; amount: number }>, note: string, amount: number | null) {
  const key = noteGroup(note);
  const bucket = g[key] ?? g.other;
  bucket.count += 1;
  bucket.amount += amount ?? 0;
}

const BANK_PIVOT_LABEL: Record<string, string> = {
  OCB: 'OCB',
  MSB: 'MSBank',
  MBB: 'MBBank',
  TPB: 'TPB',
  BIDV: 'BIDV',
  KLB: 'KLB',
  AGRIBANK: 'AGRIBank',
};

const BANK_BALANCE_LABEL: Record<string, string> = {
  OCB: 'OCB',
  MSB: 'MSB (Payout + VietQR)',
  MBB: 'MBB',
  TPB: 'TPB (Payout + VietQR)',
  BIDV: 'BIDV (Payout + VietQR)',
  KLB: 'KLB (Payout + VietQR)',
  AGRIBANK: 'AGRIBank',
};

export function buildPivot(
  boRows: BoRow[],
  statements: ParsedSk[],
  vietQr: { rows: VietQrRow[] } | null,
): { pivot: PivotBankStats[]; balance: BalanceCheck[] } {
  const pivot: PivotBankStats[] = [];
  const balance: BalanceCheck[] = [];

  for (const sk of statements) {
    const bank = sk.bank;
    const groups = emptyGroups();
    const boBank = boRows.filter((r) => r.bank === bank && r.note);
    for (const r of boBank) {
      if (!r.note) continue;
      add(groups, r.note, r.soTienChi);
    }

    for (const r of sk.rows) {
      if (!r.isDebit || !r.note) continue;
      const g = noteGroup(r.note);
      if (g === 'khop' || g === 'khop_khac_ngay' || g === 'khop_refund' || g === 'lech_tien' || g === 'review' || g === 'bo_review_thieu_sk' || g === 'bo_thieu_sk')
        continue;
      add(groups, r.note, r.debit);
    }

    pivot.push({
      bank: BANK_PIVOT_LABEL[bank] ?? bank,
      hinhThuc: 'Payout/rút',
      groups,
    });

    if (bank === 'KLB' && vietQr) {
      const vGroups = emptyGroups();
      for (const v of vietQr.rows) {
        if (!v.note) continue;
        if (v.note.includes('VietQR') || /ho[aà]n ti[eề]n/i.test(v.note)) {
          add(vGroups, v.note, v.giaTri);
        }
      }
      pivot.push({
        bank: BANK_PIVOT_LABEL.KLB,
        hinhThuc: 'Hoan tien VietQR',
        groups: vGroups,
      });
    }

    const skDebits = sk.rows.filter((r) => r.isDebit);
    const skDebitCount = skDebits.length;
    const skDebitAmount = skDebits.reduce((s, r) => s + (r.debit ?? 0), 0);

    let skGroupCount = 0;
    let skGroupAmount = 0;
    for (const r of skDebits) {
      if (!r.note) continue;
      skGroupCount += 1;
      skGroupAmount += r.debit ?? 0;
    }

    const boRelevant = boRows.filter((r) => r.bank === bank && (r.computeDiff || r.note));
    const pending = boRows.filter(
      (r) => r.bank === bank && /pending/i.test(r.trangThai) && !r.note,
    ).length;

    balance.push({
      bank: BANK_BALANCE_LABEL[bank] ?? bank,
      skDebitCount,
      skGroupCount,
      skDebitAmount,
      skGroupAmount,
      boCount: boRelevant.length,
      boGroupCount: boRelevant.filter((r) => r.note).length,
      boPending: pending,
    });
  }

  // Placeholder VietQR rows for banks that appear in sample even when empty
  for (const bank of ['MSBank', 'BIDV', 'TPB'] as const) {
    if (!pivot.some((p) => p.bank === bank && p.hinhThuc === 'Hoan tien VietQR')) {
      pivot.push({ bank, hinhThuc: 'Hoan tien VietQR', groups: emptyGroups() });
    }
  }

  const order = ['OCB', 'MSBank', 'MBBank', 'TPB', 'BIDV', 'AGRIBank', 'KLB'];
  pivot.sort((a, b) => {
    // All Payout/rút first (sample), then Hoan tien VietQR
    const ap = a.hinhThuc === 'Payout/rút' ? 0 : 1;
    const bp = b.hinhThuc === 'Payout/rút' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const ai = order.indexOf(a.bank);
    const bi = order.indexOf(b.bank);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  return { pivot, balance };
}

export interface BankPivotRow {
  bank: string;
  boCount: number;
  boAmount: number;
  khopCount: number;
  khopAmount: number;
  khacNgayCount: number;
  khacNgayAmount: number;
  reviewCount: number;
  reviewAmount: number;
  boThieuCount: number;
  boThieuAmount: number;
  lechCount: number;
  failedCount: number;
}

export interface LoaiStatusRow {
  loai: string;
  trangThai: string;
  count: number;
  amount: number;
  khopCount: number;
  khopAmount: number;
}

export interface VietQrNccRow {
  ncc: string;
  count: number;
  amount: number;
  khopCount: number;
  khopAmount: number;
  failCount: number;
}

export function buildBankPivot(boRows: BoRow[]): BankPivotRow[] {
  const map = new Map<string, BankPivotRow>();
  const ensure = (bank: string) => {
    let row = map.get(bank);
    if (!row) {
      row = {
        bank,
        boCount: 0,
        boAmount: 0,
        khopCount: 0,
        khopAmount: 0,
        khacNgayCount: 0,
        khacNgayAmount: 0,
        reviewCount: 0,
        reviewAmount: 0,
        boThieuCount: 0,
        boThieuAmount: 0,
        lechCount: 0,
        failedCount: 0,
      };
      map.set(bank, row);
    }
    return row;
  };

  for (const r of boRows) {
    const bank = r.bank ?? '(Không có NH chuyển)';
    const row = ensure(bank);
    row.boCount += 1;
    row.boAmount += r.soTienChi ?? 0;
    const g = noteGroup(r.note);
    const amt = r.soTienChi ?? 0;
    if (g === 'khop' || g === 'khop_refund') {
      row.khopCount += 1;
      row.khopAmount += amt;
    } else if (g === 'khop_khac_ngay') {
      row.khacNgayCount += 1;
      row.khacNgayAmount += amt;
    } else if (g === 'review') {
      row.reviewCount += 1;
      row.reviewAmount += amt;
    } else if (g === 'bo_thieu_sk' || g === 'bo_review_thieu_sk') {
      row.boThieuCount += 1;
      row.boThieuAmount += amt;
    } else if (g === 'lech_tien') {
      row.lechCount += 1;
    } else if (g === 'failed') {
      row.failedCount += 1;
    }
  }

  return [...map.values()].sort((a, b) => a.bank.localeCompare(b.bank));
}

function classifyLoai(pt: string): 'CHI HỘ' | 'RÚT TIỀN' {
  const n = pt.toLowerCase();
  if (n.includes('ngân hàng') || n.includes('ngan hang') || n === 'wallet') return 'RÚT TIỀN';
  return 'CHI HỘ';
}

export function buildLoaiStatus(boRows: BoRow[]): LoaiStatusRow[] {
  const statuses = ['SUCCEEDED', 'REVIEW', 'PENDING', 'FAILED'];
  const loais: Array<'CHI HỘ' | 'RÚT TIỀN'> = ['CHI HỘ', 'RÚT TIỀN'];
  const out: LoaiStatusRow[] = [];
  for (const loai of loais) {
    for (const trangThai of statuses) {
      const rows = boRows.filter(
        (r) => classifyLoai(r.phuongThuc) === loai && r.trangThai.toUpperCase() === trangThai,
      );
      let khopCount = 0;
      let khopAmount = 0;
      for (const r of rows) {
        const g = noteGroup(r.note);
        if (g === 'khop' || g === 'khop_khac_ngay' || g === 'khop_refund') {
          khopCount += 1;
          khopAmount += r.soTienChi ?? 0;
        }
      }
      out.push({
        loai,
        trangThai,
        count: rows.length,
        amount: rows.reduce((s, r) => s + (r.soTienChi ?? 0), 0),
        khopCount,
        khopAmount,
      });
    }
  }
  return out;
}

export function buildVietQrNcc(vietQr: { rows: VietQrRow[] } | null): VietQrNccRow[] {
  const nccs = ['KLB', 'TPB', 'MSB', 'BIDV'];
  return nccs.map((ncc) => {
    const rows = (vietQr?.rows ?? []).filter((r) => r.ncc.toUpperCase().includes(ncc));
    let khopCount = 0;
    let khopAmount = 0;
    let failCount = 0;
    for (const r of rows) {
      const g = noteGroup(r.note);
      if (g === 'khop' || g === 'khop_khac_ngay' || g === 'khop_refund') {
        khopCount += 1;
        khopAmount += r.giaTri ?? 0;
      }
      if (/thất bại|that bai|failed/i.test(r.trangThai) || g === 'failed') failCount += 1;
    }
    return {
      ncc,
      count: rows.length,
      amount: rows.reduce((s, r) => s + (r.giaTri ?? 0), 0),
      khopCount,
      khopAmount,
      failCount,
    };
  });
}

export function skRowAmount(row: SkRow): number {
  return row.debit ?? 0;
}
