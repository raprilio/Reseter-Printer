// Transport WebUSB untuk printer (USB class 7). Hanya Chromium (Chrome/Edge/Opera) dan butuh HTTPS.
// Windows: driver bawaan "usbprint" memegang perangkat, sehingga browser tidak bisa mengklaimnya
// kecuali driver diganti WinUSB (mis. lewat Zadig). Android, ChromeOS, dan Linux biasanya langsung bisa.

import { decodeDeviceIdBytes } from './ieee1284.js';

const PRINTER_CLASS = 7;
const FILTERS = [
  { classCode: PRINTER_CLASS },
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x04a9 }, // Canon
];

export class UsbTransport {
  constructor(device) {
    this.device = device;
    this.iface = null;
    this.alt = null;
    this.epIn = null;
    this.epOut = null;
    this.kind = 'usb';
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  static async request() {
    const device = await navigator.usb.requestDevice({ filters: FILTERS });
    const t = new UsbTransport(device);
    await t.open();
    return t;
  }

  get label() {
    const d = this.device;
    return `${d.manufacturerName || 'USB'} ${d.productName || ''} (${d.vendorId.toString(16)}:${d.productId.toString(16)})`.trim();
  }

  async open() {
    const d = this.device;
    await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);

    // Pilih alternate setting printer yang punya endpoint bulk in+out; utamakan protokol 2 (bidirectional).
    let best = null;
    for (const iface of d.configuration.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== PRINTER_CLASS) continue;
        const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
        const inn = alt.endpoints.find((e) => e.direction === 'in' && e.type === 'bulk');
        if (!out || !inn) continue;
        if (!best || alt.interfaceProtocol === 2) best = { iface, alt, out, inn };
      }
    }
    if (!best) throw new Error('Interface printer USB dengan endpoint bulk in/out tidak ditemukan.');

    try {
      await d.claimInterface(best.iface.interfaceNumber);
    } catch (e) {
      throw new Error(
        'Gagal mengklaim interface printer. Di Windows, driver usbprint menahan perangkat; ' +
          'ganti driver ke WinUSB (Zadig) atau pakai Android/Linux/ChromeOS. Detail: ' + e.message,
      );
    }
    if (best.alt.alternateSetting !== 0) {
      await d.selectAlternateInterface(best.iface.interfaceNumber, best.alt.alternateSetting);
    }
    this.iface = best.iface.interfaceNumber;
    this.alt = best.alt.alternateSetting;
    this.epOut = best.out.endpointNumber;
    this.epIn = best.inn.endpointNumber;
    this.packetSize = best.inn.packetSize || 64;
  }

  // GET_DEVICE_ID, request class printer (bRequest 0).
  async getDeviceId() {
    const d = this.device;
    const cfgIndex = Math.max(0, d.configurations.indexOf(d.configuration));
    const res = await d.controlTransferIn(
      {
        requestType: 'class',
        recipient: 'interface',
        request: 0,
        value: cfgIndex,
        index: (this.iface << 8) | this.alt,
      },
      1024,
    );
    if (res.status !== 'ok') throw new Error('GET_DEVICE_ID gagal: ' + res.status);
    return decodeDeviceIdBytes(new Uint8Array(res.data.buffer));
  }

  async send(bytes) {
    const res = await this.device.transferOut(this.epOut, bytes);
    if (res.status !== 'ok') throw new Error('transferOut: ' + res.status);
  }

  async receive(maxLen = 64, timeoutMs = 3000) {
    const size = Math.ceil(maxLen / this.packetSize) * this.packetSize;
    const read = this.device.transferIn(this.epIn, size).then((res) => {
      if (res.status !== 'ok') throw new Error('transferIn: ' + res.status);
      return new Uint8Array(res.data.buffer);
    });
    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error('Printer tidak merespons (timeout)')), timeoutMs);
    });
    try {
      return await Promise.race([read, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async close() {
    try {
      if (this.iface !== null) await this.device.releaseInterface(this.iface);
    } finally {
      await this.device.close();
    }
  }
}
