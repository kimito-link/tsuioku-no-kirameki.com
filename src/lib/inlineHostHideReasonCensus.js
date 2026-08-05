/**
 * パネルを消した「理由」を経路ごとに数える計器(純関数)。
 *
 * ★v0.1.1256 の動機(2026-08-05・実測で周期が確定した直後):
 *   v0.1.1255 の hostVisWatch が犯人の【形】を確定させた:
 *     4.0秒ちょうどの周期(誤差0.001) / 933x600 → 0x0 /
 *     display:"none" opacity:"0" / 3回観測 / maxHiddenFrames:551
 *   同時に hostRecoveryDiag は「点検117回中52回、消えていたので復帰させた」と出た。
 *   = 4秒ごとに【消す→復帰させる】を延々繰り返している状態。点滅の正体はこれ。
 *
 * ■ ここまでで分かっていないこと(だから本計器が要る)
 *   renderPageFrameOverlay(=描き直す処理)の中に hidePageFrameOverlay(=消す処理)が
 *   3経路あり、さらに外にも2経路ある。計5経路のうち【どれが消しているか】が不明。
 *   症状(消えた)は測れているが、原因(誰が消したか)が測れていなかった
 *   ([[instrument-must-name-the-cause-2026-08-01]])。
 *
 * ■ なぜ hostFlipCensus では分からなかったか(構造的な理由・重要)
 *   setInlineHostDisplay は `host.style.display`(インラインスタイル)の前後を比べる。
 *   ところが本拡張は CSS 側で
 *       #nls-inline-popup-host { display: none; opacity: 0; }
 *   を既定にしており、インラインで上書きして「見せて」いる。
 *   → インラインが同値のままでも、実際の表示(getComputedStyle)は変わりうる。
 *   → hostFlipCensus(インライン基準) と hostVisWatch(実測基準) が食い違うのは必然だった。
 *   本計器は「呼ばれた事実」を数えるので、どちらの基準にも依存しない。
 *
 * ■ 設計の掟
 *   - 0 の意味を区別する: 呼ばれた総数を必ず併記する
 *     ([[zero-count-may-mean-unmeasured-2026-08-04]])
 *   - 犯人を名指しする: 最多の経路と占有率を文章で断言する
 */

/** 保持するサンプル上限(速報を膨らませない)。 */
export const HIDE_REASON_SAMPLE_MAX = 6;

/**
 * @returns {{ total: number, byReason: Record<string, number>, lastReason: string, lastAtMs: number|null, gapsMs: number[] }}
 */
export function createInlineHostHideReasonCensus() {
  return { total: 0, byReason: {}, lastReason: '', lastAtMs: null, gapsMs: [] };
}

/**
 * 1回の「消した」を記録する。
 * @param {ReturnType<typeof createInlineHostHideReasonCensus>} census
 * @param {string} reason 経路タグ
 * @param {number} nowMs
 */
export function noteInlineHostHide(census, reason, nowMs) {
  if (!census || typeof census !== 'object') return;
  const key = String(reason || 'unknown');
  census.total = (Number(census.total) || 0) + 1;
  census.byReason[key] = (Number(census.byReason[key]) || 0) + 1;
  census.lastReason = key;
  const at = Number(nowMs) || 0;
  if (census.lastAtMs != null && at > census.lastAtMs) {
    census.gapsMs.push(at - census.lastAtMs);
    if (census.gapsMs.length > 24) census.gapsMs.shift();
  }
  census.lastAtMs = at;
}

/**
 * 最も多い経路と占有率を返す。★犯人を名指しするための集計。
 * @param {Record<string, number>|null|undefined} byReason
 * @returns {{ reason: string, count: number, share: number }}
 */
export function topHideReason(byReason) {
  const map = byReason && typeof byReason === 'object' ? byReason : {};
  const entries = Object.entries(map).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return { reason: '', count: 0, share: 0 };
  const total = entries.reduce((a, [, v]) => a + Number(v), 0);
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  const [reason, count] = entries[0];
  return { reason: String(reason), count: Number(count), share: total > 0 ? Number(count) / total : 0 };
}

/**
 * 間隔が一定か(=タイマー由来か)。hostVisibilityWatch と同じ判定基準に揃える。
 * @param {number[]} gapsMs
 * @returns {{ periodic: boolean, periodMs: number }}
 */
export function analyzeHidePeriod(gapsMs) {
  const gaps = Array.isArray(gapsMs) ? gapsMs.filter((g) => Number.isFinite(g) && g > 0) : [];
  if (gaps.length < 2) return { periodic: false, periodMs: 0 };
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (!(mean > 0)) return { periodic: false, periodMs: 0 };
  const variance = gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  return { periodic: cv < 0.15, periodMs: Math.round(mean) };
}

/**
 * 速報用スナップショット。
 * @param {ReturnType<typeof createInlineHostHideReasonCensus>} census
 */
export function snapshotInlineHostHideReasonCensus(census) {
  const c = census && typeof census === 'object' ? census : null;
  if (!c) return null;
  const period = analyzeHidePeriod(c.gapsMs);
  return {
    total: Number(c.total) || 0,
    byReason: { ...(c.byReason || {}) },
    lastReason: String(c.lastReason || ''),
    periodic: period.periodic,
    periodMs: period.periodMs
  };
}

/**
 * 状態速報の行。★0 の意味を区別し、犯人を名指しする。
 * @param {{ total?: number, byReason?: Record<string, number>, periodic?: boolean, periodMs?: number }|null|undefined} snap
 * @returns {string}
 */
export function formatInlineHostHideReasonLine(snap) {
  const s = snap && typeof snap === 'object' ? snap : null;
  if (!s) return '';
  const total = Number(s.total) || 0;
  if (total <= 0) {
    return 'パネルを消した理由 ✅ 消していません(呼び出し0回)';
  }
  const top = topHideReason(s.byReason);
  const detail = Object.entries(s.byReason || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([k, v]) => `${k}${v}`)
    .join(' / ');
  const lines = [`パネルを消した理由 ⚠ ${total}回 — ${detail}`];
  if (top.reason) {
    lines.push(`  → ★犯人: ${top.reason} が ${Math.round(top.share * 100)}% を占めます`);
  }
  if (s.periodic && Number(s.periodMs) > 0) {
    lines.push(`  → ${(Number(s.periodMs) / 1000).toFixed(1)}秒ちょうどの間隔で消しています=タイマーが呼んでいます`);
  }
  return lines.join('\n');
}
