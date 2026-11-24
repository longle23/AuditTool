import fs from 'node:fs';
import path from 'node:path';
import { runCheckingPayout } from '../lib/checking-payout/run';
import { blobSource } from '../lib/xlsx/byte-source';

async function main() {
  const filePath = 'public/Test_Payout_ket_qua_tat_ca_ngan_hang.xlsx';
  const buf = fs.readFileSync(filePath);
  const file = new File([buf], path.basename(filePath));

  const chunks: Uint8Array[] = [];
  const result = await runCheckingPayout(blobSource(file), {
    onData: (c) => chunks.push(c),
    onProgress: (p) => console.log(`${Math.round(p.fraction * 100)}% ${p.message}`),
  });

  const out = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  fs.writeFileSync('scripts/smoke-checking-out.xlsx', out);
  console.log('summary', JSON.stringify(result.summary, null, 2));
  console.log('anomalies', result.anomalies.length);
  console.log('wrote scripts/smoke-checking-out.xlsx', out.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
