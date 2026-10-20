# Profil model

Profil adalah file JSON yang berisi urutan byte khusus satu atau beberapa model printer. Aplikasi
tidak membawa byte reset bawaan, karena byte yang salah dapat merusak printer. Satu profil bawaan ada di `js/builtin-profiles.js` (Canon iP1100/1800/2500). Profil Anda sendiri diimpor lewat
panel **3. Profil model** dan disimpan di `localStorage` browser.

## Format (schema 1)

```json
{
  "schema": 1,
  "id": "epson-l120-contoh",
  "name": "Epson L120 (contoh struktur)",
  "brand": "epson",
  "models": ["L120", "L220"],
  "verified": false,
  "ops": {
    "wasteRead": {
      "steps": [{ "tx": "AA BB CC", "rx": { "len": 64, "timeoutMs": 3000 } }],
      "counters": [
        { "name": "Main pad", "offset": 8, "length": 2, "endian": "le", "max": 7200 }
      ]
    },
    "wasteReset": {
      "message": "Teks peringatan yang tampil di dialog konfirmasi.",
      "steps": [{ "tx": "DD EE FF", "delayMs": 200 }]
    }
  }
}
```

`AA BB CC` dan angka di atas hanyalah pengisi struktur, bukan perintah nyata. Jangan dikirim ke printer.

| Field | Arti |
| --- | --- |
| `brand` | `epson` atau `canon` |
| `models` | Nama model (huruf besar/kecil dan kata "Series" diabaikan) |
| `ops` | Salah satu atau lebih dari: `status`, `nozzleCheck`, `headClean`, `powerClean`, `wasteRead`, `wasteReset`, `inkCharge` |
| `steps[].tx` | Byte hex yang dikirim, spasi/koma/`0x` boleh |
| `steps[].rx` | Jika ada, aplikasi membaca `len` byte balasan (timeout `timeoutMs`) |
| `steps[].delayMs` | Jeda setelah step |
| `counters[]` | Cara membaca angka dari balasan step `rx` terakhir: `offset`, `length` (1-4 byte), `endian` (`le`/`be`), `max` (nilai saat dianggap penuh) |
| `message` | Teks tambahan di dialog konfirmasi |

Profil di `ops` selalu menimpa perintah bawaan untuk fitur yang sama. Dialog konfirmasi menampilkan
byte persisnya sebelum dikirim, dan **Mode uji (dry-run)** menampilkan byte tanpa mengirim.

## Dari mana isi profil?

Dari sumber yang sah dan bisa diverifikasi: dokumentasi servis Epson/Canon, atau menangkap lalu-lintas
USB dari reseter resmi yang Anda miliki (misalnya dengan Wireshark + USBPcap) pada printer uji.
Coba dulu dengan **dry-run**, lalu **Terminal raw**, baru jadikan profil. Set `"verified": true` hanya
setelah berhasil di printer nyata dan counter terbaca benar sesudah reset.
