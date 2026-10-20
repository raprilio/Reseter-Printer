// Profil bawaan. Berupa modul JS (bukan JSON yang di-fetch) karena CSP melarang semua koneksi.
//
// Canon iP1100 / iP1800 / iP2500: perintah BJL teks dari paket "General Tool" (T3164) yang Anda berikan
// (folder ResetterCanon.TS300). Byte di bawah disalin persis dari file; nama file asal ada di komentar.
// Hanya model yang tercantum di Model_0/1/2.ini paket itu. Model lain (G1010, iP2770, iP1980, ...)
// sengaja TIDAK tercakup: perintahnya belum terbukti sama.
//
// Sengaja TIDAK dimasukkan dari paket itu:
//   capwipping, heatrun        uji ketahanan pabrik: puluhan ribu siklus, mengausi mekanik
//   setregistration            menulis kode model/identitas printer
//   Initialize_*.prn           menulis kode tujuan/region
//   EEPROMData*.prn            templat cetak statis, bukan pembacaan EEPROM
//   PATTERN/HEAD_PATT*.prn     diawali @REGIGUIDEFRESET (menghapus alignment head), khusus satu model
//
// Semua perintah berformat: ESC [ K 02 00 00 1F + "BJLSTART\n" ... "BJLEND\n".

import { loadProfile } from './profiles.js';

// MainRewrite
const MAIN_CLEAR =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 10 00 00 00 04 30 00 00 ' +
  '00 00 00 00 00 00 00 00 00 00 00 00 0A 42 4A 4C 45 4E 44 0A';

// PlatenRewrite
const PLATEN_CLEAR =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 10 00 00 00 06 30 00 00 ' +
  '00 00 00 00 00 00 00 00 00 00 00 00 0A 42 4A 4C 45 4E 44 0A';

// eepromclear
const COUNTER_CLEAR_ALL =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 40 49 6E 69 74 69 61 6C 69 7A 65 3D 43 4E 54 43 ' +
  '4C 52 5F 41 4C 0A 42 4A 4C 45 4E 44 0A';

// WasteInkExceptClear
const COUNTER_CLEAR_EXCEPT_WASTE =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 40 49 6E 69 74 69 61 6C 69 7A 65 3D 43 4E 54 43 ' +
  '4C 52 5F 50 31 0A 42 4A 4C 45 4E 44 0A';

// cleaninga
const CLEAN_A =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 08 00 00 00 03 00 00 00 ' +
  '00 00 00 00 0A 42 4A 4C 45 4E 44 0A';

// cleaningb
const CLEAN_B =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 08 00 00 00 03 00 00 00 ' +
  '01 00 00 00 0A 42 4A 4C 45 4E 44 0A';

// cleaningc
const CLEAN_C =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 08 00 00 00 03 00 00 00 ' +
  '02 00 00 00 0A 42 4A 4C 45 4E 44 0A';

// cleaningd
const CLEAN_D =
  '1B 5B 4B 02 00 00 1F 42 4A 4C 53 54 41 52 54 0A 52 45 53 45 52 56 45 3D 08 00 00 00 03 00 00 00 ' +
  '03 00 00 00 0A 42 4A 4C 45 4E 44 0A';

const ACK_UNTESTED = 'Saya paham perintah ini belum diuji pada printer nyata.';

export const BUILTIN_PROFILES = [
  loadProfile({
    schema: 1,
    id: 'canon-bjl-ip-legacy',
    name: 'Canon iP1100/iP1800/iP2500 (General Tool T3164)',
    brand: 'canon',
    verified: false,
    source: 'folder ResetterCanon.TS300 (catatan versi: Ver1.10 menambah fungsi clear counter tinta buang Main dan Platen)',
    models: ['iP1100', 'iP1800', 'iP2500'],
    ops: {
      wasteReset: {
        label: 'Reset absorber (Main + Platen)',
        desc: 'Menghapus counter tinta buang Main lalu Platen. Bantalan tinta fisik tidak ikut kosong.',
        message: 'Mengirim clear counter Main lalu Platen.',
        steps: [{ tx: MAIN_CLEAR, delayMs: 500 }, { tx: PLATEN_CLEAR }],
      },
      mainClear: {
        label: 'Reset counter tinta buang: Main saja',
        group: 'Reset absorber & counter',
        desc: 'Hanya counter bantalan tinta buang utama (file MainRewrite).',
        mutating: true,
        steps: [{ tx: MAIN_CLEAR }],
      },
      platenClear: {
        label: 'Reset counter tinta buang: Platen saja',
        group: 'Reset absorber & counter',
        desc: 'Hanya counter bantalan platen (file PlatenRewrite).',
        mutating: true,
        steps: [{ tx: PLATEN_CLEAR }],
      },
      counterClearExceptWaste: {
        label: 'Hapus counter lain (selain tinta buang)',
        group: 'Reset absorber & counter',
        desc: 'Perintah CNTCLR_P1 (file WasteInkExceptClear). Arti persis belum dikonfirmasi; dinamai dari nama file.',
        mutating: true,
        danger: true,
        ack: 'Saya paham arti perintah ini belum pasti dan belum diuji pada printer nyata.',
        steps: [{ tx: COUNTER_CLEAR_EXCEPT_WASTE }],
      },
      counterClearAll: {
        label: 'Hapus SEMUA counter (EEPROM clear)',
        group: 'Reset absorber & counter',
        desc: 'Perintah CNTCLR_AL (file eepromclear): menghapus seluruh counter, bukan hanya tinta buang.',
        mutating: true,
        danger: true,
        ack: 'Saya paham ini menghapus seluruh counter printer, bukan hanya tinta buang, dan belum diuji pada printer nyata.',
        steps: [{ tx: COUNTER_CLEAR_ALL }],
      },
      headClean: {
        label: 'Pembersihan head tipe A',
        desc: 'Varian 0. Memakai tinta dan menambah counter absorber.',
        mutating: true,
        ack: ACK_UNTESTED,
        steps: [{ tx: CLEAN_A }],
      },
      cleanB: {
        label: 'Pembersihan head tipe B',
        group: 'Pembersihan head',
        desc: 'Varian 1. Arti tiap varian belum dikonfirmasi; memakai tinta dan menambah counter absorber.',
        mutating: true,
        steps: [{ tx: CLEAN_B }],
      },
      cleanC: {
        label: 'Pembersihan head tipe C',
        group: 'Pembersihan head',
        desc: 'Varian 2. Arti tiap varian belum dikonfirmasi; memakai tinta dan menambah counter absorber.',
        mutating: true,
        steps: [{ tx: CLEAN_C }],
      },
      cleanD: {
        label: 'Pembersihan head tipe D',
        group: 'Pembersihan head',
        desc: 'Varian 3. Arti tiap varian belum dikonfirmasi; memakai tinta dan menambah counter absorber.',
        mutating: true,
        steps: [{ tx: CLEAN_D }],
      },
    },
  }),
];
