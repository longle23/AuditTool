import { MultiSheetXlsxWriter, Xf, type CellValue } from '../xlsx/sheet-writer';
import { RULES_TABLE } from './banks';
import {
  GROUP_ORDER,
  type BankPivotRow,
  type LoaiStatusRow,
  type VietQrNccRow,
} from './pivot';
import type {
  AnomalyRow,
  BalanceCheck,
  BoRow,
  CheckingProgress,
  ParsedBo,
  ParsedSk,
  ParsedVietQr,
  PivotBankStats,
  SkRow,
} from './types';

function insertAfter<T>(arr: T[], index: number, items: T[]): T[] {
  return [...arr.slice(0, index + 1), ...items, ...arr.slice(index + 1)];
}

/** Màu ghi chú theo mẫu DOI_SOAT: hồng = bất thường, cam = review/khác ngày. */
function noteStyle(note: string | null | undefined): number {
  if (!note) return 0;
  if (/lệch số tiền|sao kê có, bo chưa|bo có, sao kê chưa|refund|hoàn tiền.*chưa|cảnh báo/i.test(note))
    return Xf.noteWarn;
  if (/review|khác ngày|gd ngày/i.test(note)) return Xf.noteMid;
  return 0;
}

function yellowFrom(headers: string[], fromCol: number): number[] {
  return headers.map((_, i) => (i > fromCol ? Xf.headerYellow : Xf.headerGreen));
}

function yellowLast(headers: string[], n: number): number[] {
  const start = headers.length - n;
  return headers.map((_, i) => (i >= start ? Xf.headerYellow : Xf.headerGreen));
}

function stylesForRow(values: CellValue[], noteCol: number, moneyIdx: number[]): (number | null)[] {
  const styles: (number | null)[] = values.map(() => null);
  for (const i of moneyIdx) {
    if (typeof values[i] === 'number') styles[i] = Xf.money;
  }
  if (noteCol >= 0 && typeof values[noteCol] === 'string') {
    styles[noteCol] = noteStyle(values[noteCol] as string) || null;
  }
  return styles;
}

function ensureMaGd2(bo: ParsedBo): { headers: string[]; soTienChiCol: number; mapRow: (row: BoRow) => (string | number | null)[] } {
  const headers = [...bo.headers];
  const hasMaGd2 = headers.some((h) => /mã gd 2|ma gd 2/i.test(h));
  let soTienChiCol = bo.soTienChiCol;
  if (!hasMaGd2) {
    const maGdCol = headers.findIndex((h) => /^mã giao dịch$/i.test(h.trim()) || /^ma giao dich$/i.test(h.trim()));
    const insertAt = maGdCol >= 0 ? maGdCol : 2;
    headers.splice(insertAt + 1, 0, 'Mã GD 2');
    if (soTienChiCol > insertAt) soTienChiCol += 1;
    return {
      headers,
      soTienChiCol,
      mapRow: (row) => {
        const cells = [...row.cells];
        cells.splice(insertAt + 1, 0, row.maGd2 || null);
        return cells;
      },
    };
  }
  return {
    headers,
    soTienChiCol,
    mapRow: (row) => row.cells,
  };
}

function boExportHeaders(headers: string[], soTienChiCol: number): string[] {
  return insertAfter(headers, soTienChiCol, [
    'Số tiền Ghi nợ trên sao kê',
    'Chênh lệch\n(Số tiền chi − Sao kê)',
    'Ghi chú đối chiếu',
  ]);
}

function boExportRow(cells: (string | number | null)[], soTienChiCol: number, row: BoRow): CellValue[] {
  const extra: CellValue[] = [row.skDebit, row.computeDiff ? row.chenhLech : null, row.note || null];
  return insertAfter(cells as CellValue[], soTienChiCol, extra);
}

function skExportHeaders(sk: ParsedSk): string[] {
  const base = [...sk.headers];
  if (sk.bank === 'OCB') {
    return [...base, 'Mã GD tách (đối chiếu BO)', 'Ghi nợ (số)', 'Số tiền chi (BO)', 'Chênh lệch\n(Ghi nợ − Số tiền chi BO)', 'Ghi chú đối chiếu'];
  }
  if (sk.bank === 'AGRIBANK') {
    return [...base, 'Ghi nợ (số, đã đảo dấu)', 'Mã GD', 'Số tiền chi (BO)', 'Chênh lệch\n(Ghi nợ − Số tiền chi BO)', 'Ghi chú đối chiếu'];
  }
  return [...base, 'Mã GD tách (đối chiếu BO)', 'Số tiền chi (BO)', 'Chênh lệch\n(Ghi nợ − Số tiền chi BO)', 'Ghi chú đối chiếu'];
}

function skExportRow(sk: ParsedSk, row: SkRow): CellValue[] {
  if (sk.bank === 'OCB') {
    return [...row.cells, row.maGdTach || null, row.debit, row.boSoTienChi, row.chenhLech, row.note || null];
  }
  if (sk.bank === 'AGRIBANK') {
    return [...row.cells, row.debit, row.maGdTach || null, row.boSoTienChi, row.chenhLech, row.note || null];
  }
  return [...row.cells, row.maGdTach || null, row.boSoTienChi, row.chenhLech, row.note || null];
}

function moneyCols(headers: string[]): number[] {
  return headers
    .map((h, i) => ({ h: h.toLowerCase(), i }))
    .filter(
      ({ h }) =>
        h.includes('tiền') ||
        h.includes('phí') ||
        h.includes('nợ') ||
        h.includes('có') ||
        h.includes('debit') ||
        h.includes('credit') ||
        h.includes('chenh') ||
        h.includes('chênh') ||
        h.includes('giá trị') ||
        h.includes('ps '),
    )
    .map(({ i }) => i);
}

export async function exportCheckingResult(opts: {
  bo: ParsedBo;
  boPrev?: ParsedBo | null;
  statements: ParsedSk[];
  vietQr: ParsedVietQr | null;
  pivot: PivotBankStats[];
  balance: BalanceCheck[];
  bankPivot: BankPivotRow[];
  loaiStatus: LoaiStatusRow[];
  vietQrNcc: VietQrNccRow[];
  anomalies: AnomalyRow[];
  periodLabel: string;
  onData: (chunk: Uint8Array, final: boolean) => void;
  onProgress?: (p: CheckingProgress) => void;
}): Promise<void> {
  const {
    bo,
    boPrev,
    statements,
    vietQr,
    pivot,
    balance,
    bankPivot,
    loaiStatus,
    vietQrNcc,
    anomalies,
    periodLabel,
    onData,
    onProgress,
  } = opts;
  onProgress?.({ phase: 'export', message: 'Đang ghi file kết quả…', fraction: 0.9 });

  const writer = new MultiSheetXlsxWriter({ onData });

  writeTongHop(writer, pivot, balance, periodLabel, statements);
  writeRules(writer, periodLabel);
  writePivotSheet(writer, bankPivot, loaiStatus, vietQrNcc, periodLabel);
  writeAnomalies(writer, anomalies);

  {
    const prepared = ensureMaGd2(bo);
    const headers = boExportHeaders(prepared.headers, prepared.soTienChiCol);
    const mcols = moneyCols(headers);
    const noteCol = headers.findIndex((h) => /ghi chú đối chiếu/i.test(h));
    writer.beginSheet(bo.name, headers, {
      subtotalColumns: mcols,
      headerStyle: Xf.headerGreen,
      headerStyles: yellowFrom(headers, prepared.soTienChiCol),
    });
    for (const row of bo.rows) {
      const values = boExportRow(prepared.mapRow(row), prepared.soTienChiCol, row);
      writer.writeRow(values, stylesForRow(values, noteCol, mcols));
    }
    writer.endSheet();
  }

  if (boPrev) {
    writer.beginSheet(boPrev.name, boPrev.headers, {
      subtotalColumns: moneyCols(boPrev.headers),
      headerStyle: Xf.headerGreen,
    });
    for (const row of boPrev.rows) writer.writeRow(row.cells as CellValue[]);
    writer.endSheet();
  }

  if (vietQr) {
    const headers = [
      ...vietQr.headers,
      'Số tiền ghi nợ trên sao kê KLB',
      'Chênh lệch\n(Giá trị GD − Sao kê)',
      'Ghi chú đối chiếu',
    ];
    const mcols = moneyCols(headers);
    const noteCol = headers.length - 1;
    const reconN = 3;
    writer.beginSheet(vietQr.name, headers, {
      subtotalColumns: mcols,
      headerStyle: Xf.headerGreen,
      headerStyles: yellowLast(headers, reconN),
    });
    for (const row of vietQr.rows) {
      const values: CellValue[] = [...row.cells, row.skDebit, row.chenhLech, row.note || null];
      writer.writeRow(values, stylesForRow(values, noteCol, mcols));
    }
    writer.endSheet();
  }

  for (const sk of statements) {
    const headers = skExportHeaders(sk);
    const mcols = moneyCols(headers);
    const noteCol = headers.length - 1;
    const reconN = sk.bank === 'OCB' || sk.bank === 'AGRIBANK' ? 5 : 4;
    writer.beginSheet(sk.name, headers, {
      subtotalColumns: mcols,
      headerStyle: Xf.headerGreen,
      headerStyles: yellowLast(headers, reconN),
    });
    for (const row of sk.rows) {
      const values = skExportRow(sk, row);
      writer.writeRow(values, stylesForRow(values, noteCol, mcols));
    }
    writer.endSheet();
  }

  await writer.finish();
  onProgress?.({ phase: 'export', message: 'Hoàn tất', fraction: 1 });
}

function writeRules(writer: MultiSheetXlsxWriter, periodLabel: string): void {
  writer.beginSheet(
    'Quy tắc đã áp dụng',
    ['Ngân hàng', 'Mã trên sao kê', 'Cột BO đối chiếu', 'Cột số tiền sao kê', 'Ghi chú / điểm lệch so với bảng mô tả'],
    { headerStyle: Xf.sectionHeader },
  );
  for (const r of RULES_TABLE) {
    writer.writeRow([r.bank, r.maSk, r.cotBo, r.cotTien, r.note || null]);
  }
  writer.writeRow(['Chung', 'Chỉ lấy mã ở dòng ghi nợ', `Kỳ báo cáo ${periodLabel}`, '', 'Cột ghi chú là kết quả phân loại đối chiếu']);
  writer.endSheet();
}

function writeAnomalies(writer: MultiSheetXlsxWriter, anomalies: AnomalyRow[]): void {
  writer.beginSheet(
    'Bất thường',
    ['Ưu tiên', 'Ngân hàng', 'Nhóm', 'Nguồn', 'Mã GD', 'Số tiền', 'Ngày / thời gian', 'Ghi chú / hướng xử lý'],
    { headerStyle: Xf.sectionHeader, subtotalColumns: [5] },
  );
  for (const a of anomalies) {
    const prio =
      a.uuTien === 'Cao' ? Xf.priorityCao : a.uuTien === 'Trung bình' ? Xf.priorityTb : 0;
    writer.writeRow(
      [a.uuTien ?? 'Thấp', a.bank, a.nhom, a.nguon, a.maGd || null, a.soTien, a.thoiGian || null, a.ghiChu],
      [prio, null, null, null, null, typeof a.soTien === 'number' ? Xf.money : null, null, noteStyle(a.ghiChu) || null],
    );
  }
  writer.endSheet();
}

function writeTongHop(
  writer: MultiSheetXlsxWriter,
  pivot: PivotBankStats[],
  balance: BalanceCheck[],
  periodLabel: string,
  statements: ParsedSk[],
): void {
  const colCount = 2 + GROUP_ORDER.length * 2;
  writer.beginFreeSheet('Tong hop', colCount, { freezeAt: 5, autoFilter: false });

  writer.writeRow([`TỔNG HỢP ĐỐI SOÁT PAYOUT – NGÀY ${periodLabel}`], [Xf.title]);
  writer.writeRow([]);
  writer.writeRow([]);

  const groupHeader: CellValue[] = ['Bank', 'Hình thức'];
  const groupStyles: (number | null)[] = [Xf.thBank, Xf.thHinhThuc];
  for (let gi = 0; gi < GROUP_ORDER.length; gi++) {
    groupHeader.push(GROUP_ORDER[gi].label, null);
    groupStyles.push(Xf.thGroup[gi] ?? Xf.thGroup[9], null);
  }
  writer.writeRow(groupHeader, groupStyles);

  const subHeader: CellValue[] = [null, null];
  const subStyles: (number | null)[] = [null, null];
  for (let i = 0; i < GROUP_ORDER.length; i++) {
    subHeader.push('Số GD', 'Số tiền');
    subStyles.push(Xf.thSub, Xf.thSub);
  }
  writer.writeRow(subHeader, subStyles);

  // Placeholder banks like sample
  writer.writeRow(['ACB', 'KHÔNG PS']);
  writer.writeRow(['Quét Mã QR']);
  writer.writeRow(['BVBank', 'KHÔNG PS']);
  writer.writeRow(['Quét Mã QR']);

  for (const row of pivot) {
    if (row.hinhThuc === 'Hoan tien VietQR' && !row.groups) continue;
    const values: CellValue[] = [row.bank, row.hinhThuc];
    const styles: (number | null)[] = [null, null];
    for (const g of GROUP_ORDER) {
      const bucket = row.groups[g.key] ?? { count: 0, amount: 0 };
      values.push(bucket.count, bucket.amount);
      styles.push(null, Xf.money);
    }
    writer.writeRow(values, styles);
  }

  writer.writeRow([]);
  writer.writeRow(['KIỂM TRA CÂN ĐỐI (kết quả phải bằng 0)'], [Xf.title]);
  const balHeaders = [
    'Ngân hàng',
    'GD ghi nợ trên sao kê',
    'Tổng các nhóm (sao kê)',
    'Chênh lệch SL',
    'Tiền ghi nợ sao kê',
    'Tổng các nhóm (tiền)',
    'Chênh lệch tiền',
    'GD BO',
    'Tổng các nhóm (BO)',
    'Chênh lệch SL BO',
    'BO Pending (chưa có sao kê)',
  ];
  writer.writeRow(
    balHeaders,
    balHeaders.map(() => Xf.sectionHeader),
  );

  for (const b of balance) {
    const pending = b.boPending ?? 0;
    writer.writeRow(
      [
        b.bank,
        b.skDebitCount,
        b.skGroupCount,
        b.skDebitCount - b.skGroupCount,
        b.skDebitAmount,
        b.skGroupAmount,
        b.skDebitAmount - b.skGroupAmount,
        b.boCount,
        b.boGroupCount,
        b.boCount - b.boGroupCount - pending,
        pending,
      ],
      [null, null, null, null, Xf.money, Xf.money, Xf.money, null, null, null, null],
    );
  }

  writer.writeRow([]);
  writer.writeRow([
    'Ghi chú: "Refund" = dòng ghi nợ hoàn tiền trên sao kê khớp với BO VietQR nhưng báo nợ khác ngày BO. "Sao kê có, BO chưa có" = ghi nợ trong kỳ không tìm thấy mã trên BO. Chi tiết xem sheet "Bất thường".',
  ]);
  const banksPresent = statements.map((s) => s.bank).join(', ');
  writer.writeRow([`Đã có sao kê ${banksPresent} (kỳ ${periodLabel}).`]);
  writer.writeRow([
    'Cột K bảng kiểm tra: số GD BO đang chờ sao kê (Pending). Chênh lệch SL BO = GD BO − Tổng các nhóm − Pending.',
  ]);
  writer.endSheet();
}

function writePivotSheet(
  writer: MultiSheetXlsxWriter,
  bankPivot: BankPivotRow[],
  loaiStatus: LoaiStatusRow[],
  vietQrNcc: VietQrNccRow[],
  periodLabel: string,
): void {
  writer.beginFreeSheet('Pivot', 14, { freezeAt: 3, autoFilter: false });
  writer.writeRow([`THỐNG KÊ KẾT QUẢ ĐỐI SOÁT – BO ${periodLabel} (theo cột "Ghi chú đối chiếu")`], [Xf.title]);
  writer.writeRow([]);
  const pivHeaders = [
    'Ngân hàng chuyển',
    'GD BO (SL)',
    'GD BO (tiền)',
    'Khớp (SL)',
    'Khớp (tiền)',
    'Khớp khác ngày (SL)',
    'Khớp khác ngày (tiền)',
    'Review – SK đã báo nợ (SL)',
    'Review (tiền)',
    'BO có, SK chưa cắt (SL)',
    'BO có, SK chưa cắt (tiền)',
    'Lệch tiền (SL)',
    'BO FAILED (SL)',
    'Tỷ lệ khớp (SL)',
  ];
  writer.writeRow(
    pivHeaders,
    pivHeaders.map(() => Xf.sectionHeader),
  );

  let totBo = 0;
  let totBoAmt = 0;
  let totKhop = 0;
  let totKhopAmt = 0;
  let totKn = 0;
  let totKnAmt = 0;
  let totRev = 0;
  let totRevAmt = 0;
  let totThieu = 0;
  let totThieuAmt = 0;
  let totLech = 0;
  let totFail = 0;

  const moneyRow = [null, null, Xf.money, null, Xf.money, null, Xf.money, null, Xf.money, null, Xf.money, null, null, null];
  for (const r of bankPivot) {
    const matched = r.khopCount + r.khacNgayCount;
    const rate = r.boCount ? matched / r.boCount : 0;
    writer.writeRow(
      [
        r.bank,
        r.boCount,
        r.boAmount,
        r.khopCount,
        r.khopAmount,
        r.khacNgayCount,
        r.khacNgayAmount,
        r.reviewCount,
        r.reviewAmount,
        r.boThieuCount,
        r.boThieuAmount,
        r.lechCount,
        r.failedCount,
        rate,
      ],
      moneyRow,
    );
    totBo += r.boCount;
    totBoAmt += r.boAmount;
    totKhop += r.khopCount;
    totKhopAmt += r.khopAmount;
    totKn += r.khacNgayCount;
    totKnAmt += r.khacNgayAmount;
    totRev += r.reviewCount;
    totRevAmt += r.reviewAmount;
    totThieu += r.boThieuCount;
    totThieuAmt += r.boThieuAmount;
    totLech += r.lechCount;
    totFail += r.failedCount;
  }

  writer.writeRow(
    [
      'Tổng cộng',
      totBo,
      totBoAmt,
      totKhop,
      totKhopAmt,
      totKn,
      totKnAmt,
      totRev,
      totRevAmt,
      totThieu,
      totThieuAmt,
      totLech,
      totFail,
      totBo ? (totKhop + totKn) / totBo : 0,
    ],
    moneyRow,
  );

  writer.writeRow([]);
  writer.writeRow(['Theo LOẠI × Trạng thái (LOẠI suy từ cột "PT chi hộ": BANK = CHI HỘ, Ngân hàng = RÚT TIỀN)'], [Xf.title]);
  const loaiHeaders = ['LOẠI', 'Trạng thái', 'Số GD', 'Số tiền chi', 'Số GD khớp (kể cả khác ngày)', 'Số tiền khớp'];
  writer.writeRow(
    loaiHeaders,
    loaiHeaders.map(() => Xf.sectionHeader),
  );
  for (const r of loaiStatus) {
    writer.writeRow([r.loai, r.trangThai, r.count, r.amount, r.khopCount, r.khopAmount], [null, null, null, Xf.money, null, Xf.money]);
  }

  writer.writeRow([]);
  writer.writeRow(['BO hoàn tiền VietQR theo NCC'], [Xf.title]);
  const nccHeaders = ['NCC', 'Số GD', 'Giá trị GD', 'Khớp (SL)', 'Khớp (tiền)', 'Thất bại (SL)'];
  writer.writeRow(
    nccHeaders,
    nccHeaders.map(() => Xf.sectionHeader),
  );
  for (const r of vietQrNcc) {
    writer.writeRow([r.ncc, r.count, r.amount, r.khopCount, r.khopAmount, r.failCount], [null, null, Xf.money, null, Xf.money, null]);
  }
  writer.endSheet();
}
