import { BaseTransport } from './transport.js';

/** Printer tiruan (Epson L3210) untuk mencoba UI tanpa perangkat keras. */
export class DemoTransport extends BaseTransport {
  constructor() {
    super();
    this.kind = 'demo';
    this.inkLevels = [82, 64, 47, 9];
    this.counters = { main: 5400, platen: 4950 };
    this._out = [];
  }

  async open() {}
  async close() {}

  async getDeviceId() {
    return 'MFG:EPSON;CMD:ESCPL2,BDC,D4,D4PX,ESCPR1;MDL:L3210 Series;CLS:PRINTER;DES:EPSON L3210 Series;';
  }

  async write(bytes) {
    const text = new TextDecoder('latin1').decode(bytes);
    if (text.includes('IQ\x01\x00\x01')) {
      this._out.push(...new TextEncoder().encode(`@BDC PS\r\nIQ:${this.inkLevels.map((v) => v.toString(16).padStart(2, '0')).join('')};\r\n`));
    } else if (text.startsWith('DEMO:RC')) {
      this._out.push(this.counters.main >> 8, this.counters.main & 0xff, this.counters.platen >> 8, this.counters.platen & 0xff);
    } else if (text.startsWith('DEMO:RW')) {
      this.counters = { main: 0, platen: 0 };
      this._out.push(...new TextEncoder().encode('OK'));
    } else if (text.startsWith('DEMO:IC')) {
      this.inkLevels = [100, 100, 100, 100];
      this._out.push(...new TextEncoder().encode('OK'));
    }
  }

  async _readChunk(waitMs) {
    await new Promise((r) => setTimeout(r, Math.min(waitMs, this._out.length ? 30 : waitMs)));
    const out = Uint8Array.from(this._out);
    this._out = [];
    return out;
  }
}

export const DEMO_PROFILE = {
  name: 'Demo (simulasi, bukan printer asli)',
  demo: true,
  match: { model: 'L3210' },
  inks: ['K', 'C', 'M', 'Y'],
  ops: {
    readCounters: {
      label: 'Baca counter waste ink',
      write: false,
      steps: [{ send: 'text:DEMO:RC' }, { read: true, timeoutMs: 500 }],
      parse: {
        counters: [
          { label: 'Main pad', offset: 0, length: 2, endian: 'be', max: 5500 },
          { label: 'Platen pad', offset: 2, length: 2, endian: 'be', max: 5500 },
        ],
      },
    },
    resetWaste: { label: 'Reset waste ink counter', write: true, steps: [{ send: 'text:DEMO:RW' }, { read: true, timeoutMs: 500 }] },
    inkCharge: { label: 'Ink charge', write: true, steps: [{ send: 'text:DEMO:IC' }, { delay: 600 }, { read: true, timeoutMs: 500 }] },
  },
};

