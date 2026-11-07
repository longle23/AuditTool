import type { ByteSource } from './byte-source';
import { columnIndex, getAttr, unescapeXml } from './xml';
import { ZipReader, type ZipEntry } from './zip-reader';

export interface RawCell {
  col: number;
  /** Cell type attribute (`s`, `str`, `inlineStr`, `b`, `e`, `d`, `n`) or empty for numbers. */
  type: string;
  /** Escaped XML content of `<v>`, if present. */
  value?: string;
  /** Inner XML of `<is>` for inline strings. */
  inline?: string;
}

export interface WorkbookHandle {
  zip: ZipReader;
  sheetName: string;
  sheet: ZipEntry;
  sharedStrings?: ZipEntry;
}

export async function openWorkbook(source: ByteSource): Promise<WorkbookHandle> {
  const zip = await ZipReader.open(source);
  const workbookEntry = zip.find('xl/workbook.xml');
  if (!workbookEntry) throw new Error('File không phải định dạng Excel .xlsx.');

  const workbookXml = await zip.readText(workbookEntry);
  const sheetTags = workbookXml.match(/<sheet\b[^>]*>/g) ?? [];
  const sheetTag = sheetTags.find((tag) => getAttr(tag, 'state') !== 'hidden') ?? sheetTags[0];
  if (!sheetTag) throw new Error('File Excel không có sheet nào.');

  const sheetName = unescapeXml(getAttr(sheetTag, 'name') ?? 'Sheet1');
  const relId = getAttr(sheetTag, 'r:id');

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const relsEntry = zip.find('xl/_rels/workbook.xml.rels');
  if (relId && relsEntry) {
    const relsXml = await zip.readText(relsEntry);
    const rel = (relsXml.match(/<Relationship\b[^>]*>/g) ?? []).find((tag) => getAttr(tag, 'Id') === relId);
    const target = rel && getAttr(rel, 'Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }

  const sheet = zip.find(sheetPath);
  if (!sheet) throw new Error(`Không tìm thấy dữ liệu sheet "${sheetName}".`);

  return { zip, sheetName, sheet, sharedStrings: zip.find('xl/sharedStrings.xml') };
}

/** Returns the inner XML of each `<si>` item. Stops after `limit` items when given. */
export async function readSharedStrings(wb: WorkbookHandle, limit = Infinity): Promise<string[]> {
  const items: string[] = [];
  if (!wb.sharedStrings || limit <= 0) return items;

  const decoder = new TextDecoder('utf-8');
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let buffer = '';

  await wb.zip.stream(wb.sharedStrings, (chunk, final) => {
    buffer += decoder.decode(chunk, { stream: !final });
    const end = final ? buffer.length : buffer.lastIndexOf('</si>') + 5;
    if (end < 5) return;
    const complete = buffer.slice(0, end);
    buffer = buffer.slice(end);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(complete))) {
      items.push(m[1] ?? '');
      if (items.length >= limit) return false;
    }
  });

  return items;
}

export interface SheetStreamInfo {
  /** Last row number declared in `<dimension>`, if present. */
  dimensionRows?: number;
}

const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const COL_RE = /\br="([A-Z]+)\d*"/;
const TYPE_RE = /\bt="(\w+)"/;

function parseCells(rowXml: string): RawCell[] {
  const cells: RawCell[] = [];
  let position = 0;
  CELL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CELL_RE.exec(rowXml))) {
    const attrs = m[1];
    const inner = m[2];
    const colMatch = COL_RE.exec(attrs);
    const col = colMatch ? columnIndex(colMatch[1]) : position;
    position = col + 1;
    if (!inner) continue;

    const typeMatch = TYPE_RE.exec(attrs);
    const type = typeMatch ? typeMatch[1] : '';
    const cell: RawCell = { col, type };

    if (type === 'inlineStr') {
      const start = inner.indexOf('<is>');
      const end = inner.lastIndexOf('</is>');
      if (start < 0 || end < 0) continue;
      cell.inline = inner.slice(start + 4, end);
    } else {
      const vOpen = inner.indexOf('<v');
      if (vOpen < 0) continue;
      const vStart = inner.indexOf('>', vOpen);
      if (inner.charCodeAt(vStart - 1) === 47 /* "/" */) continue;
      const vEnd = inner.indexOf('</v>', vStart);
      if (vEnd < 0) continue;
      cell.value = inner.slice(vStart + 1, vEnd);
    }
    cells.push(cell);
  }
  return cells;
}

/**
 * Streams the rows of a sheet in file order. `onRow` may return `false` to stop reading.
 * Empty rows are skipped.
 */
export async function streamRows(
  wb: WorkbookHandle,
  onRow: (cells: RawCell[]) => boolean | void,
  onProgress?: (compressedBytesRead: number) => void,
  info: SheetStreamInfo = {},
): Promise<void> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let inData = false;
  let done = false;

  const processRows = (text: string) => {
    ROW_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ROW_RE.exec(text))) {
      if (!m[2]) continue;
      const cells = parseCells(m[2]);
      if (cells.length === 0) continue;
      if (onRow(cells) === false) {
        done = true;
        return;
      }
    }
  };

  await wb.zip.stream(
    wb.sheet,
    (chunk, final) => {
      buffer += decoder.decode(chunk, { stream: !final });

      if (!inData) {
        const start = buffer.indexOf('<sheetData');
        if (start < 0) {
          if (!final && buffer.length > 1_000_000) buffer = buffer.slice(-1000);
          return;
        }
        const dim = /<dimension\b[^>]*\bref="[A-Z]*\d+(?::[A-Z]*(\d+))?"/.exec(buffer.slice(0, start));
        if (dim) info.dimensionRows = Number(dim[1] ?? 1);
        const tagEnd = buffer.indexOf('>', start);
        if (tagEnd < 0) return;
        if (buffer.charCodeAt(tagEnd - 1) === 47 /* "<sheetData/>" */) return false;
        buffer = buffer.slice(tagEnd + 1);
        inData = true;
      }

      const dataEnd = buffer.indexOf('</sheetData>');
      if (dataEnd >= 0) {
        processRows(buffer.slice(0, dataEnd));
        buffer = '';
        return false;
      }

      const cut = buffer.lastIndexOf('</row>');
      if (cut < 0) return;
      const complete = buffer.slice(0, cut + 6);
      buffer = buffer.slice(cut + 6);
      processRows(complete);
      if (done) return false;
    },
    onProgress,
  );
}
