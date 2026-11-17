// Хамаарлын ZIP бичигч (PKZIP, deflate, UTF-8 нэр) — мэдээлэл татах (Үе 3)-д. Гадаад сан ашиглахгүй
// (archiver-ийн glob хамаарлууд npm audit-д эмзэг байсан, D-37). Файл бүрийг санах ойд шахаж шууд урсгал руу бичнэ.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * const zip = createZip(writable); zip.add('a/b.json', Buffer|string); await zip.finish();
 * Writable-ийн backpressure-ийг хүндэтгэнэ.
 */
export function createZip(out) {
  const central = [];
  let offset = 0;
  const write = (buf) =>
    new Promise((resolve, reject) => {
      offset += buf.length;
      if (out.write(buf)) resolve();
      else {
        out.once('drain', resolve);
        out.once('error', reject);
      }
    });

  async function add(name, content, { date = new Date() } = {}) {
    if (offset > 0xfffffff0) throw new Error('ZIP хэт том (4 GB)');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const nameBuf = Buffer.from(name.replace(/^\/+/, ''), 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 6 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const { time, date: d } = dosTime(date);
    const method = useDeflate ? 8 : 0;
    const flags = 0x0800; // UTF-8 нэр (монгол үсэг)

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(d, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const headerOffset = offset;
    await write(Buffer.concat([local, nameBuf]));
    await write(body);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(d, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(headerOffset, 42);
    central.push(Buffer.concat([c, nameBuf]));
  }

  async function finish() {
    const start = offset;
    const dir = Buffer.concat(central);
    await write(dir);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(start, 16);
    await write(end);
    out.end();
  }

  return { add, finish };
}
