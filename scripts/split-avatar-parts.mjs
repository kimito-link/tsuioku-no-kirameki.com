// 偽市松背景の除去 + パーツ切り出し(one-off アセットパイプライン)
// 使い方: node .artifacts/split-avatar-parts.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PNG } = require(path.resolve('node_modules/pngjs'));

const SRC_DIR = 'memory/avatar-parts';
const OUT_DIR = 'memory/avatar-parts/parts';
mkdirSync(OUT_DIR, { recursive: true });

function load(file) {
  return PNG.sync.read(readFileSync(file));
}
function save(png, file) {
  writeFileSync(file, PNG.sync.write(png));
  console.log('wrote', file);
}

/** 端から市松色だけを flood-fill して alpha=0 にする */
function removeCheckerBackground(png) {
  const { width: w, height: h, data: d } = png;
  // 市松の2色は四隅からサンプル(明るい低彩度2トーン)
  const samples = [];
  for (const [sx, sy] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2], [14, 1], [1, 14]]) {
    const i = (sy * w + sx) * 4;
    samples.push([d[i], d[i + 1], d[i + 2]]);
  }
  const isBg = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // 低彩度かつ明るい(市松はほぼ白/薄灰)。トーン違いも吸収するため samples との距離でも判定
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat > 18) return false;
    if (r < 200) return false;
    for (const [sr, sg, sb] of samples) {
      if (Math.abs(r - sr) <= 22 && Math.abs(g - sg) <= 22 && Math.abs(b - sb) <= 22) return true;
    }
    return false;
  };
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
  // stack は [x,y,...] ペア列として処理
  const queue = [];
  for (let k = 0; k < stack.length; k += 2) queue.push([stack[k], stack[k + 1]]);
  while (queue.length) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (!isBg(i)) continue;
    d[i + 3] = 0;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return png;
}

/** 不透明ピクセルの連結成分の bbox 一覧(8近傍・小ゴミ除外) */
function componentBoxes(png, minArea = 120) {
  const { width: w, height: h, data: d } = png;
  const seen = new Uint8Array(w * h);
  const boxes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (seen[p] || d[p * 4 + 3] === 0) continue;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;
      const q = [[x, y]];
      seen[p] = 1;
      while (q.length) {
        const [cx, cy] = q.pop();
        area++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (seen[np] || d[np * 4 + 3] === 0) continue;
          seen[np] = 1;
          q.push([nx, ny]);
        }
      }
      if (area >= minArea) boxes.push({ minX, minY, maxX, maxY, area });
    }
  }
  return boxes;
}

function crop(png, box, pad = 4) {
  const x0 = Math.max(0, box.minX - pad), y0 = Math.max(0, box.minY - pad);
  const x1 = Math.min(png.width - 1, box.maxX + pad), y1 = Math.min(png.height - 1, box.maxY + pad);
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(png, out, x0, y0, out.width, out.height, 0, 0);
  return out;
}

function mergeBoxes(boxes) {
  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY)
  }));
}

// ---- 髪シート: 4×2 グリッド(成分をセル中心で割当) ----
{
  const png = removeCheckerBackground(load(path.join(SRC_DIR, 'hair-sheet-v1.png')));
  save(png, path.join(SRC_DIR, 'hair-sheet-v1-alpha.png'));
  const boxes = componentBoxes(png);
  const cellW = png.width / 4, cellH = png.height / 2;
  const names = ['bob', 'short-flip', 'long', 'ponytail', 'twintail', 'mushroom', 'center-part', 'wolf'];
  const cells = new Map();
  for (const b of boxes) {
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const cell = Math.min(1, Math.floor(cy / cellH)) * 4 + Math.min(3, Math.floor(cx / cellW));
    cells.set(cell, cells.has(cell) ? mergeBoxes([cells.get(cell), b]) : b);
  }
  for (const [cell, box] of [...cells.entries()].sort((a, b) => a[0] - b[0])) {
    save(crop(png, box), path.join(OUT_DIR, 'hair-' + (names[cell] || 'extra' + cell) + '.png'));
  }
  console.log('hair components:', boxes.length, '-> cells:', cells.size);
}

// ---- 表情シート: 行帯(目/チーク/口)で分け、左右ペアはX近接でグルーピング ----
{
  const png = removeCheckerBackground(load(path.join(SRC_DIR, 'face-sheet-v1.png')));
  save(png, path.join(SRC_DIR, 'face-sheet-v1-alpha.png'));
  const boxes = componentBoxes(png, 60);
  const h = png.height;
  const bands = { eyes: [], cheek: [], mouth: [] };
  for (const b of boxes) {
    const cy = (b.minY + b.maxY) / 2;
    if (cy < h * 0.45) bands.eyes.push(b);
    else if (cy < h * 0.62) bands.cheek.push(b);
    else bands.mouth.push(b);
  }
  // X でソートし、間隔の大きい所で 6/2/6 グループに割る
  function groupByGap(list, n) {
    const sorted = [...list].sort((a, b) => a.minX - b.minX);
    if (sorted.length <= n) return sorted.map((b) => [b]);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push({ i, gap: sorted[i].minX - sorted[i - 1].maxX });
    gaps.sort((a, b) => b.gap - a.gap);
    const cuts = gaps.slice(0, n - 1).map((g) => g.i).sort((a, b) => a - b);
    const groups = [];
    let start = 0;
    for (const c of cuts) { groups.push(sorted.slice(start, c)); start = c; }
    groups.push(sorted.slice(start));
    return groups;
  }
  // 目/口は横6等分セルに中心座標で割当(左右ペア・眉・ハイライトを同セルに確実合流)
  function groupByCells(list, n, width) {
    const groups = Array.from({ length: n }, () => []);
    for (const b of list) {
      const cx = (b.minX + b.maxX) / 2;
      groups[Math.min(n - 1, Math.floor(cx / (width / n)))].push(b);
    }
    return groups;
  }
  const eyeNames = ['open', 'smile', 'jito', 'sparkle', 'surprised', 'sleepy'];
  groupByCells(bands.eyes, 6, png.width).forEach((g, i) => {
    if (g.length) save(crop(png, mergeBoxes(g)), path.join(OUT_DIR, 'eyes-' + (eyeNames[i] || 'x' + i) + '.png'));
  });
  groupByGap(bands.cheek, 2).forEach((g, i) => {
    if (g.length) save(crop(png, mergeBoxes(g)), path.join(OUT_DIR, 'cheek-' + i + '.png'));
  });
  const mouthNames = ['omega', 'smile', 'open', 'mu', 'pokan', 'smirk'];
  groupByCells(bands.mouth, 6, png.width).forEach((g, i) => {
    if (g.length) save(crop(png, mergeBoxes(g)), path.join(OUT_DIR, 'mouth-' + (mouthNames[i] || 'x' + i) + '.png'));
  });
  console.log('face components:', boxes.length, 'eyes/cheek/mouth =', bands.eyes.length, bands.cheek.length, bands.mouth.length);
}
