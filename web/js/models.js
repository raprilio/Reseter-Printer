// Database model printer. `inks` = urutan warna pada respons status tinta.
const EPSON_INKS = ['K', 'C', 'M', 'Y'];

const epson = (model, extra = {}) => ({ brand: 'epson', model, inks: EPSON_INKS, ...extra });
const canon = (model, extra = {}) => ({ brand: 'canon', model, inks: ['BK', 'CL'], ...extra });

export const MODELS = [
  // Epson EcoTank L-series
  epson('L120', { requested: true }),
  epson('L210', { requested: true }),
  epson('L220', { requested: true }),
  epson('L360'),
  epson('L365', { requested: true }),
  epson('L380'),
  epson('L1110', { requested: true }),
  epson('L1210', { requested: true }),
  epson('L1300', { requested: true }),
  epson('L3110'),
  epson('L3150'),
  epson('L3210', { requested: true }),
  epson('L3250'),
  epson('L11050', { requested: true, note: 'A3, jumlah tinta perlu dipastikan lewat respons printer' }),
  // Canon
  canon('G1010', { requested: true, family: 'G-series (ink tank)' }),
  canon('G1020', { requested: true, family: 'G-series (ink tank)' }),
  canon('G2010', { family: 'G-series (ink tank)' }),
  canon('G3010', { family: 'G-series (ink tank)' }),
  canon('G4010', { family: 'G-series (ink tank)' }),
  canon('iX6870', { requested: true, inks: ['BK', 'C', 'M', 'Y', 'PGBK'], family: 'PIXMA iX' }),
  canon('iP2770', { requested: true, family: 'PIXMA iP' }),
  canon('iP1980', { requested: true, family: 'PIXMA iP' }),
  canon('iP2870', { family: 'PIXMA iP' }),
  canon('MG2570', { family: 'PIXMA MG' }),
];

export const USB_VENDORS = { epson: 0x04b8, canon: 0x04a9 };

const normalize = (s) =>
  String(s || '')
    .toUpperCase()
    .replace(/SERIES|EPSON|CANON|PIXMA/g, '')
    .replace(/[^A-Z0-9]/g, '');

/** Cocokkan string MDL dari IEEE-1284 Device ID ke entri database. */
export function findModel(brand, mdl) {
  const n = normalize(mdl);
  if (!n) return null;
  const pool = MODELS.filter((m) => m.brand === brand);
  const exact = pool.find((m) => normalize(m.model) === n);
  if (exact) return exact;
  return (
    pool
      .filter((m) => n.startsWith(normalize(m.model)))
      .sort((a, b) => b.model.length - a.model.length)[0] || null
  );
}

export const CANON_ERRORS = [
  { code: '5B00', meaning: 'Waste ink absorber penuh (iP/MG/MX series).' },
  { code: '1700 / 1701', meaning: 'Penghitung waste ink hampir penuh / penuh (iP series).' },
  { code: 'E08', meaning: 'Waste ink absorber hampir penuh / penuh (G-series).' },
  { code: 'E04 / E05', meaning: 'Cartridge/head tidak terdeteksi atau tidak cocok.' },
];

export const EPSON_ERRORS = [
  {
    code: 'Lampu tinta + kertas berkedip bergantian',
    meaning: 'Ink pad hampir/sudah habis masa pakai (waste ink counter penuh). Muncul juga pesan "Service required" di driver.',
  },
  { code: 'Lampu tinta berkedip', meaning: 'Tinta rendah atau habis.' },
];
