// Perintah "remote mode" Epson (ESC/P-R) yang dipakai driver/utility terbuka seperti Gutenprint escputil.
// Belum diuji pada perangkat keras: periksa log Console jika printer tidak merespons.
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

const ESC_RESET = [0x1b, 0x40];
const ENTER_REMOTE = [0x1b, 0x28, 0x52, 0x08, 0x00, 0x00, ...ascii('REMOTE1')];
const EXIT_REMOTE = [0x1b, 0x00, 0x00, 0x00];
// Pembuka EJL 1284.4 untuk printer yang membutuhkannya (opsional).
const EJL_INIT = [0x00, 0x00, 0x00, 0x1b, 0x01, ...ascii('@EJL 1284.4\n@EJL     \n'), 0x1b, 0x40];

/** Perintah remote: 2 huruf + panjang 16-bit LE + parameter. */
export const remoteCmd = (name, params) => [...ascii(name), params.length & 0xff, params.length >> 8, ...params];

export function buildRemote(cmds, { ejlInit = false } = {}) {
  return Uint8Array.from([
    ...(ejlInit ? EJL_INIT : []),
    ...ESC_RESET,
    ...ENTER_REMOTE,
    ...cmds.flat(),
    ...EXIT_REMOTE,
    ...ESC_RESET,
  ]);
}

export const nozzleCheck = (t, opts) => t.write(buildRemote([remoteCmd('NC', [0x00, 0x00])], opts));
export const headCleaning = (t, opts) => t.write(buildRemote([remoteCmd('CH', [0x00, 0x00])], opts));

export async function readInkLevels(t, inks, opts) {
  await t.drain();
  await t.write(buildRemote([remoteCmd('IQ', [0x01])], opts));
  const reply = await t.readFor({
    timeoutMs: 2500,
    until: (b) => /IQ:[0-9A-Fa-f]*;/.test(new TextDecoder('latin1').decode(b)),
  });
  return { ...parseInkQuantity(new TextDecoder('latin1').decode(reply), inks), reply };
}

/**
 * Parse "IQ:<hex>;". Persentase hanya dilaporkan bila jumlah byte persis = jumlah tinta
 * dan nilainya 0..100; selain itu hex mentah ditampilkan agar tidak menyesatkan.
 */
export function parseInkQuantity(text, inks) {
  const m = text.match(/IQ:([0-9A-Fa-f]*);/);
  if (!m) return { ok: false, reason: 'Tidak ada respons IQ dari printer.', levels: [] };
  const hex = m[1];
  const bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) || [];
  if (bytes.length === inks.length && bytes.every((v) => v <= 100)) {
    return { ok: true, hex, levels: inks.map((name, i) => ({ name, percent: bytes[i] })) };
  }
  return { ok: false, hex, reason: `Format respons tidak dikenali (${bytes.length} byte).`, levels: [] };
}
