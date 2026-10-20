import { UsbTransport } from './usb.js';
import { DemoTransport, demoProfiles } from './demo.js';
import { BUILTIN_PROFILES } from './builtin-profiles.js';
import { parseDeviceId, } from './ieee1284.js';
import { MODELS, FEATURES, brandFromManufacturer, findModel, resolveFeature } from './models.js';
import * as epson from './epson.js';
import { loadProfile, runOp, hexToBytes, bytesToHex } from './profiles.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};

const state = { transport: null, devId: null, userProfiles: [], busy: false };

// ---------- util ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage diblokir */ } },
};
const logLines = [];
function log(msg) {
  const line = `${new Date().toLocaleTimeString('id-ID')}  ${msg}`;
  logLines.push(line);
  const box = $('log');
  box.textContent = logLines.join('\n');
  box.scrollTop = box.scrollHeight;
}
const brand = () => $('brand').value;
const modelName = () => $('model').value.trim();
const profiles = () => [
  ...BUILTIN_PROFILES,
  ...state.userProfiles,
  ...(state.transport?.kind === 'demo' ? demoProfiles() : []),
];

function ask({ title, body = [], ack = null, okLabel = 'Lanjutkan', danger = false }) {
  const dlg = $('dlg');
  $('dlg-title').textContent = title;
  $('dlg-body').replaceChildren(...body);
  $('dlg-ack-wrap').hidden = !ack;
  $('dlg-ack').checked = false;
  $('dlg-ack-text').textContent = ack || '';
  const ok = $('dlg-ok');
  ok.textContent = okLabel;
  ok.className = danger ? 'danger' : 'primary';
  ok.disabled = !!ack;
  $('dlg-ack').onchange = (e) => { ok.disabled = !e.target.checked; };
  dlg.returnValue = '';
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

// ---------- render hasil ----------
function inkBars(inks) {
  const box = el('div', { className: 'bars' });
  for (const i of inks) {
    const cls = i.level < 10 ? 'hot' : i.level < 30 ? 'mid' : '';
    box.append(
      el('div', { className: 'bar' },
        el('span', {}, i.color),
        el('div', { className: 'track' }, el('div', { className: `fill ${cls}`, style: `width:${i.level}%` })),
        el('span', {}, `${i.level}%`)),
    );
  }
  return box;
}
function counterBars(counters) {
  const box = el('div', { className: 'bars' });
  for (const c of counters) {
    const cls = c.percent >= 100 ? 'hot' : c.percent >= 80 ? 'mid' : '';
    box.append(
      el('div', { className: 'bar' },
        el('span', {}, c.name),
        el('div', { className: 'track' }, el('div', { className: `fill ${cls}`, style: `width:${c.percent}%` })),
        el('span', {}, `${c.percent.toFixed(0)}%`)),
    );
  }
  const full = counters.some((c) => c.full);
  const near = counters.some((c) => c.percent >= 80);
  const verdict = full
    ? el('div', { className: 'verdict bad' }, 'Absorber PENUH: printer biasanya berhenti dengan error service required.')
    : near
      ? el('div', { className: 'verdict warn' }, 'Absorber hampir penuh (>= 80%).')
      : el('div', { className: 'verdict ok' }, 'Absorber belum penuh.');
  return el('div', {}, box, verdict);
}
const hexBlock = (label, bytes) => el('pre', { className: 'out mono' }, `${label}\n${bytesToHex(bytes)}`);
const out = (feature) => $(`out-${feature}`);
const show = (feature, ...nodes) => out(feature).replaceChildren(...nodes);
const steps = (r) => el('pre', { className: 'out mono' }, r.steps.map((s) => `TX ${s.tx}${s.rx ? `\nRX ${s.rx}` : ''}`).join('\n'));

// ---------- aksi ----------
const dry = () => $('dry').checked;
const t = () => state.transport;

async function runProfile(feature, profile) {
  const op = profile.ops[feature];
  const r = await runOp(t(), op, { dryRun: dry(), onLog: log });
  const nodes = [];
  if (dry()) nodes.push(el('div', { className: 'verdict warn' }, 'Dry-run: tidak ada yang dikirim.'));
  if (r.counters.length) nodes.push(counterBars(r.counters));
  nodes.push(steps(r));
  show(feature, ...nodes);
  return r;
}

async function sendBuiltin(feature, bytes, note) {
  log(`TX ${bytesToHex(bytes)}`);
  if (dry()) {
    show(feature, el('div', { className: 'verdict warn' }, 'Dry-run: tidak ada yang dikirim.'), hexBlock('TX', bytes));
    return;
  }
  await t().send(bytes);
  show(feature, el('div', { className: 'verdict ok' }, note), hexBlock('TX', bytes));
}

const ACTIONS = {
  status: {
    label: 'Baca status',
    async builtin() {
      if (brand() === 'canon') {
        const sta = state.devId?.fields.STA;
        show('status', el('div', { className: 'verdict warn' },
          sta ? `Kode STA dari Device ID: ${sta}` : 'Printer tidak melaporkan field STA di Device ID.'),
          el('p', { className: 'note' }, 'Level tinta Canon tidak tersedia lewat Device ID; butuh profil.'));
        return;
      }
      if (dry()) return sendBuiltin('status', epson.cmdStatus());
      log(`TX ${bytesToHex(epson.cmdStatus())}`);
      await t().send(epson.cmdStatus());
      const rx = await t().receive(512, 3000);
      log(`RX ${bytesToHex(rx)}`);
      const st = epson.parseSt2(rx);
      const nodes = [];
      if (st) {
        nodes.push(el('div', { className: 'verdict ok' }, `Status: ${st.statusText ?? 'tidak diketahui'}`));
        if (st.inks.length) nodes.push(inkBars(st.inks));
      } else {
        nodes.push(el('div', { className: 'verdict warn' }, 'Format respons tidak dikenali; hex mentah ditampilkan di bawah.'));
      }
      nodes.push(hexBlock('RX', rx));
      show('status', ...nodes);
    },
  },
  nozzleCheck: {
    label: 'Cetak pola nozzle',
    confirm: { title: 'Cek head', text: 'Printer akan mencetak pola nozzle. Siapkan kertas.' },
    builtin: () => sendBuiltin('nozzleCheck', epson.cmdNozzleCheck(), 'Perintah terkirim. Periksa hasil cetak printer.'),
  },
  headClean: {
    label: 'Bersihkan head',
    mutating: true,
    confirm: { title: 'Bersihkan head', text: 'Pembersihan head memakai tinta dan menambah counter absorber.' },
    builtin: () => sendBuiltin('headClean', epson.cmdHeadClean(), 'Perintah terkirim. Tunggu printer selesai.'),
  },
  powerClean: { label: 'Power cleaning', mutating: true },
  wasteRead: { label: 'Cek absorber' },
  wasteReset: {
    label: 'Reset absorber',
    mutating: true,
    danger: true,
    ack: 'Saya paham: bantalan tinta fisik tidak ikut kosong dan harus dibersihkan atau diganti.',
  },
  inkCharge: { label: 'Ink charge', mutating: true },
};

async function perform(feature) {
  const action = ACTIONS[feature];
  const res = resolveFeature(brand(), modelName(), feature, profiles());
  const profile = res.profile;
  if (state.busy || !t()) return;

  if (action.confirm || action.mutating) {
    const body = [el('p', {}, action.confirm?.text || profile?.ops[feature]?.message || 'Aksi ini mengubah kondisi printer.')];
    if (profile) {
      const preview = await runOp(t(), profile.ops[feature], { dryRun: true });
      body.push(el('p', { className: 'note' }, 'Perintah yang akan dikirim:'), steps(preview));
    }
    if (res.level === 'experimental') {
      body.push(el('p', { className: 'note' }, 'Perintah ini eksperimental dan belum diuji pada printer nyata.'));
    }
    const unverified = profile && !profile.verified && !profile.demo;
    if (unverified) {
      body.push(el('p', { className: 'note' }, `Profil "${profile.name}" belum terverifikasi pada printer nyata.`));
    }
    if (dry()) body.push(el('p', { className: 'note' }, 'Dry-run aktif: tidak ada yang akan dikirim.'));
    const ack = [action.ack, unverified && 'Saya paham profil ini belum diuji pada printer nyata.']
      .filter(Boolean).join(' ') || null;
    const ok = await ask({
      title: `${action.label}: ${brand()} ${modelName()}`,
      body, ack, danger: !!action.danger, okLabel: action.label,
    });
    if (!ok) return;
  }

  setBusy(true);
  try {
    log(`Mulai: ${action.label}`);
    if (profile) await runProfile(feature, profile);
    else if (action.builtin) await action.builtin();
    else throw new Error('Belum ada implementasi; tambahkan profil model ini.');
    log(`Selesai: ${action.label}`);
    if (feature === 'wasteReset' && profile?.ops.wasteRead && !dry()) {
      log('Verifikasi: membaca ulang counter absorber');
      await runProfile('wasteRead', profile);
    }
  } catch (e) {
    log(`GAGAL ${action.label}: ${e.message}`);
    show(feature, el('div', { className: 'verdict bad' }, e.message));
  } finally {
    setBusy(false);
  }
}

// ---------- tampilan fitur ----------
const BADGE = {
  builtin: 'Bawaan',
  experimental: 'Eksperimental',
  'profile-ready': 'Profil siap',
  'need-profile': 'Butuh profil',
  missing: 'Tidak tersedia',
};

function renderFeatures() {
  const host = $('features');
  const keep = new Map([...host.querySelectorAll('.out')].map((n) => [n.id, [...n.childNodes]]));
  host.replaceChildren();
  for (const f of FEATURES.filter((x) => x.id !== 'info')) {
    const res = resolveFeature(brand(), modelName(), f.id, profiles());
    const usable = ['builtin', 'experimental', 'profile-ready'].includes(res.level);
    const btn = el('button', { id: `btn-${f.id}`, disabled: !usable || !t() || state.busy }, ACTIONS[f.id].label);
    if (ACTIONS[f.id].danger) btn.classList.add('danger');
    btn.addEventListener('click', () => perform(f.id));
    const badge = el('span', { className: `badge ${res.level}` }, BADGE[res.level]);
    if (res.profile) badge.title = res.profile.name;
    const o = el('div', { className: 'out', id: `out-${f.id}` });
    if (keep.has(o.id)) o.append(...keep.get(o.id));
    host.append(el('div', { className: 'feat' }, el('div', { className: 'feat-head' }, el('span', { className: 'feat-name' }, f.label), badge, btn), o));
  }
}

function setBusy(b) {
  state.busy = b;
  for (const btn of $('features').querySelectorAll('button')) {
    btn.disabled = b || btn.disabled;
  }
  if (!b) renderFeatures();
}

function renderProfiles() {
  const list = $('prof-list');
  list.replaceChildren();
  const all = profiles();
  if (!all.length) list.append(el('li', {}, 'Belum ada profil. Impor JSON untuk mengaktifkan reset absorber dan ink charge.'));
  for (const p of all) {
    const del = el('button', { textContent: 'Hapus', hidden: !!p.demo || BUILTIN_PROFILES.includes(p) });
    del.addEventListener('click', () => {
      state.userProfiles = state.userProfiles.filter((x) => x.id !== p.id);
      store.set('rp.profiles', state.userProfiles);
      refresh();
    });
    list.append(el('li', {}, el('span', {}, `${p.name} [${p.brand}] - ${Object.keys(p.ops).join(', ')}${p.verified ? '' : ' (belum terverifikasi)'}`), del));
  }
}

function importProfile(text) {
  try {
    const p = loadProfile(text);
    state.userProfiles = [...state.userProfiles.filter((x) => x.id !== p.id), p];
    store.set('rp.profiles', state.userProfiles);
    log(`Profil diimpor: ${p.name}`);
    refresh();
  } catch (e) {
    log(`Impor profil gagal: ${e.message}`);
    alert(e.message);
  }
}

function refreshModelList() {
  $('model-list').replaceChildren(...MODELS.filter((m) => m.brand === brand()).map((m) => el('option', { value: m.name })));
}

function refresh() {
  renderFeatures();
  renderProfiles();
}

// ---------- koneksi ----------
function setConnected(transport) {
  state.transport = transport;
  const pill = $('conn-pill');
  pill.textContent = transport ? (transport.kind === 'demo' ? 'Mode demo (simulasi)' : `Terhubung: ${transport.label}`) : 'Belum terhubung';
  pill.className = `pill ${transport ? (transport.kind === 'demo' ? 'demo' : 'on') : 'off'}`;
  $('btn-disc').hidden = !transport;
  $('btn-usb').hidden = !!transport;
  $('btn-demo').hidden = !!transport;
  if (!transport) $('devinfo').hidden = true;
  refresh();
}

async function identify() {
  try {
    state.devId = parseDeviceId(await t().getDeviceId());
  } catch (e) {
    state.devId = null;
    log(`Device ID gagal dibaca: ${e.message}`);
    $('detect-note').textContent = 'Device ID tidak terbaca. Pilih merek dan model secara manual.';
    return;
  }
  log(`Device ID: ${state.devId.raw}`);
  const b = brandFromManufacturer(state.devId.manufacturer);
  if (b) $('brand').value = b;
  refreshModelList();
  const m = findModel(b, state.devId.model);
  $('model').value = m ? m.name : state.devId.model.replace(/\s*series\s*/i, '');
  $('detect-note').textContent = m
    ? `Terdeteksi otomatis: ${b} ${m.name}.`
    : 'Model tidak ada di database. Perintah bawaan tetap bisa dicoba; fitur lain butuh profil.';
  const dl = $('devinfo');
  dl.replaceChildren(
    ...Object.entries(state.devId.fields).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]),
  );
  dl.hidden = false;
}

async function connect(factory) {
  try {
    const tr = await factory();
    setConnected(tr);
    log(`Terhubung: ${tr.label}`);
    await identify();
    refresh();
  } catch (e) {
    if (e.name === 'NotFoundError') return log('Pemilihan perangkat dibatalkan.');
    log(`Koneksi gagal: ${e.message}`);
    $('detect-note').textContent = e.message;
  }
}

// ---------- init ----------
function init() {
  const compat = $('compat');
  if (!UsbTransport.isSupported()) {
    compat.className = 'banner bad';
    compat.textContent = 'Browser ini tidak mendukung WebUSB. Pakai Chrome, Edge, atau Opera lewat HTTPS. Mode demo tetap bisa dicoba.';
    compat.hidden = false;
    $('btn-usb').disabled = true;
  } else if (/Windows/.test(navigator.userAgent)) {
    compat.textContent = 'Windows: driver bawaan printer menahan perangkat sehingga browser sering gagal mengklaimnya. Jika koneksi gagal, ganti driver USB ke WinUSB (mis. dengan Zadig) atau pakai Android/Linux/ChromeOS. Mengganti driver mengganggu fungsi cetak normal sampai driver dipulihkan.';
    compat.hidden = false;
  }

  state.userProfiles = store.get('rp.profiles', []).flatMap((p) => { try { return [loadProfile(p)]; } catch { return []; } });
  refreshModelList();

  $('btn-usb').addEventListener('click', () => connect(() => UsbTransport.request()));
  $('btn-demo').addEventListener('click', () => connect(async () => new DemoTransport(brand())));
  $('btn-disc').addEventListener('click', async () => {
    try { await t().close(); } catch { /* sudah terputus */ }
    state.devId = null;
    setConnected(null);
    log('Koneksi diputus.');
  });
  $('brand').addEventListener('change', () => { refreshModelList(); $('model').value = ''; refresh(); });
  $('model').addEventListener('input', refresh);
  $('prof-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) importProfile(await f.text());
    e.target.value = '';
  });
  $('prof-paste-btn').addEventListener('click', () => importProfile($('prof-text').value));
  $('raw-send').addEventListener('click', async () => {
    if (!t()) return alert('Hubungkan printer dulu.');
    let bytes;
    try { bytes = hexToBytes($('raw-hex').value); } catch (e) { return alert(e.message); }
    const ok = await ask({ title: 'Kirim byte raw', body: [el('p', {}, 'Byte yang salah dapat mengubah memori printer.'), el('pre', { className: 'out mono' }, bytesToHex(bytes))], ack: 'Saya paham risikonya.', danger: true, okLabel: 'Kirim' });
    if (!ok) return;
    const box = $('raw-out');
    box.hidden = false;
    try {
      log(`RAW TX ${bytesToHex(bytes)}`);
      if (dry()) { box.textContent = 'Dry-run: tidak dikirim.'; return; }
      await t().send(bytes);
      let text = `TX ${bytesToHex(bytes)}`;
      if ($('raw-read').checked) {
        const rx = await t().receive(512, 3000);
        text += `\nRX ${bytesToHex(rx)}\n    ${new TextDecoder('latin1').decode(rx).replace(/[^\x20-\x7e]/g, '.')}`;
        log(`RAW RX ${bytesToHex(rx)}`);
      }
      box.textContent = text;
    } catch (e) {
      box.textContent = `Gagal: ${e.message}`;
      log(`RAW gagal: ${e.message}`);
    }
  });
  $('log-clear').addEventListener('click', () => { logLines.length = 0; $('log').textContent = ''; });
  $('log-dl').addEventListener('click', () => {
    const a = el('a', { href: URL.createObjectURL(new Blob([logLines.join('\n')], { type: 'text/plain' })), download: 'reseter-log.txt' });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  refresh();
  log('Siap. Hubungkan printer via USB atau coba mode demo.');
}

init();
