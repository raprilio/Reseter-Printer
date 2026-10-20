// Parser IEEE-1284 Device ID, mis. "MFG:EPSON;CMD:ESCPL2,BDC;MDL:L3210 Series;CLS:PRINTER;"
export function parseDeviceId(raw) {
  const fields = {};
  for (const part of String(raw).split(';')) {
    const i = part.indexOf(':');
    if (i > 0) fields[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim();
  }
  const mfg = fields.MFG || fields.MANUFACTURER || '';
  const mdl = fields.MDL || fields.MODEL || '';
  const brand = /epson/i.test(mfg) ? 'epson' : /canon/i.test(mfg) ? 'canon' : 'unknown';
  const cmd = (fields.CMD || fields.COMMAND || '').split(',').map((s) => s.trim()).filter(Boolean);
  return { raw, fields, mfg, mdl, brand, cmd };
}

/** Respons GET_DEVICE_ID: 2 byte panjang (big-endian, termasuk dirinya sendiri) + string. */
export function decodeDeviceIdResponse(bytes) {
  if (bytes.length < 2) return '';
  const be = (bytes[0] << 8) | bytes[1];
  const le = bytes[0] | (bytes[1] << 8);
  const len = be >= 2 && be <= bytes.length ? be : le >= 2 && le <= bytes.length ? le : bytes.length;
  return new TextDecoder('latin1').decode(bytes.slice(2, len));
}
