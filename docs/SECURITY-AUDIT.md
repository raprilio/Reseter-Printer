# Audit keamanan file referensi (Google Drive)

Tanggal analisis: 2026-10-20. Metode: **analisis statis saja**. Tidak ada file yang dijalankan, dan tidak ada file referensi yang disalin ke repo ini.

## Keterbatasan (penting)

- Tidak ada mesin antivirus di lingkungan analisis. Yang diperiksa: header PE, entropi section, tabel import, dan string ASCII/UTF-16.
- `RENDAH*` berarti **tidak ditemukan indikator**, bukan terbukti bersih. Malware bisa menyamar atau membuat koneksi lewat cara yang tidak terlihat secara statis.
- Untuk kepastian: cari hash di [VirusTotal](https://www.virustotal.com) (cukup tempel SHA-256, tanpa mengunggah file), dan jalankan hanya di mesin virtual atau PC cadangan tanpa data penting.

## Ringkasan

- Tidak ada string eksfiltrasi (Telegram, Discord webhook, Pastebin), PowerShell, pencurian data browser/dompet, ransomware, atau manipulasi Windows Defender di binary mana pun.
- Empat file berisiko tinggi atau sedang: protector `Adjprog.exe` L1110, `AdjProg.exe` 30 MB L1300, keygen `WLGen_L1110.exe`, dan `DataServiceLapper.dll`. **Jangan dijalankan.**
- `st3400` (11 MB) bukan data tool: itu file **PNG** 24605x24363 piksel (~1,8 GB saat dikembangkan) dengan satu chunk IDAT, tanpa data setelah IEND. Tidak ada muatan tersembunyi yang ditemukan, tetapi jangan dibuka di penampil gambar (mirip decompression bomb).
- Paket-paket ini berlabel model yang tidak cocok: 'IP1980' sebenarnya berisi data tool iP1100/1800/2500, dan 'G1010' berisi Service Tool v3400 (2012) yang tidak memuat G-series.
- Banyak folder memuat file teks yang menyuruh mengunjungi situs unduhan pihak ketiga (`blogprinter.net`, `androlite.com`) dan kata sandi 'i-loadzone.com'. Hindari.

## Tabel file

| Risiko | File | Lokasi di Drive | SHA-256 | Catatan |
|---|---|---|---|---|
| TINGGI | Adjprog.exe (4,0 MB) | Epson L1110 ITKoding Reseter / EPSON L1110 RESETTER | `62d6825f4de77b8ad457e2c663f5b5e950d4e979573b2258ddd79d78ae4eb597` | Terbungkus protector (WinLicense/Themida-like): 3 section entropi ~7,9, hanya 2 import. Perilakunya tidak bisa diperiksa secara statis. |
| TINGGI | AdjProg.exe (29,9 MB) | Epson L1300 ITKoding Reseter | `2bab29a7d50635c6c22c0ed55fc53a109edfeb855597d67d7f8c99b89c223803` | Import sama dengan L120.exe tetapi digelembungkan ke 30 MB, timestamp 1970-01-01, section .text hampir kosong. Pola umum untuk menghindari batas ukuran scan antivirus, atau hasil rakitan ulang. |
| TINGGI | WLGen_L1110.exe | Epson L1110 ITKoding Reseter / KEY L1110 / EXE | `480cdccfa85f39861eae9a842a8bbaa8c8e25331ee826e476940f36ff4463e93` | Keygen lisensi WinLicense (bersama WinLicenseSDK.dll, GeneratorSeed.gns). Alat bypass lisensi, kategori yang paling sering membawa malware. Secara statis tidak ada indikator jaringan. |
| SEDANG | DataServiceLapper.dll | Epson L310 Reseter | `5f0e69859996a538863ed9839c8f60ae7d6213d781cde3a2020320baafa31e64` | Satu-satunya binary dengan API jaringan (WS2_32, klien HTTP ATL, SOAP, string epson.net). Tidak dibutuhkan alat reset offline. Berpotensi menghubungi server luar. |
| RENDAH* | L120.exe | Epson L120 Reseter | `d3b640bdfe1af458af18bf669451fa352d0f8676039fa626dec00dbc9e45e6dd` | Aplikasi MFC biasa, tanpa API jaringan atau string eksfiltrasi. |
| RENDAH* | Adjprogcracked.exe | Epson L310 Reseter | `8446cd3d10a09c9dbb58d692509e2f9581f2d0f3f2cbf68a583de3621d39e167` | Sama seperti di atas. Nama 'cracked' berarti sudah dimodifikasi pihak ketiga. |
| RENDAH* | Service tool v3400.exe | Canon G1010 / Canon Service Tool | `ddbf23a7e87ed1041d316353ebc8738877b0e9fd5ce40ec3f7c942be0b9d94c4` | Tanpa API jaringan. Rilisan 2012; daftar modelnya tidak memuat G-series. |
| RENDAH* | GeneralTool.exe | ResetterCanon.IP1980.NesabaMedia / ResetterCanon.TS300 | `28df79c8efaae9aed7f725ccf3b1fb84b68adeddf973d63e95a8a5bd33921eb1` | Tanpa API jaringan. Untuk iP1100/iP1800/iP2500, bukan iP1980. |
| RENDAH* | apdadrv.dll (v2012) | 6 folder Epson | `77b718b6c42376501ea36be816cb905ee8105ccda7a06fa0587e7fd694ad4abb` | Driver komunikasi printer, tanpa API jaringan. |
| RENDAH* | apdadrv.dll (v2017) | 2 folder Epson | `f2277c9f1f477a6bd06b4645bd818e241ce8352395b4d67bab87583aaebd36fd` | Idem. |
| RENDAH* | StrGene.dll (v2002) | 5 folder Epson | `6d468ed2ef32d8f7486de26e817ff9e1e8bfac2e2ad7ff191722c2b29e0344c7` | Idem. |
| RENDAH* | StrGene.dll (v2017) | 2 folder Epson | `8e731f4d1dddb9a46031f3d863425c62bfd16dd755925d42fa6d5f707b27f6d6` | Idem. |
| RENDAH* | WinLicenseSDK.dll | KEY L1110 / EXE | `2fc6d1ecda29e0a93ecd0cdcdc1971a5a9c9765472c75abc6a3e1afedfd35de1` | Bagian dari paket keygen; tulis registry (wajar untuk SDK lisensi). |
| RENDAH* | ECCfunctions.dll | KEY L1110 / EXE | `5d513a767ec31280afca64d62d89d093465d331b5cadd9991be3f3e8ca2e7d44` | Bagian dari paket keygen. |
| RENDAH* | CustomWinlicenseSDK.dll | KEY L1110 / DLL | `09d593d1f8ca13036a5ba20ffd3a86d97406acdf6d1696c1edb7b5920b4b9866` | Bagian dari paket keygen. |

File data teks/biner kecil (`eepromclear`, `WasteInkExceptClear`, `MainRewrite`, `PlatenRewrite`, `*.prn`, `Model_*.ini`, `license.reg`) berisi perintah BJL teks biasa atau satu kunci registry `HKLM\Software\ResetYourPrinter\RUPOM`. Tidak berbahaya, tetapi untuk iP1100/1800/2500.

## Yang dilakukan pada aplikasi ini

- Aplikasi tidak memuat satu pun file dari referensi, dan tidak punya kode jaringan, `eval`, atau skrip eksternal.
- `Content-Security-Policy` di `index.html` (`connect-src 'none'`, `script-src 'self'`) membuat browser menolak koneksi keluar. Terbukti di Chromium: `fetch`, WebSocket, `sendBeacon`, skrip dan gambar eksternal ditolak; `eval` ditolak.
- `tests/security.test.mjs` menggagalkan build bila ada kode jaringan atau CSP dilonggarkan.
