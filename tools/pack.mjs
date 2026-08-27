/**
 * 配布用の ZIP を作る（依存パッケージなし）。
 *   node tools/pack.mjs
 * dist/moru-<version>.zip に、拡張機能の動作に必要なファイルだけを固める。
 * manifest.json が ZIP の直下に来るので、ウェブストアにもそのまま出せる。
 */
import { deflateRawSync } from 'node:zlib';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** ZIP に入れるもの。ここに無いものは入らない */
const INCLUDE = [
  'manifest.json',
  'README.md',
  'icons',
  'src'
];

/* ---- ファイル収集 ---- */

async function collect(entry) {
  const abs = join(ROOT, entry);
  const info = await stat(abs);
  if (info.isFile()) return [entry];

  const out = [];
  for (const name of await readdir(abs)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;   // 一時ファイルは除外
    out.push(...await collect(join(entry, name)));
  }
  return out;
}

/* ---- 最小構成の ZIP ライター ---- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** JavaScript の Date を DOS 形式の日付・時刻に変換する */
function dosDateTime(d) {
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

function buildZip(entries, now) {
  const { date, time } = dosDateTime(now);
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const deflated = deflateRawSync(data, { level: 9 });
    // 圧縮して大きくなるならそのまま格納する
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // 展開に必要なバージョン
    local.writeUInt16LE(0x0800, 6);        // UTF-8 のファイル名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);               // 作成したバージョン
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(0, 30);               // extra + comment の長さ
    cd.writeUInt16LE(0, 34);               // ディスク番号
    cd.writeUInt16LE(0, 36);               // 内部属性
    cd.writeUInt32LE(0, 38);               // 外部属性
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);   // 中央ディレクトリのサイズ
  end.writeUInt32LE(offset, 16);         // 中央ディレクトリの開始位置
  end.writeUInt16LE(0, 20);              // コメントの長さ

  return Buffer.concat([...locals, cdBuf, end]);
}

/* ---- 実行 ---- */

const manifest = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8'));

const names = [];
for (const entry of INCLUDE) names.push(...await collect(entry));
names.sort();

const entries = [];
for (const name of names) {
  entries.push({
    name: name.split(sep).join('/'),        // ZIP 内は必ず / 区切り
    data: await readFile(join(ROOT, name))
  });
}

// manifest.json に載っているファイルが全部入っているか確かめる
const packed = new Set(entries.map((e) => e.name));
const required = [
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ...(manifest.web_accessible_resources || []).flatMap((w) => w.resources || [])
].filter(Boolean);

const missing = [...new Set(required)].filter((f) => !packed.has(f));
if (missing.length) {
  console.error('manifest.json が参照しているのに ZIP に入らないファイル:');
  for (const f of missing) console.error('  ' + f);
  process.exit(1);
}

await mkdir(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', `moru-${manifest.version}.zip`);
const zip = buildZip(entries, new Date());
await writeFile(out, zip);

console.log(`${relative(ROOT, out)}  (${entries.length} ファイル, ${(zip.length / 1024).toFixed(1)} KB)`);
for (const e of entries) console.log('  ' + e.name);
