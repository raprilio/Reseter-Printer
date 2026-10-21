import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeviceId, decodeDeviceIdResponse } from '../web/js/deviceid.js';
import { findModel } from '../web/js/models.js';
import { buildRemote, remoteCmd, parseInkQuantity, readInkLevels } from '../web/js/epson.js';
import { parseData, validateProfile, runSteps, evalCounters, profileMatches } from '../web/js/profile.js';
import { evaluateAbsorber } from '../web/js/canon.js';
import { DemoTransport, DEMO_PROFILE } from '../web/js/demo.js';

test('parse device id epson & canon', () => {
  const e = parseDeviceId('MFG:EPSON;CMD:ESCPL2,BDC;MDL:L3210 Series;CLS:PRINTER;');
  assert.equal(e.brand, 'epson');
  assert.equal(findModel(e.brand, e.mdl).model, 'L3210');
  const c = parseDeviceId('MFG:Canon;CMD:BJRaster3,NCCe;MDL:G1010 series;CLS:PRINTER;');
  assert.equal(c.brand, 'canon');
  assert.equal(findModel(c.brand, c.mdl).model, 'G1010');
  assert.equal(findModel('canon', 'iX6800 series'), null);
  assert.equal(findModel('epson', 'L1110 Series').model, 'L1110');
  assert.equal(findModel('epson', 'L11050 Series').model, 'L11050');
});

test('decode device id response (BE and LE length)', () => {
  const s = 'MFG:X;MDL:Y;';
  const body = [...s].map((c) => c.charCodeAt(0));
  const n = body.length + 2;
  assert.equal(decodeDeviceIdResponse(Uint8Array.from([n >> 8, n & 255, ...body])), s);
  assert.equal(decodeDeviceIdResponse(Uint8Array.from([n & 255, n >> 8, ...body])), s);
});

test('epson remote framing', () => {
  assert.deepEqual([...remoteCmd('NC', [0, 0])], [0x4e, 0x43, 2, 0, 0, 0]);
  const b = buildRemote([remoteCmd('IQ', [1])]);
  assert.equal(new TextDecoder('latin1').decode(b).includes('REMOTE1IQ\x01\x00\x01'), true);
});

test('ink quantity parse is strict', () => {
  const inks = ['K', 'C', 'M', 'Y'];
  assert.equal(parseInkQuantity('IQ:52402f09;', inks).levels[3].percent, 9);
  assert.equal(parseInkQuantity('IQ:0102;', inks).ok, false);
  assert.equal(parseInkQuantity('IQ:ffffffff;', inks).ok, false);
  assert.equal(parseInkQuantity('garbage', inks).ok, false);
});

test('demo transport end to end', async () => {
  const t = new DemoTransport();
  const ink = await readInkLevels(t, ['K', 'C', 'M', 'Y']);
  assert.deepEqual(ink.levels.map((l) => l.percent), [82, 64, 47, 9]);
  const rc = DEMO_PROFILE.ops.readCounters;
  let counters = evalCounters(await runSteps(t, rc.steps), rc.parse);
  assert.equal(counters[0].value, 5400);
  await runSteps(t, DEMO_PROFILE.ops.resetWaste.steps);
  counters = evalCounters(await runSteps(t, rc.steps), rc.parse);
  assert.equal(counters[0].value, 0);
});

test('profile validation', () => {
  assert.deepEqual(validateProfile(DEMO_PROFILE), []);
  assert.ok(validateProfile({ name: 'x', match: { model: 'A' }, ops: { a: { steps: [{ send: 'zz' }], write: false } } }).length);
  assert.ok(validateProfile({ name: 'x', match: { model: 'A' }, ops: { a: { steps: [{ send: 'hex:00' }] } } }).some((e) => /write/.test(e)));
  assert.deepEqual([...parseData('hex:1B 40, 0x41')], [0x1b, 0x40, 0x41]);
  assert.equal(profileMatches({ match: { model: 'L3210' } }, 'L3210 Series'), true);
  assert.equal(profileMatches({ match: { model: 'L3210' } }, 'L1110 Series'), false);
});

test('example profile is valid schema', async () => {
  const { readFile } = await import('node:fs/promises');
  const p = JSON.parse(await readFile(new URL('../profiles/example.json', import.meta.url)));
  assert.deepEqual(validateProfile(p), []);
});

test('canon absorber evaluation', () => {
  assert.equal(evaluateAbsorber({ lamp: 'none', pc: '5B00' }).level, 'full');
  assert.equal(evaluateAbsorber({ lamp: '8', pc: 'none' }).level, 'near');
  assert.equal(evaluateAbsorber({ lamp: 'none', pc: 'E08' }).level, 'near');
  assert.equal(evaluateAbsorber({ lamp: 'other', pc: 'none' }).level, 'other');
  assert.equal(evaluateAbsorber({ lamp: 'none', pc: 'none' }).level, 'unknown');
  assert.equal(evaluateAbsorber({ lamp: '8', pc: '5B00' }).level, 'full');
});
