import { decodeDeviceIdResponse } from './deviceid.js';

const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

export class BaseTransport {
  /** Baca sampai `until(acc)` true, data diam `idleMs` setelah ada byte, atau `timeoutMs` habis. */
  async readFor({ timeoutMs = 1500, idleMs = 200, until } = {}) {
    const start = performance.now();
    let acc = new Uint8Array(0);
    for (;;) {
      const remaining = timeoutMs - (performance.now() - start);
      if (remaining <= 0) break;
      const chunk = await this._readChunk(acc.length ? Math.min(idleMs, remaining) : remaining);
      if (!chunk.length) {
        if (acc.length) break;
        continue;
      }
      acc = concat(acc, chunk);
      if (until && until(acc)) break;
    }
    return acc;
  }

  async drain() {
    await this._readChunk(40);
  }
}

/** Transport WebUSB untuk interface USB Printer Class (0x07). */
export class WebUsbTransport extends BaseTransport {
  constructor(device) {
    super();
    this.device = device;
    this.kind = 'webusb';
    this._buf = new Uint8Array(0);
    this._pending = null;
  }

  static async request(vendorIds) {
    return navigator.usb.requestDevice({ filters: vendorIds.map((vendorId) => ({ vendorId })) });
  }

  async open() {
    const d = this.device;
    await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);
    let found = null;
    for (const iface of d.configuration.interfaces) {
      // Utamakan alternate bidirectional (protocol 2) agar bisa membaca respons.
      const alts = iface.alternates
        .filter((a) => a.interfaceClass === 0x07 && a.interfaceSubclass === 0x01)
        .sort((a, b) => b.interfaceProtocol - a.interfaceProtocol);
      if (alts.length) {
        found = { iface, alt: alts.find((a) => a.interfaceProtocol === 2) || alts[0] };
        break;
      }
    }
    if (!found) throw new Error('Interface USB Printer Class tidak ditemukan pada perangkat ini.');
    this.ifaceNumber = found.iface.interfaceNumber;
    this.altSetting = found.alt.alternateSetting;
    try {
      await d.claimInterface(this.ifaceNumber);
    } catch (e) {
      throw new Error(
        `Gagal claim interface (${e.message}). Di Windows driver "usbprint" menahan perangkat: ` +
          'ganti driver USB printer ke WinUSB (Zadig) atau gunakan Chrome Android/Linux.'
      );
    }
    if (found.alt.alternateSetting !== 0 || found.iface.alternates.length > 1) {
      await d.selectAlternateInterface(this.ifaceNumber, this.altSetting);
    }
    this.epOut = found.alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')?.endpointNumber;
    this.epIn = found.alt.endpoints.find((e) => e.direction === 'in' && e.type === 'bulk')?.endpointNumber;
    if (!this.epOut) throw new Error('Endpoint bulk OUT tidak ditemukan.');
    this.bidirectional = Boolean(this.epIn);
  }

  async close() {
    try {
      await this.device.close();
    } catch {
      /* sudah tertutup */
    }
  }

  async getDeviceId() {
    const res = await this.device.controlTransferIn(
      {
        requestType: 'class',
        recipient: 'interface',
        request: 0, // GET_DEVICE_ID
        value: this.device.configuration.configurationValue,
        index: (this.ifaceNumber << 8) | this.altSetting,
      },
      1024
    );
    if (res.status !== 'ok') throw new Error(`GET_DEVICE_ID gagal: ${res.status}`);
    return decodeDeviceIdResponse(new Uint8Array(res.data.buffer));
  }

  async write(bytes) {
    const res = await this.device.transferOut(this.epOut, bytes);
    if (res.status !== 'ok') throw new Error(`Tulis USB gagal: ${res.status}`);
  }

  _pull() {
    if (!this.epIn) return new Promise(() => {});
    if (!this._pending) {
      this._pending = this.device
        .transferIn(this.epIn, 512)
        .then((r) => {
          this._pending = null;
          if (r.data && r.data.byteLength) this._buf = concat(this._buf, new Uint8Array(r.data.buffer));
        })
        .catch((e) => {
          this._pending = null;
          throw e;
        });
    }
    return this._pending;
  }

  async _readChunk(waitMs) {
    if (!this._buf.length) {
      let timer;
      const timeout = new Promise((r) => {
        timer = setTimeout(r, waitMs);
      });
      await Promise.race([this._pull(), timeout]);
      clearTimeout(timer);
    }
    const out = this._buf;
    this._buf = new Uint8Array(0);
    return out;
  }
}
