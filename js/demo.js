// Printer simulasi untuk mencoba alur UI tanpa perangkat. TIDAK mengirim apa pun ke printer asli
// dan perintah "DE xx" di bawah adalah karangan untuk demo, bukan protokol Epson/Canon.

import { MODELS } from './models.js';
import { bytesToHex } from './profiles.js';

const enc = new TextEncoder();

export function demoProfiles() {
  const mk = (brand) => ({
    schema: 1,
    id: `demo-${brand}`,
    name: `Demo ${brand} (simulasi)`,
    brand,
    demo: true,
    verified: false,
    models: MODELS.filter((m) => m.brand === brand).map((m) => m.name),
    ops: {
      wasteRead: {
        steps: [{ tx: 'DE 01', rx: { len: 8, timeoutMs: 1000 } }],
        counters: [
          { name: 'Main pad', offset: 2, length: 2, endian: 'le', max: 10000 },
          { name: 'Platen pad', offset: 4, length: 2, endian: 'le', max: 10000 },
        ],
      },
      wasteReset: {
        steps: [{ tx: 'DE 02' }],
        message: 'Simulasi: counter demo akan di-nol-kan.',
      },
      inkCharge: { steps: [{ tx: 'DE 03' }], message: 'Simulasi ink charge.' },
      powerClean: { steps: [{ tx: 'DE 04' }], message: 'Simulasi power cleaning.' },
    },
  });
  return [mk('epson'), mk('canon')];
}

function st2(status, inks) {
  const ink = [3];
  inks.forEach(([code, level]) => ink.push(0, code, level));
  const fields = [0x01, 1, status, 0x02, 1, 0, 0x0f, ink.length, ...ink];
  return Uint8Array.from([
    ...enc.encode('@BDC ST2\r\n'),
    fields.length & 0xff,
    fields.length >> 8,
    ...fields,
  ]);
}

export class DemoTransport {
  constructor(brand = 'epson') {
    this.kind = 'demo';
    this.brand = brand;
    this.label = 'Printer simulasi';
    this.counters = { main: 9400, platen: 6100 };
    this.queue = [];
    this.history = [];
  }

  async getDeviceId() {
    return this.brand === 'epson'
      ? 'MFG:EPSON;CMD:ESCPL2,BDC,D4,D4PX,ESCPR1;MDL:L3210 Series;CLS:PRINTER;DES:EPSON L3210 Series;'
      : 'MFG:Canon;CMD:BJRaster3,NCCe,IVEC,IVECPLI;MDL:G1010 series;CLS:PRINTER;DES:Canon G1010 series;VER:1.030;STA:10;';
  }

  async send(bytes) {
    this.history.push(bytesToHex(bytes));
    const text = new TextDecoder('latin1').decode(bytes);
    if (bytes[0] === 0xde) {
      const [, op] = bytes;
      if (op === 1) {
        const { main, platen } = this.counters;
        this.queue.push(Uint8Array.from([0xde, 1, main & 255, main >> 8, platen & 255, platen >> 8, 0, 0]));
      } else if (op === 2) this.counters = { main: 0, platen: 0 };
    } else if (text.includes('REMOTE1ST')) {
      this.queue.push(st2(4, [[0, 82], [1, 45], [2, 18], [3, 64]]));
    }
  }

  async receive() {
    const next = this.queue.shift();
    if (!next) throw new Error('Printer tidak merespons (timeout)');
    return next;
  }

  async close() {}
}
