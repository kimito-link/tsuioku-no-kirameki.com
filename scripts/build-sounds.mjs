// build-sounds.mjs
// extension/sound/ の効果音mp3を組み立てる。
// 2026-07-16: 全音源は ffmpeg aevalsrc(正弦波の数式合成)のみで生成する
//   (buildSynthPachinkoSuite)。外部音声素材(sound-src/)を読み込む経路は、出典記録が
//   信頼できないと判明したため全て削除した(詳細は sound-src/SOURCES.md)。
// 実行: npm run sound:build (要 ffmpeg がPATHにあること)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'sound-src', 'soundeffect-lab');
const OUT_DIR = join(ROOT, 'extension', 'sound');
const TIERS_OUT_DIR = join(OUT_DIR, 'tiers');

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

const DEFAULT_LOUDNORM = 'loudnorm=I=-14:TP=-1.0:LRA=11';

/**
 * 2026-07-16: 旧buildGiftSound(sound-src/gift-whoosh.mp3+gift-impact.mp3+gift-sparkle.mp3を
 *   ミックスする経路)は出典が信頼できないと判明し削除した(3ファイルとも削除済み)。
 *   GIFT種別(effectSoundKindForGiftTierの未対応tierフォールバック)は、実際に配布・使用中の
 *   gift_mediumバリエーション(buildSynthPachinkoSuiteが生成する完全自作合成音)の1本目を
 *   そのまま流用する(ad/rank_up/rank_down/milestone_*と同じ「既存自作音を転用」パターン)。
 * @returns {boolean} コピーできたか
 */
function buildGiftSoundFromSynthTier() {
  const src = join(TIERS_OUT_DIR, 'gift-medium-1.mp3');
  const dest = join(OUT_DIR, 'effect-gift.mp3');
  if (!existsSync(src)) {
    console.log('[build-sounds] tiers/gift-medium-1.mp3 が無いため effect-gift.mp3 の生成をスキップします。');
    return false;
  }
  copyFileSync(src, dest);
  console.log(`[build-sounds] ${dest} を再生成しました(tiers/gift-medium-1.mp3 の複製・自作合成音)。`);
  return true;
}

/**
 * 2026-07-16: フォールバック単一ファイル(EFFECT_SOUND_PATHSが指すeffect-<kind>.mp3)を、
 *   対応するtiersバリエーションの1番目のコピーへ揃える(ad/rank_up/milestone_*と同じパターン・
 *   バリエーション解決に失敗した異常系でも出典不明の音が鳴らないようにする)。
 */
function syncFallbackFilesToTierOne() {
  const mapping = {
    'effect-ad.mp3': 'ad-1.mp3',
    'effect-rank-up.mp3': 'rank-up-1.mp3',
    'effect-milestone-soft.mp3': 'milestone-soft-1.mp3',
    'effect-milestone-hard.mp3': 'milestone-hard-1.mp3',
    'effect-milestone-jackpot.mp3': 'milestone-jackpot-1.mp3'
  };
  for (const [destName, srcName] of Object.entries(mapping)) {
    const src = join(TIERS_OUT_DIR, srcName);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(OUT_DIR, destName));
  }
  console.log('[build-sounds] フォールバック単一ファイル(effect-ad/rank-up/milestone-*.mp3)をtiersの1番目へ同期しました。');
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
 * v0.1.1069: パチンコ音の文法(保留→きゅいん→リーチ煽り→大当たり→払い出し)に基づく
 *   全音源フルセット合成(council/pachinko-sound-max-SYNTHESIS.md 正本)。
 *   ffmpeg aevalsrc の直接合成のみを使う(素材ミックスは他カテゴリのみ)。完全に決定論・
 *   ライセンスフリー(自作)。バリエーション n=1..3 は基準周波数を±6%ずらして作る(乱数不使用)。
 */
const SYNTH_LOUDNORM = 'loudnorm=I=-6:TP=-0.3:LRA=9'; // ベロシティ強め=音圧-6LUFS

function synthToDest(inputs, filterComplex, dest, tmpDir) {
  const wav = join(tmpDir, `synth-${dest.split(/[\\/]/).pop()}.wav`);
  const args = [];
  for (const i of inputs) { args.push('-f', 'lavfi', '-i', i); }
  args.push('-filter_complex', filterComplex, '-map', '[out]', wav);
  ffmpeg(args);
  ffmpeg(['-i', wav, '-af', SYNTH_LOUDNORM, '-ar', '44100', '-q:a', '2', dest]);
}

// 払い出しジャラジャラ(素数ms間隔3系統・完全決定論で乱雑=物量感を作る・設計書§2.4)。
// カンマ回避のため mod(t,P) でなく floor 形 (t-P*floor(t/P)) を使う(lavfiパーサ地雷)。
const jara = (k, dur = 0.9, periods = [0.073, 0.097, 0.113]) =>
  `aevalsrc=(0.55*(sin(2*PI*${2489 * k}*t)+0.5*sin(2*PI*${4978 * k}*t))*exp(-70*(t-${periods[0]}*floor(t/${periods[0]})))` +
  `+0.45*(sin(2*PI*${3322 * k}*t)+0.5*sin(2*PI*${6644 * k}*t))*exp(-65*(t-${periods[1]}*floor(t/${periods[1]})))` +
  `+0.4*(sin(2*PI*${4186 * k}*t)+0.4*sin(2*PI*${8372 * k}*t))*exp(-60*(t-${periods[2]}*floor(t/${periods[2]}))))` +
  `*exp(-1.8*t):s=44100:d=${dur}`;

// 変奏ごとのジャラジャラ周期(全て素数ms・設計書§2.10「変奏2/3で周期自体を差し替え」)。
const JARA_PERIODS_BY_VARIANT = Object.freeze({
  1: [0.073, 0.097, 0.113],
  2: [0.079, 0.101, 0.127],
  3: [0.083, 0.103, 0.131]
});

function buildSynthPachinkoSuite(tmpDir) {
  mkdirSync(TIERS_OUT_DIR, { recursive: true });
  for (let n = 1; n <= 3; n++) {
    const k = 1 + 0.06 * (n - 2); // 変奏: -6%/0/+6%
    const periods = JARA_PERIODS_BY_VARIANT[n];

    // small: 保留入賞「チン・チン」コインベル2連(0.32秒・部分音 1:2.0:2.76)
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*${2093 * k}*t)+0.5*sin(2*PI*${4186 * k}*t)+0.3*sin(2*PI*${5777 * k}*t))*exp(-25*t):s=44100:d=0.25`,
        `aevalsrc=(sin(2*PI*${2637 * k}*t)+0.5*sin(2*PI*${5274 * k}*t)+0.3*sin(2*PI*${7278 * k}*t))*exp(-25*t):s=44100:d=0.25`
      ],
      '[1:a]adelay=70|70[b];[0:a][b]amix=inputs=2:normalize=0:duration=longest,highpass=f=800,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `gift-small-${n}.mp3`), tmpDir
    );

    // medium: きゅいん(500→2900Hzチャープ+トレモロ31Hz)+終端チン(0.62秒)
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*(${500 * k}*t+${3000 * k}*t*t))+0.45*sin(4*PI*(${500 * k}*t+${3000 * k}*t*t)))*exp(-2.2*t):s=44100:d=0.42`,
        `aevalsrc=(sin(2*PI*${5274 * k}*t)+0.5*sin(2*PI*${7902 * k}*t))*exp(-28*t):s=44100:d=0.22`
      ],
      '[0:a]tremolo=f=31:d=0.75[c];[1:a]adelay=400|400[b];' +
        '[c][b]amix=inputs=2:normalize=0:duration=longest,aecho=0.55:0.3:55:0.28,highpass=f=700,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `gift-medium-${n}.mp3`), tmpDir
    );

    // large: きゅいーん(350→3400Hz)+締めベル2連(G7→C8)0.95秒
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*(${350 * k}*t+${2650 * k}*t*t))+0.45*sin(4*PI*(${350 * k}*t+${2650 * k}*t*t)))*exp(-1.6*t):s=44100:d=0.58`,
        `aevalsrc=(sin(2*PI*${3136 * k}*t)+0.5*sin(2*PI*${6272 * k}*t)+0.3*sin(2*PI*${8655 * k}*t))*exp(-18*t):s=44100:d=0.3`,
        `aevalsrc=(sin(2*PI*${4186 * k}*t)+0.5*sin(2*PI*${8372 * k}*t))*exp(-16*t):s=44100:d=0.35`
      ],
      '[0:a]tremolo=f=27:d=0.85[c];[1:a]adelay=560|560[b1];[2:a]adelay=680|680[b2];' +
        '[c][b1][b2]amix=inputs=3:normalize=0:duration=longest,aecho=0.6:0.35:70:0.32,highpass=f=700,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `gift-large-${n}.mp3`), tmpDir
    );

    // mega: 大当たり=きゅいん→カスケード4連(C7-E7-G7-C8)→ジャラ尾0.6秒(1.5秒)
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*(${300 * k}*t+${3000 * k}*t*t))+0.5*sin(4*PI*(${300 * k}*t+${3000 * k}*t*t)))*exp(-1.4*t):s=44100:d=0.55`,
        `aevalsrc=(sin(2*PI*${2093 * k}*t)+0.5*sin(2*PI*${4186 * k}*t))*exp(-13*t):s=44100:d=0.45`,
        `aevalsrc=(sin(2*PI*${2637 * k}*t)+0.5*sin(2*PI*${5274 * k}*t))*exp(-13*t):s=44100:d=0.45`,
        `aevalsrc=(sin(2*PI*${3136 * k}*t)+0.5*sin(2*PI*${6272 * k}*t))*exp(-12*t):s=44100:d=0.5`,
        `aevalsrc=(sin(2*PI*${4186 * k}*t)+0.5*sin(2*PI*${8372 * k}*t))*exp(-11*t):s=44100:d=0.55`,
        jara(k, 0.6, periods)
      ],
      '[0:a]tremolo=f=26:d=0.8[c];[1:a]adelay=430|430[b1];[2:a]adelay=550|550[b2];[3:a]adelay=670|670[b3];[4:a]adelay=790|790[b4];' +
        '[5:a]adelay=850|850,volume=0.35[j];' +
        '[c][b1][b2][b3][b4][j]amix=inputs=6:normalize=0:duration=longest,aecho=0.7:0.45:80:0.4,highpass=f=700,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `gift-mega-${n}.mp3`), tmpDir
    );

    // milestone-soft: 保留ポポン(G6→C7・奇数倍音3倍のチップ音色)0.3秒
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*${1568 * k}*t)+0.33*sin(6*PI*${1568 * k}*t))*exp(-18*t):s=44100:d=0.18`,
        `aevalsrc=(sin(2*PI*${2093 * k}*t)+0.33*sin(6*PI*${2093 * k}*t))*exp(-18*t):s=44100:d=0.2`
      ],
      '[1:a]adelay=90|90[b];[0:a][b]amix=inputs=2:normalize=0:duration=longest,highpass=f=800,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `milestone-soft-${n}.mp3`), tmpDir
    );

    // milestone-hard: リーチ煽り(スイープ600→1300Hz+3連上昇ブリップ・未解決終止)0.75秒
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*(${600 * k}*t+${500 * k}*t*t))+0.3*sin(6*PI*(${600 * k}*t+${500 * k}*t*t)))*exp(-1.2*t):s=44100:d=0.7`,
        `aevalsrc=(sin(2*PI*${1046 * k}*t)+0.33*sin(6*PI*${1046 * k}*t))*exp(-14*t):s=44100:d=0.2`,
        `aevalsrc=(sin(2*PI*${1318 * k}*t)+0.33*sin(6*PI*${1318 * k}*t))*exp(-14*t):s=44100:d=0.2`,
        `aevalsrc=(sin(2*PI*${1568 * k}*t)+0.33*sin(6*PI*${1568 * k}*t))*exp(-12*t):s=44100:d=0.25`
      ],
      '[0:a]tremolo=f=18:d=0.6[c];[1:a]adelay=0|0[b1];[2:a]adelay=110|110[b2];[3:a]adelay=220|220[b3];' +
        '[c][b1][b2][b3]amix=inputs=4:normalize=0:duration=longest,aecho=0.5:0.3:60:0.25,highpass=f=700,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `milestone-hard-${n}.mp3`), tmpDir
    );

    // milestone-jackpot: 大当たりファンファーレ+払い出しジャラ0.9秒(1.8秒・確変=最長)
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*(${300 * k}*t+${3300 * k}*t*t))+0.5*sin(4*PI*(${300 * k}*t+${3300 * k}*t*t)))*exp(-1.3*t):s=44100:d=0.55`,
        `aevalsrc=(sin(2*PI*${2093 * k}*t)+0.5*sin(2*PI*${4186 * k}*t))*exp(-13*t):s=44100:d=0.45`,
        `aevalsrc=(sin(2*PI*${2637 * k}*t)+0.5*sin(2*PI*${5274 * k}*t))*exp(-13*t):s=44100:d=0.45`,
        `aevalsrc=(sin(2*PI*${3136 * k}*t)+0.5*sin(2*PI*${6272 * k}*t))*exp(-12*t):s=44100:d=0.5`,
        `aevalsrc=(sin(2*PI*${4186 * k}*t)+0.5*sin(2*PI*${8372 * k}*t))*exp(-11*t):s=44100:d=0.55`,
        jara(k, 0.9, periods)
      ],
      '[0:a]tremolo=f=26:d=0.8[c];[1:a]adelay=420|420[b1];[2:a]adelay=540|540[b2];[3:a]adelay=660|660[b3];[4:a]adelay=780|780[b4];' +
        '[5:a]adelay=700|700,volume=0.5[j];' +
        '[c][b1][b2][b3][b4][j]amix=inputs=6:normalize=0:duration=longest,aecho=0.7:0.45:80:0.4,highpass=f=700,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `milestone-jackpot-${n}.mp3`), tmpDir
    );
  }

  // reach: リーチ煽りロング(5度上昇パルス3連+導音保持・未解決終止)1.0秒・変奏2本
  // n=1: k=1.0, gap=240 / n=2: k=1.06, gap=200 (加速変奏)
  for (const [n, k, gap] of [[1, 1.0, 240], [2, 1.06, 200]]) {
    synthToDest(
      [
        `aevalsrc=(sin(2*PI*(${600 * k}*t+${682 * k}*t*t))+0.35*sin(4*PI*(${600 * k}*t+${682 * k}*t*t)))*exp(-6*t):s=44100:d=0.22`,
        `aevalsrc=(sin(2*PI*(${900 * k}*t+${1023 * k}*t*t))+0.35*sin(4*PI*(${900 * k}*t+${1023 * k}*t*t)))*exp(-6*t):s=44100:d=0.22`,
        `aevalsrc=(sin(2*PI*(${1350 * k}*t+${1534 * k}*t*t))+0.35*sin(4*PI*(${1350 * k}*t+${1534 * k}*t*t)))*exp(-6*t):s=44100:d=0.22`,
        `aevalsrc=sin(2*PI*${1976 * k}*t+6*sin(2*PI*6.5*t))*exp(-3.5*t):s=44100:d=0.45`
      ],
      `[1:a]adelay=${gap}|${gap}[b1];[2:a]adelay=${gap * 2}|${gap * 2}[b2];[3:a]adelay=${gap * 2 + 180}|${gap * 2 + 180}[b3];` +
        '[0:a][b1][b2][b3]amix=inputs=4:normalize=0:duration=longest,aecho=0.5:0.28:65:0.25,highpass=f=700,alimiter=limit=0.95[out]',
      join(TIERS_OUT_DIR, `reach-${n}.mp3`), tmpDir
    );
  }

  console.log('[build-sounds] パチンコ文法準拠の合成音23ファイル(gift12/milestone9/reach2)を生成しました。');
}

/**
 * 2026-07-16: 効果音ラボ(soundeffect-lab.info)の原素材から ad/rank_up/milestone_soft/
 *   milestone_hard/milestone_jackpot のバリエーションを組み立てる。効果音ラボは商用利用無料・
 *   クレジット表記不要・「アプリの操作音として組み込む」用途を明示的に許可している
 *   (禁止されるのは「効果音を自由に鳴らせるアプリの作成」= 本プロジェクトの未公開の
 *   「マイ効果音」機能はこの禁止に抵触しうるため対象外・別途要検討)。
 *   各カテゴリはラウドネス正規化(DEFAULT_LOUDNORM)のみ行い、tiers/<category>-<n>.mp3 へ
 *   出力する(バリエーション不足のカテゴリは同一ファイルの複製で埋める・乱数不使用)。
 * @param {string} tmpDir
 * @returns {boolean} 1件でも生成できたか
 */
function buildSoundEffectLabVariations(tmpDir) {
  /** @type {Record<string, string[]>} カテゴリ→原素材ファイル名(音量が大きい順に並べる必要はない)。 */
  const CATEGORY_SOURCES = {
    rank_up: ['shakin1.mp3', 'shakin2.mp3', 'shakin3.mp3'],
    ad: ['cute-pose1.mp3', 'cute-pose2.mp3'],
    milestone_soft: ['item-get1.mp3', 'item-get2.mp3'],
    milestone_hard: ['levelup1.mp3'],
    milestone_jackpot: ['jajean1.mp3', 'trumpet1.mp3']
  };
  mkdirSync(TIERS_OUT_DIR, { recursive: true });
  let builtAny = false;
  for (const [category, sources] of Object.entries(CATEGORY_SOURCES)) {
    const missing = sources.filter((name) => !existsSync(join(SRC_DIR, name)));
    if (missing.length > 0) {
      console.log(`[build-sounds] sound-src/soundeffect-lab/ に ${missing.join(', ')} が無いため ${category} をスキップします。`);
      continue;
    }
    // カテゴリ内バリエーション数を他カテゴリと揃えるため、原素材が2本未満なら先頭を複製で埋める。
    const filled = [sources[0], sources[1] || sources[0], sources[2] || sources[1] || sources[0]];
    filled.forEach((name, i) => {
      const src = join(SRC_DIR, name);
      const dest = join(TIERS_OUT_DIR, `${category.replace(/_/g, '-')}-${i + 1}.mp3`);
      const tmp = join(tmpDir, `lab-${category}-${i + 1}.mp3`);
      ffmpeg(['-i', src, '-af', DEFAULT_LOUDNORM, '-ar', '44100', '-q:a', '2', tmp]);
      copyFileSync(tmp, dest);
      builtAny = true;
    });
  }
  if (builtAny) {
    console.log('[build-sounds] 効果音ラボ素材から ad/rank_up/milestone_soft/hard/jackpot のバリエーションを生成しました。');
  }
  return builtAny;
}

function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nls-sound-build-'));
  try {
    // 2026-07-16: 旧buildTierVariations(sound-src/tiers/の外部素材を正規化コピーする経路)は
    //   出典が信頼できないと判明し削除した(sound-src/tiers/ 自体も削除済み)。gift/milestone/reach
    //   のtierは常にこの直後のbuildSynthPachinkoSuiteが上書きしていたため、実配布物への影響はない。
    buildSynthPachinkoSuite(tmpDir);
    // buildGiftSoundFromSynthTier は tiers/gift-medium-1.mp3(上のbuildSynthPachinkoSuiteが
    //   生成)を複製するため、必ずこの後に呼ぶ。
    const built = buildGiftSoundFromSynthTier();
    // 効果音ラボ素材(ad/rank_up/milestone_*専用ファイル)。無くても他の生成物には影響しない。
    buildSoundEffectLabVariations(tmpDir);
    // フォールバック単一ファイルをtiersの1番目へ同期(必ずbuildSoundEffectLabVariationsの後)。
    syncFallbackFilesToTierOne();
    if (process.argv.includes('--normalize-all')) {
      normalizeExistingEffects(tmpDir);
    }
    if (!built) process.exitCode = 1;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
