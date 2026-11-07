import type { ByteSource } from '../xlsx/byte-source';
import { openWorkbook, readSharedStrings, streamRows, type RawCell, type WorkbookHandle } from '../xlsx/sheet-reader';
import { SingleSheetXlsxWriter, type EncodedValue } from '../xlsx/sheet-writer';
import { richTextToPlain, unescapeXml } from '../xlsx/xml';

export interface WorkbookInspection {
  sheetName: string;
  /** Data rows excluding the header, taken from the sheet dimension when available. */
  rowCount: number | null;
  headers: string[];
  timeColumn: string | null;
  /** Timestamp (epoch ms, UTC-based wall clock) of the first data row in the time column. */
  sampleTime: number | null;
}

export interface MergeInput {
  name: string;
  source: ByteSource;
}

export interface MergeProgress {
  phase: 'reading' | 'writing' | 'finalizing';
  fileIndex: number;
  fileCount: number;
  fileName: string;
  rows: number;
  /** Overall completion between 0 and 1. */
  fraction: number;
}

export interface MergeFileReport {
  name: string;
  rows: number;
  reversed: boolean;
  columnsReordered: boolean;
  /** Earliest and latest timestamps in the time column, after ordering. */
  firstTime: number | null;
  lastTime: number | null;
}

export interface MergeResult {
  rows: number;
  columns: number;
  sheetName: string;
  files: MergeFileReport[];
  renumberedColumn: string | null;
  timeColumn: string | null;
}

export interface MergeOptions {
  sheetName: string;
  onProgress?: (progress: MergeProgress) => void;
  onData: (chunk: Uint8Array, final: boolean) => void;
}

const FIELD_SEPARATOR = '\u0001';
const READ_WEIGHT = 0.65;
const PROGRESS_INTERVAL_MS = 120;

export function normalizeHeader(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

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

function headerTexts(cells: RawCell[], sst: string[]): string[] {
  const headers: string[] = [];
  for (const cell of cells) headers[cell.col] = cellText(cell, sst).trim();
  for (let i = 0; i < headers.length; i++) headers[i] ??= '';
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  return headers;
}

/** Keys header names by occurrence so duplicated column names still map one-to-one. */
function headerKeys(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const key = normalizeHeader(h);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  });
}

export interface HeaderComparison {
  missing: string[];
  extra: string[];
  reordered: boolean;
}

export function compareHeaders(master: string[], other: string[]): HeaderComparison {
  const masterKeys = headerKeys(master);
  const otherKeys = headerKeys(other);
  const masterSet = new Set(masterKeys);
  const otherSet = new Set(otherKeys);
  const missing = master.filter((_, i) => !otherSet.has(masterKeys[i]));
  const extra = other.filter((h, i) => h && !masterSet.has(otherKeys[i]));
  const reordered = missing.length === 0 && extra.length === 0 && masterKeys.some((k, i) => otherKeys[i] !== k);
  return { missing, extra, reordered };
}

export function describeHeaderMismatch(cmp: HeaderComparison): string {
  const parts: string[] = [];
  if (cmp.missing.length) parts.push(`thiếu cột: ${cmp.missing.join(', ')}`);
  if (cmp.extra.length) parts.push(`thừa cột: ${cmp.extra.join(', ')}`);
  return `Cấu trúc cột khác file đầu tiên (${parts.join('; ')}).`;
}

export async function inspectWorkbook(source: ByteSource): Promise<WorkbookInspection> {
  const wb = await openWorkbook(source);
  const firstRows: RawCell[][] = [];
  const info: { dimensionRows?: number } = {};
  await streamRows(wb, (cells) => firstRows.push(cells) < 2, undefined, info);
  if (firstRows.length === 0) throw new Error('Sheet không có dữ liệu.');

  const maxIndex = firstRows
    .flat()
    .reduce((max, c) => (c.type === 's' ? Math.max(max, Number(c.value)) : max), -1);
  const sst = await readSharedStrings(wb, maxIndex + 1);
  const headers = headerTexts(firstRows[0], sst);
  const timeIndex = findTimeColumn(headerKeys(headers));

  let sampleTime: number | null = null;
  const sampleCell = timeIndex >= 0 ? firstRows[1]?.find((c) => c.col === timeIndex) : undefined;
  if (sampleCell) {
    sampleTime =
      sampleCell.type === '' || sampleCell.type === 'n'
        ? excelSerialToTime(Number(sampleCell.value))
        : parseTimestamp(cellText(sampleCell, sst));
  }

  return {
    sheetName: wb.sheetName,
    rowCount: info.dimensionRows ? Math.max(0, info.dimensionRows - 1) : null,
    headers,
    timeColumn: timeIndex >= 0 ? headers[timeIndex] : null,
    sampleTime,
  };
}

const TIME_HEADER_RE = /^(tg|thời gian|ngày|date|time)/;
const PREFERRED_TIME_HEADER_RE = /hoàn thành|completed|finished/;
const STT_HEADERS = new Set(['stt', 'số thứ tự', 'no', 'no.', '#']);

/** Completion time is what transaction exports are sorted and split by, so prefer it over creation time. */
function findTimeColumn(keys: string[]): number {
  const preferred = keys.findIndex((k) => TIME_HEADER_RE.test(k) && PREFERRED_TIME_HEADER_RE.test(k));
  return preferred >= 0 ? preferred : keys.findIndex((k) => TIME_HEADER_RE.test(k));
}

function excelSerialToTime(serial: number): number | null {
  return Number.isFinite(serial) ? Math.round((serial - 25569) * 86_400_000) : null;
}

/** Parses `HH:mm dd/MM/yyyy`, `dd/MM/yyyy HH:mm[:ss]` and ISO-like timestamps to epoch ms. */
export function parseTimestamp(text: string): number | null {
  const s = text.trim();
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return Date.UTC(+m[6], +m[5] - 1, +m[4], +m[1], +m[2], +(m[3] ?? 0));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return null;
}

export async function mergeMonthlyFiles(inputs: MergeInput[], options: MergeOptions): Promise<MergeResult> {
  if (inputs.length === 0) throw new Error('Chưa có file nào để gộp.');

  const writer = new SingleSheetXlsxWriter({ sheetName: options.sheetName, onData: options.onData });
  const reports: MergeFileReport[] = [];
  const fileCount = inputs.length;

  const master = { headers: [] as string[], keys: [] as string[], ready: false };
  let sttColumn = -1;
  let timeColumn = -1;
  let lastEmit = 0;

  const emit = (progress: MergeProgress, force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < PROGRESS_INTERVAL_MS) return;
    lastEmit = now;
    options.onProgress?.(progress);
  };

  const encodedText = (value: EncodedValue): string | number | null => {
    if (!value) return null;
    if (value[0] === 's') return richTextToPlain(writer.sst.items[Number(value.slice(1))] ?? '');
    if (value[0] === 'n') return Number(value.slice(1));
    return value.slice(1);
  };

  const toTimestamp = (value: EncodedValue | undefined): number | null => {
    const v = value ? encodedText(value) : null;
    if (typeof v === 'number') return excelSerialToTime(v);
    return v ? parseTimestamp(v) : null;
  };

  for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
    const input = inputs[fileIndex];
    let wb: WorkbookHandle;
    try {
      wb = await openWorkbook(input.source);
    } catch (error) {
      throw new Error(`${input.name}: ${(error as Error).message}`);
    }

    const sst = await readSharedStrings(wb);
    const sheetBytes = Math.max(1, wb.sheet.compressedSize);
    const rows: string[] = [];
    let columnMap: Int32Array | null = null;
    let columnsReordered = false;

    const progress = (phase: MergeProgress['phase'], fileFraction: number): MergeProgress => ({
      phase,
      fileIndex,
      fileCount,
      fileName: input.name,
      rows: Math.max(0, writer.rowsWritten - 1) + (phase === 'reading' ? rows.length : 0),
      fraction: Math.min(0.995, (fileIndex + fileFraction) / fileCount),
    });

    emit(progress('reading', 0), true);

    await streamRows(
      wb,
      (cells) => {
        if (!columnMap) {
          const headers = headerTexts(cells, sst);
          if (!master.ready) {
            master.headers = headers;
            master.keys = headerKeys(headers);
            master.ready = true;
            sttColumn = master.keys.findIndex((k) => STT_HEADERS.has(k));
            timeColumn = findTimeColumn(master.keys);
          } else {
            const cmp = compareHeaders(master.headers, headers);
            if (cmp.missing.length || cmp.extra.length) {
              throw new Error(`${input.name}: ${describeHeaderMismatch(cmp)}`);
            }
            columnsReordered = cmp.reordered;
          }
          const keys = headerKeys(headers);
          const lastCol = cells.reduce((max, c) => Math.max(max, c.col), headers.length - 1);
          const map = new Int32Array(lastCol + 1).fill(-1);
          keys.forEach((key, col) => {
            if (headers[col]) map[col] = master.keys.indexOf(key);
          });
          columnMap = map;
          return;
        }

        const values: EncodedValue[] = new Array(master.keys.length).fill('');
        let hasData = false;
        for (const cell of cells) {
          const out = cell.col < columnMap.length ? columnMap[cell.col] : -1;
          if (out < 0) continue;
          let encoded: EncodedValue = '';
          switch (cell.type) {
            case 's': {
              const item = sst[Number(cell.value)];
              if (item !== undefined) encoded = 's' + writer.sst.add(item);
              break;
            }
            case 'str':
              if (cell.value) encoded = 's' + writer.sst.addText(cell.value);
              break;
            case 'inlineStr':
              if (cell.inline) encoded = 's' + writer.sst.add(cell.inline);
              break;
            case '':
            case 'n':
              if (cell.value) encoded = 'n' + cell.value;
              break;
            default:
              if (cell.value !== undefined) encoded = cell.type[0] + cell.value;
          }
          if (encoded) {
            values[out] = encoded;
            if (out !== sttColumn) hasData = true;
          }
        }
        if (!hasData) return;
        if (sttColumn >= 0) values[sttColumn] = '';
        rows.push(values.join(FIELD_SEPARATOR));
      },
      (read) => emit(progress('reading', (read / sheetBytes) * READ_WEIGHT)),
    );

    if (!columnMap) throw new Error(`${input.name}: Sheet không có dữ liệu.`);

    // Exports are often newest-first; flip them so the merged sheet runs from the start of the month.
    let reversed = false;
    let firstTime: number | null = null;
    let lastTime: number | null = null;
    if (timeColumn >= 0 && rows.length > 0) {
      firstTime = toTimestamp(rows[0].split(FIELD_SEPARATOR)[timeColumn]);
      lastTime = toTimestamp(rows[rows.length - 1].split(FIELD_SEPARATOR)[timeColumn]);
      if (firstTime !== null && lastTime !== null && firstTime > lastTime) {
        rows.reverse();
        reversed = true;
        [firstTime, lastTime] = [lastTime, firstTime];
      }
    }

    if (fileIndex === 0) {
      const headerIds = master.headers.map((h) => writer.sst.addText(escapeText(h)));
      writer.begin(headerIds, columnWidths(master.headers, rows, writer.sst.lengths));
    }

    emit(progress('writing', READ_WEIGHT), true);
    for (let i = 0; i < rows.length; i++) {
      const values = rows[i].split(FIELD_SEPARATOR);
      if (sttColumn >= 0) values[sttColumn] = 'n' + writer.rowsWritten;
      writer.writeRow(values);
      rows[i] = '';
      if ((i & 0x1fff) === 0) emit(progress('writing', READ_WEIGHT + (1 - READ_WEIGHT) * (i / rows.length)));
    }

    reports.push({ name: input.name, rows: rows.length, reversed, columnsReordered, firstTime, lastTime });
  }

  emit(
    {
      phase: 'finalizing',
      fileIndex: fileCount - 1,
      fileCount,
      fileName: inputs[fileCount - 1].name,
      rows: writer.rowsWritten - 1,
      fraction: 0.995,
    },
    true,
  );
  await writer.finish();

  const headers = master.headers;
  return {
    rows: writer.rowsWritten - 1,
    columns: headers.length,
    sheetName: options.sheetName,
    files: reports,
    renumberedColumn: sttColumn >= 0 ? headers[sttColumn] : null,
    timeColumn: timeColumn >= 0 ? headers[timeColumn] : null,
  };
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function columnWidths(headers: string[], rows: string[], sstLengths: number[]): number[] {
  const sample = Math.min(rows.length, 500);
  const step = sample > 0 ? rows.length / sample : 1;
  const max = headers.map(() => 0);
  for (let s = 0; s < sample; s++) {
    const values = rows[Math.floor(s * step)].split(FIELD_SEPARATOR);
    for (let i = 0; i < headers.length; i++) {
      const v = values[i];
      if (!v) continue;
      const len = v[0] === 's' ? sstLengths[Number(v.slice(1))] ?? 0 : v.length - 1;
      if (len > max[i]) max[i] = len;
    }
  }
  return headers.map((h, i) => Math.min(60, Math.max(8, h.length * 1.15 + 4, max[i] * 1.1 + 2)));
}
