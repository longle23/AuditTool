import assert from 'node:assert/strict';
import {
  agriMaGd2FromBo,
  boMatchKey,
  extractAgriMaGd,
  extractBidvMaGd,
  extractMsbMaGd,
  extractOcbMaGd,
  extractTpbMaGd,
  parseAmount,
} from './banks';
import { noteGroup } from './reconcile';

assert.equal(extractTpbMaGd('TPB655898430165454834656 THAO VY'), '655898430165454834656');
assert.equal(extractTpbMaGd('TT C6D2SNTV6GQEZ'), '');

assert.equal(extractBidvMaGd('ND O@L_2868271710_261028_C@H_MMVN'), '2868271710');
assert.equal(extractOcbMaGd('FT26302V1WHL\\BNK'), 'FT26302V1WHL');
assert.equal(extractMsbMaGd('PAYMETELLER/FT2630134FRQ'), 'FT2630134FRQ');
assert.equal(extractAgriMaGd('something|123456 abc'), '123456');
assert.equal(
  extractAgriMaGd(
    'MA_GD:658973503|VPAYME|6755284407847618230#7705205142013|THAI VY|823092 VY THAI GA032632329273',
  ),
  '823092',
);
assert.equal(agriMaGd2FromBo('616394859221016888579'), '888579');

assert.equal(parseAmount('-51,000,000'), -51000000);
assert.equal(parseAmount("'-9,050,000"), -9050000);
assert.equal(parseAmount('1.234.567'), 1234567);
assert.equal(parseAmount(7843080), 7843080);

assert.equal(
  boMatchKey('TPB', { maGd: '655898430165454834656', maGdNganHang: 'CO096', maGd2: '' }),
  '655898430165454834656',
);
assert.equal(
  boMatchKey('MSB', { maGd: 'x', maGdNganHang: 'FT2630134FRQ', maGd2: '' }),
  'FT2630134FRQ',
);

assert.equal(noteGroup('Khớp'), 'khop');
assert.equal(noteGroup('Khớp (khác ngày BO) – GD ngày 29/10/2026'), 'khop_khac_ngay');
assert.equal(noteGroup('Khớp (khác ngày BO) – hoàn tiền VietQR, GD ngày 18/11/2026'), 'khop_khac_ngay');
assert.equal(noteGroup('Khớp – hoàn tiền VietQR (BO KLB_VietQRPay)'), 'khop');
assert.equal(noteGroup('Lệch số tiền – BO 1, sao kê 2'), 'lech_tien');
assert.equal(noteGroup('Sao kê có, BO chưa có – kiểm tra diễn giải: abc'), 'sk_thieu_bo');
assert.equal(noteGroup('BO có, sao kê chưa cắt tiền – …'), 'bo_review_thieu_sk');
assert.equal(noteGroup('GD ngày 29/10/2026'), 'khac_ngay');

console.log('banks.test.ts: ok');
