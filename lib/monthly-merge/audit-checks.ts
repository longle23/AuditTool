import type { EncodedValue } from '../xlsx/sheet-writer';

const KEY_HEADERS = ['mã đơn hàng', 'mã thanh toán', 'mã giao dịch', 'order id', 'transaction id', 'payment id'];
const AMOUNT_HEADER_RE = /^(giá trị|phí|lãi|giá vốn|thực nhận|số tiền|tiền|amount|fee|total)/;

const MAX_ITEMS_PER_COLUMN = 5000;
const MAX_OCCURRENCES_PER_ITEM = 50;
const MAX_FILES = 1024;

export function findKeyColumns(keys: string[]): number[] {
  return keys.flatMap((k, i) => (KEY_HEADERS.includes(k) ? [i] : []));
}

export function findAmountColumns(keys: string[]): number[] {
  return keys.flatMap((k, i) => (AMOUNT_HEADER_RE.test(k) && !k.startsWith('mã') ? [i] : []));
}

/** Compensated (Neumaier) summation so large VND/USD totals don't drift. */
class Sum {
  private sum = 0;
  private c = 0;
  add(x: number) {
    const t = this.sum + x;
    this.c += Math.abs(this.sum) >= Math.abs(x) ? this.sum - t + x : x - t + this.sum;
    this.sum = t;
  }
  get value() {
    return this.sum + this.c;
  }
}

function numeric(value: EncodedValue | undefined): number | null {
  if (!value || value.charCodeAt(0) !== 110 /* n */) return null;
  const n = Number(value.slice(1));
  return Number.isFinite(n) ? n : null;
}

export interface ControlTotalsRow {
  name: string;
  rows: number;
  totals: number[];
}

export interface ControlTotalsReport {
  columns: string[];
  files: ControlTotalsRow[];
  total: ControlTotalsRow;
  /** Totals and row counts computed while reading the sources equal those computed while writing the output. */
  reconciled: boolean;
}

/**
 * Sums amount columns per source file (while reading) and over the merged sheet (while writing),
 * as two independent passes, so the merge itself can be reconciled.
 */
export class ControlTotals {
  private readonly read: Sum[][] = [];
  private readonly readRows: number[] = [];
  private readonly written: Sum[];
  private writtenRows = 0;

  constructor(private readonly columns: number[]) {
    this.written = columns.map(() => new Sum());
  }

  addRead(fileIndex: number, values: EncodedValue[]) {
    this.read[fileIndex] ??= this.columns.map(() => new Sum());
    this.readRows[fileIndex] = (this.readRows[fileIndex] ?? 0) + 1;
    const sums = this.read[fileIndex];
    for (let i = 0; i < this.columns.length; i++) {
      const n = numeric(values[this.columns[i]]);
      if (n !== null) sums[i].add(n);
    }
  }

  addWritten(values: EncodedValue[]) {
    this.writtenRows++;
    for (let i = 0; i < this.columns.length; i++) {
      const n = numeric(values[this.columns[i]]);
      if (n !== null) this.written[i].add(n);
    }
  }

  report(headers: string[], fileNames: string[]): ControlTotalsReport | null {
    if (this.columns.length === 0) return null;
    const files = fileNames.map((name, f) => ({
      name,
      rows: this.readRows[f] ?? 0,
      totals: this.columns.map((_, i) => this.read[f]?.[i].value ?? 0),
    }));
    const total = {
      name: 'Tổng cộng',
      rows: this.writtenRows,
      totals: this.written.map((s) => s.value),
    };
    const readRows = files.reduce((s, f) => s + f.rows, 0);
    const reconciled =
      readRows === this.writtenRows &&
      total.totals.every((t, i) => {
        const fromFiles = files.reduce((s, f) => s + f.totals[i], 0);
        return Math.abs(fromFiles - t) <= Math.max(1e-6, Math.abs(t) * 1e-12);
      });
    return { columns: this.columns.map((c) => headers[c]), files, total, reconciled };
  }
}

export interface DuplicateOccurrence {
  /** Excel row number in the merged sheet. */
  row: number;
  fileIndex: number;
}

export interface DuplicateItem {
  value: string;
  count: number;
  occurrences: DuplicateOccurrence[];
}

export interface DuplicateReport {
  column: string;
  /** Distinct values that occur more than once. */
  duplicateValues: number;
  /** Rows involved in duplicates, including the first occurrence. */
  duplicateRows: number;
  /** Duplicated values that occur in more than one source file. */
  crossFileValues: number;
  items: DuplicateItem[];
  truncated: boolean;
}

/** Finds repeated transaction IDs, keyed by the encoded cell value (shared strings are already deduplicated). */
export class DuplicateDetector {
  private readonly first: Map<string, number>[];
  private readonly repeats: Map<string, number[]>[];

  constructor(private readonly columns: number[]) {
    this.first = columns.map(() => new Map());
    this.repeats = columns.map(() => new Map());
  }

  add(values: EncodedValue[], row: number, fileIndex: number) {
    const packed = row * MAX_FILES + Math.min(fileIndex, MAX_FILES - 1);
    for (let i = 0; i < this.columns.length; i++) {
      const key = values[this.columns[i]];
      if (!key) continue;
      const prev = this.first[i].get(key);
      if (prev === undefined) {
        this.first[i].set(key, packed);
        continue;
      }
      let list = this.repeats[i].get(key);
      if (!list) {
        list = [prev];
        this.repeats[i].set(key, list);
      }
      list.push(packed);
    }
  }

  report(headers: string[], decode: (value: EncodedValue) => string): DuplicateReport[] {
    return this.columns.map((col, i) => {
      const repeats = this.repeats[i];
      let duplicateRows = 0;
      let crossFileValues = 0;
      const items: DuplicateItem[] = [];
      for (const [key, list] of repeats) {
        duplicateRows += list.length;
        const files = new Set(list.map((p) => p % MAX_FILES));
        if (files.size > 1) crossFileValues++;
        if (items.length < MAX_ITEMS_PER_COLUMN) {
          items.push({
            value: decode(key),
            count: list.length,
            occurrences: list.slice(0, MAX_OCCURRENCES_PER_ITEM).map((p) => ({
              row: Math.floor(p / MAX_FILES),
              fileIndex: p % MAX_FILES,
            })),
          });
        }
      }
      const duplicateValues = repeats.size;
      this.first[i].clear();
      repeats.clear();
      return {
        column: headers[col],
        duplicateValues,
        duplicateRows,
        crossFileValues,
        items,
        truncated: duplicateValues > items.length,
      };
    });
  }
}
