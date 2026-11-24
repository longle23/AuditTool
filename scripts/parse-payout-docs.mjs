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

function readXlsx(path, maxRows = 100) {
  const buf = new Uint8Array(fs.readFileSync(path));
  const files = unzipSync(buf);
  const shared = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : '';
  const strings = parseSharedStrings(shared);
  const workbook = strFromU8(files['xl/workbook.xml']);
  const sheetNames = [...workbook.matchAll(/name="([^"]+)"/g)].map((x) => x[1]);
  console.log('\n==========', path, '==========');
  console.log('sheet names:', sheetNames);

  const sheetFiles = Object.keys(files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (let i = 0; i < sheetFiles.length; i++) {
    const sn = sheetFiles[i];
    const xml = strFromU8(files[sn]);
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
    console.log(`\n--- sheet ${i + 1}: ${sheetNames[i] ?? sn} | rows: ${rows.length} ---`);
    let count = 0;
    for (const row of rows) {
      if (count++ >= maxRows) {
        console.log('...truncated');
        break;
      }
      const cells = [...row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^/]*)\/>/g)];
      const vals = cells.map((c) => {
        const attrs = c[1] || c[3] || '';
        const body = c[2] || '';
        const t = (attrs.match(/t="([^"]+)"/) || [])[1];
        const r = (attrs.match(/r="([^"]+)"/) || [])[1];
        let v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
        if (t === 's') v = strings[Number(v)] ?? v;
        if (t === 'inlineStr')
          v = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
        return `${r || ''}=${v}`;
      });
      console.log(vals.join(' | '));
    }
  }
}

readXlsx('public/Mo ta  xu ly Checking Payout.xlsx', 120);
readXlsx('public/Test_Payout_ket_qua_tat_ca_ngan_hang.xlsx', 40);
