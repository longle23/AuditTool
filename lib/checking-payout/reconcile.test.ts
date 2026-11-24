import assert from 'node:assert/strict';
import { reconcileWorkbook } from './reconcile';
import type { BoRow, ParsedBo, ParsedSk, SkRow } from './types';
import { buildPeriod } from './dates';

function bo(partial: Partial<BoRow> & Pick<BoRow, 'maGd' | 'maGdNganHang' | 'soTienChi' | 'bank'>): BoRow {
  return {
    sheetRow: 0,
    cells: [],
    maGd2: '',
    phuongThuc: 'Ngân hàng',
    trangThai: 'SUCCEEDED',
    nganHangChuyen: partial.bank ?? '',
    thoiGian: '10:00 28/10/2026',
    ngayYmd: '2026-10-28',
    skDebit: null,
    chenhLech: null,
    note: '',
    computeDiff: true,
    matchKey: '',
    ...partial,
  };
}

function sk(partial: Partial<SkRow> & Pick<SkRow, 'matchKey' | 'debit' | 'bank'>): SkRow {
  return {
    sheetRow: 0,
    cells: [],
    rawDesc: '',
    maGdTach: partial.matchKey,
    credit: null,
    thoiGian: '28/10/2026',
    ngayYmd: '2026-10-28',
    isDebit: true,
    boSoTienChi: null,
    chenhLech: null,
    note: '',
    ...partial,
  };
}

const periodDays = buildPeriod(['2026-10-28']);
const periodSet = new Set(['2026-10-28']);

const boSheet: ParsedBo = {
  name: 'BO 28.10.2026',
  headers: ['Mã giao dịch', 'Số tiền chi', 'Mã GD ngân hàng', 'Phương thức', 'Trạng thái', 'Ngân hàng chuyển'],
  headerRowIndex: 0,
  soTienChiCol: 1,
  rows: [
    bo({ maGd: '111', maGdNganHang: 'FT1', soTienChi: 1000, bank: 'OCB' }),
    bo({ maGd: '222', maGdNganHang: 'FT2', soTienChi: 2000, bank: 'OCB' }),
    bo({ maGd: '333', maGdNganHang: 'FT3', soTienChi: 3000, bank: 'OCB' }),
  ],
};

const skSheet: ParsedSk = {
  name: 'Sao ke OCB',
  headers: [],
  headerRowIndex: 0,
  bank: 'OCB',
  rows: [
    sk({ bank: 'OCB', matchKey: 'FT1', debit: 1000 }),
    sk({ bank: 'OCB', matchKey: 'FT2', debit: 2500 }),
    sk({ bank: 'OCB', matchKey: 'FT9', debit: 900 }),
  ],
};

const { anomalies, summary } = reconcileWorkbook({
  sheetNames: [boSheet.name, skSheet.name],
  bo: boSheet,
  boPrev: null,
  statements: [skSheet],
  vietQr: null,
  periodDays,
  periodLabel: '28/10/2026',
  periodSet,
});

assert.equal(boSheet.rows[0].note, 'Khớp');
assert.ok(boSheet.rows[1].note.startsWith('Lệch số tiền'));
assert.ok(boSheet.rows[2].note.includes('BO có, sao kê chưa'));
assert.ok(skSheet.rows[2].note.includes('Sao kê có, BO chưa có'));
assert.equal(summary.matched, 1);
assert.ok(anomalies.length >= 2);

console.log('reconcile.test.ts: ok');
