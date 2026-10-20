// Parser IEEE-1284 Device ID, string identitas standar yang dikembalikan printer USB.
// Contoh: "MFG:EPSON;CMD:ESCPL2,BDC,D4,D4PX;MDL:L3210 Series;CLS:PRINTER;"

const KEY_ALIASES = {
  MANUFACTURER: 'MFG',
  MODEL: 'MDL',
  'COMMAND SET': 'CMD',
  COMMANDSET: 'CMD',
  CLASS: 'CLS',
  DESCRIPTION: 'DES',
};

export function decodeDeviceIdBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 2) return '';
  // Dua byte pertama = panjang total (big-endian menurut spesifikasi, sebagian
  // firmware mengirim little-endian), dihitung termasuk dua byte itu sendiri.
  const be = (b[0] << 8) | b[1];
  const le = (b[1] << 8) | b[0];
  let len = be;
  if (len < 2 || len > b.length) len = le;
  if (len < 2 || len > b.length) len = b.length;
  return new TextDecoder('latin1').decode(b.slice(2, len)).replace(/\0+$/, '');
}

export function parseDeviceId(input) {
  const raw = typeof input === 'string' ? input : decodeDeviceIdBytes(input);
  const fields = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf(':');
    if (i < 1) continue;
    let key = part.slice(0, i).trim().toUpperCase();
    key = KEY_ALIASES[key] || key;
    fields[key] = part.slice(i + 1).trim();
  }
  return {
    raw,
    fields,
    manufacturer: fields.MFG || '',
    model: fields.MDL || '',
    description: fields.DES || '',
    class: fields.CLS || '',
    commands: (fields.CMD || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}
