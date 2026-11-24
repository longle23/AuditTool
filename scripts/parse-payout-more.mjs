import fs from 'fs';
import { unzipSync, strFromU8 } from 'fflate';

function parseSharedStrings(shared) {
  const strings = [];
  const re = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(shared))) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) =>
      x[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
    );
    strings.push(texts.join(''));
  }
  return strings;
}

function getCellVal(attrs, body, strings) {
  const t = (attrs.match(/t="([^"]+)"/) || [])[1];
  let v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
  if (t === 's') v = strings[Number(v)] ?? v;
  if (t === 'inlineStr') v = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
  return v.replace(/&#10;/g, '\n');
}

function readSheetRows(files, sheetPath, strings, maxRows = 50, startRow = 0) {
  const xml = strFromU8(files[sheetPath]);
  const rows = [...xml.matchAll(/<row[^>]* r="(\d+)"[^>]*>([\s\S]*?)<\/row>|<row[^>]*>([\s\S]*?)<\/row>/g)];
  const out = [];
  let n = 0;
  for (const row of rows) {
    const rnum = Number(row[1] || 0);
    if (startRow && rnum && rnum < startRow) continue;
    if (n++ >= maxRows) break;
    const body = row[2] || row[3] || '';
    const cells = [...body.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^/]*)\/>/g)];
    const vals = {};
    for (const c of cells) {
      const attrs = c[1] || c[3] || '';
      const r = (attrs.match(/r="([A-Z]+)(\d+)"/) || []);
      const col = r[1];
      if (!col) continue;
      vals[col] = getCellVal(attrs, c[2] || '', strings);
    }
    out.push({ r: rnum, vals });
  }
  return out;
}

const path = 'public/Test_Payout_ket_qua_tat_ca_ngan_hang.xlsx';
const buf = new Uint8Array(fs.readFileSync(path));
const files = unzipSync(buf);
const strings = parseSharedStrings(strFromU8(files['xl/sharedStrings.xml']));
const workbook = strFromU8(files['xl/workbook.xml']);
const sheetNames = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((tag) => {
  const name = (tag[0].match(/name="([^"]+)"/) || [])[1];
  const id = (tag[0].match(/r:id="([^"]+)"/) || [])[1];
  return { name, id };
});
const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const relMap = {};
for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
  relMap[m[1]] = m[2].startsWith('/') ? m[2].slice(1) : `xl/${m[2].replace(/^\.\//, '')}`;
}

function findSheet(namePart) {
  const s = sheetNames.find((x) => x.name.includes(namePart));
  return { ...s, path: relMap[s.id] };
}

// PIVORT full
{
  const s = findSheet('PIVORT');
  console.log('\n==== PIVORT ====');
  for (const row of readSheetRows(files, s.path, strings, 30)) {
    console.log('R' + row.r, Object.entries(row.vals).map(([k, v]) => `${k}=${v}`).join(' | '));
  }
}

// Bất thường
{
  const s = findSheet('Bất thường');
  console.log('\n==== Bất thường ====');
  for (const row of readSheetRows(files, s.path, strings, 40)) {
    console.log('R' + row.r, Object.entries(row.vals).map(([k, v]) => `${k}=${v}`).join(' | '));
  }
}

// BIDV header + a few matched/unmatched
{
  const s = findSheet('Sao ke BIDV');
  console.log('\n==== Sao ke BIDV headers + sample ====');
  for (const row of readSheetRows(files, s.path, strings, 25)) {
    console.log('R' + row.r, Object.entries(row.vals).map(([k, v]) => `${k}=${String(v).slice(0, 80)}`).join(' | '));
  }
}

// MSB header
{
  const s = findSheet('Sao ke MSB');
  console.log('\n==== Sao ke MSB headers ====');
  for (const row of readSheetRows(files, s.path, strings, 15)) {
    console.log('R' + row.r, Object.entries(row.vals).map(([k, v]) => `${k}=${String(v).slice(0, 80)}`).join(' | '));
  }
}

// KLB header
{
  const s = findSheet('Sao ke KLB');
  console.log('\n==== Sao ke KLB headers ====');
  for (const row of readSheetRows(files, s.path, strings, 15)) {
    console.log('R' + row.r, Object.entries(row.vals).map(([k, v]) => `${k}=${String(v).slice(0, 80)}`).join(' | '));
  }
}

// BO KLB_VietQRPay
{
  const s = findSheet('BO KLB_VietQRPay');
  console.log('\n==== BO KLB_VietQRPay headers ====');
  for (const row of readSheetRows(files, s.path, strings, 8)) {
    console.log('R' + row.r, Object.entries(row.vals).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(' | '));
  }
}

// Count note categories on BO
{
  const s = findSheet('BO 28.10');
  const xml = strFromU8(files[s.path]);
  // Find column L notes via shared string indices - too hard. Just sample mismatched notes
  console.log('\n==== BO note samples (scan shared strings for note keywords) ====');
  const notes = new Map();
  for (const str of strings) {
    if (
      str.includes('Khớp') ||
      str.includes('BO có') ||
      str.includes('Sao kê có') ||
      str.includes('Lệch') ||
      str.includes('Review') ||
      str.includes('FAILED') ||
      str.includes('Payin') ||
      str.includes('GD ngày')
    ) {
      // only short-ish note-like
      if (str.length < 200) notes.set(str, (notes.get(str) || 0) + 1);
    }
  }
  // That's just unique strings in sharedStrings, not counts. Print unique note-like strings
  console.log([...notes.keys()].slice(0, 80).join('\n---\n'));
}
