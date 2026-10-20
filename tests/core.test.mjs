import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeviceId, decodeDeviceIdBytes } from '../js/ieee1284.js';
import { findModel, brandFromManufacturer, resolveFeature, MODELS, normalize } from '../js/models.js';
import * as epson from '../js/epson.js';
import { hexToBytes, bytesToHex, loadProfile, runOp, readCounter } from '../js/profiles.js';
import { DemoTransport, demoProfiles } from '../js/demo.js';

const withLen = (s, le = false) => {
  const body = new TextEncoder().encode(s);
  const n = body.length + 2;
  return Uint8Array.from(le ? [n & 255, n >> 8, ...body] : [n >> 8, n & 255, ...body]);
};

test('Device ID: big-endian dan little-endian length', () => {
  const s = 'MFG:EPSON;CMD:ESCPL2,BDC;MDL:L3210 Series;CLS:PRINTER;';
  assert.equal(decodeDeviceIdBytes(withLen(s)), s);
  assert.equal(decodeDeviceIdBytes(withLen(s, true)), s);
  const p = parseDeviceId(s);
  assert.equal(p.manufacturer, 'EPSON');
  assert.equal(p.model, 'L3210 Series');
  assert.deepEqual(p.commands, ['ESCPL2', 'BDC']);
});

test('Device ID: alias key panjang (MANUFACTURER/MODEL)', () => {
  const p = parseDeviceId('MANUFACTURER:Canon;COMMAND SET:BJRaster3;MODEL:G1010 series;');
  assert.equal(p.manufacturer, 'Canon');
  assert.equal(p.model, 'G1010 series');
  assert.deepEqual(p.commands, ['BJRaster3']);
});

test('Model: semua model permintaan ada dan cocok dari Device ID', () => {
  const wanted = {
    canon: ['G1020', 'G1010', 'iX6870', 'iP2770', 'iP1980'],
    epson: ['L365', 'L220', 'L1300', 'L11050', 'L1110', 'L210', 'L120', 'L1210', 'L3210'],
  };
  for (const [brand, names] of Object.entries(wanted))
    for (const n of names) assert.ok(findModel(brand, n), `${brand} ${n} hilang`);
  assert.equal(findModel('canon', 'PIXMA iX6870 Series').name, 'iX6870');
  assert.equal(findModel('canon', 'G1010 series').name, 'G1010');
  assert.equal(findModel('epson', 'L3210 Series').name, 'L3210');
  assert.equal(findModel('epson', 'G1010'), null); // lintas merek tidak boleh cocok
  assert.equal(brandFromManufacturer('SEIKO EPSON'), 'epson');
  assert.equal(normalize('PIXMA iP2770 series'), 'ip2770');
});

test('Model: nama unik per merek', () => {
  const keys = MODELS.map((m) => m.brand + normalize(m.name));
  assert.equal(new Set(keys).size, keys.length);
});

test('Fitur: tanpa profil, reset absorber butuh profil; dengan profil siap', () => {
  assert.equal(resolveFeature('epson', 'L120', 'wasteReset', []).level, 'need-profile');
  assert.equal(resolveFeature('epson', 'L120', 'nozzleCheck', []).level, 'experimental');
  assert.equal(resolveFeature('canon', 'G1010', 'status', []).level, 'builtin');
  const [ep] = demoProfiles();
  assert.equal(resolveFeature('epson', 'L120', 'wasteReset', [ep]).level, 'profile-ready');
  assert.equal(resolveFeature('canon', 'G1010', 'wasteReset', [ep]).level, 'need-profile');
});

test('Epson REMOTE1: byte perintah', () => {
  assert.equal(
    bytesToHex(epson.cmdNozzleCheck()),
    '1B 40 1B 28 52 08 00 00 52 45 4D 4F 54 45 31 4E 43 02 00 00 00 1B 00 00 00',
  );
  assert.equal(
    bytesToHex(epson.cmdStatus()),
    '1B 40 1B 28 52 08 00 00 52 45 4D 4F 54 45 31 53 54 01 00 01 1B 00 00 00',
  );
});

test('Epson ST2 dan IQ: parser', () => {
  const t = new DemoTransport('epson');
  const buf = (async () => {
    await t.send(epson.cmdStatus());
    return t.receive();
  })();
  return buf.then((b) => {
    const r = epson.parseSt2(b);
    assert.equal(r.statusText, 'Idle');
    assert.deepEqual(
      r.inks.map((i) => [i.color, i.level]),
      [['Black', 82], ['Cyan', 45], ['Magenta', 18], ['Yellow', 64]],
    );
    assert.equal(epson.parseSt2(new Uint8Array([1, 2, 3])), null);
    assert.deepEqual(epson.parseInkQuantity(new TextEncoder().encode('IQ:6450;')), [0x64, 0x50]);
  });
});

test('Profil: validasi menolak data rusak', () => {
  assert.throws(() => loadProfile({}), /schema/);
  const base = { schema: 1, id: 'x', name: 'x', brand: 'epson', models: ['L120'] };
  assert.throws(() => loadProfile({ ...base, brand: 'hp', ops: {} }), /brand/);
  assert.throws(() => loadProfile({ ...base, ops: { a: { steps: [{ tx: 'ZZ' }] } } }), /Hex tidak valid/);
  assert.throws(() => loadProfile({ ...base, ops: { a: { steps: [{ tx: '0' }] } } }), /ganjil/);
  assert.throws(
    () => loadProfile({ ...base, ops: { a: { steps: [{ tx: '01' }], counters: [{ length: 2, max: 0 }] } } }),
    /max/,
  );
  assert.throws(() => loadProfile({ ...base, ops: { 'a b': { steps: [{ tx: '1B 40' }] } } }), /id perintah/);
  assert.throws(() => loadProfile({ ...base, ops: { '1x': { steps: [{ tx: '1B 40' }] } } }), /id perintah/);
  assert.ok(loadProfile({ ...base, ops: { a: { steps: [{ tx: '1B 40' }] } } }));
});

test('Profil: hex dan counter', () => {
  assert.deepEqual([...hexToBytes('0x1B, 40 ff')], [0x1b, 0x40, 0xff]);
  assert.equal(readCounter(Uint8Array.of(0, 0, 0x10, 0x27), { offset: 2, length: 2, endian: 'le' }), 10000);
  assert.equal(readCounter(Uint8Array.of(0x27, 0x10), { offset: 0, length: 2, endian: 'be' }), 10000);
  assert.throws(() => readCounter(Uint8Array.of(1), { name: 'n', offset: 0, length: 2 }), /pendek/);
});

test('runOp: dry-run tidak mengirim apa pun; run baca & reset counter demo', async () => {
  const [ep] = demoProfiles();
  const t = new DemoTransport('epson');

  const dry = await runOp(t, ep.ops.wasteRead, { dryRun: true });
  assert.equal(t.history.length, 0);
  assert.equal(dry.steps[0].tx, 'DE 01');

  const before = await runOp(t, ep.ops.wasteRead);
  assert.equal(before.counters[0].value, 9400);
  assert.equal(before.counters[0].percent, 94);
  assert.equal(before.counters[0].full, false);

  await runOp(t, ep.ops.wasteReset);
  const after = await runOp(t, ep.ops.wasteRead);
  assert.deepEqual(after.counters.map((c) => c.value), [0, 0]);
});

test('runOp: counter ditandai penuh saat >= max', async () => {
  const t = new DemoTransport('epson');
  t.counters = { main: 10000, platen: 12000 };
  const [ep] = demoProfiles();
  const r = await runOp(t, ep.ops.wasteRead);
  assert.deepEqual(r.counters.map((c) => c.full), [true, true]);
  assert.equal(r.counters[1].percent, 100);
});
