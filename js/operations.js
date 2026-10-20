// Daftar perintah per model: perintah standar + perintah tambahan yang dibawa profil.
// Fungsi murni (tanpa DOM) supaya bisa diuji.

import { normalize, resolveFeature } from './models.js';

export const GROUP_ORDER = [
  'Info & status',
  'Cek head',
  'Pembersihan head',
  'Reset absorber & counter',
  'Isi tinta',
  'Lainnya',
];

const ACK_RESET =
  'Saya paham: bantalan tinta fisik tidak ikut kosong dan harus dibersihkan atau diganti.';

// Urutan di sini = urutan tampil dalam grup.
export const STANDARD_OPS = {
  status: {
    label: 'Status & level tinta',
    group: 'Info & status',
    desc: 'Membaca status printer dan level tinta.',
  },
  nozzleCheck: {
    label: 'Cek head (nozzle check)',
    group: 'Cek head',
    desc: 'Mencetak pola nozzle untuk memeriksa head. Siapkan kertas.',
    confirmText: 'Printer akan mencetak pola nozzle. Siapkan kertas.',
  },
  headClean: {
    label: 'Bersihkan head',
    group: 'Pembersihan head',
    desc: 'Membersihkan head. Memakai tinta dan menambah counter absorber.',
    mutating: true,
    confirmText: 'Pembersihan head memakai tinta dan menambah counter absorber.',
  },
  powerClean: {
    label: 'Power cleaning',
    group: 'Pembersihan head',
    desc: 'Pembersihan head intensif. Memakai banyak tinta.',
    mutating: true,
  },
  wasteRead: {
    label: 'Cek absorber (waste ink counter)',
    group: 'Reset absorber & counter',
    desc: 'Membaca persentase counter tinta buang dan memeriksa apakah absorber penuh.',
  },
  wasteReset: {
    label: 'Reset absorber (waste ink pad counter)',
    group: 'Reset absorber & counter',
    desc: 'Mengatur ulang counter tinta buang. Bantalan fisik tidak ikut kosong.',
    mutating: true,
    danger: true,
    ack: ACK_RESET,
  },
  inkCharge: {
    label: 'Ink charge',
    group: 'Isi tinta',
    desc: 'Mengisi jalur tinta setelah tinta baru dipasang.',
    mutating: true,
  },
};

const groupRank = (g) => {
  const i = GROUP_ORDER.indexOf(g);
  return i < 0 ? GROUP_ORDER.length : i;
};

const REASON = {
  'need-profile': 'Belum ada data perintah untuk model ini (butuh profil).',
  missing: 'Tidak didukung untuk merek ini.',
};

/**
 * @returns {Array<{id,label,group,desc,level,profile,mutating,danger,ack,confirmText,available,reason}>}
 * level: builtin | experimental | profile-ready | need-profile | missing
 */
export function listOperations(brand, modelName, profiles = []) {
  const items = [];
  const seen = new Set();

  for (const [id, meta] of Object.entries(STANDARD_OPS)) {
    const res = resolveFeature(brand, modelName, id, profiles);
    const op = res.profile?.ops[id];
    items.push({
      id,
      label: op?.label || meta.label,
      group: op?.group || meta.group,
      desc: op?.desc || meta.desc,
      mutating: op?.mutating ?? meta.mutating ?? false,
      danger: op?.danger ?? meta.danger ?? false,
      ack: op?.ack || meta.ack || null,
      confirmText: meta.confirmText || null,
      level: res.level,
      profile: res.profile,
    });
    seen.add(id);
  }

  // Perintah tambahan: hanya ada bila profil model ini membawanya.
  for (const p of profiles) {
    if (p.brand !== brand) continue;
    if (!p.models.some((m) => normalize(m) === normalize(modelName))) continue;
    for (const [id, op] of Object.entries(p.ops)) {
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        label: op.label || id,
        group: op.group || 'Lainnya',
        desc: op.desc || '',
        mutating: op.mutating ?? true,
        danger: !!op.danger,
        ack: op.ack || null,
        confirmText: null,
        level: 'profile-ready',
        profile: p,
      });
    }
  }

  for (const it of items) {
    it.available = ['builtin', 'experimental', 'profile-ready'].includes(it.level);
    it.reason = it.available ? '' : REASON[it.level] || '';
  }
  // sort stabil: grup dulu, lalu urutan kemunculan
  return items
    .map((it, i) => [it, i])
    .sort((a, b) => groupRank(a[0].group) - groupRank(b[0].group) || a[1] - b[1])
    .map(([it]) => it);
}

export const isResetGroup = (item) => item.group === 'Reset absorber & counter';
