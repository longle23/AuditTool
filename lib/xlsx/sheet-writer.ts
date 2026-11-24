import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { columnLetters, escapeXml } from './xml';

export const EXCEL_MAX_ROWS = 1_048_576;

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const FLUSH_THRESHOLD = 1 << 20;

/** Encoded cell value: first char is the kind (`s` shared string index, `n` number, `b`, `e`, `d`), rest is the value. */
export type EncodedValue = string;

export class SharedStringTable {
  private readonly index = new Map<string, number>();
  readonly items: string[] = [];
  /** Approximate display length per item, used for column widths. */
  readonly lengths: number[] = [];
  references = 0;

  /** `xml` is the escaped inner XML of an `<si>` item. */
  add(xml: string, plainLength?: number): number {
    this.references++;
    let id = this.index.get(xml);
    if (id === undefined) {
      // Copy so the key doesn't pin the multi-megabyte chunk it was sliced from.
      const owned = (' ' + xml).slice(1);
      id = this.items.length;
      this.index.set(owned, id);
      this.items.push(owned);
      this.lengths.push(plainLength ?? Math.max(0, xml.length - 7));
    }
    return id;
  }

  addText(escapedText: string): number {
    const preserve = /^\s|\s$/.test(escapedText) ? ' xml:space="preserve"' : '';
    return this.add(`<t${preserve}>${escapedText}</t>`, escapedText.length);
  }
}

export interface SheetWriterOptions {
  sheetName: string;
  /** Deflate level 1–9. Lower is faster and slightly larger. */
  level?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  onData: (chunk: Uint8Array, final: boolean) => void;
}

/** Streams a single-sheet .xlsx workbook with a styled, frozen, filterable header row. */
export class SingleSheetXlsxWriter {
  readonly sst = new SharedStringTable();
  private readonly zip: Zip;
  private readonly sheet: ZipDeflate;
  private readonly encoder = new TextEncoder();
  private readonly level: number;
  private pending: string[] = [];
  private pendingLength = 0;
  private columnCount = 0;
  private letters: string[] = [];
  private rowNumber = 0;
  private headerRow = 1;
  private finished: Promise<void>;
  private resolveFinished!: () => void;
  private rejectFinished!: (error: Error) => void;

  constructor(private readonly options: SheetWriterOptions) {
    this.level = options.level ?? 1;
    this.finished = new Promise((resolve, reject) => {
      this.resolveFinished = resolve;
      this.rejectFinished = reject;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.rejectFinished(err);
        return;
      }
      options.onData(chunk, final);
      if (final) this.resolveFinished();
    });
    this.sheet = new ZipDeflate('xl/worksheets/sheet1.xml', { level: this.level as 3 });
    this.zip.add(this.sheet);
  }

  /** Excel row number of the last row written. */
  get rowsWritten(): number {
    return this.rowNumber;
  }

  get dataRows(): number {
    return Math.max(0, this.rowNumber - this.headerRow);
  }

  /**
   * Writes the sheet preamble and the header row. `headerSst` are shared string ids.
   * With `subtotalColumns`, row 1 holds SUBTOTAL(9, …) formulas for those column indexes and the header moves to row 2.
   */
  begin(headerSst: number[], columnWidths: number[], subtotalColumns: number[] = []): void {
    this.columnCount = headerSst.length;
    this.letters = headerSst.map((_, i) => columnLetters(i));
    const totals = subtotalColumns.filter((i) => i < this.columnCount);
    const h = (this.headerRow = totals.length ? 2 : 1);

    const cols = columnWidths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(2)}" customWidth="1"/>`)
      .join('');

    this.write(
      `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
        `<pane ySplit="${h}" topLeftCell="A${h + 1}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="A${h + 1}" sqref="A${h + 1}"/>` +
        '</sheetView></sheetViews>' +
        '<sheetFormatPr defaultRowHeight="15"/>' +
        (cols ? `<cols>${cols}</cols>` : '') +
        '<sheetData>',
    );

    if (totals.length) {
      // shortcut: rows are streamed so the last row is unknown here; the range runs to the sheet end, which SUBTOTAL treats the same.
      let row = '<row r="1">';
      for (const i of totals) {
        const c = this.letters[i];
        row += `<c r="${c}1" s="2"><f>SUBTOTAL(9,${c}${h + 1}:${c}${EXCEL_MAX_ROWS})</f></c>`;
      }
      this.write(row + '</row>');
    }

    this.rowNumber = h;
    let row = `<row r="${h}" ht="20" customHeight="1">`;
    for (let i = 0; i < headerSst.length; i++) {
      row += `<c r="${this.letters[i]}${h}" s="1" t="s"><v>${headerSst[i]}</v></c>`;
    }
    this.write(row + '</row>');
  }

  writeRow(values: EncodedValue[]): void {
    const r = ++this.rowNumber;
    if (r > EXCEL_MAX_ROWS) {
      throw new Error(`Vượt giới hạn ${EXCEL_MAX_ROWS.toLocaleString('vi-VN')} dòng của một sheet Excel.`);
    }
    let row = `<row r="${r}">`;
    const n = Math.min(values.length, this.columnCount);
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (!v) continue;
      const kind = v.charCodeAt(0);
      const ref = `${this.letters[i]}${r}`;
      const raw = v.slice(1);
      if (kind === 115 /* s */) row += `<c r="${ref}" t="s"><v>${raw}</v></c>`;
      else if (kind === 110 /* n */) row += `<c r="${ref}"><v>${raw}</v></c>`;
      else row += `<c r="${ref}" t="${v[0]}"><v>${raw}</v></c>`;
    }
    this.write(row + '</row>');
  }

  async finish(): Promise<void> {
    const lastColumn = columnLetters(Math.max(this.columnCount, 1) - 1);
    const range = `A${this.headerRow}:${lastColumn}${Math.max(this.rowNumber, this.headerRow)}`;
    this.write(
      '</sheetData>' +
        (this.columnCount > 0 ? `<autoFilter ref="${range}"/>` : '') +
        '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
        '</worksheet>',
    );
    this.flush(true);

    this.addDeflated('xl/sharedStrings.xml', this.sharedStringsParts());
    this.addSmall('xl/workbook.xml', this.workbookXml(range));
    this.addSmall('xl/styles.xml', STYLES_XML);
    this.addSmall('xl/_rels/workbook.xml.rels', WORKBOOK_RELS);
    this.addSmall('_rels/.rels', ROOT_RELS);
    this.addSmall('[Content_Types].xml', CONTENT_TYPES);
    this.zip.end();
    await this.finished;
  }

  private write(text: string): void {
    this.pending.push(text);
    this.pendingLength += text.length;
    if (this.pendingLength >= FLUSH_THRESHOLD) this.flush(false);
  }

  private flush(final: boolean): void {
    const text = this.pending.join('');
    this.pending = [];
    this.pendingLength = 0;
    this.sheet.push(this.encoder.encode(text), final);
  }

  private *sharedStringsParts(): Generator<string> {
    yield `${XML_HEAD}<sst xmlns="${MAIN_NS}" count="${this.sst.references}" uniqueCount="${this.sst.items.length}">`;
    let batch = '';
    for (const item of this.sst.items) {
      batch += `<si>${item}</si>`;
      if (batch.length >= FLUSH_THRESHOLD) {
        yield batch;
        batch = '';
      }
    }
    yield batch + '</sst>';
  }

  private addDeflated(name: string, parts: Iterable<string>): void {
    const file = new ZipDeflate(name, { level: this.level as 3 });
    this.zip.add(file);
    for (const part of parts) file.push(this.encoder.encode(part));
    file.push(new Uint8Array(0), true);
  }

  private addSmall(name: string, xml: string): void {
    const file = new ZipPassThrough(name);
    this.zip.add(file);
    file.push(this.encoder.encode(xml), true);
  }

  private workbookXml(range: string): string {
    const name = escapeXml(this.options.sheetName);
    const quoted = this.options.sheetName.replace(/'/g, "''");
    const absolute = range.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
    const filter =
      this.columnCount > 0
        ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${escapeXml(`'${quoted}'!${absolute}`)}</definedName></definedNames>`
        : '';
    return (
      `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      '<bookViews><workbookView/></bookViews>' +
      `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
      filter +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
      '</workbook>'
    );
  }
}

/** Style indexes for MultiSheet / checking-payout (0–2 kept for SingleSheet). */
export const Xf = {
  normal: 0,
  headerNavy: 1,
  moneyBold: 2,
  headerGreen: 3,
  headerYellow: 4,
  title: 5,
  thBank: 6,
  thHinhThuc: 7,
  /** Tong hop group header colors — index 0..9 */
  thGroup: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const,
  thSub: 18,
  sectionHeader: 19,
  noteWarn: 20,
  noteMid: 21,
  money: 22,
  priorityCao: 23,
  priorityTb: 24,
} as const;

const STYLES_XML =
  `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;-#,##0;0"/></numFmts>' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="16">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF00205B"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFBE3D6"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9F2D0"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFCAE2FA"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFC1E5F5"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EAEA"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFC2F1C8"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="25">' +
  // 0 normal
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  // 1 header navy (SingleSheet)
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  // 2 money bold
  '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  // 3 header green (mẫu BO)
  '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 4 header yellow (cột đối chiếu)
  '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 5 title
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  // 6 Tong hop Bank
  '<xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 7 Tong hop Hình thức
  '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 8–17 Tong hop groups (fill 6,7,6,8,9,10,11,11,11,11)
  '<xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 18 subheader Số GD/Số tiền
  '<xf numFmtId="0" fontId="2" fillId="15" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  // 19 section header light yellow
  '<xf numFmtId="0" fontId="4" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  // 20 note warn pink
  '<xf numFmtId="0" fontId="0" fillId="13" borderId="0" xfId="0" applyFill="1"/>' +
  // 21 note mid orange
  '<xf numFmtId="0" fontId="0" fillId="14" borderId="0" xfId="0" applyFill="1"/>' +
  // 22 money
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  // 23 priority Cao
  '<xf numFmtId="0" fontId="2" fillId="13" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  // 24 priority Trung bình
  '<xf numFmtId="0" fontId="0" fillId="14" borderId="0" xfId="0" applyFill="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const WORKBOOK_RELS =
  `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId3" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/>` +
  '</Relationships>';

const ROOT_RELS =
  `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>';

const CONTENT_TYPES =
  `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
  '</Types>';

export type CellValue = string | number | boolean | null | undefined;

interface ActiveSheet {
  name: string;
  index: number;
  sheet: ZipDeflate;
  pending: string[];
  pendingLength: number;
  columnCount: number;
  letters: string[];
  rowNumber: number;
  headerRow: number;
  filterRange: string;
  autoFilter: boolean;
  /** Columns that get money number format when writing numbers. */
  moneyCols: Set<number>;
}

/** Streams a multi-sheet .xlsx with one shared string table. */
export class MultiSheetXlsxWriter {
  readonly sst = new SharedStringTable();
  private readonly zip: Zip;
  private readonly encoder = new TextEncoder();
  private readonly level: number;
  private readonly sheets: { name: string; filterRange: string; autoFilter: boolean }[] = [];
  private active: ActiveSheet | null = null;
  private finished: Promise<void>;
  private resolveFinished!: () => void;
  private rejectFinished!: (error: Error) => void;

  constructor(private readonly options: { level?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; onData: (chunk: Uint8Array, final: boolean) => void }) {
    this.level = options.level ?? 1;
    this.finished = new Promise((resolve, reject) => {
      this.resolveFinished = resolve;
      this.rejectFinished = reject;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.rejectFinished(err);
        return;
      }
      options.onData(chunk, final);
      if (final) this.resolveFinished();
    });
  }

  /**
   * Starts a new sheet. Call `writeRow` then `endSheet` before the next `beginSheet`.
   * `subtotalColumns` are 0-based indexes that get SUBTOTAL(9) on row 1.
   */
  beginSheet(
    name: string,
    headers: string[],
    opts: {
      columnWidths?: number[];
      subtotalColumns?: number[];
      /** Default header cell style (default navy=1). */
      headerStyle?: number;
      /** Per-column header style override. */
      headerStyles?: (number | undefined)[];
    } = {},
  ): void {
    if (this.active) throw new Error('Cần endSheet() trước khi mở sheet mới.');
    const index = this.sheets.length + 1;
    const sheet = new ZipDeflate(`xl/worksheets/sheet${index}.xml`, { level: this.level as 3 });
    this.zip.add(sheet);

    const headerSst = headers.map((h) => this.sst.addText(escapeXml(h)));
    const columnCount = headers.length;
    const letters = headers.map((_, i) => columnLetters(i));
    const totals = (opts.subtotalColumns ?? []).filter((i) => i < columnCount);
    const headerRow = totals.length ? 2 : 1;
    const widths = opts.columnWidths ?? headers.map((h) => Math.min(40, Math.max(10, h.length + 2)));
    const defaultHeaderStyle = opts.headerStyle ?? 1;

    const active: ActiveSheet = {
      name,
      index,
      sheet,
      pending: [],
      pendingLength: 0,
      columnCount,
      letters,
      rowNumber: 0,
      headerRow,
      filterRange: '',
      autoFilter: true,
      moneyCols: new Set(totals),
    };
    this.active = active;

    const cols = widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(2)}" customWidth="1"/>`)
      .join('');

    this.writeActive(
      `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        `<sheetViews><sheetView${index === 1 ? ' tabSelected="1"' : ''} workbookViewId="0">` +
        `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/>` +
        '</sheetView></sheetViews>' +
        '<sheetFormatPr defaultRowHeight="15"/>' +
        (cols ? `<cols>${cols}</cols>` : '') +
        '<sheetData>',
    );

    if (totals.length) {
      let row = '<row r="1">';
      for (const i of totals) {
        const c = letters[i];
        row += `<c r="${c}1" s="2"><f>SUBTOTAL(9,${c}${headerRow + 1}:${c}${EXCEL_MAX_ROWS})</f></c>`;
      }
      this.writeActive(row + '</row>');
    }

    active.rowNumber = headerRow;
    let headerXml = `<row r="${headerRow}" ht="30" customHeight="1">`;
    for (let i = 0; i < headerSst.length; i++) {
      const s = opts.headerStyles?.[i] ?? defaultHeaderStyle;
      headerXml += `<c r="${letters[i]}${headerRow}" s="${s}" t="s"><v>${headerSst[i]}</v></c>`;
    }
    this.writeActive(headerXml + '</row>');
  }

  /** Blank sheet: write every row yourself via `writeRow` (starts at row 1). */
  beginFreeSheet(
    name: string,
    columnCount: number,
    opts: { freezeAt?: number; autoFilter?: boolean; columnWidths?: number[] } = {},
  ): void {
    if (this.active) throw new Error('Cần endSheet() trước khi mở sheet mới.');
    const index = this.sheets.length + 1;
    const sheet = new ZipDeflate(`xl/worksheets/sheet${index}.xml`, { level: this.level as 3 });
    this.zip.add(sheet);
    const letters = Array.from({ length: columnCount }, (_, i) => columnLetters(i));
    const freezeAt = opts.freezeAt ?? 0;
    const widths = opts.columnWidths ?? Array.from({ length: columnCount }, () => 14);
    const active: ActiveSheet = {
      name,
      index,
      sheet,
      pending: [],
      pendingLength: 0,
      columnCount,
      letters,
      rowNumber: 0,
      headerRow: Math.max(freezeAt, 1),
      filterRange: '',
      autoFilter: opts.autoFilter ?? false,
      moneyCols: new Set(),
    };
    this.active = active;
    const cols = widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(2)}" customWidth="1"/>`)
      .join('');
    const pane =
      freezeAt > 0
        ? `<pane ySplit="${freezeAt}" topLeftCell="A${freezeAt + 1}" activePane="bottomLeft" state="frozen"/>` +
          `<selection pane="bottomLeft" activeCell="A${freezeAt + 1}" sqref="A${freezeAt + 1}"/>`
        : '';
    this.writeActive(
      `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        `<sheetViews><sheetView${index === 1 ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>` +
        '<sheetFormatPr defaultRowHeight="15"/>' +
        (cols ? `<cols>${cols}</cols>` : '') +
        '<sheetData>',
    );
  }

  writeRow(values: CellValue[], cellStyles?: (number | null | undefined)[]): void {
    const active = this.active;
    if (!active) throw new Error('Chưa beginSheet().');
    const r = ++active.rowNumber;
    if (r > EXCEL_MAX_ROWS) {
      throw new Error(`Vượt giới hạn ${EXCEL_MAX_ROWS.toLocaleString('vi-VN')} dòng của một sheet Excel.`);
    }
    let row = `<row r="${r}">`;
    const n = Math.min(values.length, active.columnCount);
    for (let i = 0; i < n; i++) {
      const v = values[i];
      if (v === null || v === undefined || v === '') continue;
      const ref = `${active.letters[i]}${r}`;
      const style =
        cellStyles?.[i] != null && cellStyles[i]! > 0
          ? cellStyles[i]!
          : typeof v === 'number' && active.moneyCols.has(i)
            ? Xf.money
            : 0;
      const sAttr = style > 0 ? ` s="${style}"` : '';
      if (typeof v === 'number' && Number.isFinite(v)) {
        row += `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
      } else if (typeof v === 'boolean') {
        row += `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
      } else {
        const id = this.sst.addText(escapeXml(String(v)));
        row += `<c r="${ref}"${sAttr} t="s"><v>${id}</v></c>`;
      }
    }
    this.writeActive(row + '</row>');
  }

  endSheet(): void {
    const active = this.active;
    if (!active) throw new Error('Chưa beginSheet().');
    const lastColumn = columnLetters(Math.max(active.columnCount, 1) - 1);
    const range = `A${active.headerRow}:${lastColumn}${Math.max(active.rowNumber, active.headerRow)}`;
    active.filterRange = range;
    this.writeActive(
      '</sheetData>' +
        (active.autoFilter && active.columnCount > 0 ? `<autoFilter ref="${range}"/>` : '') +
        '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
        '</worksheet>',
    );
    this.flushActive(true);
    this.sheets.push({ name: active.name, filterRange: range, autoFilter: active.autoFilter });
    this.active = null;
  }

  async finish(): Promise<void> {
    if (this.active) this.endSheet();
    if (this.sheets.length === 0) throw new Error('Workbook không có sheet nào.');

    this.addDeflated('xl/sharedStrings.xml', this.sharedStringsParts());
    this.addSmall('xl/workbook.xml', this.workbookXml());
    this.addSmall('xl/styles.xml', STYLES_XML);
    this.addSmall('xl/_rels/workbook.xml.rels', this.workbookRels());
    this.addSmall('_rels/.rels', ROOT_RELS);
    this.addSmall('[Content_Types].xml', this.contentTypes());
    this.zip.end();
    await this.finished;
  }

  private writeActive(text: string): void {
    const active = this.active!;
    active.pending.push(text);
    active.pendingLength += text.length;
    if (active.pendingLength >= FLUSH_THRESHOLD) this.flushActive(false);
  }

  private flushActive(final: boolean): void {
    const active = this.active!;
    const text = active.pending.join('');
    active.pending = [];
    active.pendingLength = 0;
    active.sheet.push(this.encoder.encode(text), final);
  }

  private *sharedStringsParts(): Generator<string> {
    yield `${XML_HEAD}<sst xmlns="${MAIN_NS}" count="${this.sst.references}" uniqueCount="${this.sst.items.length}">`;
    let batch = '';
    for (const item of this.sst.items) {
      batch += `<si>${item}</si>`;
      if (batch.length >= FLUSH_THRESHOLD) {
        yield batch;
        batch = '';
      }
    }
    yield batch + '</sst>';
  }

  private addDeflated(name: string, parts: Iterable<string>): void {
    const file = new ZipDeflate(name, { level: this.level as 3 });
    this.zip.add(file);
    for (const part of parts) file.push(this.encoder.encode(part));
    file.push(new Uint8Array(0), true);
  }

  private addSmall(name: string, xml: string): void {
    const file = new ZipPassThrough(name);
    this.zip.add(file);
    file.push(this.encoder.encode(xml), true);
  }

  private workbookXml(): string {
    const sheetTags = this.sheets
      .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('');
    const defined = this.sheets
      .filter((s) => s.autoFilter)
      .map((s) => {
        const i = this.sheets.indexOf(s);
        const quoted = s.name.replace(/'/g, "''");
        const absolute = s.filterRange.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
        return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(`'${quoted}'!${absolute}`)}</definedName>`;
      })
      .join('');
    return (
      `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      '<bookViews><workbookView/></bookViews>' +
      `<sheets>${sheetTags}</sheets>` +
      (defined ? `<definedNames>${defined}</definedNames>` : '') +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
      '</workbook>'
    );
  }

  private workbookRels(): string {
    const sheetRels = this.sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('');
    const n = this.sheets.length;
    return (
      `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheetRels +
      `<Relationship Id="rId${n + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${n + 2}" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/>` +
      '</Relationships>'
    );
  }

  private contentTypes(): string {
    const sheets = this.sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('');
    return (
      `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '</Types>'
    );
  }
}
