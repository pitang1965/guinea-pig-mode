/**
 * icons/*.png を生成する（依存パッケージなし）。
 *   node tools/make-icons.mjs
 * 128x128 の座標系で正面向きのモルモットの顔を描き、各サイズに縮小して PNG 出力する。
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 128;   // 設計時の座標系
const SS = 4;       // スーパーサンプリング倍率

const C = {
  body: [0xc9, 0x79, 0x3f, 255],   // 地の毛色
  pale: [0xf7, 0xe9, 0xd2, 255],   // 額のブレーズと口まわり
  inner: [0xed, 0xa2, 0x85, 255],  // 耳の内側
  eye: [0x24, 0x16, 0x11, 255],
  shine: [0xff, 0xff, 0xff, 255],
  nose: [0x8f, 0x54, 0x57, 255],
  mouth: [0x6b, 0x3a, 0x3d, 255],
  line: [0x48, 0x29, 0x1a, 255]    // 輪郭
};

/** 楕円: 中心/半径/回転角(度、時計回り)/色 */
const ellipse = (cx, cy, rx, ry, rot, color) =>
  ({ kind: 'ellipse', cx, cy, rx, ry, rot: (rot * Math.PI) / 180, color });

/** 丸端の線分（口やヒゲ用） */
const capsule = (x1, y1, x2, y2, r, color) =>
  ({ kind: 'capsule', x1, y1, x2, y2, r, color });

/* ---- 頭（クリーム地。まず輪郭付きで描く） ---- */
const HEAD_SHAPE = ellipse(64, 74, 45, 43, 0, C.pale);
const HEAD = [HEAD_SHAPE];

/** 頭からはみ出さないように切り抜く */
const clipHead = (shape) => ({ ...shape, clip: HEAD_SHAPE });

/* ---- 両側の差し毛。真ん中にクリームのブレーズが残る ---- */
const MARKS = [
  clipHead(ellipse(26, 50, 28, 26, 0, C.body)),
  clipHead(ellipse(102, 50, 28, 26, 0, C.body))
];

/* ---- 耳（頭の手前に、独立した輪郭付きで垂らす） ---- */
const EARS = [
  ellipse(30, 43, 14.5, 8, -40, C.body),
  ellipse(98, 43, 14.5, 8, 40, C.body)
];
const EAR_INNER = [
  ellipse(33, 41, 8, 4, -40, C.inner),
  ellipse(95, 41, 8, 4, 40, C.inner)
];

/* ---- 目・鼻・口 ---- */
const FACE = [
  // 目は細長い楕円。外側をわずかに下げ、下に向かって浅く八の字に開く
  ellipse(45, 66, 9.5, 5.2, -65, C.eye),
  ellipse(83, 66, 9.5, 5.2, 65, C.eye),
  ellipse(41.8, 64.2, 2, 2, 0, C.shine),       // ハイライトは左右とも同じ側に置く
  ellipse(79.8, 64.2, 2, 2, 0, C.shine),

  ellipse(64, 86, 6.5, 4.2, 0, C.nose),        // 鼻
  ellipse(64, 88.5, 2.8, 2.8, 0, C.nose),      // 鼻先
  ellipse(61, 85.2, 2, 1.2, -30, C.mouth),     // 鼻の穴
  ellipse(67, 85.2, 2, 1.2, 30, C.mouth),

  // 逆Yの字の口。縦線を長めにとる
  capsule(64, 91, 64, 101.5, 1.9, C.mouth),
  capsule(64, 101.5, 58.5, 105, 1.9, C.mouth),
  capsule(58.5, 105, 53.5, 105.8, 1.9, C.mouth),
  capsule(64, 101.5, 69.5, 105, 1.9, C.mouth),
  capsule(69.5, 105, 74.5, 105.8, 1.9, C.mouth)
];

const GROW = 3.4;  // 輪郭線の太さ

function inside(shape, x, y) {
  if (shape.kind === 'capsule') {
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - shape.x1) * dx + (y - shape.y1) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x - (shape.x1 + t * dx);
    const py = y - (shape.y1 + t * dy);
    return px * px + py * py <= shape.r * shape.r;
  }
  const dx = x - shape.cx;
  const dy = y - shape.cy;
  const cos = Math.cos(shape.rot);
  const sin = Math.sin(shape.rot);
  const px = dx * cos + dy * sin;
  const py = -dx * sin + dy * cos;
  return (px * px) / (shape.rx * shape.rx) + (py * py) / (shape.ry * shape.ry) <= 1;
}

function grow(shape, amount) {
  return shape.kind === 'capsule'
    ? { ...shape, r: shape.r + amount, color: C.line }
    : { ...shape, rx: shape.rx + amount, ry: shape.ry + amount, color: C.line };
}

/** 指定サイズの RGBA バッファを描く */
function draw(size) {
  const n = size * SS;
  const scale = BASE / n;
  const buf = new Float32Array(n * n * 4);

  const layers = [
    ...HEAD.map((s) => grow(s, GROW)), ...HEAD,
    ...MARKS,
    ...EARS.map((s) => grow(s, GROW)), ...EARS, ...EAR_INNER,
    ...FACE
  ];

  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const x = (px + 0.5) * scale;
      const y = (py + 0.5) * scale;
      let r = 0, g = 0, b = 0, a = 0;
      for (const shape of layers) {
        if (shape.clip && !inside(shape.clip, x, y)) continue;
        if (!inside(shape, x, y)) continue;
        const [sr, sg, sb] = shape.color;   // すべて不透明なので上書き
        r = sr; g = sg; b = sb; a = 255;
      }
      const i = (py * n + px) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }

  // スーパーサンプルをアルファ加重平均して縮小
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + (x * SS + sx)) * 4;
          const alpha = buf[i + 3] / 255;
          r += buf[i] * alpha; g += buf[i + 1] * alpha; b += buf[i + 2] * alpha;
          a += buf[i + 3];
        }
      }
      const samples = SS * SS;
      const aAvg = a / samples;
      const weight = aAvg > 0 ? a / 255 : 1;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / weight);
      out[o + 1] = Math.round(g / weight);
      out[o + 2] = Math.round(b / weight);
      out[o + 3] = Math.round(aAvg);
    }
  }
  return out;
}

/* ---- 最小構成の PNG エンコーダ ---- */

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

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // フィルタ: None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync(join(ROOT, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = join(ROOT, 'icons', `icon${size}.png`);
  writeFileSync(file, encodePng(draw(size), size));
  console.log('wrote', file);
}
