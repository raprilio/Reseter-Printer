// Profil bawaan. Berupa modul JS (bukan JSON yang di-fetch) karena CSP melarang semua koneksi.
//
// Canon iP1100 / iP1800 / iP2500: perintah BJL teks biasa dari paket "General Tool" (T3164) yang
// Anda berikan (folder ResetterCanon.TS300). Hanya model yang tercantum di Model_0/1/2.ini paket itu.
// Model lain (G1010, iP2770, iP1980, ...) sengaja TIDAK tercakup: perintahnya belum terbukti sama.

import { loadProfile } from './profiles.js';

// ESC [ K 02 00 00 1F + "BJLSTART\n" ... "BJLEND\n"
const MAIN_REWRITE =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 10 00 00 00 04 30 00 00 ' +
  '00 00 00 00 00 00 00 00 00 00 00 00 0A 42 4A 4C 45 4E 44 0A';
const PLATEN_REWRITE =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 10 00 00 00 06 30 00 00 ' +
  '00 00 00 00 00 00 00 00 00 00 00 00 0A 42 4A 4C 45 4E 44 0A';

export const BUILTIN_PROFILES = [
  loadProfile({
    schema: 1,
    id: 'canon-bjl-ip-legacy',
    name: 'Canon iP1100/iP1800/iP2500 (General Tool T3164)',
    brand: 'canon',
    verified: false,
    source: 'folder ResetterCanon.TS300: file MainRewrite dan PlatenRewrite',
    models: ['iP1100', 'iP1800', 'iP2500'],
    ops: {
      wasteReset: {
        message:
          'Mengirim MainRewrite lalu PlatenRewrite (nama operasi dari nama file di General Tool). ' +
          'Counter tidak bisa dibaca kembali dengan profil ini, jadi hasilnya tidak diverifikasi otomatis.',
        steps: [{ tx: MAIN_REWRITE, delayMs: 500 }, { tx: PLATEN_REWRITE }],
      },
    },
  }),
];
