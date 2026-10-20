import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PROFILES } from '../js/builtin-profiles.js';
import { resolveFeature, MODELS, normalize, findModel } from '../js/models.js';
import { listOperations } from '../js/operations.js';
import { hexToBytes, bytesToHex, runOp } from '../js/profiles.js';

const canon = BUILTIN_PROFILES.find((p) => p.id === 'canon-bjl-ip-legacy');
const text = (b) => new TextDecoder('latin1').decode(b);
const allSteps = () => Object.entries(canon.ops).flatMap(([id, op]) => op.steps.map((s) => [id, hexToBytes(s.tx)]));

test('Profil Canon legacy: daftar perintah yang dibawa', () => {
  assert.ok(canon);
  assert.equal(canon.verified, false); // tidak boleh diklaim terverifikasi tanpa uji printer
  assert.deepEqual(Object.keys(canon.ops), [
    'wasteReset', 'mainClear', 'platenClear', 'counterClearExceptWaste', 'counterClearAll',
    'headClean', 'cleanB', 'cleanC', 'cleanD',
  ]);
  for (const m of canon.models) assert.ok(findModel('canon', m), `${m} tidak ada di database`);
});

test('Semua perintah: format BJL valid (ESC [ K 02 00 00 1F ... BJLSTART ... BJLEND)', () => {
  for (const [id, b] of allSteps()) {
    assert.deepEqual([...b.slice(0, 7)], [0x1b, 0x5b, 0x4b, 0x02, 0x00, 0x00, 0x1f], id);
    assert.ok(text(b).includes('BJLSTART\n'), id);
    assert.ok(text(b).endsWith('BJLEND\n'), id);
  }
});

test('Reset: Main dan Platen beda hanya satu byte tipe; reset gabungan = Main lalu Platen', () => {
  const op = (id) => canon.ops[id].steps.map((s) => hexToBytes(s.tx));
  const [main] = op('mainClear');
  const [platen] = op('platenClear');
  const diff = [...main].flatMap((v, i) => (v === platen[i] ? [] : [[i, v, platen[i]]]));
  assert.deepEqual(diff, [[28, 0x04, 0x06]]);
  assert.deepEqual(op('wasteReset').map(bytesToHex), [bytesToHex(main), bytesToHex(platen)]);
});

test('Clear counter: CNTCLR_AL (semua) dan CNTCLR_P1 (selain tinta buang), keduanya ditandai bahaya', () => {
  assert.match(text(hexToBytes(canon.ops.counterClearAll.steps[0].tx)), /@Initialize=CNTCLR_AL\n/);
  assert.match(text(hexToBytes(canon.ops.counterClearExceptWaste.steps[0].tx)), /@Initialize=CNTCLR_P1\n/);
  assert.equal(canon.ops.counterClearAll.danger, true);
  assert.equal(canon.ops.counterClearExceptWaste.danger, true);
  assert.ok(canon.ops.counterClearAll.ack);
});

test('Pembersihan head A-D: perintah sama, hanya parameter 0..3 (byte ke-32)', () => {
  const ids = ['headClean', 'cleanB', 'cleanC', 'cleanD'];
  const bytes = ids.map((id) => hexToBytes(canon.ops[id].steps[0].tx));
  bytes.forEach((b, n) => {
    assert.equal(b.length, 44);
    assert.equal(b[32], n);
    assert.deepEqual([...b.slice(0, 32)], [...bytes[0].slice(0, 32)]);
    assert.deepEqual([...b.slice(33)], [...bytes[0].slice(33)]);
  });
});

test('Pagar pengaman: perintah berbahaya dari paket sumber TIDAK boleh masuk', () => {
  const forbidden = [
    [/REGIGUIDEFRESET/, 'menghapus alignment head'],
    [/SETREGISTRATION/, 'menulis kode model'],
    [/Initialize=M_/, 'menulis kode tujuan/region'],
  ];
  for (const [id, b] of allSteps()) {
    for (const [re, why] of forbidden) assert.doesNotMatch(text(b), re, `${id}: ${why}`);
    // uji ketahanan pabrik (capwipping 36480, heatrun 123840 / 9088 siklus)
    const hex = bytesToHex(b);
    for (const bad of ['80 8E 00 00', 'C0 E3 01 00', '80 23 00 00']) assert.ok(!hex.includes(bad), `${id}: uji ketahanan`);
    assert.ok(b.length <= 64, `${id}: terlalu besar untuk perintah teks, mungkin data cetak`);
  }
});

test('Cakupan: hanya iP1100/1800/2500, model lain tidak mendapat perintah apa pun dari profil', () => {
  for (const m of ['iP1100', 'iP1800', 'iP2500'])
    assert.equal(resolveFeature('canon', m, 'wasteReset', BUILTIN_PROFILES).level, 'profile-ready');
  for (const m of ['G1010', 'G1020', 'iP2770', 'iP1980', 'iX6870']) {
    assert.equal(resolveFeature('canon', m, 'wasteReset', BUILTIN_PROFILES).level, 'need-profile', m);
    assert.ok(!listOperations('canon', m, BUILTIN_PROFILES).some((o) => o.level === 'profile-ready'), m);
  }
  assert.ok(!listOperations('epson', 'L120', BUILTIN_PROFILES).some((o) => o.level === 'profile-ready'));
});

test('runOp: dry-run tidak mengirim; reset gabungan mengirim Main lalu Platen berurutan', async () => {
  const sent = [];
  const transport = { send: async (b) => sent.push(text(b)), receive: async () => new Uint8Array() };
  const op = { ...canon.ops.wasteReset, steps: canon.ops.wasteReset.steps.map((s) => ({ ...s, delayMs: 0 })) };
  await runOp(transport, op, { dryRun: true });
  assert.equal(sent.length, 0);
  await runOp(transport, op);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].charCodeAt(28), 0x04);
  assert.equal(sent[1].charCodeAt(28), 0x06);
});

test('Database model: tetap unik', () => {
  const keys = MODELS.map((m) => m.brand + normalize(m.name));
  assert.equal(new Set(keys).size, keys.length);
});
