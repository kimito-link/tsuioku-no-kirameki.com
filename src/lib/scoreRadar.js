/**
 * 配信採点の「講評レーダー」5軸(council/broadcast-scoring-SYNTHESIS.md §2.3)を組む純関数群。
 *
 * 全軸とも入力は既に publish 済みの診断値のみ(reportPreview/bgmPhaseDiag/giftEffectDiag/
 *   voiceDiag)。新規の重い集計・新規storage read は一切行わない(§1.3の軽量制約と同じ)。
 *   拡張(popup)とWeb採点シート(app/score.js)が同一の本ファイルを import して共用する
 *   (似せて自作しない=live-viewの教訓を部品レベルで継承・設計書§2.3)。
 *
 * 軸名は「来場」で固定する(「新規来場」は既存データに真の新規判定が無く嘘になるため禁止・
 *   設計書裁定)。
 *
 * @typedef {{ key: string, label: string, value: number|null }} ScoreRadarAxis
 * @typedef {{ axes: ScoreRadarAxis[] }} ScoreRadar
 */

import { escapeHtml } from './htmlEscape.js';

/** @param {unknown} x @param {number} [fallback] @returns {number} */
function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

/** レーダー軸のkey→表示ラベル対応(表示側でも共用できるようexportする)。 */
export const SCORE_RADAR_AXIS_LABEL = Object.freeze({
  commentDensity: 'コメント密度',
  gift: 'ギフト',
  visitors: '来場',
  hotDwell: '盛り上がり持続',
  voiceDigest: '読み上げ消化率'
});

/**
 * コメント密度軸: reportPreview.commentsPerMinute から 0-100 正規化。
 * @param {number} commentsPerMinute
 * @returns {number}
 */
function commentDensityAxis(commentsPerMinute) {
  const cpm = Math.max(0, commentsPerMinute);
  return Math.min(100, Math.round(cpm * 10));
}

/**
 * ギフト軸: giftEffectDiag.giftDetected(+adDetected) を対数スケールで 0-100 正規化。
 * @param {number} giftDetected
 * @param {number} adDetected
 * @returns {number}
 */
function giftAxis(giftDetected, adDetected) {
  const n = Math.max(0, giftDetected) + Math.max(0, adDetected);
  return Math.min(100, Math.round(50 * Math.log10(n + 1)));
}

/**
 * 来場軸: reportPreview.visitors を対数スケールで 0-100 正規化。
 *   ※軸名は「来場」(「新規来場」の真の新規判定は既存データに無いため嘘をつかない・設計書裁定)。
 * @param {number} visitors
 * @returns {number}
 */
function visitorsAxis(visitors) {
  const v = Math.max(0, visitors);
  return Math.min(100, Math.round(40 * Math.log10(v + 1)));
}

/**
 * 盛り上がり持続軸: phaseStats.hotDwellMs / elapsedMs(R≥1.5=煽り以上の滞在率)。
 *   配信の40%が煽り以上で100点(§2.3)。elapsedMs<=0(未観測)は0点(持続率が定義できない)。
 * @param {number} hotDwellMs
 * @param {number} elapsedMs
 * @returns {number}
 */
function hotDwellAxis(hotDwellMs, elapsedMs) {
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed <= 0) return 0;
  const dwell = Math.max(0, hotDwellMs);
  const pct = (dwell / elapsed) * 100;
  return Math.min(100, Math.round(pct * 2.5));
}

/**
 * 読み上げ消化率軸: voiceDiag.spokenTotal / (spokenTotal + staleDropTotal)。
 *   読み上げOFF(enabled=false かつ spoken=0)なら null(未使用を0点と偽らない・§2.3)。
 * @param {boolean} enabled
 * @param {number} spokenTotal
 * @param {number} staleDropTotal
 * @returns {number|null}
 */
function voiceDigestAxis(enabled, spokenTotal, staleDropTotal) {
  const spoken = Math.max(0, spokenTotal);
  const drop = Math.max(0, staleDropTotal);
  if (!enabled && spoken === 0) return null;
  const denom = spoken + drop;
  if (denom <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((spoken / denom) * 100)));
}

/**
 * @typedef {{
 *   commentsPerMinute?: unknown,
 *   visitors?: unknown
 * }} ScoreRadarReportPreviewInput
 * @typedef {{
 *   hotDwellMs?: unknown,
 *   elapsedMs?: unknown
 * }} ScoreRadarPhaseStatsInput
 * @typedef {{
 *   giftDetected?: unknown,
 *   adDetected?: unknown
 * }} ScoreRadarGiftDiagInput
 * @typedef {{
 *   enabled?: unknown,
 *   spokenTotal?: unknown,
 *   staleDropTotal?: unknown
 * }} ScoreRadarVoiceDiagInput
 */

/**
 * 講評レーダー5軸を組む純関数(council/broadcast-scoring-SYNTHESIS.md §2.3)。
 *   全入力は既publish済みの診断値のみ・乱数なし・決定論(同じ入力には常に同じ結果)。
 * @param {{
 *   reportPreview?: ScoreRadarReportPreviewInput|null,
 *   phaseStats?: ScoreRadarPhaseStatsInput|null,
 *   giftDiag?: ScoreRadarGiftDiagInput|null,
 *   voiceDiag?: ScoreRadarVoiceDiagInput|null
 * }|null|undefined} inputs
 * @returns {ScoreRadar}
 */
export function buildScoreRadar(inputs) {
  const src = inputs && typeof inputs === 'object' ? inputs : {};
  const rp = src.reportPreview && typeof src.reportPreview === 'object' ? src.reportPreview : {};
  const ps = src.phaseStats && typeof src.phaseStats === 'object' ? src.phaseStats : {};
  const gd = src.giftDiag && typeof src.giftDiag === 'object' ? src.giftDiag : {};
  const vd = src.voiceDiag && typeof src.voiceDiag === 'object' ? src.voiceDiag : {};

  return {
    axes: [
      {
        key: 'commentDensity',
        label: SCORE_RADAR_AXIS_LABEL.commentDensity,
        value: commentDensityAxis(num(rp.commentsPerMinute))
      },
      {
        key: 'gift',
        label: SCORE_RADAR_AXIS_LABEL.gift,
        value: giftAxis(num(gd.giftDetected), num(gd.adDetected))
      },
      {
        key: 'visitors',
        label: SCORE_RADAR_AXIS_LABEL.visitors,
        value: visitorsAxis(num(rp.visitors))
      },
      {
        key: 'hotDwell',
        label: SCORE_RADAR_AXIS_LABEL.hotDwell,
        value: hotDwellAxis(num(ps.hotDwellMs), num(ps.elapsedMs))
      },
      {
        key: 'voiceDigest',
        label: SCORE_RADAR_AXIS_LABEL.voiceDigest,
        value: voiceDigestAxis(vd.enabled === true, num(vd.spokenTotal), num(vd.staleDropTotal))
      }
    ]
  };
}

/* ============================================================================
 * SVG組み立て(§2.4「講評レーダー」の器。拡張/Webで同一関数を共用=drift防止)。
 * ========================================================================== */

/** SVGの正方形サイズ(viewBox基準・固定値・乱数なし)。 */
const RADAR_SVG_SIZE = 200;
/** 中心座標(SVGの中央)。 */
const RADAR_CENTER = RADAR_SVG_SIZE / 2;
/** レーダー最外周の半径(ラベル用の余白を残す)。 */
const RADAR_MAX_RADIUS = 78;
/** 目盛りの輪の数(25/50/75/100%の4本)。 */
const RADAR_GRID_RINGS = 4;

/**
 * 軸数ぶんの角度(ラジアン)配列を返す。12時方向を1軸目とし、時計回りに等分する
 *   (固定ジオメトリ・乱数なし)。
 * @param {number} count
 * @returns {number[]}
 */
function radarAxisAngles(count) {
  const n = Math.max(1, count);
  const angles = [];
  for (let i = 0; i < n; i += 1) {
    angles.push((Math.PI * 2 * i) / n - Math.PI / 2);
  }
  return angles;
}

/**
 * 極座標(中心からの半径・角度)→SVG座標。
 * @param {number} radius
 * @param {number} angle
 * @returns {{ x: number, y: number }}
 */
function polarPoint(radius, angle) {
  return {
    x: RADAR_CENTER + radius * Math.cos(angle),
    y: RADAR_CENTER + radius * Math.sin(angle)
  };
}

/** @param {{x:number,y:number}[]} points @returns {string} */
function pointsToPolygonAttr(points) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/**
 * 講評レーダーSVGを組む純関数(依存は htmlEscape のみ・§2.3)。value=null の軸は
 *   「—」ラベルを添えて半径0点として描く(未使用を0点と偽らない・欠損は視覚的にも「—」で分かる)。
 * @param {ScoreRadar|null|undefined} radar
 * @returns {string} 空なら ''(軸が無い)
 */
export function buildScoreRadarSvgHtml(radar) {
  const axes = radar && typeof radar === 'object' && Array.isArray(radar.axes) ? radar.axes : [];
  if (axes.length === 0) return '';

  const angles = radarAxisAngles(axes.length);

  // 目盛りの輪(25/50/75/100%)。
  const gridPolygons = [];
  for (let ring = 1; ring <= RADAR_GRID_RINGS; ring += 1) {
    const r = (RADAR_MAX_RADIUS * ring) / RADAR_GRID_RINGS;
    const pts = angles.map((angle) => polarPoint(r, angle));
    gridPolygons.push(
      `<polygon class="nl-score-radar-grid" points="${pointsToPolygonAttr(pts)}" />`
    );
  }

  // 軸線(中心→外周)。
  const axisLines = angles
    .map((angle) => {
      const p = polarPoint(RADAR_MAX_RADIUS, angle);
      return `<line class="nl-score-radar-axis-line" x1="${RADAR_CENTER}" y1="${RADAR_CENTER}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" />`;
    })
    .join('');

  /** @param {unknown} v @returns {boolean} 値が有効な数値か(null/undefined/非数値はfalse)。 */
  const hasNumericValue = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

  // 実データのポリゴン(null軸は半径0扱い)。
  const dataPoints = axes.map((axis, i) => {
    const value = hasNumericValue(axis?.value) ? Math.max(0, Math.min(100, Number(axis.value))) : 0;
    const r = (RADAR_MAX_RADIUS * value) / 100;
    return polarPoint(r, angles[i]);
  });
  const dataPolygon = `<polygon class="nl-score-radar-data" points="${pointsToPolygonAttr(dataPoints)}" />`;

  // ラベル(軸の少し外側に配置)。
  const labelRadius = RADAR_MAX_RADIUS + 16;
  const labels = axes
    .map((axis, i) => {
      const p = polarPoint(labelRadius, angles[i]);
      const valueText = hasNumericValue(axis?.value) ? String(Math.round(Number(axis.value))) : '—';
      const anchor = Math.cos(angles[i]) > 0.2 ? 'start' : Math.cos(angles[i]) < -0.2 ? 'end' : 'middle';
      return (
        `<text class="nl-score-radar-label" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${anchor}">` +
        `${escapeHtml(axis?.label || '')} (${escapeHtml(valueText)})</text>`
      );
    })
    .join('');

  return (
    `<svg class="nl-score-radar-svg" viewBox="0 0 ${RADAR_SVG_SIZE} ${RADAR_SVG_SIZE}" role="img" aria-label="配信採点レーダーチャート">` +
      gridPolygons.join('') +
      axisLines +
      dataPolygon +
      labels +
    `</svg>`
  );
}
