/**
 * LP(tsuioku-no-kirameki/index.html)用に、拡張の元画像(1500x1500 の PNG・1枚 400〜520KB)を、
 * 表示サイズに合わせた軽い WebP へ変換する(元の画像=拡張が使うものは【触らない】)。
 *
 * 背景(2026-10-16・ユーザー「LPを改善して」「アクセスした瞬間こうなる(横縞)」):
 *   Lighthouse(スマホ): 性能 58・LCP 48秒・転送 13.5MB。重い順に BGM の mp3 4.6MB・キャラ画像 PNG が1枚 400〜520KB×15種(約5.4MB)。
 *   しかも 1500x1500 を 83〜200px で表示=ブラウザは元の大きさ(1枚 約9MB のメモリ)へ展開するので、展開・描画が追いつかず
 *   描き終わっていない帯が【横縞】に見えていた(サイドパネルの縞と同じ形)。
 *
 * 使い方: node scripts/lp-optimize-images.mjs        (出力が最新ならスキップ・何度実行しても同じ結果)
 *         node scripts/lp-optimize-images.mjs --check (出力が無い/古ければ exit 1)
 * 出力:   tsuioku-no-kirameki/images/yukkuri/<name>.webp (キャラ・400x400) / tsuioku-no-kirameki/images/lp/<name>.webp (ロゴ・400px幅)
 * 依存:   ffmpeg(libwebp 入り)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LP_DIR = path.join(ROOT, 'tsuioku-no-kirameki');
const HTML = path.join(LP_DIR, 'index.html');
const CHECK = process.argv.includes('--check');

/** 変換の対象: LP が参照している元画像。キャラは正方形 400px、ロゴは幅 400px(縦横比そのまま)。 */
export function collectTargets(html) {
  const out = new Map(); // 元(extension/images からの相対) → { dest, width, height? }
  const re = /\.\.\/extension\/images\/(yukkuri-charactore-english\/[a-z]+\/[A-Za-z0-9_.-]+\.png|logo\/[A-Za-z0-9_.-]+\.png|lp\/[A-Za-z0-9_.-]+\.png)/g;
  let m;
  while ((m = re.exec(html))) {
    const rel = m[1];
    if (/\.thumb128\.png$/.test(rel)) continue; // 既に 128px の小さな版(そのまま使う)
    const base = path.basename(rel, '.png');
    const isChar = rel.startsWith('yukkuri-charactore-english/');
    out.set(rel, { dest: isChar ? `images/yukkuri/${base}.webp` : `images/lp/${base}.webp`, scale: isChar ? '400:400' : '400:-2' });
  }
  return out;
}

function convert(srcAbs, destAbs, scale) {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', srcAbs, '-vf', `scale=${scale}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', '-pix_fmt', 'yuva420p', destAbs], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${srcAbs}: ${r.stderr}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = fs.readFileSync(HTML, 'utf8');
  const targets = collectTargets(html);
  let converted = 0; let skipped = 0; let stale = 0; let srcBytes = 0; let destBytes = 0;
  for (const [rel, t] of targets) {
    const srcAbs = path.join(ROOT, 'extension', 'images', rel);
    const destAbs = path.join(LP_DIR, t.dest);
    if (!fs.existsSync(srcAbs)) { console.error('元画像がありません:', rel); process.exitCode = 1; continue; }
    const upToDate = fs.existsSync(destAbs) && fs.statSync(destAbs).mtimeMs >= fs.statSync(srcAbs).mtimeMs;
    srcBytes += fs.statSync(srcAbs).size;
    if (upToDate) { skipped += 1; destBytes += fs.statSync(destAbs).size; continue; }
    if (CHECK) { stale += 1; continue; }
    convert(srcAbs, destAbs, t.scale);
    converted += 1;
    destBytes += fs.statSync(destAbs).size;
  }
  console.log(`LP画像: 対象${targets.size}枚 / 変換${converted}・最新でスキップ${skipped}${CHECK ? `・要変換${stale}` : ''} / 元 ${(srcBytes / 1024).toFixed(0)}KB → WebP ${(destBytes / 1024).toFixed(0)}KB`);
  if (CHECK && stale > 0) process.exit(1);
}
