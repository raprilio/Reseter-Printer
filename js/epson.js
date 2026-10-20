// Perintah "REMOTE1" Epson (ESC/P). Format dan perintah ST, IQ, NC, CH berasal dari
// dokumentasi publik/open source (mis. escputil di Gutenprint), BUKAN dari service tool resmi.
// Semuanya diberi level "experimental": belum diuji pada printer nyata di repo ini.

const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));

// Satu perintah remote = 2 huruf nama + panjang parameter (2 byte LE) + parameter.
export function remote(commands) {
  const out = [0x1b, 0x40, 0x1b, 0x28, 0x52, 0x08, 0x00, 0x00, ...ascii('REMOTE1')];
  for (const { name, params = [] } of commands) {
    out.push(...ascii(name), params.length & 0xff, params.length >> 8, ...params);
  }
  out.push(0x1b, 0x00, 0x00, 0x00); // keluar dari mode remote
  return Uint8Array.from(out);
}

export const cmdStatus = () => remote([{ name: 'ST', params: [0x01] }]);
export const cmdInkQuantity = () => remote([{ name: 'IQ', params: [0x01] }]);
export const cmdNozzleCheck = () => remote([{ name: 'NC', params: [0x00, 0x00] }]);
export const cmdHeadClean = () => remote([{ name: 'CH', params: [0x00, 0x00] }]);

export const INK_COLORS = {
  0: 'Black', 1: 'Cyan', 2: 'Magenta', 3: 'Yellow',
  4: 'Light Cyan', 5: 'Light Magenta', 6: 'Photo Black', 7: 'Matte Black',
};
export const STATUS_CODES = {
  0: 'Error', 1: 'Self printing', 2: 'Busy', 3: 'Waiting', 4: 'Idle', 5: 'Paused',
};

// Respons format "ST2": "@BDC ST2\r\n" + panjang(2 byte LE) + field berulang [id][len][data].
// Field 0x01 = kode status, 0x02 = kode error, 0x0f = tinta (len record di byte pertama,
// tiap record: [?, kode warna, level%]). Susunan field tinta adalah tebakan terdekat dari
// dokumentasi publik, jadi UI selalu menampilkan hex mentah di samping hasil parse.
export function parseSt2(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = new TextDecoder('latin1').decode(b);
  const at = text.indexOf('@BDC ST2');
  if (at < 0) return null;
  let p = text.indexOf('\n', at);
  if (p < 0) return null;
  p += 1;
  const total = b[p] | (b[p + 1] << 8);
  p += 2;
  const end = Math.min(b.length, p + total);
  const result = { status: null, errorCode: null, inks: [] };
  while (p + 2 <= end) {
    const id = b[p];
    const len = b[p + 1];
    const data = b.slice(p + 2, p + 2 + len);
    p += 2 + len;
    if (id === 0x01) result.status = data[0];
    else if (id === 0x02) result.errorCode = data[0];
    else if (id === 0x0f && data.length > 1) {
      const size = data[0] || 3;
      for (let i = 1; i + size <= data.length; i += size) {
        const code = data[i + 1];
        result.inks.push({
          color: INK_COLORS[code] || `Warna ${code}`,
          level: data[i + 2],
        });
      }
    }
  }
  result.statusText =
    result.status == null ? null : STATUS_CODES[result.status] || `Kode ${result.status}`;
  return result;
}

// Format lama: "...IQ:6464646464;..." (satu byte hex per cartridge).
export function parseInkQuantity(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  const m = /IQ:([0-9A-Fa-f]+)/.exec(text);
  if (!m) return null;
  const hex = m[1];
  const levels = [];
  for (let i = 0; i + 2 <= hex.length; i += 2) levels.push(parseInt(hex.slice(i, i + 2), 16));
  return levels;
}
