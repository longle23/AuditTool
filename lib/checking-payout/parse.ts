import type { ByteSource } from '../xlsx/byte-source';
import {
  listSheets,
  openSheet,
  readSharedStrings,
  streamRows,
  type RawCell,
  type SheetInfo,
  type WorkbookHandle,
} from '../xlsx/sheet-reader';
import { richTextToPlain, unescapeXml } from '../xlsx/xml';
import {
  absoluteDebit,
  agriMaGd2FromBo,
  detectBankFromSheetName,
  detectBoSheet,
  extractMaGdForBank,
  normalizeBankCode,
  normKey,
  parseAmount,
} from './banks';
import { adjustMsbDate, buildPeriod, parseToYmd, periodLabel } from './dates';
import type {
  BankCode,
  BoRow,
  CheckingProgress,
  ParsedBo,
  ParsedSk,
  ParsedVietQr,
  SkRow,
  VietQrRow,
} from './types';

function cellText(cell: RawCell, sst: string[]): string {
  switch (cell.type) {
    case 's': {
      const item = sst[Number(cell.value)];
      return item === undefined ? '' : richTextToPlain(item);
    }
    case 'inlineStr':
      return richTextToPlain(cell.inline ?? '');
    default:
      return unescapeXml(cell.value ?? '');
  }
}

function cellValue(cell: RawCell, sst: string[]): string | number | null {
  if (cell.type === 's' || cell.type === 'inlineStr' || cell.type === 'str') {
    const t = cellText(cell, sst).trim();
    return t === '' ? null : t;
  }
  if (cell.type === '' || cell.type === 'n') {
    const n = Number(cell.value);
    return Number.isFinite(n) ? n : null;
  }
  const t = cellText(cell, sst).trim();
  return t === '' ? null : t;
}

function rowValues(cells: RawCell[], sst: string[], width: number): (string | number | null)[] {
  const out: (string | number | null)[] = Array.from({ length: width }, () => null);
  for (const c of cells) {
    if (c.col < width) out[c.col] = cellValue(c, sst);
  }
  return out;
}

function headerTexts(cells: RawCell[], sst: string[]): string[] {
  const headers: string[] = [];
  for (const cell of cells) headers[cell.col] = cellText(cell, sst).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < headers.length; i++) headers[i] ??= '';
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  return headers;
}

function findCol(headers: string[], predicates: ((h: string) => boolean)[]): number {
  const keys = headers.map(normKey);
  for (const pred of predicates) {
    const i = keys.findIndex(pred);
    if (i >= 0) return i;
  }
  return -1;
}

function looksLikeHeader(headers: string[]): boolean {
  const joined = headers.map(normKey).join('|');
  return (
    joined.includes('ma giao dich') ||
    joined.includes('so tien') ||
    joined.includes('dien giai') ||
    joined.includes('but toan') ||
    joined.includes('phat sinh') ||
    joined.includes('ghi no') ||
    joined.includes('debit') ||
    joined.includes('stt') ||
    joined.includes('transaction')
  );
}

async function loadSheetRows(wb: WorkbookHandle, sst: string[]): Promise<{ headers: string[]; headerRowIndex: number; rows: (string | number | null)[][] }> {
  const raw: RawCell[][] = [];
  await streamRows(wb, (cells) => {
    raw.push(cells);
  });
  if (raw.length === 0) throw new Error(`Sheet "${wb.sheetName}" không có dữ liệu.`);

  let headerRowIndex = -1;
  let headers: string[] = [];
  const scan = Math.min(raw.length, 40);
  for (let i = 0; i < scan; i++) {
    const h = headerTexts(raw[i], sst);
    if (h.filter(Boolean).length >= 3 && looksLikeHeader(h)) {
      headerRowIndex = i;
      headers = h;
      break;
    }
  }
  if (headerRowIndex < 0) {
    // fallback: densest row in first 20
    let best = 0;
    let bestCount = 0;
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const h = headerTexts(raw[i], sst);
      const c = h.filter(Boolean).length;
      if (c > bestCount) {
        best = i;
        bestCount = c;
        headers = h;
      }
    }
    headerRowIndex = best;
  }

  // Drop reconciliation columns if re-processing a result file (keep other cols in place)
  const keepIdx: number[] = [];
  const keptHeaders: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const n = normKey(headers[i]);
    const isRecon =
      n.includes('ma gd tach') ||
      n.includes('so tien ghi no tren sao ke') ||
      n.includes('so tien chi (bo)') ||
      n.includes('ghi no (so)') ||
      n === 'ghi chu doi chieu' ||
      n.includes('chenh lech') ||
      n.includes('so tien ghi no tren sao ke klb');
    if (isRecon) continue;
    keepIdx.push(i);
    keptHeaders.push(headers[i]);
  }
  headers = keptHeaders;

  const fullWidth = Math.max(0, ...raw.map((r) => r.reduce((m, c) => Math.max(m, c.col + 1), 0)));
  const rows: (string | number | null)[][] = [];
  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const full = rowValues(raw[i], sst, fullWidth);
    const vals = keepIdx.map((idx) => full[idx] ?? null);
    if (vals.every((v) => v === null || v === '')) continue;
    rows.push(vals);
  }
  return { headers, headerRowIndex, rows };
}

function strAt(row: (string | number | null)[], col: number): string {
  if (col < 0) return '';
  const v = row[col];
  return v === null || v === undefined ? '' : String(v).trim();
}

function numAt(row: (string | number | null)[], col: number): number | null {
  if (col < 0) return null;
  return parseAmount(row[col]);
}

function parseBoRows(headers: string[], data: (string | number | null)[][], sheetName: string): ParsedBo {
  const colMaGd = findCol(headers, [(h) => h === 'ma giao dich' || h.startsWith('ma giao dich')]);
  const colMaNh = findCol(headers, [(h) => h.includes('ma gd ngan hang') || h === 'ma gd nh']);
  const colTien = findCol(headers, [(h) => h === 'so tien chi' || h.includes('so tien chi')]);
  const colPt = findCol(headers, [
    (h) => h.includes('phuong thuc'),
    (h) => h === 'pt chi ho' || h.includes('pt chi'),
  ]);
  const colTt = findCol(headers, [(h) => h.includes('trang thai')]);
  const colBank = findCol(headers, [(h) => h.includes('ngan hang chuyen')]);
  const colTime = findCol(headers, [
    (h) => h.includes('thoi gian hoan thanh'),
    (h) => h.includes('thoi gian tao'),
    (h) => h.includes('thoi gian duyet'),
    (h) => h.includes('thoi gian'),
  ]);
  const colMaGd2 = findCol(headers, [(h) => h === 'ma gd 2' || h.includes('ma gd 2')]);

  if (colMaGd < 0 || colTien < 0) {
    throw new Error(`Sheet BO "${sheetName}" thiếu cột "Mã giao dịch" hoặc "Số tiền chi".`);
  }

  const rows: BoRow[] = data.map((cells, i) => {
    const maGd = strAt(cells, colMaGd);
    const maGdNganHang = strAt(cells, colMaNh);
    const bank = normalizeBankCode(strAt(cells, colBank));
    const maGd2 =
      colMaGd2 >= 0 ? strAt(cells, colMaGd2) : bank === 'AGRIBANK' ? agriMaGd2FromBo(maGd) : '';
    const thoiGian = strAt(cells, colTime);
    const ngayYmd = parseToYmd(cells[colTime] ?? thoiGian);
    return {
      sheetRow: i,
      cells,
      maGd,
      maGdNganHang,
      maGd2,
      soTienChi: numAt(cells, colTien),
      phuongThuc: strAt(cells, colPt),
      trangThai: strAt(cells, colTt),
      nganHangChuyen: strAt(cells, colBank),
      thoiGian,
      ngayYmd,
      skDebit: null,
      chenhLech: null,
      note: '',
      computeDiff: false,
      bank,
      matchKey: '',
    };
  });

  return { name: sheetName, headers, headerRowIndex: 0, rows, soTienChiCol: colTien };
}

function skFieldMap(bank: BankCode, headers: string[]) {
  const desc = findCol(headers, [
    (h) => h.includes('dien giai'),
    (h) => h.includes('noi dung'),
    (h) => h.includes('content'),
    (h) => h.includes('transaction description'),
  ]);
  const ref = findCol(headers, [
    (h) => h.includes('so gd') || h.includes('transaction number'),
    (h) => h.includes('so but toan') || h.includes('reference'),
    (h) => h === 'but toan' || h.includes('but toan'),
    (h) => h === 'ma giao dich' || (h.includes('ma giao dich') && !h.includes('tach')),
  ]);
  const debit = findCol(headers, [
    (h) => h.includes('ghi no') && !h.includes('chenh'),
    (h) => h.includes('phat sinh no'),
    (h) => h.includes('ps giam') || (h.includes('debit') && !h.includes('credit')),
    (h) => h === 'no/debit' || h.startsWith('no/'),
    (h) => h.includes('so tien giam'),
    (h) => h.includes('so tien giao dich'),
  ]);
  const credit = findCol(headers, [
    (h) => h.includes('ghi co'),
    (h) => h.includes('phat sinh co'),
    (h) => h.includes('ps tang') || h.includes('credit'),
    (h) => h.includes('so tien tang'),
  ]);
  const time = findCol(headers, [
    (h) => h.includes('ngay giao dich') || h.includes('transaction date'),
    (h) => h.includes('ngay tao') || h.includes('thoi gian'),
    (h) => h.includes('ngay thuc hien') || h.includes('bank date') || h.includes('ngay hach toan'),
    (h) => h.includes('ngay gia tri') || h.includes('value date'),
  ]);

  // bank-specific refinements
  if (bank === 'OCB') {
    return {
      desc,
      ref: findCol(headers, [(h) => h.includes('so gd') || h.includes('transaction number')]),
      debit: findCol(headers, [(h) => h.includes('ps giam') || h.includes('debit')]),
      credit: findCol(headers, [(h) => h.includes('ps tang') || h.includes('credit')]),
      time: findCol(headers, [(h) => h.includes('ngay thuc hien') || h.includes('bank date'), (h) => h.includes('ngay tao')]),
    };
  }
  if (bank === 'MSB') {
    return {
      desc,
      ref: findCol(headers, [(h) => h.includes('so but toan') || h.includes('reference')]),
      debit: findCol(headers, [(h) => h.includes('no/debit') || (h.includes('no') && h.includes('debit'))]),
      credit: findCol(headers, [(h) => h.includes('co/credit') || (h.includes('co') && h.includes('credit'))]),
      time: findCol(headers, [(h) => h.includes('ngay giao dich')]),
    };
  }
  if (bank === 'MBB') {
    return {
      desc: findCol(headers, [(h) => h.includes('noi dung')]),
      ref: findCol(headers, [(h) => h.includes('but toan')]),
      debit: findCol(headers, [(h) => h.includes('phat sinh no')]),
      credit: findCol(headers, [(h) => h.includes('phat sinh co')]),
      time: findCol(headers, [(h) => h.includes('ngay giao dich') || h.includes('ngay hach toan')]),
    };
  }
  if (bank === 'KLB') {
    return {
      desc: findCol(headers, [(h) => h.includes('noi dung')]),
      ref: findCol(headers, [(h) => h === 'ma giao dich' || h.includes('ma giao dich')]),
      debit: findCol(headers, [(h) => h.includes('so tien giam')]),
      credit: findCol(headers, [(h) => h.includes('so tien tang')]),
      time: findCol(headers, [(h) => h.includes('thoi gian') || h.includes('ngay')]),
    };
  }
  if (bank === 'AGRIBANK') {
    return {
      desc: findCol(headers, [(h) => h.includes('noi dung')]),
      ref: -1,
      debit: findCol(headers, [(h) => h.includes('so tien giao dich') || h.includes('so tien')]),
      credit: -1,
      time: findCol(headers, [(h) => h.includes('ngay') || h.includes('thoi gian')]),
    };
  }
  return { desc, ref, debit, credit, time };
}

function parseSkRows(bank: BankCode, headers: string[], data: (string | number | null)[][], sheetName: string): ParsedSk {
  const map = skFieldMap(bank, headers);
  const rows: SkRow[] = data.map((cells, i) => {
    const desc = strAt(cells, map.desc);
    const ref = strAt(cells, map.ref);
    let debitRaw = numAt(cells, map.debit);
    let credit = numAt(cells, map.credit);
    if (bank === 'AGRIBANK' && debitRaw !== null) {
      // Âm = ghi nợ; dương = ghi có
      if (debitRaw < 0) {
        debitRaw = Math.abs(debitRaw);
        credit = null;
      } else if (debitRaw > 0) {
        credit = debitRaw;
        debitRaw = null;
      }
    }
    if ((bank === 'OCB' || bank === 'KLB') && debitRaw !== null) debitRaw = Math.abs(debitRaw);

    const debit = debitRaw !== null ? absoluteDebit(debitRaw) : null;
    const hasDebit = debit !== null && debit > 0;
    const hasCredit = credit !== null && credit > 0;
    const ma = extractMaGdForBank(bank, { desc, ref });

    const thoiGian = strAt(cells, map.time);
    const ngayYmd = parseToYmd(cells[map.time] ?? thoiGian);

    return {
      bank,
      sheetRow: i,
      cells,
      rawDesc: desc || ref,
      maGdTach: ma,
      debit: hasDebit ? debit : null,
      credit: hasCredit ? credit : null,
      thoiGian,
      ngayYmd,
      isDebit: hasDebit,
      boSoTienChi: null,
      chenhLech: null,
      note: '',
      matchKey: ma.trim(),
    };
  });

  // Fix isDebit: row with debit>0 counts as debit even if credit also present (rare)
  for (const r of rows) {
    if (r.debit !== null && r.debit > 0) r.isDebit = true;
    if ((r.debit === null || r.debit === 0) && r.credit !== null && r.credit > 0) r.isDebit = false;
  }

  return { name: sheetName, headers, headerRowIndex: 0, rows, bank };
}

function parseVietQr(headers: string[], data: (string | number | null)[][], sheetName: string): ParsedVietQr {
  const colDv = findCol(headers, [(h) => h.includes('ma dich vu')]);
  const colNh = findCol(headers, [(h) => h.includes('ma ngan hang')]);
  const colGia = findCol(headers, [(h) => h.includes('gia tri')]);
  const colTt = findCol(headers, [(h) => h.includes('trang thai')]);
  const colTime = findCol(headers, [(h) => h.includes('thoi gian')]);
  const colNcc = findCol(headers, [(h) => h === 'ncc' || h.includes('ncc')]);

  const rows: VietQrRow[] = data.map((cells, i) => ({
    sheetRow: i,
    cells,
    maDichVu: strAt(cells, colDv),
    maNganHang: strAt(cells, colNh),
    giaTri: numAt(cells, colGia),
    trangThai: strAt(cells, colTt),
    thoiGian: strAt(cells, colTime),
    ngayYmd: parseToYmd(cells[colTime] ?? strAt(cells, colTime)),
    ncc: strAt(cells, colNcc),
    skDebit: null,
    chenhLech: null,
    note: '',
  }));

  return { name: sheetName, headers, headerRowIndex: 0, rows };
}

export interface WorkbookParseResult {
  sheetNames: string[];
  bo: ParsedBo;
  /** BO ngân hàng ngày trước (thường BO KLB) — dùng fallback khi SK không khớp BO kỳ. */
  boPrev: ParsedBo | null;
  statements: ParsedSk[];
  vietQr: ParsedVietQr | null;
  periodDays: ReturnType<typeof buildPeriod>;
  periodLabel: string;
  periodSet: Set<string>;
}

export async function parseCheckingWorkbook(
  source: ByteSource,
  onProgress?: (p: CheckingProgress) => void,
): Promise<WorkbookParseResult> {
  onProgress?.({ phase: 'detect', message: 'Đang đọc danh sách sheet…', fraction: 0.02 });
  const { zip, sheets } = await listSheets(source);
  const visible = sheets.filter((s) => !s.hidden && !s.name.startsWith('_'));

  // Need shared strings from any handle
  const first = openSheet(zip, visible[0] ?? sheets[0]);
  const sst = await readSharedStrings(first);

  let boInfo: SheetInfo | null = null;
  let boPrevInfo: SheetInfo | null = null;
  let vietQrInfo: SheetInfo | null = null;
  const skInfos: { info: SheetInfo; bank: BankCode }[] = [];

  for (const info of visible) {
    const kind = detectBoSheet(info.name);
    if (kind === 'vietqr') {
      vietQrInfo = info;
      continue;
    }
    if (kind === 'bo_prev') {
      if (!boPrevInfo) boPrevInfo = info;
      continue;
    }
    if (kind === 'bo' && !boInfo) {
      boInfo = info;
      continue;
    }
    const bank = detectBankFromSheetName(info.name);
    if (bank) skInfos.push({ info, bank });
  }

  if (!boInfo) throw new Error('Không tìm thấy sheet BO (tên bắt đầu bằng "BO").');
  if (skInfos.length === 0) throw new Error('Không tìm thấy sheet sao kê ngân hàng nào.');

  onProgress?.({ phase: 'parse', message: `Đang đọc ${boInfo.name}…`, fraction: 0.08 });
  const boWb = openSheet(zip, boInfo);
  const boLoaded = await loadSheetRows(boWb, sst);
  const bo = parseBoRows(boLoaded.headers, boLoaded.rows, boInfo.name);

  let boPrev: ParsedBo | null = null;
  if (boPrevInfo) {
    onProgress?.({ phase: 'parse', message: `Đang đọc ${boPrevInfo.name}…`, fraction: 0.12 });
    const wb = openSheet(zip, boPrevInfo);
    const loaded = await loadSheetRows(wb, sst);
    boPrev = parseBoRows(loaded.headers, loaded.rows, boPrevInfo.name);
  }

  const statements: ParsedSk[] = [];
  for (let i = 0; i < skInfos.length; i++) {
    const { info, bank } = skInfos[i];
    onProgress?.({
      phase: 'parse',
      message: `Đang đọc ${info.name}…`,
      fraction: 0.15 + (0.5 * (i + 1)) / skInfos.length,
    });
    const wb = openSheet(zip, info);
    const loaded = await loadSheetRows(wb, sst);
    statements.push(parseSkRows(bank, loaded.headers, loaded.rows, info.name));
  }

  let vietQr: ParsedVietQr | null = null;
  if (vietQrInfo) {
    onProgress?.({ phase: 'parse', message: `Đang đọc ${vietQrInfo.name}…`, fraction: 0.7 });
    const wb = openSheet(zip, vietQrInfo);
    const loaded = await loadSheetRows(wb, sst);
    vietQr = parseVietQr(loaded.headers, loaded.rows, vietQrInfo.name);
  }

  const periodDays = buildPeriod(bo.rows.map((r) => r.ngayYmd).filter((d): d is string => !!d));
  const periodSet = new Set(periodDays.map((d) => d.ymd));
  const sorted = periodDays.map((d) => d.ymd);

  // MSB date adjustment once period known
  for (const sk of statements) {
    if (sk.bank !== 'MSB') continue;
    for (const row of sk.rows) {
      row.ngayYmd = adjustMsbDate(row.ngayYmd, row.thoiGian, sorted);
    }
  }

  return {
    sheetNames: visible.map((s) => s.name),
    bo,
    boPrev,
    statements,
    vietQr,
    periodDays,
    periodLabel: periodLabel(periodDays),
    periodSet,
  };
}

export function classifyDetectedSheets(names: string[]): { role: string; name: string }[] {
  return names.map((name) => {
    const bo = detectBoSheet(name);
    if (bo === 'vietqr') return { role: 'BO VietQRPay', name };
    if (bo === 'bo') return { role: 'BO', name };
    if (bo === 'bo_prev') return { role: 'BO ngày trước', name };
    const bank = detectBankFromSheetName(name);
    if (bank) return { role: `Sao kê ${bank}`, name };
    return { role: 'Khác', name };
  });
}
