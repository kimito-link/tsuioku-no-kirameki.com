/**
 * インラインパネル(host)の「消えた⇄戻った」を数える計器。
 *
 * ★なぜ要るか(2026-08-04・画面録画で確定した症状):
 *   パネルが **4.000秒ちょうどの周期で1フレーム(33ms)だけ丸ごと消えて即復帰**していた。
 *   ところが既存の計器は2つとも、これを構造的に取りこぼしていた:
 *
 *   - `hostMoveDiag`  : **親要素を変える「移設」しか数えない**。display/visibility/width の
 *                       トグルは1件も数えないので moveCount:1 のまま(矛盾ではなく別物を計測)。
 *   - `scrollWhiteoutDiag`: **scroll イベントでしかサンプルしない**うえ 250ms throttle。
 *                       眺めているだけならサンプル0件=`whiteoutCount:0` は「白化なし」ではなく
 *                       **「未計測」**。この誤読が犯人特定を2日遅らせた。
 *
 * ★設計方針(計器は症状でなく原因を名指しする):
 *   - 消えた**回数**だけでなく **持続時間**と**間隔**を持つ(33ms/4000ms の山が立てば周期性を断言できる)
 *   - **どのコード経路が消したか**をタグで持つ(行番号まで名指しするため)
 *   - 判定を持つ(「⚠ 周期的に消えています」まで言う。値だけ出しても読み飛ばされる)
 *   - scroll 非依存(MutationObserver 駆動)=眺めているだけでも数える
 *
 * 正本: docs/handoff/ROOT-CAUSE-CLAIM-RULE.md 第4条(値でなく判定を出す)
 * @module hostVisibilityFlipCensus
 */

/** 保持する消失サンプルの上限(状態速報が膨らまないよう少なく固定)。 */
export const HOST_FLIP_SAMPLE_MAX = 8;

/** 「1フレーム相当」とみなす上限(ms)。30fps=33ms・60fps=16msの両方を拾う。 */
export const HOST_FLIP_ONE_FRAME_MAX_MS = 50;

/** 周期性ありと判定する最小の消失回数(これ未満は偶発として判定を出さない)。 */
export const HOST_FLIP_PERIODIC_MIN_COUNT = 3;

/** 間隔のばらつきがこの比率以内なら「一定周期」と断言する(標準偏差/平均)。 */
export const HOST_FLIP_PERIODIC_CV_MAX = 0.15;

/**
 * @typedef {object} HostFlipSample
 * @property {number} hiddenMs 消えていた時間
 * @property {number} sincePrevMs 前回消失からの間隔
 * @property {string} cause 消した経路のタグ
 *
 * @typedef {object} HostVisibilityFlipCensus
 * @property {number} hideCount 消えた回数
 * @property {number} showCount 戻った回数
 * @property {number} oneFrameHideCount うち「1フレームだけ」の消失回数
 * @property {Record<string, number>} byCause 経路タグ別の消失回数
 * @property {HostFlipSample[]} samples 直近サンプル
 * @property {number|null} _hiddenAtMs 内部: 消え始めた時刻
 * @property {string} _hiddenCause 内部: 消し始めた経路
 * @property {number|null} _prevHideAtMs 内部: 前回消失時刻
 */

/** @returns {HostVisibilityFlipCensus} */
export function createHostVisibilityFlipCensus() {
  return {
    hideCount: 0,
    showCount: 0,
    oneFrameHideCount: 0,
    byCause: {},
    samples: [],
    _hiddenAtMs: null,
    _hiddenCause: '',
    _prevHideAtMs: null
  };
}

/**
 * 「消えた」を記録する。既に消えている間の再通知は無視する(二重計上しない)。
 *
 * @param {HostVisibilityFlipCensus|null|undefined} c
 * @param {{ cause?: string, nowMs?: number }} info cause=消した経路のタグ(呼び出し元で付ける)
 */
export function noteHostHidden(c, info) {
  if (!c || typeof c !== 'object') return;
  try {
    if (c._hiddenAtMs != null) return; // 既に消えている=状態変化ではない
    const now = Number(info?.nowMs) || 0;
    const cause = String(info?.cause || 'unknown');
    c._hiddenAtMs = now;
    c._hiddenCause = cause;
    c.hideCount = (Number(c.hideCount) || 0) + 1;
    const bag = c.byCause || (c.byCause = {});
    bag[cause] = (Number(bag[cause]) || 0) + 1;
  } catch { /* 計器の失敗は描画を止めない */ }
}

/**
 * 「戻った」を記録し、消えていた時間と前回からの間隔を1サンプルに畳む。
 *
 * @param {HostVisibilityFlipCensus|null|undefined} c
 * @param {{ nowMs?: number }} [info]
 */
export function noteHostShown(c, info) {
  if (!c || typeof c !== 'object') return;
  try {
    if (c._hiddenAtMs == null) return; // 消えていない=状態変化ではない
    const now = Number(info?.nowMs) || 0;
    const hiddenMs = Math.max(0, now - Number(c._hiddenAtMs));
    const sincePrev = c._prevHideAtMs == null
      ? 0
      : Math.max(0, Number(c._hiddenAtMs) - Number(c._prevHideAtMs));
    c.showCount = (Number(c.showCount) || 0) + 1;
    if (hiddenMs <= HOST_FLIP_ONE_FRAME_MAX_MS) {
      c.oneFrameHideCount = (Number(c.oneFrameHideCount) || 0) + 1;
    }
    const samples = Array.isArray(c.samples) ? c.samples : (c.samples = []);
    samples.push({ hiddenMs, sincePrevMs: sincePrev, cause: String(c._hiddenCause || 'unknown') });
    if (samples.length > HOST_FLIP_SAMPLE_MAX) samples.shift();
    c._prevHideAtMs = Number(c._hiddenAtMs);
    c._hiddenAtMs = null;
    c._hiddenCause = '';
  } catch { /* 計器の失敗は描画を止めない */ }
}

/**
 * ★周期性の判定。間隔のばらつき(変動係数)が小さければ「一定周期で消えている」と断言する。
 *   偶発的な消失を周期と誤報しないよう、件数が足りなければ判定不能を返す。
 *
 * @param {HostVisibilityFlipCensus|null|undefined} c
 * @returns {{ periodic: boolean, periodMs: number, reason: string }}
 *   reason: 'periodic' | 'irregular' | 'too-few'
 */
export function judgeHostFlipPeriodicity(c) {
  const samples = Array.isArray(c?.samples) ? c.samples : [];
  const gaps = samples.map((s) => Number(s?.sincePrevMs) || 0).filter((v) => v > 0);
  if (gaps.length < HOST_FLIP_PERIODIC_MIN_COUNT) {
    return { periodic: false, periodMs: 0, reason: 'too-few' };
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return { periodic: false, periodMs: 0, reason: 'too-few' };
  const variance = gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv <= HOST_FLIP_PERIODIC_CV_MAX) {
    return { periodic: true, periodMs: Math.round(mean), reason: 'periodic' };
  }
  return { periodic: false, periodMs: Math.round(mean), reason: 'irregular' };
}

/**
 * 診断JSONに出す形へ(statusFastDiagLite の passthrough 必須)。
 * @param {HostVisibilityFlipCensus|null|undefined} c
 * @returns {object|null}
 */
export function snapshotHostVisibilityFlipCensus(c) {
  if (!c || typeof c !== 'object') return null;
  const bag = c.byCause && typeof c.byCause === 'object' ? c.byCause : {};
  /** @type {Record<string, number>} */
  const byCause = {};
  for (const k of Object.keys(bag)) byCause[k] = Number(bag[k]) || 0;
  const verdict = judgeHostFlipPeriodicity(c);
  return {
    hideCount: Number(c.hideCount) || 0,
    showCount: Number(c.showCount) || 0,
    oneFrameHideCount: Number(c.oneFrameHideCount) || 0,
    byCause,
    samples: Array.isArray(c.samples) ? c.samples.slice(-HOST_FLIP_SAMPLE_MAX) : [],
    periodic: verdict.periodic,
    periodMs: verdict.periodMs,
    line: formatHostVisibilityFlipLine(c)
  };
}

/**
 * 状態速報の行にする。★「消えている」ことと「その周期」と「犯人」を名指しする。
 * @param {HostVisibilityFlipCensus|null|undefined} c
 * @returns {string}
 */
export function formatHostVisibilityFlipLine(c) {
  if (!c || typeof c !== 'object') return 'パネル消失 —';
  const hide = Number(c.hideCount) || 0;
  const oneFrame = Number(c.oneFrameHideCount) || 0;
  if (hide === 0) {
    return 'パネル消失 ✅ 観測されていません(消えた回数0)';
  }
  const bag = c.byCause && typeof c.byCause === 'object' ? c.byCause : {};
  const causes = Object.keys(bag)
    .sort((a, b) => (Number(bag[b]) || 0) - (Number(bag[a]) || 0))
    .map((k) => `${k}${bag[k]}`)
    .join(' / ');
  const lines = [`パネル消失 ⚠ ${hide}回(うち一瞬だけ ${oneFrame}回) / 経路: ${causes || '不明'}`];
  const v = judgeHostFlipPeriodicity(c);
  if (v.periodic) {
    lines.push(`  → ★${(v.periodMs / 1000).toFixed(1)}秒ちょうどの周期で消えています=タイマーが原因(偶発ではない)`);
  } else if (v.reason === 'irregular') {
    lines.push(`  → 間隔はばらつきあり(平均${(v.periodMs / 1000).toFixed(1)}秒)=タイマー以外の要因`);
  }
  const top = Object.keys(bag).sort((a, b) => (Number(bag[b]) || 0) - (Number(bag[a]) || 0))[0];
  if (top && hide > 0) {
    const pct = Math.round((Number(bag[top]) || 0) * 100 / hide);
    if (pct >= 60) lines.push(`  → 犯人: ${top} が ${pct}% を占めます`);
  }
  return lines.join('\n');
}
