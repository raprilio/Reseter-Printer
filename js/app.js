import { UsbTransport } from './usb.js';
import { DemoTransport, demoProfiles } from './demo.js';
import { BUILTIN_PROFILES } from './builtin-profiles.js';
import { parseDeviceId } from './ieee1284.js';
import { MODELS, brandFromManufacturer, findModel, normalize } from './models.js';
import { listOperations, isResetGroup } from './operations.js';
import * as epson from './epson.js';
import { loadProfile, runOp, hexToBytes, bytesToHex } from './profiles.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};
const BRAND_NAME = { epson: 'Epson', canon: 'Canon' };

const state = { brand: 'epson', model: '', search: '', transport: null, devId: null, userProfiles: [], busy: false };

// ---------- util ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage diblokir */ } },
};
const logLines = [];
function log(msg) {
  logLines.push(`${new Date().toLocaleTimeString('id-ID')}  ${msg}`);
  const box = $('log');
  box.textContent = logLines.join('\n');
  box.scrollTop = box.scrollHeight;
}
const t = () => state.transport;
const dry = () => $('dry').checked;
const profiles = () => [
  ...BUILTIN_PROFILES,
  ...state.userProfiles,
  ...(state.transport?.kind === 'demo' ? demoProfiles() : []),
];
const currentOps = () => (state.model ? listOperations(state.brand, state.model, profiles()) : []);

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
    box.append(el('div', { className: 'bar' },
      el('span', {}, i.color),
      el('div', { className: 'track' }, el('div', { className: `fill ${cls}`, style: `width:${i.level}%` })),
      el('span', {}, `${i.level}%`)));
  }
  return box;
}
function counterBars(counters) {
  const box = el('div', { className: 'bars' });
  for (const c of counters) {
    const cls = c.percent >= 100 ? 'hot' : c.percent >= 80 ? 'mid' : '';
    box.append(el('div', { className: 'bar' },
      el('span', {}, c.name),
      el('div', { className: 'track' }, el('div', { className: `fill ${cls}`, style: `width:${c.percent}%` })),
      el('span', {}, `${c.percent.toFixed(0)}%`)));
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
const show = (id, ...nodes) => $(`out-${id}`)?.replaceChildren(...nodes);
const steps = (r) => el('pre', { className: 'out mono' }, r.steps.map((s) => `TX ${s.tx}${s.rx ? `\nRX ${s.rx}` : ''}`).join('\n'));
const dryNote = () => el('div', { className: 'verdict warn' }, 'Dry-run: tidak ada yang dikirim.');

// ---------- eksekusi ----------
async function runProfile(id, profile) {
  const r = await runOp(t(), profile.ops[id], { dryRun: dry(), onLog: log });
  const nodes = [];
  if (dry()) nodes.push(dryNote());
  else if (!r.counters.length) nodes.push(el('div', { className: 'verdict ok' }, 'Perintah terkirim. Periksa hasilnya pada printer.'));
  if (r.counters.length) nodes.push(counterBars(r.counters));
  nodes.push(steps(r));
  show(id, ...nodes);
  return r;
}

async function sendBuiltin(id, bytes, note) {
  log(`TX ${bytesToHex(bytes)}`);
  if (dry()) return show(id, dryNote(), hexBlock('TX', bytes));
  await t().send(bytes);
  show(id, el('div', { className: 'verdict ok' }, note), hexBlock('TX', bytes));
}

// Perintah bawaan (tanpa profil). Hanya tersedia untuk Epson, dan Canon untuk status.
const BUILTIN = {
  async status() {
    if (state.brand === 'canon') {
      const sta = state.devId?.fields.STA;
      return show('status',
        el('div', { className: 'verdict warn' }, sta ? `Kode STA dari Device ID: ${sta}` : 'Printer tidak melaporkan field STA di Device ID.'),
        el('p', { className: 'note' }, 'Level tinta Canon tidak tersedia lewat Device ID; butuh profil.'));
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
  nozzleCheck: () => sendBuiltin('nozzleCheck', epson.cmdNozzleCheck(), 'Perintah terkirim. Periksa hasil cetak printer.'),
  headClean: () => sendBuiltin('headClean', epson.cmdHeadClean(), 'Perintah terkirim. Tunggu printer selesai.'),
};

async function perform(id) {
  const item = currentOps().find((o) => o.id === id);
  if (!item?.available || state.busy || !t()) return;
  const profile = item.profile;

  if (item.mutating || item.confirmText) {
    const body = [el('p', {}, item.confirmText || profile?.ops[id]?.message || item.desc)];
    if (profile) {
      const preview = await runOp(t(), profile.ops[id], { dryRun: true });
      body.push(el('p', { className: 'note' }, 'Perintah yang akan dikirim:'), steps(preview));
    }
    if (item.level === 'experimental') body.push(el('p', { className: 'note' }, 'Perintah ini eksperimental dan belum diuji pada printer nyata.'));
    const unverified = profile && !profile.verified && !profile.demo;
    if (unverified) body.push(el('p', { className: 'note' }, `Profil "${profile.name}" belum terverifikasi pada printer nyata.`));
    if (dry()) body.push(el('p', { className: 'note' }, 'Dry-run aktif: tidak ada yang akan dikirim.'));
    const ack = item.ack || (item.danger ? 'Saya paham risikonya.' : null);
    const ackText = [ack, unverified && !(ack || '').includes('belum diuji') && 'Saya paham perintah ini belum diuji pada printer nyata.']
      .filter(Boolean).join(' ') || null;
    const ok = await ask({
      title: `${item.label}: ${BRAND_NAME[state.brand]} ${state.model}`,
      body, ack: ackText, danger: item.danger, okLabel: 'Jalankan',
    });
    if (!ok) return;
  }

  setBusy(true);
  try {
    log(`Mulai: ${item.label}`);
    if (profile) await runProfile(id, profile);
    else if (BUILTIN[id]) await BUILTIN[id]();
    else throw new Error('Belum ada implementasi; tambahkan profil model ini.');
    log(`Selesai: ${item.label}`);
    if (isResetGroup(item) && id !== 'wasteRead' && profile?.ops.wasteRead && !dry()) {
      log('Verifikasi: membaca ulang counter absorber');
      await runProfile('wasteRead', profile);
    }
  } catch (e) {
    log(`GAGAL ${item.label}: ${e.message}`);
    show(id, el('div', { className: 'verdict bad' }, e.message));
  } finally {
    setBusy(false);
  }
}

// ---------- tampilan: daftar model ----------
function renderModels() {
  const q = normalize(state.search);
  const list = MODELS.filter((m) => m.brand === state.brand && (!q || normalize(m.name).includes(q)));
  const ul = $('model-list');
  ul.replaceChildren();
  for (const m of list) {
    const ops = listOperations(m.brand, m.name, profiles()).filter((o) => o.available);
    const reset = ops.some((o) => isResetGroup(o) && o.level === 'profile-ready');
    const btn = el('button', { type: 'button' },
      el('span', { className: 'mname' }, m.name),
      el('span', { className: `mtag${reset ? ' ok' : ''}` }, reset ? `Reset tersedia · ${ops.length} perintah` : `${ops.length} perintah`));
    if (m.name === state.model) btn.setAttribute('aria-current', 'true');
    btn.addEventListener('click', () => selectModel(m.brand, m.name));
    ul.append(el('li', {}, btn));
  }
  const raw = state.search.trim();
  if (raw && !MODELS.some((m) => m.brand === state.brand && normalize(m.name) === q)) {
    const btn = el('button', { type: 'button' }, el('span', { className: 'mname' }, `Pakai "${raw}"`), el('span', { className: 'mtag' }, 'model kustom'));
    btn.addEventListener('click', () => selectModel(state.brand, raw));
    ul.append(el('li', {}, btn));
  }
  for (const b of ['epson', 'canon']) $(`tab-${b}`).setAttribute('aria-pressed', String(state.brand === b));
  $('pick-note').textContent = state.model
    ? `Terpilih: ${BRAND_NAME[state.brand]} ${state.model}`
    : 'Belum ada model dipilih. Perintah muncul setelah Anda memilih, atau otomatis saat printer terhubung.';
}

function selectModel(brand, name) {
  state.brand = brand;
  state.model = name;
  refresh();
}

// ---------- tampilan: daftar perintah ----------
const LEVEL_LABEL = { builtin: 'Bawaan', experimental: 'Eksperimental' };
function badgeFor(o) {
  if (o.level === 'profile-ready') {
    const p = o.profile;
    return p.demo ? ['Simulasi', 'profile-ready'] : p.verified ? ['Terverifikasi', 'builtin'] : ['Belum diuji', 'experimental'];
  }
  return [LEVEL_LABEL[o.level] || '', o.level];
}

function opRow(o, withButton) {
  const text = el('span', { className: 'feat-text' }, el('span', { className: 'feat-name' }, o.label), el('span', { className: 'feat-desc' }, withButton ? o.desc : o.reason));
  const head = el('div', { className: 'feat-head' }, text);
  if (withButton) {
    const [label, cls] = badgeFor(o);
    head.append(el('span', { className: `badge ${cls}` }, label));
    const btn = el('button', { id: `btn-${o.id}`, disabled: !t() || state.busy }, 'Jalankan');
    if (o.danger) btn.classList.add('danger');
    btn.addEventListener('click', () => perform(o.id));
    head.append(btn);
  }
  return el('div', { className: 'feat' }, head, withButton ? el('div', { className: 'out', id: `out-${o.id}` }) : null);
}

function renderOps() {
  const host = $('ops');
  const keep = new Map([...host.querySelectorAll('.out')].map((n) => [n.id, [...n.childNodes]]));
  host.replaceChildren();
  $('ops-model').textContent = state.model ? `${BRAND_NAME[state.brand]} ${state.model}` : '';
  if (!state.model) {
    host.append(el('p', { className: 'note' }, 'Pilih model printer di langkah 1.'));
    return;
  }
  const ops = currentOps();
  const avail = ops.filter((o) => o.available);
  const na = ops.filter((o) => !o.available);
  let last = null;
  for (const o of avail) {
    if (o.group !== last) { host.append(el('div', { className: 'grp' }, o.group)); last = o.group; }
    const row = opRow(o, true);
    const prev = keep.get(`out-${o.id}`);
    if (prev) row.querySelector('.out').append(...prev);
    host.append(row);
  }
  if (!t() && avail.length) host.prepend(el('p', { className: 'note' }, 'Hubungkan printer di langkah 2 untuk mengaktifkan tombol Jalankan.'));
  if (na.length) {
    host.append(el('details', { className: 'na' }, el('summary', {}, `Belum tersedia untuk model ini (${na.length})`), ...na.map((o) => opRow(o, false))));
  }
}

function setBusy(b) {
  state.busy = b;
  for (const btn of $('ops').querySelectorAll('button')) btn.disabled = b || btn.disabled;
  if (!b) renderOps();
}

function renderProfiles() {
  const list = $('prof-list');
  list.replaceChildren();
  const all = profiles();
  for (const p of all) {
    const del = el('button', { textContent: 'Hapus', hidden: !!p.demo || BUILTIN_PROFILES.includes(p) });
    del.addEventListener('click', () => {
      state.userProfiles = state.userProfiles.filter((x) => x.id !== p.id);
      store.set('rp.profiles', state.userProfiles);
      refresh();
    });
    list.append(el('li', {}, el('span', {}, `${p.name} [${p.brand}] - ${Object.keys(p.ops).length} perintah${p.verified ? '' : ' (belum terverifikasi)'}`), del));
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

function refresh() {
  renderModels();
  renderOps();
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
  if (!transport) {
    $('devinfo').hidden = true;
    $('detect-note').textContent = '';
  }
  refresh();
}

async function identify() {
  try {
    state.devId = parseDeviceId(await t().getDeviceId());
  } catch (e) {
    state.devId = null;
    log(`Device ID gagal dibaca: ${e.message}`);
    $('detect-note').textContent = 'Device ID tidak terbaca. Pilih merek dan model secara manual di langkah 1.';
    return;
  }
  log(`Device ID: ${state.devId.raw}`);
  const dl = $('devinfo');
  dl.replaceChildren(...Object.entries(state.devId.fields).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  dl.hidden = false;
  if (t().kind === 'demo' && state.model) {
    $('detect-note').textContent = 'Mode demo: memakai model yang Anda pilih.';
    return;
  }
  const b = brandFromManufacturer(state.devId.manufacturer);
  const m = findModel(b, state.devId.model);
  if (b) {
    selectModel(b, m ? m.name : state.devId.model.replace(/\s*series\s*/i, ''));
    $('detect-note').textContent = m
      ? `Terdeteksi otomatis: ${BRAND_NAME[b]} ${m.name}.`
      : 'Model tidak ada di daftar. Perintah bawaan tetap bisa dicoba; fitur lain butuh profil.';
  }
}

async function connect(factory) {
  try {
    const tr = await factory();
    setConnected(tr);
    log(`Terhubung: ${tr.label}`);
    await identify();
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

  for (const b of ['epson', 'canon']) {
    $(`tab-${b}`).addEventListener('click', () => {
      if (state.brand !== b) state.model = '';
      state.brand = b;
      refresh();
    });
  }
  $('model-search').addEventListener('input', (e) => { state.search = e.target.value; renderModels(); });

  $('btn-usb').addEventListener('click', () => connect(() => UsbTransport.request()));
  $('btn-demo').addEventListener('click', () => connect(async () => new DemoTransport(state.brand)));
  $('btn-disc').addEventListener('click', async () => {
    try { await t().close(); } catch { /* sudah terputus */ }
    state.devId = null;
    setConnected(null);
    log('Koneksi diputus.');
  });
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
  log('Siap. Pilih printer di langkah 1.');
}

init();
