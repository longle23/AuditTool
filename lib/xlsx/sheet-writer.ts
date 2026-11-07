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

  get rowsWritten(): number {
    return this.rowNumber;
  }

  /** Writes the sheet preamble and the header row. `headerSst` are shared string ids. */
  begin(headerSst: number[], columnWidths: number[]): void {
    this.columnCount = headerSst.length;
    this.letters = headerSst.map((_, i) => columnLetters(i));

    const cols = columnWidths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(2)}" customWidth="1"/>`)
      .join('');

    this.write(
      `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
        '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
        '</sheetView></sheetViews>' +
        '<sheetFormatPr defaultRowHeight="15"/>' +
        (cols ? `<cols>${cols}</cols>` : '') +
        '<sheetData>',
    );

    this.rowNumber = 1;
    let row = '<row r="1" ht="20" customHeight="1">';
    for (let i = 0; i < headerSst.length; i++) {
      row += `<c r="${this.letters[i]}1" s="1" t="s"><v>${headerSst[i]}</v></c>`;
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
    const range = `A1:${lastColumn}${Math.max(this.rowNumber, 1)}`;
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
      '</workbook>'
    );
  }
}

const STYLES_XML =
  `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF00205B"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
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
