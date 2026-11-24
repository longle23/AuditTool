export type BankCode = 'TPB' | 'BIDV' | 'OCB' | 'MSB' | 'MBB' | 'KLB' | 'AGRIBANK';

export const BANK_CODES: BankCode[] = ['TPB', 'BIDV', 'OCB', 'MSB', 'MBB', 'KLB', 'AGRIBANK'];

export interface PeriodDay {
  /** YYYY-MM-DD in local report calendar (from BO timestamps). */
  ymd: string;
  /** dd/mm/yyyy display. */
  label: string;
}

export interface BoRow {
  sheetRow: number;
  cells: (string | number | null)[];
  maGd: string;
  maGdNganHang: string;
  maGd2: string;
  soTienChi: number | null;
  phuongThuc: string;
  trangThai: string;
  nganHangChuyen: string;
  thoiGian: string;
  /** YYYY-MM-DD from thoiGian when parseable. */
  ngayYmd: string | null;
  /** Filled by reconcile. */
  skDebit: number | null;
  chenhLech: number | null;
  note: string;
  /** Whether chenhLech should be computed. */
  computeDiff: boolean;
  bank: BankCode | null;
  matchKey: string;
}

export interface SkRow {
  bank: BankCode;
  sheetRow: number;
  cells: (string | number | null)[];
  rawDesc: string;
  maGdTach: string;
  debit: number | null;
  credit: number | null;
  thoiGian: string;
  ngayYmd: string | null;
  /** True when this row is a debit (ghi nợ) eligible for matching. */
  isDebit: boolean;
  boSoTienChi: number | null;
  chenhLech: number | null;
  note: string;
  matchKey: string;
  /** Matched against VietQR instead of main BO. */
  vietQrMatch?: boolean;
}

export interface VietQrRow {
  sheetRow: number;
  cells: (string | number | null)[];
  maDichVu: string;
  maNganHang: string;
  giaTri: number | null;
  trangThai: string;
  thoiGian: string;
  ngayYmd: string | null;
  ncc: string;
  skDebit: number | null;
  chenhLech: number | null;
  note: string;
}

export interface ParsedSheet {
  name: string;
  headers: string[];
  /** 0-based header row index in original stream (for reference). */
  headerRowIndex: number;
}

export interface ParsedBo extends ParsedSheet {
  rows: BoRow[];
  /** Column index of "Số tiền chi" — insert recon cols after this. */
  soTienChiCol: number;
}

export interface ParsedSk extends ParsedSheet {
  bank: BankCode;
  rows: SkRow[];
}

export interface ParsedVietQr extends ParsedSheet {
  rows: VietQrRow[];
}

export interface AnomalyRow {
  bank: string;
  nhom: string;
  nguon: 'BO' | 'Sao kê' | 'VietQR' | string;
  maGd: string;
  soTien: number | null;
  thoiGian: string;
  ghiChu: string;
  uuTien?: 'Cao' | 'Trung bình' | 'Thấp';
}

export interface PivotBankStats {
  bank: string;
  hinhThuc: string;
  groups: Record<string, { count: number; amount: number }>;
}

export interface BalanceCheck {
  bank: string;
  skDebitCount: number;
  skGroupCount: number;
  skDebitAmount: number;
  skGroupAmount: number;
  boCount: number;
  boGroupCount: number;
  boPending?: number;
}

export interface ReconcileSummary {
  periodLabel: string;
  periodDays: PeriodDay[];
  banks: { bank: BankCode; sheetName: string; boRows: number; skDebitRows: number; matched: number; mismatches: number }[];
  matched: number;
  boMissingOnSk: number;
  skMissingOnBo: number;
  amountMismatch: number;
}

export interface CheckingProgress {
  phase: 'detect' | 'parse' | 'reconcile' | 'export';
  message: string;
  fraction: number;
}

export interface CheckingResult {
  summary: ReconcileSummary;
  anomalies: AnomalyRow[];
  pivot: PivotBankStats[];
  balance: BalanceCheck[];
}
