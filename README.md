# Reseter Printer Web

Utilitas web (tanpa instalasi) untuk printer **Epson** dan **Canon** lewat **WebUSB**: info printer,
status tinta, cek head, pembersihan head, serta cek/reset counter absorber dan ink charge lewat profil model.

Cara pakai: **1** pilih printer dari daftar, **2** hubungkan USB (atau coba mode demo), **3** jalankan perintah dari daftar.

Jalankan lokal: `npm run serve` lalu buka `http://localhost:8080` (WebUSB mengizinkan `localhost`).
Tes: `npm test`. Tidak ada dependensi dan tidak ada langkah build.

## Status fitur (jujur)

| Fitur | Epson | Canon |
| --- | --- | --- |
| Info printer (IEEE-1284 Device ID) + deteksi model otomatis | bawaan | bawaan |
| Status & level tinta | eksperimental (REMOTE1 `ST`/`IQ`) | hanya kode `STA` dari Device ID |
| Cek head (nozzle check) | eksperimental (`NC`) | butuh profil |
| Bersihkan head | eksperimental (`CH`) | butuh profil |
| Reset absorber | butuh profil | profil bawaan **hanya iP1100/iP1800/iP2500** (belum terverifikasi), model Canon lain butuh profil |
| Power cleaning, cek absorber, ink charge | butuh profil | butuh profil |

- **Bawaan**: protokol standar yang terdokumentasi.
- **Eksperimental**: perintah berasal dari dokumentasi open source (escputil/Gutenprint) dan sudah diuji
  terhadap printer simulasi serta uji unit, tetapi **belum diuji pada printer nyata**.
- **Butuh profil**: byte perintah dan alamat counter berbeda per model dan tidak dikode keras di sini
  karena tidak ada sumber yang bisa diverifikasi (lihat [profiles/README.md](profiles/README.md)).
  Tanpa profil, tombol dinonaktifkan. Mode demo memperlihatkan alur lengkapnya dengan printer simulasi.

### Perintah bawaan Canon iP1100 / iP1800 / iP2500

Berasal dari paket Canon General Tool (T3164) yang Anda sediakan (perintah BJL teks, byte disalin persis dari file).
Tampil sebagai daftar di langkah 3:

| Perintah di aplikasi | File sumber | Catatan |
| --- | --- | --- |
| Reset absorber (Main + Platen) | `MainRewrite` + `PlatenRewrite` | Catatan versi tool (Ver1.10) menyatakan keduanya fungsi *clear counter tinta buang* |
| Reset counter Main saja / Platen saja | `MainRewrite` / `PlatenRewrite` | |
| Hapus counter lain (selain tinta buang) | `WasteInkExceptClear` (`CNTCLR_P1`) | Arti persis belum dikonfirmasi; ditandai bahaya |
| Hapus SEMUA counter (EEPROM clear) | `eepromclear` (`CNTCLR_AL`) | Menghapus seluruh counter, bukan hanya tinta buang; ditandai bahaya |
| Pembersihan head tipe A, B, C, D | `cleaninga` ... `cleaningd` | Perintah sama, parameter 0 sampai 3; arti varian belum dikonfirmasi |

Sengaja **tidak** dimasukkan dari paket itu (dijaga oleh tes):

- `capwipping`, `heatrun`: uji ketahanan pabrik, puluhan ribu siklus, mengausi mekanik.
- `setregistration`: menulis kode model/identitas printer.
- `Initialize_*.prn`: menulis kode tujuan/region.
- `EEPROMData*.prn`: templat cetak statis, bukan pembacaan EEPROM (hasilnya angka kosong yang menyesatkan).
- `PATTERN.prn`, `HEAD_PATT_BLK_CLR.prn`: diawali `@REGIGUIDEFRESET` (menghapus alignment head) dan khusus satu model.

Batasan:

- **Belum diuji pada printer nyata**: bertanda `verified: false`, dan dialog mewajibkan centang pengakuan.
- Counter tidak bisa dibaca kembali dengan profil ini, jadi hasil reset tidak diverifikasi otomatis.
- Tidak mencakup G1010, G1020, iP2770, iP1980, iX6870: perintahnya belum terbukti sama untuk model itu.
  Pada model tersebut aplikasi hanya menampilkan info/status, dan perintah lain muncul di bagian "Belum tersedia".

## Batasan

- Hanya browser Chromium (Chrome, Edge, Opera) di HTTPS atau `localhost`. Firefox dan Safari tidak punya WebUSB.
- **Windows**: driver bawaan printer menahan perangkat, jadi browser sering gagal mengklaim USB. Solusinya
  mengganti driver ke WinUSB (mis. Zadig), yang mematikan cetak normal sampai driver dipulihkan.
  Android, ChromeOS, dan Linux biasanya langsung bisa.
- Printer jaringan (Wi-Fi/LAN) tidak didukung: browser tidak bisa SNMP/UDP. Itu butuh agen lokal.
- Reset counter tidak mengosongkan bantalan tinta fisik. Bantalan yang penuh bisa meluap dan merusak
  papan sirkuit. Bersihkan atau ganti bantalan sebelum reset.

## Keamanan

Aplikasi tidak punya kode jaringan, dan CSP memblokir koneksi keluar; hasil audit file referensi ada di [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).

## Struktur

```
index.html, css/style.css
js/usb.js        transport WebUSB
js/ieee1284.js   parser Device ID
js/models.js     database model + ketersediaan fitur
js/operations.js daftar perintah per model (standar + dari profil)
js/builtin-profiles.js  profil bawaan Canon iP1100/1800/2500
js/epson.js      perintah REMOTE1 dan parser respons
js/profiles.js   validasi dan eksekutor profil
js/demo.js       printer simulasi
js/app.js        UI
tests/           uji unit (node --test)
```

## Deploy

Workflow `.github/workflows/pages.yml` menerbitkan situs statis ke GitHub Pages. Aktifkan di
Settings > Pages > Source: **GitHub Actions**.
