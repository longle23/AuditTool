import {
  boMatchKey,
  isPayoutMethod,
  isSucceeded,
  looksLikePayinDebitReversal,
  looksLikeRefund,
  normKey,
} from './banks';
import { extractBidvDescDate, formatYmdNote, isInPeriod, ymdToLabel } from './dates';
import type { AnomalyRow, CheckingProgress, ReconcileSummary, VietQrRow } from './types';
import type { parseCheckingWorkbook } from './parse';

type ParseResult = Awaited<ReturnType<typeof parseCheckingWorkbook>>;

const PIVOT_GROUPS = [
  'khop',
  'review',
  'khop_khac_ngay',
  'khop_refund',
  'bo_review_thieu_sk',
  'sk_thieu_bo',
  'bo_thieu_sk',
  'khac_ngay',
  'lech_tien',
  'failed',
] as const;

export type PivotGroup = (typeof PIVOT_GROUPS)[number];

export function noteGroup(note: string): PivotGroup | 'other' {
  const n = note;
  if (!n) return 'other';
  // Mẫu: khớp VietQR/hoàn tiền cùng ngày → cột khớp; khác ngày → cột khớp khác ngày
  if (n.startsWith('Khớp (khác ngày BO)')) return 'khop_khac_ngay';
  if (n === 'Khớp' || n.startsWith('Khớp')) return 'khop';
  if (n.startsWith('Review')) return 'review';
  if (n.includes('BO có, sao kê chưa')) return 'bo_review_thieu_sk';
  if (n.includes('Hoàn tiền VietQR chưa') || n.includes('Refund (hoàn tiền)')) return 'sk_thieu_bo';
  if (n.includes('Sao kê có, BO chưa có')) return 'sk_thieu_bo';
  if (n.startsWith('GD ngày')) return 'khac_ngay';
  if (n.startsWith('Lệch số tiền')) return 'lech_tien';
  if (n.startsWith('BO FAILED') || n.includes('Thất bại')) return 'failed';
  if (n === 'GD Payin') return 'other';
  return 'other';
}

/** Ưu tiên sheet Bất thường — theo mẫu DOI_SOAT. */
export function anomalyPriority(nhom: string, ghiChu: string): 'Cao' | 'Trung bình' | 'Thấp' {
  const t = `${nhom} ${ghiChu}`;
  if (/Review|CẢNH BÁO|lệch số tiền|Lệch số tiền/i.test(t)) return 'Cao';
  if (/BO có, sao kê chưa|FAILED/i.test(t)) return 'Trung bình';
  return 'Thấp';
}

function moneyEq(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 0.5;
}

function indexByKey(rows: { matchKey: string }[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const k = rows[i].matchKey;
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(i);
    else map.set(k, [i]);
  }
  return map;
}

export interface ReconcileOutput {
  anomalies: AnomalyRow[];
  summary: ReconcileSummary;
}

export function reconcileWorkbook(parsed: ParseResult, onProgress?: (p: CheckingProgress) => void): ReconcileOutput {
  onProgress?.({ phase: 'reconcile', message: 'Đang đối soát 2 chiều…', fraction: 0.75 });
  const { bo, boPrev, statements, vietQr, periodSet, periodDays, periodLabel } = parsed;
  const anomalies: AnomalyRow[] = [];

  // Prepare BO match keys
  for (const row of bo.rows) {
    if (!row.bank) {
      row.matchKey = '';
      continue;
    }
    row.matchKey = boMatchKey(row.bank, row);
    row.computeDiff = isSucceeded(row.trangThai) && isPayoutMethod(row.phuongThuc);
  }
  if (boPrev) {
    for (const row of boPrev.rows) {
      if (!row.bank) continue;
      row.matchKey = boMatchKey(row.bank, row);
      row.computeDiff = false;
    }
  }

  const vietQrByMa = new Map<string, VietQrRow>();
  if (vietQr) {
    for (const r of vietQr.rows) {
      if (r.maNganHang) vietQrByMa.set(r.maNganHang.trim(), r);
    }
  }

  const bankSummaries: ReconcileSummary['banks'] = [];

  for (const sk of statements) {
    const bank = sk.bank;
    const boRows = bo.rows.filter((r) => r.bank === bank);
    for (const r of boRows) r.matchKey = boMatchKey(bank, r);

    const boIndex = indexByKey(boRows);
    // Agribank: also index by 6 số cuối for older format
    if (bank === 'AGRIBANK') {
      for (let i = 0; i < boRows.length; i++) {
        const short = boRows[i].maGd2 || boRows[i].maGd.slice(-6);
        if (!short || boIndex.has(short)) continue;
        boIndex.set(short, [i]);
      }
    }

    const boPrevRows = (boPrev?.rows ?? []).filter((r) => r.bank === bank);
    const boPrevIndex = indexByKey(boPrevRows);

    const skDebits = sk.rows.filter((r) => r.isDebit);
    const skIndex = indexByKey(skDebits);

    const usedSk = new Set<number>();
    const usedBo = new Set<number>();

    let matched = 0;
    let mismatches = 0;

    // BO → SK
    for (const brow of boRows) {
      const status = normKey(brow.trangThai);
      if (!brow.matchKey) {
        if (brow.computeDiff || status === 'review' || status === 'pending') {
          brow.note = `BO có, sao kê chưa cắt tiền – Mã GD ngân hàng: ${brow.maGdNganHang || '-'} – trạng thái BO: ${brow.trangThai}`;
          anomalies.push({
            bank,
            nhom: 'BO có, sao kê chưa cắt tiền',
            nguon: 'BO',
            maGd: brow.maGd,
            soTien: brow.soTienChi,
            thoiGian: brow.thoiGian,
            ghiChu: brow.note,
          });
          mismatches++;
        } else if (status.includes('fail')) {
          brow.note = `BO FAILED – ${brow.trangThai}`;
        }
        continue;
      }

      const candidates = (skIndex.get(brow.matchKey) ?? []).filter((i) => !usedSk.has(i));
      if (candidates.length === 0) {
        // KLB: try VietQR
        if (bank === 'KLB' && vietQrByMa.has(brow.matchKey)) {
          const v = vietQrByMa.get(brow.matchKey)!;
          v.skDebit = null;
          // will be filled from SK side if present
        }

        if (status.includes('fail')) {
          brow.note = `BO FAILED – ${brow.trangThai}`;
        } else if (status === 'review' || status === 'pending' || brow.computeDiff) {
          brow.note = `BO có, sao kê chưa cắt tiền – Mã GD ngân hàng: ${brow.maGdNganHang || '-'} – trạng thái BO: ${brow.trangThai}`;
          anomalies.push({
            bank,
            nhom: 'BO có, sao kê chưa cắt tiền',
            nguon: 'BO',
            maGd: brow.maGd,
            soTien: brow.soTienChi,
            thoiGian: brow.thoiGian,
            ghiChu: brow.note,
          });
          mismatches++;
        }
        continue;
      }

      const skIdx = candidates[0];
      const srow = skDebits[skIdx];
      usedSk.add(skIdx);
      usedBo.add(boRows.indexOf(brow));

      brow.skDebit = srow.debit;
      srow.boSoTienChi = brow.soTienChi;

      const sameDay = !srow.ngayYmd || isInPeriod(srow.ngayYmd, periodSet) || srow.ngayYmd === brow.ngayYmd;
      const amountOk = moneyEq(brow.soTienChi, srow.debit);

      if (brow.computeDiff) {
        brow.chenhLech = (brow.soTienChi ?? 0) - (srow.debit ?? 0);
        srow.chenhLech = (srow.debit ?? 0) - (brow.soTienChi ?? 0);
      }

      if (!amountOk) {
        brow.note = `Lệch số tiền – BO ${fmt(brow.soTienChi)}, sao kê ${fmt(srow.debit)}`;
        srow.note = brow.note;
        anomalies.push({
          bank,
          nhom: 'Khớp mã, lệch số tiền',
          nguon: 'Sao kê',
          maGd: srow.matchKey || brow.matchKey,
          soTien: srow.debit,
          thoiGian: srow.thoiGian || srow.ngayYmd || '',
          ghiChu: brow.note,
        });
        mismatches++;
      } else if (!sameDay && srow.ngayYmd) {
        const note = `Khớp (khác ngày BO) – GD ngày ${ymdToLabel(srow.ngayYmd)}`;
        brow.note = note;
        srow.note = note;
        matched++;
      } else if (status === 'review') {
        const note = `Review – sao kê đã báo nợ, BO đang review`;
        brow.note = note;
        srow.note = note;
        matched++;
      } else {
        brow.note = 'Khớp';
        srow.note = 'Khớp';
        matched++;
      }
    }

    // SK → BO for unmatched debit rows
    for (let i = 0; i < skDebits.length; i++) {
      if (usedSk.has(i)) continue;
      const srow = skDebits[i];

      if (looksLikePayinDebitReversal(srow.debit, srow.credit) && (srow.debit === null || srow.debit === 0)) {
        srow.note = 'GD Payin';
        continue;
      }

      // Outside period
      if (srow.ngayYmd && !isInPeriod(srow.ngayYmd, periodSet)) {
        srow.note = formatYmdNote(srow.ngayYmd);
        continue;
      }

      // Credit-only already filtered; check payin via credit on same conceptual line
      if (!srow.isDebit) {
        srow.note = 'GD Payin';
        continue;
      }

      // VietQR fallback for KLB
      if (bank === 'KLB' && srow.matchKey && vietQrByMa.has(srow.matchKey)) {
        const v = vietQrByMa.get(srow.matchKey)!;
        v.skDebit = srow.debit;
        if (v.giaTri !== null && srow.debit !== null) v.chenhLech = v.giaTri - srow.debit;
        const sameDay = !srow.ngayYmd || isInPeriod(srow.ngayYmd, periodSet);
        if (moneyEq(v.giaTri, srow.debit)) {
          const note = sameDay
            ? 'Khớp – hoàn tiền VietQR (BO KLB_VietQRPay)'
            : `Khớp (khác ngày BO) – hoàn tiền VietQR, GD ngày ${srow.ngayYmd ? ymdToLabel(srow.ngayYmd) : ''}`;
          srow.note = note;
          v.note = note;
          srow.boSoTienChi = v.giaTri;
          srow.vietQrMatch = true;
          matched++;
        } else {
          srow.note = `Lệch số tiền – VietQR ${fmt(v.giaTri)}, sao kê ${fmt(srow.debit)}`;
          v.note = srow.note;
          mismatches++;
        }
        usedSk.add(i);
        continue;
      }

      // BO ngày trước (KLB) fallback
      if (srow.matchKey && boPrevIndex.has(srow.matchKey)) {
        const prev = boPrevRows[boPrevIndex.get(srow.matchKey)![0]];
        srow.boSoTienChi = prev.soTienChi;
        if (moneyEq(prev.soTienChi, srow.debit)) {
          const day = prev.ngayYmd ? ymdToLabel(prev.ngayYmd) : srow.ngayYmd ? ymdToLabel(srow.ngayYmd) : '';
          srow.note = `Khớp (khác ngày BO) – GD ngày ${day} (BO ngày trước)`;
          matched++;
        } else {
          srow.note = `Lệch số tiền – BO ngày trước ${fmt(prev.soTienChi)}, sao kê ${fmt(srow.debit)}`;
          mismatches++;
        }
        usedSk.add(i);
        continue;
      }

      if (looksLikeRefund(srow.rawDesc)) {
        const note =
          bank === 'KLB'
            ? `Hoàn tiền VietQR chưa có trên BO KLB_VietQRPay: ${srow.rawDesc}`
            : `Refund (hoàn tiền) – chưa có trên BO: ${srow.rawDesc}`;
        srow.note = note;
        anomalies.push({
          bank,
          nhom: 'Refund (chưa khớp)',
          nguon: 'Sao kê',
          maGd: srow.matchKey,
          soTien: srow.debit,
          thoiGian: srow.thoiGian || srow.ngayYmd || '',
          ghiChu: note,
        });
        mismatches++;
        continue;
      }

      // BIDV: check desc date before period
      if (bank === 'BIDV') {
        const d = extractBidvDescDate(srow.rawDesc);
        if (d && !isInPeriod(d, periodSet)) {
          srow.note = `${formatYmdNote(d)} (khác ngày báo cáo)`;
          continue;
        }
      }

      // Unmatched in period
      if (!srow.matchKey) {
        // no extractable code — still note if debit in period
        if (srow.ngayYmd && isInPeriod(srow.ngayYmd, periodSet)) {
          srow.note = `Sao kê có, BO chưa có – kiểm tra diễn giải: ${srow.rawDesc}`;
          anomalies.push({
            bank,
            nhom: 'Sao kê có, BO chưa có',
            nguon: 'Sao kê',
            maGd: '',
            soTien: srow.debit,
            thoiGian: srow.thoiGian || srow.ngayYmd || '',
            ghiChu: srow.note,
          });
          mismatches++;
        } else if (srow.ngayYmd) {
          srow.note = formatYmdNote(srow.ngayYmd);
        }
        continue;
      }

      const boHits = boIndex.get(srow.matchKey);
      if (!boHits || boHits.length === 0) {
        srow.note = `Sao kê có, BO chưa có – kiểm tra diễn giải: ${srow.rawDesc}`;
        anomalies.push({
          bank,
          nhom: 'Sao kê có, BO chưa có',
          nguon: 'Sao kê',
          maGd: srow.matchKey,
          soTien: srow.debit,
          thoiGian: srow.thoiGian || srow.ngayYmd || '',
          ghiChu: srow.note,
        });
        mismatches++;
      } else {
        // Mã trùng trên BO nhưng đã khớp dòng khác
        srow.note = `Sao kê có, BO chưa có – mã trùng/đã khớp dòng khác: ${srow.rawDesc}`;
        anomalies.push({
          bank,
          nhom: 'Sao kê có, BO chưa có',
          nguon: 'Sao kê',
          maGd: srow.matchKey,
          soTien: srow.debit,
          thoiGian: srow.thoiGian || srow.ngayYmd || '',
          ghiChu: srow.note,
        });
        mismatches++;
      }
    }

    // Non-debit SK rows → Payin / khác ngày
    for (const srow of sk.rows) {
      if (srow.note) continue;
      if (!srow.isDebit) {
        srow.note = 'GD Payin';
        continue;
      }
      if (srow.ngayYmd && !isInPeriod(srow.ngayYmd, periodSet)) {
        srow.note = formatYmdNote(srow.ngayYmd);
      }
    }

    bankSummaries.push({
      bank,
      sheetName: sk.name,
      boRows: boRows.length,
      skDebitRows: skDebits.length,
      matched,
      mismatches,
    });
  }

  // VietQR rows without note
  if (vietQr) {
    for (const v of vietQr.rows) {
      if (v.note) continue;
      const st = normKey(v.trangThai);
      if (st.includes('that bai') || st.includes('fail')) {
        v.note = `BO FAILED – VietQR ${v.trangThai}`;
      } else if (!v.skDebit) {
        // leave empty or mark missing — only if thành công
        if (st.includes('thanh cong') || st.includes('success')) {
          v.note = 'BO có, sao kê chưa cắt tiền – VietQR';
        }
      }
    }
  }

  const summary: ReconcileSummary = {
    periodLabel,
    periodDays,
    banks: bankSummaries,
    matched: bankSummaries.reduce((s, b) => s + b.matched, 0),
    boMissingOnSk: anomalies.filter((a) => a.nhom.includes('BO có')).length,
    skMissingOnBo: anomalies.filter((a) => a.nhom.includes('Sao kê có')).length,
    amountMismatch: anomalies.filter((a) => a.nhom.includes('lệch số tiền')).length,
  };

  for (const a of anomalies) {
    a.uuTien = anomalyPriority(a.nhom, a.ghiChu);
  }
  anomalies.sort((a, b) => {
    const rank = { Cao: 0, 'Trung bình': 1, Thấp: 2 };
    return (rank[a.uuTien ?? 'Thấp'] ?? 9) - (rank[b.uuTien ?? 'Thấp'] ?? 9);
  });

  onProgress?.({ phase: 'reconcile', message: 'Đối soát xong', fraction: 0.85 });
  return { anomalies, summary };
}

function fmt(n: number | null): string {
  if (n === null) return '-';
  return n.toLocaleString('vi-VN');
}
