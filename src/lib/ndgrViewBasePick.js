/**
 * ndgrViewBasePick — 過去ログ一括取得(backfill)が使う NDGR view base の選び方(純関数・v0.1.1560)。
 *
 * 背景(2026-10-05 実測・lv342383970 タイムシフト):
 *   タイムシフトではプレイヤーが NDGR view を【2 本】同時に開く。片方(BBwT4…)は entry に
 *   backward URI があるのに backward 本文が常に 0 byte・snapshot 404(＝本文ゼロの stream)。
 *   もう片方(BBwq81…)は backward 46〜83KB で本文が取れる。page-intercept の observeNdgrViewUri は
 *   「最後に観測した view」を採用する(v0.1.762: 生放送の token ローテーション対策)ため、
 *   ~24 秒ごとに交互に観測される 2 本のうち空の方を掴むと、backfill は rows:0 のまま 10 回
 *   再シード→60 秒ウォッチドッグで stalled(ユーザー画面「stalled・残り 10,615 件」)。
 *   一過性リトライは同じ view base でやり直すので永久に 0 件だった。
 *
 * 方針(仕様 docs/handoff/timeshift-sidepanel-symptoms-SPEC.md §2 Q1・(B)):
 *   - page-intercept は観測した view base を「最新順・重複なし・上限 N」で属性に出す(既存の
 *     「最新 1 本」属性は意味を変えない)。
 *   - content 側は候補配列から「この liveId でまだ死亡判定されていない最初の候補」を選ぶ。
 *   - 死亡判定は「本文を一度も取れずに終わった巡回」(rows=0 かつ seg=0 かつ stopReason が
 *     stalled / backward_exhausted / no_entry)だけ。rate_limited / aborted / visibility_paused 等は
 *     view のせいではないので殺さない。
 *   - 全候補が死亡なら先頭(最新)に戻す＝v0.1.762 の「最新が生きている」仮定を床にする。
 *     新しい token は死亡集合に無いので自動的に最優先になる(生放送のローテーションを壊さない)。
 */

/** 属性に出す観測 view base の上限(最新順)。タイムシフトは 2 本、生放送のローテーションで +α。 */
export const NDGR_VIEW_BASE_RECENT_MAX = 4;

/** 「本文を一度も取れなかった」巡回の停止理由。これ以外は view のせいにしない。 */
export const NDGR_VIEW_BASE_DEAD_STOP_REASONS = Object.freeze(['stalled', 'backward_exhausted', 'no_entry']);

/**
 * @param {unknown} v
 * @returns {string}
 */
function cleanBase(v) {
  const s = String(v == null ? '' : v).trim();
  return /^https?:\/\//.test(s) ? s : '';
}

/**
 * 観測した view base を先頭に積む(重複は先頭へ移動・上限超は末尾を落とす)。入力は変更せず新配列を返す。
 * @param {readonly unknown[] | null | undefined} recent
 * @param {unknown} base
 * @param {number} [max]
 * @returns {string[]}
 */
export function pushRecentNdgrViewBase(recent, base, max = NDGR_VIEW_BASE_RECENT_MAX) {
  const prev = Array.isArray(recent) ? recent.map(cleanBase).filter(Boolean) : [];
  const b = cleanBase(base);
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : NDGR_VIEW_BASE_RECENT_MAX;
  if (!b) return prev.slice(0, limit);
  const out = [b];
  for (const p of prev) {
    if (p !== b && !out.includes(p)) out.push(p);
  }
  return out.slice(0, limit);
}

/**
 * 属性文字列(JSON 配列)を候補配列に戻す。`latest`(既存の最新 1 本属性)を必ず先頭に置く。
 * 壊れた JSON・非文字列・http(s) 以外は捨てる。
 * @param {unknown} recentAttr
 * @param {unknown} latestAttr
 * @returns {string[]}
 */
export function parseNdgrViewBaseCandidates(recentAttr, latestAttr) {
  /** @type {string[]} */
  let recent = [];
  try {
    const parsed = typeof recentAttr === 'string' && recentAttr ? JSON.parse(recentAttr) : null;
    if (Array.isArray(parsed)) recent = parsed.map(cleanBase).filter(Boolean);
  } catch {
    recent = [];
  }
  const latest = cleanBase(latestAttr);
  /** @type {string[]} */
  const out = [];
  if (latest) out.push(latest);
  for (const r of recent) {
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

/**
 * 使う view base を選ぶ。`reason` は診断用(nls_backfill_progress_v1.viewPick に出る)。
 *   - 候補なし → base '' / none
 *   - 先頭が dead でない → 先頭 / latest(v0.1.762 の最新優先を維持)
 *   - 先頭が dead → 最初の非 dead 候補 / skip_dead(タイムシフト 2 本 view の根治点)
 *   - 全部 dead → 先頭 / all_dead(最新を床にする・今日と同じ失敗形で有界)
 * @param {readonly unknown[] | null | undefined} candidates
 * @param {ReadonlySet<string> | null | undefined} deadBases
 * @returns {{ base: string, reason: 'none' | 'latest' | 'skip_dead' | 'all_dead' }}
 */
export function pickNdgrViewBase(candidates, deadBases) {
  const list = Array.isArray(candidates) ? candidates.map(cleanBase).filter(Boolean) : [];
  if (!list.length) return { base: '', reason: 'none' };
  const dead = deadBases instanceof Set ? deadBases : new Set();
  if (!dead.has(list[0])) return { base: list[0], reason: 'latest' };
  for (const b of list) {
    if (!dead.has(b)) return { base: b, reason: 'skip_dead' };
  }
  return { base: list[0], reason: 'all_dead' };
}

/**
 * この巡回結果で、使った view base を死亡扱いにしてよいか。
 * true: rows=0 かつ seg=0(backward 本文を一度も受け取っていない)かつ stopReason が
 *   stalled / backward_exhausted / no_entry のいずれか。
 * false: 本文が 1 件でも取れた(rows>0 / seg>0)、または view のせいでない停止
 *   (rate_limited / aborted / visibility_paused / no_view_base / cap_* / reached_start / no_progress 等)。
 * @param {{ stopReason?: unknown, rows?: unknown, seg?: unknown } | null | undefined} p
 * @returns {boolean}
 */
export function shouldMarkNdgrViewBaseDead(p) {
  const rows = Number(p?.rows) || 0;
  const seg = Number(p?.seg) || 0;
  if (rows > 0 || seg > 0) return false;
  const reason = String(p?.stopReason || '').trim();
  return NDGR_VIEW_BASE_DEAD_STOP_REASONS.includes(/** @type {any} */ (reason));
}
