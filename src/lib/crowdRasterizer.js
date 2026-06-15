/**
 * crowdRasterizer.js
 * 人数ラスタライザ Canvas (Antigravity Enhanced Version)
 * 決定的乱数を用いて、奥ほど小さく、曲面状に群衆を敷き詰めます。
 * 【Antigravity 特別演出】: 単なるシルエットではなく、観客が色とりどりの
 * サイリウム（ペンライト）を振っている「光の海」を表現し、圧倒的なライブ感を演出します。
 * 遠くの観客は暗闇に溶け込み（空気遠近法）、近景の光は強く輝きます。
 */

import { resolveCrowdMotionProfile, resolveCrowdSpriteMotion } from './venueCrowdMotion.js';

/**
 * 2026-06-14 星野アイデア会議2「1000人超で退避強化」:
 *   群衆描画は1スプライトあたりシルエット+ペンライト3パス(うち1つは screen 合成の広いグロー)
 *   と重く、人数連動で renderSeats 毎に最大2048体を再描画すると大規模配信で重い。
 *   そこで人数帯で「描画予算」を純関数で決める:
 *     - spriteCap: 実際に描く体数。一定数を超えると視覚情報がほぼ増えない(重なる)ので
 *       上限を段階的に抑える(密度は depth 分布で維持=満員感は落とさない)。
 *     - glow: 最重量パス(広い screen 合成グロー)を出すか。高人数では切って軽くする。
 *     - lightStick: ペンライト自体を描くか(極大人数ではシルエットだけ=最軽量)。
 * これは数値モデルだけ(canvas 非依存・テスト可能)。drawCrowdOnCanvas が受け取って従う。
 *
 * @param {number} count 観客(匿名)概算人数
 * @returns {{ spriteCap: number, glow: boolean, lightStick: boolean }}
 */
export function resolveCrowdRenderPlan(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return { spriteCap: 0, glow: false, lightStick: false };
  // ~600 までは全部+フル演出(従来の見た目を維持)。
  if (n <= 600) return { spriteCap: n, glow: true, lightStick: true };
  // 600〜1000: 全部描くが広いグローは切る(芯+中グローは残し雰囲気維持)。
  if (n <= 1000) return { spriteCap: n, glow: false, lightStick: true };
  // 1000〜2048: 体数を 1000 に抑え(重なりで見た目差は小)・グローなし。
  if (n <= 2048) return { spriteCap: 1000, glow: false, lightStick: true };
  // 2048 超(超大規模): シルエットのみ・体数 800 で最軽量(光の海は密度で表現)。
  return { spriteCap: 800, glow: false, lightStick: false };
}

// 決定的乱数 (Xorshift32)
/** @param {any} state */
function xorshift32(state) {
  let x = state || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

// 観客のシルエットベース色（空気遠近法でさらに調整されます）
const SILHOUETTES = [
  { type: 'round' },
  { type: 'square' }
];

// サイリウム（ペンライト）の厳選された鮮やかなカラーパレット
const LIGHTSTICK_COLORS = [
  '#ff3366', // ピンクレッド
  '#33ccff', // シアン
  '#ffcc00', // イエロー
  '#66ff66', // エメラルドグリーン
  '#cc66ff', // パープル
  '#ff8833', // オレンジ
  '#ffffff'  // ホワイト
];

/**
 * サイリウムを持った観客を描画
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} depth
 * @param {string} spriteType
 * @param {string} lightColor
 * @param {{ glow?: boolean, lightStick?: boolean }} [detail] 描画予算(高人数で重いパスを省く)
 * @param {{ swayRad?: number, breathe?: number }} [motion] 動き(同期した揺れ・呼吸)。省略時は静止=従来挙動。
 */
function drawAudience(ctx, x, y, size, depth, spriteType, lightColor, detail = {}, motion = {}) {
  const wantStick = detail.lightStick !== false;
  const wantGlow = detail.glow !== false;
  const swayRad = Number(motion.swayRad) || 0;
  // 呼吸: 体全体を上下にごく僅か動かす(motion.breathe は size=1 基準の係数, 上が負)。
  const breatheY = (Number(motion.breathe) || 0) * size;
  y += breatheY;
  // 空気遠近法：奥 (depth ~ 0) ほど暗闇 (背景) に溶け込む
  // 手前 (depth ~ 1) は元の明るさを維持
  const alpha = 0.2 + depth * 0.8;
  const lightness = Math.floor(10 + depth * 25);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgb(${lightness}, ${lightness + 5}, ${lightness + 15})`;

  // 1. シルエットの描画
  ctx.beginPath();
  if (spriteType === 'round') {
    // 丸っこい頭部
    ctx.arc(x, y - size * 0.5, size * 0.45, 0, Math.PI * 2);
    // 肩幅
    ctx.moveTo(x - size * 0.7, y + size * 0.4);
    ctx.quadraticCurveTo(x, y - size * 0.2, x + size * 0.7, y + size * 0.4);
    ctx.lineTo(x + size * 0.7, y + size);
    ctx.lineTo(x - size * 0.7, y + size);
  } else {
    // 四角っぽい頭部
    ctx.roundRect(x - size * 0.4, y - size, size * 0.8, size * 0.9, size * 0.2);
    // 肩幅
    ctx.moveTo(x - size * 0.6, y + size * 0.5);
    ctx.lineTo(x, y - size * 0.1);
    ctx.lineTo(x + size * 0.6, y + size * 0.5);
    ctx.lineTo(x + size * 0.6, y + size);
    ctx.lineTo(x - size * 0.6, y + size);
  }
  ctx.fill();

  // 2. サイリウム（ペンライト）の描画(高人数では省いてシルエットのみ=最軽量)
  if (!wantStick) return;
  // 腕の位置（ランダムな揺らぎを表現するため x, y から少しずらす）
  const stickX = x + size * 0.4;
  const stickY = y - size * 0.2;
  const stickLength = size * 0.8;
  const stickWidth = Math.max(1.5, size * 0.15);

  // ペンライト先端: 根元(stickX,stickY)から上へ。motion.swayRad ぶん根元を軸に回す
  //   (全員共通位相で回すと「同期した波」になる=co-presence の核)。静止時 swayRad=0 で従来挙動。
  const baseDX = size * 0.1; // 元の僅かな傾き(0時のデフォルト)
  const baseDY = -stickLength;
  const cos = Math.cos(swayRad);
  const sin = Math.sin(swayRad);
  const tipX = stickX + (baseDX * cos - baseDY * sin);
  const tipY = stickY + (baseDX * sin + baseDY * cos);

  // ペンライトの芯（白く輝く部分）
  ctx.globalAlpha = depth * 0.9 + 0.1;
  ctx.lineCap = 'round';
  ctx.lineWidth = stickWidth;
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(stickX, stickY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // ペンライトの光彩（Glow）
  ctx.globalAlpha = depth * 0.6 + 0.1;
  ctx.lineWidth = stickWidth * 3;
  ctx.strokeStyle = lightColor;
  ctx.stroke();

  // さらに広い光彩（加算合成風にぼかす）= 最重量パス。高人数では省く。
  if (!wantGlow) return;
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = depth * 0.3;
  ctx.lineWidth = stickWidth * 6;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over'; // リセット
}

/**
 * キャンバスに群衆（光の海）を描画する
 * @param {HTMLCanvasElement} canvas
 * @param {number} count 描画する人数
 * @param {number} seed シード値（liveIdのハッシュなどを想定）
 * @param {{ timeMs?: number, heatLevel?: number }} [anim] アニメーション(同期した揺れ・呼吸)。
 *   省略時は静止=従来挙動(描画結果は count+seed だけで決まり再描画を省略できる)。
 *   timeMs=単調増加時刻 / heatLevel=盛り上がり0..1(揺れの速さ・大きさを決める)。
 */
export function drawCrowdOnCanvas(canvas, count, seed = 12345, anim = null) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (count <= 0) return;

  // 2026-06-14「1000人超で退避強化」: 人数帯で描画予算を決め、重い演出パスと体数を抑える。
  const plan = resolveCrowdRenderPlan(count);
  const maxDraw = Math.max(0, Math.min(count, plan.spriteCap));
  if (maxDraw <= 0) return;
  const detail = { glow: plan.glow, lightStick: plan.lightStick };
  let rngState = (seed + count) >>> 0;

  // アニメーション(同期した揺れ・呼吸)。anim 省略時は静止=従来挙動。
  const motionProfile = anim ? resolveCrowdMotionProfile(anim.heatLevel ?? 0) : null;
  const timeMs = anim ? (Number(anim.timeMs) || 0) : 0;

  const positions = [];
  
  // 1. 全員の座標とプロパティを決定（曲面ドーム状のアリーナ配置）
  for (let i = 0; i < maxDraw; i++) {
    rngState = xorshift32(rngState);
    const r = rngState / 0xffffffff;

    // 奥(0.0) 〜 手前(1.0)
    // 奥に行くほど人数密度が高いため、depth の分布を調整 (Math.pow で奥に偏らせる)
    const normalizedIndex = i / maxDraw;
    const depth = 1.0 - Math.pow(normalizedIndex, 0.6); 
    
    rngState = xorshift32(rngState);
    const angleRng = (rngState / 0xffffffff);
    
    // 左右位置（中央に少し集まりつつ、画面外まで広がる）
    const xPos = w * 0.5 + (angleRng - 0.5) * w * 1.8; 
    
    // Y座標の曲面計算（アリーナのすり鉢状の座席を表現）
    const xDist = Math.abs((xPos - w * 0.5) / (w * 0.5));
    const curveY = Math.pow(xDist, 1.5) * depth * h * 0.3; // 端ほど上に上がる

    // 基本Y座標 + 曲面カーブ + 少しのランダムな揺らぎ
    const yPos = (depth * h * 0.85) - curveY + (r * h * 0.15) + (h * 0.1); 
    
    // 手前ほど大きく、奥は極小
    const size = Math.max(2, 5 + depth * 35); 

    rngState = xorshift32(rngState);
    const spriteType = SILHOUETTES[rngState % SILHOUETTES.length].type;
    
    rngState = xorshift32(rngState);
    const lightColor = LIGHTSTICK_COLORS[rngState % LIGHTSTICK_COLORS.length];

    // 揺れの個体位相は横位置由来(安定)。盛り上がり時に左右へ波が伝わるように見える。
    const unitPhase = (xPos / w + 2) % 1;

    positions.push({ x: xPos, y: yPos, size, depth, spriteType, lightColor, unitPhase });
  }

  // 2. Y座標（奥から手前）でソートして描画順を決定（Z-ソート）
  positions.sort((a, b) => a.y - b.y);

  // 3. 描画実行
  for (const p of positions) {
    const motion = motionProfile
      ? resolveCrowdSpriteMotion(timeMs, p.unitPhase, motionProfile)
      : undefined;
    drawAudience(ctx, p.x, p.y, p.size, p.depth, p.spriteType, p.lightColor, detail, motion);
  }
}
