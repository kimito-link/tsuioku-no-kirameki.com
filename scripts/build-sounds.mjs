// build-sounds.mjs
// sound-src/(CC0原素材)から extension/sound/ の効果音mp3を組み立てる。
// Fable設計(council/sound-and-pachinko-gamification.md)に基づき、ギフト投擲音を
//   「投擲のフッ(whoosh)→着弾のドン(impact)→きらめきの余韻(sparkle)」の3層構造に
//   ミックスし、ffmpeg loudnorm でラウドネス正規化する(音圧不足の再発防止・v0.1.1059)。
// 実行: npm run sound:build (要 ffmpeg がPATHにあること)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'sound-src');
const OUT_DIR = join(ROOT, 'extension', 'sound');
const TIERS_SRC_DIR = join(SRC_DIR, 'tiers');
const TIERS_OUT_DIR = join(OUT_DIR, 'tiers');

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

// v0.1.1061: ギフト系のラウドネス目標。-14 LUFS(配信基準)だと配信音声の下に埋もれて
//   「しょぼい」ため、短尺SFXの慣例に合わせ -9 LUFS まで引き上げる(ユーザー実試聴フィードバック)。
const GIFT_LOUDNORM = 'loudnorm=I=-9:TP=-0.5:LRA=11';
const DEFAULT_LOUDNORM = 'loudnorm=I=-14:TP=-1.0:LRA=11';

/**
 * gift-whoosh.mp3(0ms開始)→gift-impact.mp3(100ms開始)→gift-sparkle.mp3(180ms開始)を
 *   1本にミックスし、loudnorm で正規化して effect-gift.mp3 へ出力。
 * @param {string} tmpDir
 */
function buildGiftSound(tmpDir) {
  const whoosh = join(SRC_DIR, 'gift-whoosh.mp3');
  const impact = join(SRC_DIR, 'gift-impact.mp3');
  const sparkle = join(SRC_DIR, 'gift-sparkle.mp3');
  if (!existsSync(whoosh) || !existsSync(impact) || !existsSync(sparkle)) {
    console.log('[build-sounds] sound-src/gift-*.mp3 が無いためギフト音のミックスをスキップします。');
    return false;
  }
  const mixed = join(tmpDir, 'gift-mixed.wav');
  const normalized = join(OUT_DIR, 'effect-gift.mp3');

  // adelay で各層の開始オフセットをずらしてから amix。全体は最長の入力(sparkle)に自然に収まる。
  // ★amix は既定で各入力を 1/入力数 に減衰させる(v0.1.1059の「しょぼい」の一因)。
  //   normalize=0 で各層の重みを保ち、クリップは alimiter に任せる。
  ffmpeg([
    '-i', whoosh,
    '-i', impact,
    '-i', sparkle,
    '-filter_complex',
    '[0:a]adelay=0|0,volume=0.9[a0];' +
      '[1:a]adelay=100|100,volume=1.0[a1];' +
      '[2:a]adelay=180|180,volume=0.85[a2];' +
      '[a0][a1][a2]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[out]',
    '-map', '[out]',
    mixed
  ]);
  ffmpeg([
    '-i', mixed,
    '-af', GIFT_LOUDNORM,
    '-ar', '44100',
    '-q:a', '2',
    normalized
  ]);
  console.log(`[build-sounds] ${normalized} を再生成しました(whoosh+impact+sparkleの3層ミックス)。`);
  return true;
}

/** 既存の effect-*.mp3 全てをラウドネス正規化する(音圧のばらつきを均す・恒久対応)。 */
function normalizeExistingEffects(tmpDir) {
  const targets = [
    'effect-ad.mp3',
    'effect-rank-up.mp3',
    'effect-rank-down.mp3',
    'effect-milestone-soft.mp3',
    'effect-milestone-hard.mp3',
    'effect-milestone-jackpot.mp3'
  ];
  for (const name of targets) {
    const path = join(OUT_DIR, name);
    if (!existsSync(path)) continue;
    const tmp = join(tmpDir, name);
    ffmpeg(['-i', path, '-af', DEFAULT_LOUDNORM, '-ar', '44100', '-q:a', '2', tmp]);
    copyFileSync(tmp, path);
    console.log(`[build-sounds] ${name} をラウドネス正規化しました。`);
  }
}

/**
 * v0.1.1061: ギフトのtierバリエーションに「着弾ボディ」を敷く。
 *   実試聴で「しょぼすぎてよくわからない」(特に small/medium は0.2〜0.3秒の裸のブリップ)
 *   だったため、全ギフト音を「バリエーション素材(個性)+impact(ドン)+sparkle(キラ)」の
 *   3層ミックスに統一し、tierが上がるほどボディを厚く・余韻を長くする。
 *   数値はティアごとの重み(決定論・乱数なし)。
 */
const GIFT_TIER_BODY = Object.freeze({
  small: { impact: 0.5, sparkle: 0.5, durSec: 0.9 },
  medium: { impact: 0.65, sparkle: 0.6, durSec: 1.2 },
  large: { impact: 0.85, sparkle: 0.7, durSec: 1.6 },
  mega: { impact: 1.0, sparkle: 0.85, durSec: 2.2 }
});

/**
 * gift-<tier>-<n>.mp3 1本を、impact+sparkle のボディ付き3層ミックスへ組み立てる。
 * @param {string} src バリエーション素材
 * @param {string} dest 出力先
 * @param {{impact:number,sparkle:number,durSec:number}} body ティア重み
 * @param {string} tmpDir
 */
function buildGiftTierSound(src, dest, body, tmpDir) {
  const impact = join(SRC_DIR, 'gift-impact.mp3');
  const sparkle = join(SRC_DIR, 'gift-sparkle.mp3');
  const mixed = join(tmpDir, `mix-${dest.split(/[\\/]/).pop()}.wav`);
  const fadeStart = Math.max(0.1, body.durSec - 0.3);
  ffmpeg([
    '-i', src,
    '-i', impact,
    '-i', sparkle,
    '-filter_complex',
    '[0:a]adelay=0|0,volume=1.0[a0];' +
      `[1:a]adelay=30|30,volume=${body.impact}[a1];` +
      `[2:a]adelay=120|120,volume=${body.sparkle}[a2];` +
      '[a0][a1][a2]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,' +
      `atrim=0:${body.durSec},afade=t=out:st=${fadeStart}:d=0.3,alimiter=limit=0.95[out]`,
    '-map', '[out]',
    mixed
  ]);
  ffmpeg(['-i', mixed, '-af', GIFT_LOUDNORM, '-ar', '44100', '-q:a', '2', dest]);
}

/**
 * v0.1.1059: パチンコ台的バリエーション。sound-src/tiers/<category>-<n>.mp3 を全てラウドネス
 *   正規化して extension/sound/tiers/ へコピーする。同じイベントでも毎回違う音が鳴るよう、
 *   effectSoundPlayer.js がカテゴリ内からランダムに1本選ぶ前提の素材群。
 * @param {string} tmpDir
 */
function buildTierVariations(tmpDir) {
  if (!existsSync(TIERS_SRC_DIR)) {
    console.log('[build-sounds] sound-src/tiers/ が無いためバリエーション正規化をスキップします。');
    return false;
  }
  mkdirSync(TIERS_OUT_DIR, { recursive: true });
  const files = readdirSync(TIERS_SRC_DIR).filter((f) => f.endsWith('.mp3'));
  const hasBody = existsSync(join(SRC_DIR, 'gift-impact.mp3')) && existsSync(join(SRC_DIR, 'gift-sparkle.mp3'));
  let bodyCount = 0;
  for (const name of files) {
    const src = join(TIERS_SRC_DIR, name);
    const dest = join(TIERS_OUT_DIR, name);
    // v0.1.1061: gift-* は裸のブリップでなく「着弾ボディ付き3層ミックス」に組み立てる。
    const giftTier = /^gift-(small|medium|large|mega)-\d+\.mp3$/.exec(name)?.[1];
    if (giftTier && hasBody) {
      buildGiftTierSound(src, dest, GIFT_TIER_BODY[giftTier], tmpDir);
      bodyCount += 1;
      continue;
    }
    const tmp = join(tmpDir, `tier-${name}`);
    ffmpeg(['-i', src, '-af', DEFAULT_LOUDNORM, '-ar', '44100', '-q:a', '2', tmp]);
    copyFileSync(tmp, dest);
  }
  console.log(`[build-sounds] tiers/ 配下 ${files.length} 件を処理しました(うちギフト${bodyCount}件はボディ付きミックス)。`);
  return true;
}

function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nls-sound-build-'));
  try {
    const built = buildGiftSound(tmpDir);
    const tiersBuilt = buildTierVariations(tmpDir);
    if (process.argv.includes('--normalize-all')) {
      normalizeExistingEffects(tmpDir);
    }
    if (!built && !tiersBuilt) process.exitCode = 1;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
