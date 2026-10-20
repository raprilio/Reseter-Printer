import { MODELS, USB_VENDORS, findModel, CANON_ERRORS, EPSON_ERRORS } from './models.js';
import { parseDeviceId } from './deviceid.js';
import { WebUsbTransport } from './transport.js';
import { DemoTransport, DEMO_PROFILE } from './demo.js';
import * as epson from './epson.js';
import { validateProfile, profileMatches, runSteps, evalCounters, toHex, parseData } from './profile.js';

const $ = (id) => document.getElementById(id);
const state = { t: null, dev: null, model: null, profile: null, busy: false };

// ---------- util ----------
const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem('profiles') || '[]');
    } catch {
      return [];
    }
  },
  set(v) {
    try {
      localStorage.setItem('profiles', JSON.stringify(v));
    } catch {
      /* penyimpanan diblokir */
    }
  },
};

function log(kind, msg) {
  const el = $('log');
  const line = document.createElement('div');
  line.className = kind;
  const ts = new Date().toLocaleTimeString('id-ID');
  line.textContent = `${ts} ${kind === 'tx' ? '→' : kind === 'rx' ? '←' : '•'} ${msg}`;
  el.append(line);
  el.scrollTop = el.scrollHeight;
}
const ioLog = (dir, bytes) => {
  const ascii = [...bytes].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
  log(dir, `${toHex(bytes) || '(kosong)'}  |${ascii}|`);
};

function banner(msg, isErr = false) {
  const b = $('banner');
  b.hidden = !msg;
  b.className = `banner${isErr ? ' err' : ''}`;
  b.textContent = msg || '';
}

const ejlOpt = () => ({ ejlInit: $('optEjl').checked });
const isEpson = () => state.dev?.brand === 'epson';

function inkColor(name) {
  const n = name.toUpperCase();
  if (n === 'K' || n.includes('BK')) return 'var(--k)';
  if (n === 'C') return 'var(--c)';
  if (n === 'M') return 'var(--m)';
  if (n === 'Y') return 'var(--y)';
  return 'var(--other)';
}

function bar(label, pct, color, text, low) {
  const d = document.createElement('div');
  d.className = `bar${low ? ' low' : ''}`;
  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = 'fill';
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  fill.style.background = color;
  track.append(fill);
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'val';
  v.textContent = text;
  d.append(l, track, v);
  return d;
}

function fill(container, nodes) {
  container.classList.remove('empty');
  container.replaceChildren(...nodes);
}

// ---------- UI state ----------
function opFor(key) {
  return state.profile?.ops?.[key] || null;
}

function refreshButtons() {
  const on = Boolean(state.t) && !state.busy;
  $('btnInk').disabled = !on || !isEpson();
  $('btnNozzle').disabled = !on || !isEpson();
  $('btnClean').disabled = !on || !isEpson();
  $('btnRaw').disabled = !on;
  for (const btn of document.querySelectorAll('[data-op]')) btn.disabled = !on || !opFor(btn.dataset.op);

  $('inkHint').textContent = !state.t
    ? ''
    : !isEpson()
      ? 'Status tinta Canon via USB belum didukung. Pantau lewat driver/indikator printer.'
      : '';
  const missing = state.t && !state.profile;
  $('wasteHint').textContent = missing
    ? 'Belum ada profil untuk model ini: cek counter dan reset dinonaktifkan. Impor profil di kartu "Profil model".'
    : '';
  $('profileState').textContent = state.profile
    ? `Aktif: ${state.profile.name}${state.profile.verified || state.profile.demo ? '' : ' (belum ditandai terverifikasi)'}`
    : 'Tidak ada profil aktif.';
  $('connState').textContent = !state.t ? 'Tidak terhubung' : state.t.kind === 'demo' ? 'Mode demo' : 'Terhubung';
  $('connState').className = `pill ${!state.t ? 'off' : state.t.kind === 'demo' ? 'demo' : 'on'}`;
  $('btnConnect').hidden = $('btnDemo').hidden = Boolean(state.t);
  $('btnDisconnect').hidden = !state.t;
}

async function guarded(label, fn) {
  if (state.busy) return;
  state.busy = true;
  refreshButtons();
  try {
    log('inf', label);
    await fn();
  } catch (e) {
    log('err', `${label} gagal: ${e.message}`);
    banner(`${label} gagal: ${e.message}`, true);
  } finally {
    state.busy = false;
    refreshButtons();
  }
}

function pickProfile() {
  if (state.t?.kind === 'demo') return DEMO_PROFILE;
  const mdl = state.dev?.mdl || '';
  return store.get().find((p) => profileMatches(p, mdl)) || null;
}

// ---------- connect ----------
async function afterOpen(t) {
  state.t = t;
  const raw = await t.getDeviceId();
  log('rx', `Device ID: ${raw}`);
  state.dev = parseDeviceId(raw);
  state.model = findModel(state.dev.brand, state.dev.mdl);
  state.profile = pickProfile();
  const rows = [
    ['Merek', state.dev.mfg || '?'],
    ['Model', state.dev.mdl || '?'],
    ['Di database', state.model ? `${state.model.model}${state.model.family ? ` — ${state.model.family}` : ''}` : 'Tidak ada (tetap bisa dipakai, perintah generik)'],
    ['Perintah', state.dev.cmd.join(', ') || '-'],
    ['Transport', t.kind === 'demo' ? 'Simulasi' : t.bidirectional ? 'WebUSB (dua arah)' : 'WebUSB (satu arah, tidak bisa membaca balasan)'],
  ];
  $('deviceInfo').replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    })
  );
  for (const li of $('modelList').children) li.classList.toggle('active', li.dataset.model === state.model?.model);
  if (state.dev.brand === 'unknown') banner('Merek tidak dikenali sebagai Epson/Canon. Fitur otomatis dinonaktifkan.');
  else banner(t.kind === 'demo' ? 'Mode demo: semua data simulasi, tidak ada printer yang disentuh.' : '');
  refreshButtons();
}

async function connectUsb() {
  if (!('usb' in navigator)) {
    banner('Browser ini tidak mendukung WebUSB. Gunakan Chrome/Edge (desktop) atau Chrome di Android, dan buka lewat HTTPS atau localhost.', true);
    return;
  }
  await guarded('Menghubungkan printer', async () => {
    const dev = await WebUsbTransport.request(Object.values(USB_VENDORS));
    const t = new WebUsbTransport(dev);
    await t.open();
    await afterOpen(t);
  });
}

async function disconnect() {
  await state.t?.close();
  Object.assign(state, { t: null, dev: null, model: null, profile: null });
  $('deviceInfo').replaceChildren(Object.assign(document.createElement('dt'), { textContent: 'Status' }), Object.assign(document.createElement('dd'), { textContent: 'Belum ada printer terhubung.' }));
  for (const id of ['inkBars', 'wasteBars']) {
    $(id).className = 'bars empty';
    $(id).textContent = 'Belum dibaca.';
  }
  $('wasteVerdict').hidden = true;
  for (const li of $('modelList').children) li.classList.remove('active');
  banner('');
  refreshButtons();
}

// ---------- operations ----------
async function readInk() {
  const inks = state.model?.inks || ['K', 'C', 'M', 'Y'];
  const r = await epson.readInkLevels(state.t, inks, ejlOpt());
  ioLog('rx', r.reply);
  if (!r.ok) {
    $('inkBars').className = 'bars empty';
    $('inkBars').textContent = `${r.reason}${r.hex ? ` Mentah: ${r.hex}` : ''}`;
    return;
  }
  fill($('inkBars'), r.levels.map((l) => bar(l.name, l.percent, inkColor(l.name), `${l.percent}%`, l.percent <= 10)));
}

function confirmTyped({ title, body, word }) {
  const dlg = $('confirmDlg');
  $('dlgTitle').textContent = title;
  $('dlgBody').textContent = body;
  $('dlgWord').textContent = word;
  $('dlgInput').value = '';
  $('dlgOk').disabled = true;
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

async function runProfileOp(key) {
  const op = opFor(key);
  if (!op) throw new Error('Profil tidak punya operasi ini.');
  if (!state.profile.demo && !profileMatches(state.profile, state.dev.mdl)) throw new Error('Profil tidak cocok dengan model yang terhubung.');
  if (op.write) {
    const warn =
      key === 'resetWaste'
        ? 'Reset hanya mengubah angka counter. Bantalan waste ink fisik TIDAK dikosongkan; jika sudah jenuh, tinta bisa meluber dan merusak printer. Ganti/cuci pad lebih dulu.'
        : 'Operasi ini menulis ke printer dan tidak bisa dibatalkan.';
    const ok = await confirmTyped({ title: op.label || key, body: warn, word: 'RESET' });
    if (!ok) {
      log('inf', 'Dibatalkan oleh pengguna.');
      return null;
    }
  }
  const reply = await runSteps(state.t, op.steps, ioLog);
  log('inf', `${op.label || key}: selesai.`);
  return { op, reply };
}

async function checkAbsorber() {
  const res = await runProfileOp('readCounters');
  if (!res) return;
  const counters = evalCounters(res.reply, res.op.parse);
  if (!counters.length) throw new Error('Profil tidak mendefinisikan parse.counters.');
  fill($('wasteBars'), counters.map((c) => {
    const pct = c.percent ?? 0;
    return bar(c.label, pct, pct >= 100 ? 'var(--danger)' : pct >= 90 ? 'var(--warn)' : 'var(--ok)', c.max ? `${Math.round(pct)}%` : String(c.value), pct >= 90);
  }));
  const worst = Math.max(...counters.map((c) => c.percent ?? 0));
  const v = $('wasteVerdict');
  v.hidden = false;
  v.className = `verdict ${worst >= 100 ? 'full' : worst >= 90 ? 'near' : 'good'}`;
  v.textContent = worst >= 100 ? 'ABSORBER FULL' : worst >= 90 ? 'Absorber hampir penuh' : 'Absorber masih aman';
}

async function resetWaste() {
  const res = await runProfileOp('resetWaste');
  if (res) await checkAbsorber();
}

async function inkCharge() {
  const res = await runProfileOp('inkCharge');
  if (res && isEpson()) await readInk();
}

async function rawSend() {
  const data = parseData(`hex:${$('rawHex').value}`);
  ioLog('tx', data);
  await state.t.write(data);
  ioLog('rx', await state.t.readFor({ timeoutMs: 1500 }));
}

// ---------- profile import ----------
async function importProfile(file) {
  try {
    const p = JSON.parse(await file.text());
    const errs = validateProfile(p);
    if (errs.length) throw new Error(errs.join(' | '));
    const list = store.get().filter((x) => x.match.model !== p.match.model);
    store.set([...list, p]);
    log('inf', `Profil "${p.name}" disimpan.`);
    banner('');
    if (state.dev) {
      state.profile = pickProfile();
      refreshButtons();
    }
  } catch (e) {
    banner(`Profil ditolak: ${e.message}`, true);
  }
}

// ---------- static content ----------
function renderModels() {
  const q = $('modelSearch').value.trim().toUpperCase();
  const brand = $('modelBrand').value;
  const items = MODELS.filter((m) => (!brand || m.brand === brand) && (!q || m.model.toUpperCase().includes(q)));
  $('modelList').replaceChildren(
    ...items.map((m) => {
      const li = document.createElement('li');
      li.className = m.brand;
      li.dataset.model = m.model;
      li.textContent = `${m.brand === 'epson' ? 'Epson' : 'Canon'} ${m.model}`;
      li.title = m.note || m.family || '';
      li.classList.toggle('active', m.model === state.model?.model);
      return li;
    })
  );
}

function renderGuide() {
  const table = (title, rows) => {
    const wrap = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = title;
    const tb = document.createElement('table');
    for (const r of rows) {
      const tr = tb.insertRow();
      tr.insertCell().textContent = r.code;
      tr.insertCell().textContent = r.meaning;
    }
    wrap.append(h, tb);
    return wrap;
  };
  $('guide').replaceChildren(table('Canon', CANON_ERRORS), table('Epson', EPSON_ERRORS));
}

// ---------- wire up ----------
$('btnConnect').onclick = connectUsb;
$('btnDemo').onclick = () => guarded('Memulai mode demo', () => afterOpen(new DemoTransport()));
$('btnDisconnect').onclick = disconnect;
$('btnInk').onclick = () => guarded('Membaca status tinta', readInk);
$('btnNozzle').onclick = () => guarded('Cek nozzle', async () => { await epson.nozzleCheck(state.t, ejlOpt()); log('inf', 'Perintah nozzle check terkirim; printer harus mencetak pola.'); });
$('btnClean').onclick = () => guarded('Pembersihan head', async () => { await epson.headCleaning(state.t, ejlOpt()); log('inf', 'Perintah head cleaning terkirim (memakai tinta & menambah waste counter).'); });
$('btnCheckAbs').onclick = () => guarded('Cek absorber', checkAbsorber);
$('btnReset').onclick = () => guarded('Reset waste ink counter', resetWaste);
$('btnCharge').onclick = () => guarded('Ink charge', inkCharge);
$('btnRaw').onclick = () => guarded('Kirim hex mentah', rawSend);
$('btnClearLog').onclick = () => $('log').replaceChildren();
$('btnClearProfiles').onclick = () => { store.set([]); log('inf', 'Profil tersimpan dihapus.'); if (state.dev) { state.profile = pickProfile(); refreshButtons(); } };
$('fileProfile').onchange = (e) => e.target.files[0] && importProfile(e.target.files[0]);
$('modelSearch').oninput = $('modelBrand').onchange = renderModels;
$('dlgInput').oninput = () => { $('dlgOk').disabled = $('dlgInput').value.trim().toUpperCase() !== $('dlgWord').textContent; };

renderModels();
renderGuide();
refreshButtons();
