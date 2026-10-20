// Database model printer + resolusi ketersediaan fitur.
//
// Level fitur:
//   builtin      perintah standar/terdokumentasi, tersedia tanpa profil
//   experimental perintah sudah diimplementasikan tetapi BELUM diuji pada perangkat nyata
//   profile      butuh profil (JSON) berisi urutan perintah khusus model; lihat profiles/README.md
//   missing      tidak ada implementasi untuk merek ini

export const FEATURES = [
  { id: 'info', label: 'Info printer (Device ID)' },
  { id: 'status', label: 'Status & level tinta' },
  { id: 'nozzleCheck', label: 'Cek head (nozzle check)' },
  { id: 'headClean', label: 'Bersihkan head' },
  { id: 'powerClean', label: 'Power cleaning' },
  { id: 'wasteRead', label: 'Cek absorber (waste ink counter)' },
  { id: 'wasteReset', label: 'Reset absorber / waste ink pad' },
  { id: 'inkCharge', label: 'Ink charge' },
];

const BASE_LEVEL = {
  epson: {
    info: 'builtin',
    status: 'experimental',
    nozzleCheck: 'experimental',
    headClean: 'experimental',
    powerClean: 'profile',
    wasteRead: 'profile',
    wasteReset: 'profile',
    inkCharge: 'profile',
  },
  canon: {
    info: 'builtin',
    status: 'builtin', // field STA di Device ID
    nozzleCheck: 'profile',
    headClean: 'profile',
    powerClean: 'profile',
    wasteRead: 'profile',
    wasteReset: 'profile',
    inkCharge: 'profile',
  },
};

const epson = (name, extra = {}) => ({ brand: 'epson', name, ...extra });
const canon = (name, extra = {}) => ({ brand: 'canon', name, ...extra });

export const MODELS = [
  // Epson, sesuai permintaan
  epson('L120'), epson('L210'), epson('L220'), epson('L365'),
  epson('L1110'), epson('L1210'), epson('L1300'), epson('L3210'), epson('L11050'),
  // Epson, tambahan umum
  epson('L110'), epson('L130'), epson('L310'), epson('L360'), epson('L380'),
  epson('L385'), epson('L405'), epson('L455'), epson('L565'), epson('L805'),
  epson('L1800'), epson('L3110'), epson('L3150'), epson('L3250'), epson('L4150'),
  // Canon, sesuai permintaan
  canon('G1010'), canon('G1020'), canon('iP2770'), canon('iP1980'),
  canon('iX6870', { aliases: ['PIXMA iX6870 Series'] }),
  // Canon, tambahan umum
  canon('G1000'), canon('G2000'), canon('G2010'), canon('G2020'),
  canon('G3000'), canon('G3010'), canon('G3020'), canon('G4010'),
  canon('iP1100'), canon('iP1800'), canon('iP2500'),
  canon('iP2700'), canon('iP2772'), canon('iP2870'), canon('iP1880'), canon('iX6770'),
];

export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/pixma|series|printer|epson|canon|seiko|inc\.?|corp\.?/g, '')
    .replace(/[^a-z0-9]/g, '');

export function brandFromManufacturer(mfg) {
  const m = String(mfg || '').toLowerCase();
  if (m.includes('epson')) return 'epson';
  if (m.includes('canon')) return 'canon';
  return null;
}

export function findModel(brand, modelText) {
  const key = normalize(modelText);
  if (!key) return null;
  return (
    MODELS.find(
      (m) =>
        (!brand || m.brand === brand) &&
        [m.name, ...(m.aliases || [])].some((n) => normalize(n) === key),
    ) || null
  );
}

// profiles: array hasil profiles.loadProfile(); fungsi ini hanya membaca bentuknya.
export function findProfile(profiles, brand, modelName, opId) {
  const key = normalize(modelName);
  return (
    (profiles || []).find(
      (p) =>
        p.brand === brand &&
        p.ops?.[opId] &&
        p.models.some((n) => normalize(n) === key),
    ) || null
  );
}

export function resolveFeature(brand, modelName, featureId, profiles = []) {
  const profile = findProfile(profiles, brand, modelName, featureId);
  if (profile) return { level: 'profile-ready', profile };
  const level = BASE_LEVEL[brand]?.[featureId] || 'missing';
  return { level: level === 'profile' ? 'need-profile' : level, profile: null };
}
