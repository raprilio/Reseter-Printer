# Profil model

Operasi yang **menulis** ke printer (reset waste ink counter, ink charge) dan pembacaan counter
bergantung pada perintah EEPROM/service yang berbeda per model. Aplikasi tidak menyertakan data
tersebut; ia membacanya dari profil JSON yang Anda impor lewat kartu **Profil model**.

Format: lihat `example.json` (placeholder, tidak cocok dengan printer mana pun).

- `match.model` — dicocokkan ke field `MDL` Device ID (mis. `L3210`).
- `ops.<nama>` — `readCounters`, `resetWaste`, `inkCharge`. Tiap op wajib punya `write: true|false`.
- `steps` — berurutan: `{"send":"hex:.."|"text:.."}`, `{"delay":ms}`, `{"read":true,"timeoutMs":ms,"expectHex":".."}`.
- `parse.counters` — mengambil angka dari byte balasan (`offset`, `length`, `endian`, `max` untuk persentase).

Hanya impor profil dari sumber yang Anda percaya dan sudah diuji pada printer yang sama:
perintah tulis yang salah dapat merusak printer secara permanen.
