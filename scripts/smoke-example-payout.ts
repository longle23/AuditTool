import fs from 'node:fs';
import path from 'node:path';
import { listSheets } from '../lib/xlsx/sheet-reader';
import { blobSource } from '../lib/xlsx/byte-source';
import { classifyDetectedSheets } from '../lib/checking-payout/parse';
import { runCheckingPayout } from '../lib/checking-payout/run';

async function main() {
  const filePath = path.join('public', 'Data Example', 'Check payout 17.11.2026.xlsx');
  if (!fs.existsSync(filePath)) throw new Error(`Không thấy file: ${filePath}`);

  const buf = fs.readFileSync(filePath);
  const file = new File([buf], path.basename(filePath));
  const source = blobSource(file);

  const { sheets } = await listSheets(source);
  const visible = sheets.filter((s) => !s.hidden && !s.name.startsWith('_')).map((s) => s.name);
  console.log('=== Sheets ===');
  for (const s of classifyDetectedSheets(visible)) console.log(`  [${s.role}] ${s.name}`);

  const chunks: Uint8Array[] = [];
  const started = Date.now();
  const result = await runCheckingPayout(source, {
    onData: (c) => chunks.push(c),
    onProgress: (p) => console.log(`${Math.round(p.fraction * 100)}% ${p.message}`),
  });

  const outPath = path.join('public', 'Data Example', 'Check_payout_17.11.2026_ketqua.xlsx');
  const out = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  fs.writeFileSync(outPath, out);

  console.log('\n=== Summary ===');
  console.log(`Kỳ: ${result.summary.periodLabel || '(trống)'}`);
  console.log(`Khớp: ${result.summary.matched}`);
  console.log(`BO thiếu trên SK: ${result.summary.boMissingOnSk}`);
  console.log(`SK thiếu trên BO: ${result.summary.skMissingOnBo}`);
  console.log(`Lệch tiền: ${result.summary.amountMismatch}`);
  console.log(`Bất thường: ${result.anomalies.length}`);
  console.log(`Thời gian: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`\nWrote: ${outPath} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
