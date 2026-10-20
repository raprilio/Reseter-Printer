import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const jsFiles = readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js'));
const html = readFileSync(new URL('index.html', root), 'utf8');

// Aplikasi tidak boleh punya jalur keluar data: tidak ada API jaringan, eval, atau HTML mentah.
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/WebSocket/, 'WebSocket'],
  [/sendBeacon/, 'sendBeacon'],
  [/EventSource/, 'EventSource'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\b/, 'new Function'],
  [/importScripts/, 'importScripts'],
  [/\.innerHTML|insertAdjacentHTML|document\.write/, 'HTML mentah'],
  [/document\.cookie/, 'cookie'],
  [/https?:\/\//, 'URL absolut'],
];

for (const f of jsFiles) {
  test(`js/${f}: tanpa kode jaringan/eval`, () => {
    const src = readFileSync(new URL(`js/${f}`, root), 'utf8');
    for (const [re, label] of FORBIDDEN) assert.doesNotMatch(src, re, `${f} memuat ${label}`);
  });
}

test('index.html: CSP memblokir semua koneksi keluar dan skrip luar', () => {
  const m = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(m, 'meta CSP hilang');
  const csp = Object.fromEntries(
    m[1].split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]),
  );
  assert.deepEqual(csp['default-src'], ["'none'"]);
  assert.deepEqual(csp['connect-src'], ["'none'"]);
  assert.deepEqual(csp['script-src'], ["'self'"]);
  assert.ok(!m[1].includes('unsafe-inline') && !m[1].includes('unsafe-eval'));
});

test('index.html: hanya skrip modul lokal, tanpa skrip/gambar/iframe eksternal', () => {
  const tags = [...html.matchAll(/<(script|img|iframe|link)\b[^>]*>/g)].map((x) => x[0]);
  for (const t of tags) {
    assert.doesNotMatch(t, /(src|href)="(https?:)?\/\//, `sumber eksternal: ${t}`);
  }
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'ada skrip inline');
});
