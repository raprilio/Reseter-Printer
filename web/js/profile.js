// Mesin "profil" data-driven: urutan perintah USB per model (baca counter, reset waste, ink charge, dst.)
// Profil ditulis sebagai JSON sehingga data/kunci spesifik model tidak di-hardcode di aplikasi.

export function parseData(spec) {
  const s = String(spec);
  if (s.startsWith('hex:')) {
    const clean = s.slice(4).replace(/[\s,]|0x/gi, '');
    if (!/^([0-9a-f]{2})*$/i.test(clean)) throw new Error(`Hex tidak valid: ${s}`);
    return Uint8Array.from(clean.match(/../g) || [], (h) => parseInt(h, 16));
  }
  if (s.startsWith('text:')) return Uint8Array.from(s.slice(5), (c) => c.charCodeAt(0) & 0xff);
  throw new Error(`Data harus diawali "hex:" atau "text:": ${s}`);
}

export const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

export function validateProfile(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['Profil harus berupa objek JSON.'];
  if (!p.name) errs.push('Field "name" wajib.');
  if (!p.match?.model) errs.push('Field "match.model" wajib (mis. "L3210").');
  if (!p.ops || typeof p.ops !== 'object') errs.push('Field "ops" wajib.');
  for (const [key, op] of Object.entries(p.ops || {})) {
    if (!Array.isArray(op.steps) || !op.steps.length) errs.push(`ops.${key}: "steps" kosong.`);
    for (const [i, st] of (op.steps || []).entries()) {
      try {
        if (st.send !== undefined) parseData(st.send);
        else if (!st.read && st.delay === undefined) errs.push(`ops.${key}.steps[${i}]: butuh send/read/delay.`);
      } catch (e) {
        errs.push(`ops.${key}.steps[${i}]: ${e.message}`);
      }
    }
    if (op.write === undefined) errs.push(`ops.${key}: tandai "write": true/false secara eksplisit.`);
  }
  return errs;
}

export function profileMatches(profile, mdl) {
  const n = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n(mdl).includes(n(profile.match.model));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Jalankan langkah-langkah; kembalikan gabungan semua byte balasan. */
export async function runSteps(t, steps, log = () => {}) {
  let all = new Uint8Array(0);
  for (const st of steps) {
    if (st.send !== undefined) {
      const data = parseData(st.send);
      log('tx', data);
      await t.write(data);
    }
    if (st.delay) await sleep(st.delay);
    if (st.read) {
      const r = await t.readFor({ timeoutMs: st.timeoutMs ?? 1500 });
      log('rx', r);
      const merged = new Uint8Array(all.length + r.length);
      merged.set(all);
      merged.set(r, all.length);
      all = merged;
      if (st.expectHex && !toHex(r).includes(toHex(parseData(`hex:${st.expectHex}`)))) {
        throw new Error(`Respons tidak sesuai harapan (${st.expectHex}).`);
      }
    }
  }
  return all;
}

/** Ambil nilai counter dari byte balasan sesuai definisi `parse.counters`. */
export function evalCounters(reply, parse) {
  return (parse?.counters || []).map((c) => {
    const len = c.length ?? 2;
    if (c.offset + len > reply.length) throw new Error(`Balasan terlalu pendek untuk "${c.label}".`);
    let v = 0;
    for (let i = 0; i < len; i++) {
      const byte = reply[c.offset + (c.endian === 'le' ? len - 1 - i : i)];
      v = v * 256 + byte;
    }
    return { label: c.label, value: v, max: c.max, percent: c.max ? Math.min(100, (v / c.max) * 100) : null };
  });
}
