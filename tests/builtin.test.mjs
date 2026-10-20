import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PROFILES } from '../js/builtin-profiles.js';
import { findModel, resolveFeature, MODELS, normalize } from '../js/models.js';
import { hexToBytes, runOp } from '../js/profiles.js';

const canon = BUILTIN_PROFILES.find((p) => p.id === 'canon-bjl-ip-legacy');
const text = (b) => new TextDecoder('latin1').decode(b);

test('Profil Canon legacy: bentuk perintah BJL valid dan model ada di database', () => {
  assert.ok(canon);
  assert.equal(canon.verified, false); // tidak boleh diklaim terverifikasi tanpa uji printer
  for (const m of canon.models) assert.ok(findModel('canon', m), `${m} tidak ada di database`);
  for (const step of canon.ops.wasteReset.steps) {
    const b = hexToBytes(step.tx);
    assert.deepEqual([...b.slice(0, 7)], [0x1b, 0x5b, 0x4b, 0x02, 0x00, 0x00, 0x1f]);
    assert.ok(text(b).includes('BJLSTART\n') && text(b).endsWith('BJLEND\n'));
    assert.equal(b.length, 52);
  }
});

test('Profil Canon legacy: Main lalu Platen, beda hanya satu byte tipe', () => {
  const [main, platen] = canon.ops.wasteReset.steps.map((s) => hexToBytes(s.tx));
  const diff = [...main].flatMap((v, i) => (v === platen[i] ? [] : [[i, v, platen[i]]]));
  assert.deepEqual(diff, [[28, 0x04, 0x06]]);
});

test('Cakupan: hanya iP1100/1800/2500, model lain tetap butuh profil', () => {
  for (const m of ['iP1100', 'iP1800', 'iP2500'])
    assert.equal(resolveFeature('canon', m, 'wasteReset', BUILTIN_PROFILES).level, 'profile-ready');
  for (const m of ['G1010', 'G1020', 'iP2770', 'iP1980', 'iX6870'])
    assert.equal(resolveFeature('canon', m, 'wasteReset', BUILTIN_PROFILES).level, 'need-profile', m);
  // tidak bocor ke Epson
  assert.equal(resolveFeature('epson', 'L120', 'wasteReset', BUILTIN_PROFILES).level, 'need-profile');
  // tidak ada fitur yang ikut terbuka selain wasteReset
  assert.deepEqual(Object.keys(canon.ops), ['wasteReset']);
});

test('runOp: dry-run tidak mengirim; run mengirim Main lalu Platen berurutan', async () => {
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

test('Database model: tetap unik setelah penambahan', () => {
  const keys = MODELS.map((m) => m.brand + normalize(m.name));
  assert.equal(new Set(keys).size, keys.length);
});
