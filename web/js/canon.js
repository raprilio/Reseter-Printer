// Diagnosa absorber Canon G-series dari indikator yang terlihat (lampu Alarm / pesan di komputer).
// Ini sinyal "sudah terlambat": muncul setelah ambang counter terlewati. Angka counter sebenarnya
// hanya bisa dibaca lewat profil model (lihat profiles/README.md).

export const ABSORBER_MODELS = ['G1010', 'G1020'];

/**
 * @param {{ lamp: 'none'|'8'|'other', pc: 'none'|'5B00'|'E08'|'other' }} input
 * @returns {{ level: 'full'|'near'|'other'|'unknown', title: string, steps: string[] }}
 */
export function evaluateAbsorber({ lamp, pc }) {
  const serviceSteps = [
    'Bongkar dan periksa bantalan (pad) penyerap tinta buangan: ganti atau cuci-keringkan sampai tidak jenuh.',
    'Setelah pad bersih/diganti, reset counter absorber dengan service tool yang cocok untuk model ini.',
    'Opsi lapangan: pasang saluran waste ink eksternal ke wadah, lalu tetap pantau dan kosongkan wadahnya.',
  ];
  if (pc === '5B00') {
    return {
      level: 'full',
      title: 'Absorber PENUH — harus diganti/dibersihkan',
      steps: ['Printer menolak mencetak (5B00). Matikan penggunaan sampai pad ditangani.', ...serviceSteps],
    };
  }
  if (pc === 'E08' || lamp === '8') {
    return {
      level: 'near',
      title: 'Absorber hampir penuh (E08) — segera ganti/bersihkan',
      steps: [
        'Umumnya printer masih bisa lanjut cetak setelah menekan tombol Resume, tetapi batasnya tinggal sedikit.',
        ...serviceSteps,
      ],
    };
  }
  if (pc === 'other' || lamp === 'other') {
    return {
      level: 'other',
      title: 'Gejala ini bukan indikasi absorber',
      steps: ['Cocokkan kode/jumlah kedipan dengan tabel "Kode error & panduan" atau manual printer.'],
    };
  }
  return {
    level: 'unknown',
    title: 'Tidak ada tanda absorber penuh — angka counter belum diketahui',
    steps: [
      'Tidak adanya peringatan tidak berarti pad kosong; peringatan baru muncul setelah ambang terlewati.',
      'Untuk angka persentase pasti, impor profil model (baca counter) lalu klik "Cek absorber full".',
    ],
  };
}
