import test from 'node:test';
import assert from 'node:assert/strict';
import { listOperations, GROUP_ORDER, STANDARD_OPS } from '../js/operations.js';
import { BUILTIN_PROFILES } from '../js/builtin-profiles.js';
import { demoProfiles } from '../js/demo.js';

const ids = (ops) => ops.map((o) => o.id);

test('Epson tanpa profil: hanya 3 perintah tersedia (eksperimental), sisanya butuh profil', () => {
  const ops = listOperations('epson', 'L3210', BUILTIN_PROFILES);
  assert.deepEqual(ids(ops.filter((o) => o.available)).sort(), ['headClean', 'nozzleCheck', 'status']);
  assert.ok(ops.filter((o) => o.available).every((o) => o.level === 'experimental'));
  for (const o of ops.filter((x) => !x.available)) {
    assert.equal(o.level, 'need-profile');
    assert.match(o.reason, /butuh profil/);
  }
  assert.equal(ops.length, Object.keys(STANDARD_OPS).length);
});

test('Daftar terurut per grup sesuai GROUP_ORDER', () => {
  for (const [b, m] of [['epson', 'L120'], ['canon', 'iP1800']]) {
    const ranks = listOperations(b, m, BUILTIN_PROFILES).map((o) => GROUP_ORDER.indexOf(o.group));
    assert.ok(ranks.every((r) => r >= 0));
    assert.deepEqual(ranks, [...ranks].sort((a, c) => a - c));
  }
});

test('Canon iP1800: 9 perintah dari profil, perintah standar ditimpa label profil, ekstra muncul', () => {
  const ops = listOperations('canon', 'iP1800', BUILTIN_PROFILES);
  const ready = ops.filter((o) => o.level === 'profile-ready');
  assert.equal(ready.length, 9);
  assert.deepEqual(ids(ready).sort(), [
    'cleanB', 'cleanC', 'cleanD', 'counterClearAll', 'counterClearExceptWaste',
    'headClean', 'mainClear', 'platenClear', 'wasteReset',
  ].sort());
  const hc = ops.find((o) => o.id === 'headClean');
  assert.equal(hc.label, 'Pembersihan head tipe A');
  // grup pembersihan: A, lalu B, C, D berurutan
  const clean = ops.filter((o) => o.group === 'Pembersihan head' && o.available).map((o) => o.id);
  assert.deepEqual(clean, ['headClean', 'cleanB', 'cleanC', 'cleanD']);
  // yang tidak punya data tetap terdaftar sebagai tidak tersedia
  assert.deepEqual(ids(ops.filter((o) => !o.available)).sort(), ['inkCharge', 'nozzleCheck', 'powerClean', 'wasteRead']);
  assert.equal(ops.find((o) => o.id === 'status').level, 'builtin');
});

test('Perintah berbahaya membawa ack; reset standar mengingatkan bantalan fisik', () => {
  const ops = listOperations('canon', 'iP2500', BUILTIN_PROFILES);
  const get = (id) => ops.find((o) => o.id === id);
  assert.equal(get('counterClearAll').danger, true);
  assert.match(get('counterClearAll').ack, /seluruh counter/);
  assert.equal(get('counterClearExceptWaste').danger, true);
  assert.match(get('wasteReset').ack, /bantalan tinta fisik/);
  assert.equal(get('mainClear').danger, false);
  assert.equal(get('mainClear').mutating, true);
});

test('Perintah ekstra tidak bocor ke model/merek lain', () => {
  for (const [b, m] of [['canon', 'G1010'], ['canon', 'iP1980'], ['canon', 'iP2770'], ['epson', 'L120']]) {
    const names = ids(listOperations(b, m, BUILTIN_PROFILES));
    for (const x of ['mainClear', 'platenClear', 'counterClearAll', 'cleanB']) assert.ok(!names.includes(x), `${b} ${m} bocor ${x}`);
  }
});

test('Profil demo + bawaan: bawaan menang untuk model yang sama', () => {
  const ops = listOperations('canon', 'iP1800', [...BUILTIN_PROFILES, ...demoProfiles()]);
  assert.equal(ops.find((o) => o.id === 'wasteReset').profile.id, 'canon-bjl-ip-legacy');
  // wasteRead hanya ada di profil demo
  assert.equal(ops.find((o) => o.id === 'wasteRead').profile.demo, true);
});

test('Model kustom (tidak ada di database) tetap menghasilkan daftar', () => {
  const ops = listOperations('epson', 'XP-9999', BUILTIN_PROFILES);
  assert.equal(ops.length, Object.keys(STANDARD_OPS).length);
  assert.equal(ops.filter((o) => o.available).length, 3);
});
