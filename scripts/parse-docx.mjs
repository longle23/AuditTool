import fs from 'fs';
import { unzipSync, strFromU8 } from 'fflate';

const buf = new Uint8Array(fs.readFileSync('public/Mo ta Checking Payout_Claude.docx'));
const files = unzipSync(buf);
const doc = strFromU8(files['word/document.xml']);
const texts = [...doc.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
  m[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"'),
);
// Reconstruct paragraphs roughly
const paras = doc.split(/<\/w:p>/).map((p) => {
  const ts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
    m[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"'),
  );
  return ts.join('');
});
console.log(paras.filter((p) => p.trim()).join('\n'));
