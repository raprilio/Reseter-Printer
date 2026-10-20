// Profil perintah per model. Inilah tempat urutan byte khusus (counter absorber, ink charge,
// dst.) disimpan sebagai DATA, bukan dikode keras. Format lengkap ada di profiles/README.md.

export function hexToBytes(hex) {
  const clean = String(hex).replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (!clean || /[^0-9a-f]/i.test(clean)) throw new Error('Hex tidak valid: ' + hex);
  if (clean.length % 2) throw new Error('Hex ganjil: ' + hex);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const bytesToHex = (b) =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ').toUpperCase();

export function validateProfile(p) {
  const err = (m) => {
    throw new Error('Profil tidak valid: ' + m);
  };
  if (!p || typeof p !== 'object') err('bukan objek');
  if (p.schema !== 1) err('schema harus 1');
  if (!p.id || !p.name) err('id dan name wajib');
  if (!['epson', 'canon'].includes(p.brand)) err('brand harus epson atau canon');
  if (!Array.isArray(p.models) || !p.models.length) err('models kosong');
  if (!p.ops || typeof p.ops !== 'object') err('ops kosong');
  for (const [name, op] of Object.entries(p.ops)) {
    if (!Array.isArray(op.steps) || !op.steps.length) err(`${name}: steps kosong`);
    for (const s of op.steps) hexToBytes(s.tx); // melempar jika hex salah
    for (const c of op.counters || []) {
      if (!(c.length >= 1 && c.length <= 4)) err(`${name}: length counter 1-4`);
      if (!(c.max > 0)) err(`${name}: max counter harus > 0`);
    }
  }
  return p;
}

export function loadProfile(json) {
  return validateProfile(typeof json === 'string' ? JSON.parse(json) : json);
}

export function readCounter(bytes, c) {
  let v = 0;
  for (let i = 0; i < c.length; i++) {
    const byte = bytes[c.offset + i];
    if (byte === undefined) throw new Error(`Respons terlalu pendek untuk "${c.name}"`);
    v = c.endian === 'be' ? v * 256 + byte : v + byte * 256 ** i;
  }
  return v;
}

// transport: { send(Uint8Array), receive(maxLen, timeoutMs) -> Uint8Array }
export async function runOp(transport, op, { dryRun = false, onLog = () => {} } = {}) {
  const steps = [];
  let lastRx = null;
  for (const [i, s] of op.steps.entries()) {
    const tx = hexToBytes(s.tx);
    const entry = { index: i, tx: bytesToHex(tx), rx: null };
    onLog(`TX[${i}] ${entry.tx}`);
    if (!dryRun) {
      await transport.send(tx);
      if (s.rx) {
        lastRx = await transport.receive(s.rx.len ?? 64, s.rx.timeoutMs ?? 3000);
        entry.rx = bytesToHex(lastRx);
        onLog(`RX[${i}] ${entry.rx}`);
      }
      if (s.delayMs) await new Promise((r) => setTimeout(r, s.delayMs));
    }
    steps.push(entry);
  }
  const counters = [];
  if (!dryRun && op.counters?.length) {
    if (!lastRx) throw new Error('Profil mendefinisikan counters tetapi tidak ada step rx');
    for (const c of op.counters) {
      const value = readCounter(lastRx, c);
      const percent = Math.min(100, (value / c.max) * 100);
      counters.push({ name: c.name, value, max: c.max, percent, full: value >= c.max });
    }
  }
  return { steps, counters, rx: lastRx };
}
