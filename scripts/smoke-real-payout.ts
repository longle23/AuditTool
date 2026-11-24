import fs from 'node:fs';
import path from 'node:path';
import { listSheets } from '../lib/xlsx/sheet-reader';
import { blobSource } from '../lib/xlsx/byte-source';
import { classifyDetectedSheets } from '../lib/checking-payout/parse';
import { runCheckingPayout } from '../lib/checking-payout/run';

async function main() {
  const filePath = path.join('public', 'Data thật để test tool', 'Check Payout 19.11.2026.xlsx');
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

  const outDir = path.join('public', 'Data thật để test tool');
  const outPath = path.join(outDir, 'Check Payout 19.11.2026_ketqua.xlsx');
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
  console.log('\nTheo ngân hàng:');
  for (const b of result.summary.banks) {
    console.log(
      `  ${b.bank.padEnd(8)} BO=${b.boRows}  SK nợ=${b.skDebitRows}  khớp=${b.matched}  lệch=${b.mismatches}`,
    );
  }

  console.log('\nCân đối:');
  for (const b of result.balance) {
    console.log(
      `  ${b.bank.padEnd(24)} SK lệch SL=${b.skDebitCount - b.skGroupCount}  tiền=${b.skDebitAmount - b.skGroupAmount}  BO lệch SL=${b.boCount - b.boGroupCount}`,
    );
  }

  if (result.anomalies.length) {
    console.log('\nBất thường (mẫu tối đa 15):');
    for (const a of result.anomalies.slice(0, 15)) {
      console.log(`  [${a.bank}] ${a.nhom} | ${a.maGd || '-'} | ${a.soTien ?? '-'} | ${a.ghiChu.slice(0, 100)}`);
    }
  }

  console.log(`\nWrote: ${outPath} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
