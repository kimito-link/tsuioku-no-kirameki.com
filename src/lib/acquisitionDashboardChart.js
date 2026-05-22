/**
 * 「データ取得率」ダッシュボードのチャート計算（純関数）。
 *
 * popup-entry.js の renderAcquisitionDashboard から「DOM 非依存の数値計算」だけを
 * 抽出したもの（pure refactor、挙動不変）。SVG レーダーの座標・円グラフの
 * conic-gradient 文字列・各種パーセントを計算する。host.innerHTML への適用は
 * 呼び出し側（popup）に残す。chrome.* / DOM / module 状態に非依存。
 */

/** レーダー幾何の既定パラメータ（renderAcquisitionDashboard と一致） */
export const ACQUISITION_RADAR_GEOMETRY = Object.freeze({ cx: 60, cy: 60, r: 44 });

/** 円グラフのセグメント色（thumb / id / nick / comment の順） */
export const ACQUISITION_PIE_COLORS = Object.freeze([
  '#0f8fd8',
  '#6366f1',
  '#ea580c',
  '#0d9488'
]);

/**
 * avatarStats / snapshot / displayCount から各取得率（%）を導出する。
 * commentPct は公式コメント数が無い/0 のとき null（レーダー・円では 0 扱い）。
 *
 * @param {{
 *   avatarStats?: ({ total?: number, withHttpAvatar?: number, withResolvedAvatar?: number, missingUserId?: number, withNickname?: number }|null),
 *   snapshot?: ({ officialCommentCount?: number }|null),
 *   displayCount?: number
 * }} p
 * @returns {{ thumb: number, idPct: number, nick: number, commentPct: number|null, total: number }}
 */
export function computeAcquisitionPercents(p) {
  const params = p && typeof p === 'object' ? p : {};
  const avs = params.avatarStats;
  const t = avs && typeof avs.total === 'number' ? Math.max(0, avs.total) : 0;
  const withHttpStored =
    avs && typeof avs.withHttpAvatar === 'number' && Number.isFinite(avs.withHttpAvatar)
      ? Math.max(0, avs.withHttpAvatar)
      : 0;
  const resolvedRaw =
    avs &&
    typeof avs.withResolvedAvatar === 'number' &&
    Number.isFinite(avs.withResolvedAvatar)
      ? Math.max(0, avs.withResolvedAvatar)
      : null;
  const thumbNumerator =
    resolvedRaw != null ? Math.min(resolvedRaw, t || resolvedRaw) : withHttpStored;
  const thumb = t > 0 ? (thumbNumerator / t) * 100 : 0;
  const missingUserId =
    avs && typeof avs.missingUserId === 'number' && Number.isFinite(avs.missingUserId)
      ? avs.missingUserId
      : 0;
  const withNickname =
    avs && typeof avs.withNickname === 'number' && Number.isFinite(avs.withNickname)
      ? avs.withNickname
      : 0;
  const idPct = t > 0 ? ((t - missingUserId) / t) * 100 : 0;
  const nick = t > 0 ? (withNickname / t) * 100 : 0;

  const snap = params.snapshot;
  const oc =
    snap &&
    typeof snap.officialCommentCount === 'number' &&
    Number.isFinite(snap.officialCommentCount)
      ? snap.officialCommentCount
      : null;
  const displayCount = Number(params.displayCount) || 0;
  /** @type {number|null} */
  let commentPct = null;
  if (oc != null && oc > 0) {
    commentPct = Math.min(100, (displayCount / oc) * 100);
  }
  return { thumb, idPct, nick, commentPct, total: t };
}

/**
 * 4 軸レーダーの座標群を計算する。
 * 角度は軸 i について `-π/2 + i·π/2`（上始まり時計回り）。
 *
 * @param {readonly number[]} percents [thumb, idPct, nick, comment]（各 0..100、範囲外はクランプ）
 * @param {{ cx?: number, cy?: number, r?: number }} [geo]
 * @returns {{ polyPts: string, ringPts: string, midPts: string, axisLines: string }}
 */
export function computeRadarPolygonPoints(percents, geo = {}) {
  const cx = Number.isFinite(geo.cx) ? Number(geo.cx) : ACQUISITION_RADAR_GEOMETRY.cx;
  const cy = Number.isFinite(geo.cy) ? Number(geo.cy) : ACQUISITION_RADAR_GEOMETRY.cy;
  const R = Number.isFinite(geo.r) ? Number(geo.r) : ACQUISITION_RADAR_GEOMETRY.r;
  const vals = Array.isArray(percents) ? percents : [];
  /** @param {number} i */
  const angle = (i) => -Math.PI / 2 + (i * Math.PI) / 2;

  const polyPts = [0, 1, 2, 3]
    .map((i) => {
      const pct = Number(vals[i]) || 0;
      const rr = (Math.max(0, Math.min(100, pct)) / 100) * R;
      const x = cx + rr * Math.cos(angle(i));
      const y = cy + rr * Math.sin(angle(i));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const ringPts = [0, 1, 2, 3]
    .map((i) => {
      const x = cx + R * Math.cos(angle(i));
      const y = cy + R * Math.sin(angle(i));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const midR = R * 0.5;
  const midPts = [0, 1, 2, 3]
    .map((i) => {
      const x = cx + midR * Math.cos(angle(i));
      const y = cy + midR * Math.sin(angle(i));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const axisLines = [0, 1, 2, 3]
    .map((i) => {
      const x2 = cx + R * Math.cos(angle(i));
      const y2 = cy + R * Math.sin(angle(i));
      return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#94a3b8" stroke-width="0.45" opacity="0.4"/>`;
    })
    .join('');
  return { polyPts, ringPts, midPts, axisLines };
}

/**
 * 円グラフ（conic-gradient）の background 値を計算する。
 * 重みの合計が 0 に近いときは中立色（'#94a3b8'）。
 *
 * @param {{ thumb?: number, idPct?: number, nick?: number, commentPct?: number|null }} weights
 * @returns {string} `conic-gradient(...)` か単色
 */
export function computeAcquisitionPieGradient(weights) {
  const w = weights && typeof weights === 'object' ? weights : {};
  const wThumb = Math.max(0, Number(w.thumb) || 0);
  const wId = Math.max(0, Number(w.idPct) || 0);
  const wNick = Math.max(0, Number(w.nick) || 0);
  const wComm = w.commentPct != null ? Math.max(0, Number(w.commentPct) || 0) : 0;
  const wSum = wThumb + wId + wNick + wComm;
  if (wSum <= 0.001) return '#94a3b8';

  let a = 0;
  /** @type {string[]} */
  const segs = [];
  /** @param {number} frac @param {string} color */
  const pushSeg = (frac, color) => {
    const deg = (frac / wSum) * 360;
    const b = a + deg;
    segs.push(`${color} ${a}deg ${b}deg`);
    a = b;
  };
  pushSeg(wThumb, ACQUISITION_PIE_COLORS[0]);
  pushSeg(wId, ACQUISITION_PIE_COLORS[1]);
  pushSeg(wNick, ACQUISITION_PIE_COLORS[2]);
  pushSeg(wComm, ACQUISITION_PIE_COLORS[3]);
  return `conic-gradient(${segs.join(',')})`;
}
