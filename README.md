# Reseter Printer Web

Aplikasi web (tanpa build, tanpa server) untuk teknisi printer Epson & Canon. Terhubung ke printer
lewat **WebUSB**, mendeteksi model otomatis dari IEEE-1284 Device ID.

## Menjalankan

```bash
npm start            # http://localhost:8080
npm test             # unit test protokol & parser
```

WebUSB butuh Chrome/Edge (desktop) atau Chrome Android, dan halaman harus lewat **HTTPS atau
localhost** — mis. GitHub Pages dengan folder `web/`. Klik **Mode Demo** untuk mencoba UI tanpa printer.

## Status fitur

| Fitur | Epson | Canon |
|---|---|---|
| Auto detect model (Device ID) | ✅ | ✅ |
| Status tinta (`IQ`) | ⚠️ belum diuji di printer | ❌ belum ada |
| Cek nozzle / head cleaning | ⚠️ belum diuji di printer | ❌ pakai driver/tombol panel |
| Cek absorber, reset waste counter, ink charge | 🔌 butuh profil model | 🔌 butuh profil model |
| Cek absorber Canon G1010/G1020 (lampu/pesan error, tanpa USB) | — | ✅ panduan |
| Console hex mentah | ✅ | ✅ |

- ⚠️ = berdasar perintah remote Epson yang terdokumentasi di utilitas terbuka; tidak ada perangkat keras di
  lingkungan pengembangan, jadi belum terverifikasi.
- 🔌 = logika UI + eksekutor siap dan teruji lewat simulasi, tetapi alamat EEPROM/kunci per model **tidak
  disertakan**. Lihat `profiles/README.md`.

## Catatan Windows

Driver `usbprint` Windows menahan printer sehingga browser tidak bisa claim interface. Ganti driver perangkat
ke WinUSB (mis. dengan Zadig) atau gunakan Android/Linux/ChromeOS.

## Peringatan

Reset counter tidak mengosongkan bantalan waste ink. Bantalan yang jenuh bisa meluber.
