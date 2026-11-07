import { Inflate } from 'fflate';
import type { ByteSource } from './byte-source';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const READ_CHUNK = 2 * 1024 * 1024;

const utf8 = new TextDecoder('utf-8');

function u64(view: DataView, offset: number): number {
  return view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 0x100000000;
}

export class ZipReader {
  private constructor(
    private readonly source: ByteSource,
    readonly entries: Map<string, ZipEntry>,
  ) {}

  static async open(source: ByteSource): Promise<ZipReader> {
    const tailLength = Math.min(source.size, 22 + 0xffff + 20);
    const tailOffset = source.size - tailLength;
    const tail = await source.read(tailOffset, tailLength);
    const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tailView.getUint32(i, true) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Không phải file .xlsx hợp lệ (không đọc được cấu trúc zip).');

    let entryCount = tailView.getUint16(eocd + 10, true);
    let cdSize = tailView.getUint32(eocd + 12, true);
    let cdOffset = tailView.getUint32(eocd + 16, true);

    const locator = eocd - 20;
    if (locator >= 0 && tailView.getUint32(locator, true) === ZIP64_EOCD_LOCATOR_SIGNATURE) {
      const zip64Offset = u64(tailView, locator + 8);
      const rec = await source.read(zip64Offset, 56);
      const recView = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
      if (recView.getUint32(0, true) === ZIP64_EOCD_SIGNATURE) {
        entryCount = u64(recView, 32);
        cdSize = u64(recView, 40);
        cdOffset = u64(recView, 48);
      }
    }

    const cd = await source.read(cdOffset, cdSize);
    const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const entries = new Map<string, ZipEntry>();
    let p = 0;
    for (let i = 0; i < entryCount && p + 46 <= cd.length; i++) {
      if (view.getUint32(p, true) !== CENTRAL_SIGNATURE) break;
      const method = view.getUint16(p + 10, true);
      let compressedSize = view.getUint32(p + 20, true);
      let uncompressedSize = view.getUint32(p + 24, true);
      const nameLength = view.getUint16(p + 28, true);
      const extraLength = view.getUint16(p + 30, true);
      const commentLength = view.getUint16(p + 32, true);
      let localHeaderOffset = view.getUint32(p + 42, true);
      const name = utf8.decode(cd.subarray(p + 46, p + 46 + nameLength));

      let e = p + 46 + nameLength;
      const extraEnd = e + extraLength;
      while (e + 4 <= extraEnd) {
        const id = view.getUint16(e, true);
        const size = view.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompressedSize === 0xffffffff) { uncompressedSize = u64(view, q); q += 8; }
          if (compressedSize === 0xffffffff) { compressedSize = u64(view, q); q += 8; }
          if (localHeaderOffset === 0xffffffff) { localHeaderOffset = u64(view, q); }
        }
        e += 4 + size;
      }

      entries.set(name.replace(/^\/+/, ''), { name, method, compressedSize, uncompressedSize, localHeaderOffset });
      p = extraEnd + commentLength;
    }

    return new ZipReader(source, entries);
  }

  find(path: string): ZipEntry | undefined {
    const direct = this.entries.get(path);
    if (direct) return direct;
    const lower = path.toLowerCase();
    for (const [name, entry] of this.entries) {
      if (name.toLowerCase() === lower) return entry;
    }
    return undefined;
  }

  /**
   * Streams the decompressed bytes of an entry. `onData` may return `false` to stop early.
   * `onProgress` receives the number of compressed bytes consumed so far.
   */
  async stream(
    entry: ZipEntry,
    onData: (chunk: Uint8Array, final: boolean) => boolean | void,
    onProgress?: (compressedBytesRead: number) => void,
  ): Promise<void> {
    const header = await this.source.read(entry.localHeaderOffset, 30);
    const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (headerView.getUint32(0, true) !== LOCAL_SIGNATURE) {
      throw new Error(`Không đọc được "${entry.name}" trong file zip.`);
    }
    const dataStart =
      entry.localHeaderOffset + 30 + headerView.getUint16(26, true) + headerView.getUint16(28, true);

    let stopped = false;
    let inflater: Inflate | null = null;
    if (entry.method === 8) {
      inflater = new Inflate((chunk, final) => {
        if (!stopped && onData(chunk, final) === false) stopped = true;
      });
    } else if (entry.method !== 0) {
      throw new Error(`Kiểu nén không được hỗ trợ (${entry.method}) trong "${entry.name}".`);
    }

    let read = 0;
    while (read < entry.compressedSize && !stopped) {
      const length = Math.min(READ_CHUNK, entry.compressedSize - read);
      const chunk = await this.source.read(dataStart + read, length);
      read += length;
      const final = read >= entry.compressedSize;
      if (inflater) inflater.push(chunk, final);
      else if (onData(chunk, final) === false) stopped = true;
      onProgress?.(read);
    }
    if (entry.compressedSize === 0 && !stopped) onData(new Uint8Array(0), true);
  }

  async readText(entry: ZipEntry): Promise<string> {
    const decoder = new TextDecoder('utf-8');
    let text = '';
    await this.stream(entry, (chunk, final) => {
      text += decoder.decode(chunk, { stream: !final });
    });
    return text;
  }
}
