/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】/live/ と同じ集計規則(liveCommentTally+liveLaneBuckets)を拡張の保存コメントへ当てた「輸入した応援レーン」
 *   の組み立てと、拡張の現行レーン(鏡)との差の計測(影運用=表示には使わない)
 * 【この箱に入らないもの】DOM・storage・chrome.*・時計(now は呼び出し側から受け取る)
 * 【書けるstorageキー】なし
 * 【正本宣言】「/live/ 規則でレーンを作る」入口はこのファイルのみ(拡張・計測ツールの両方がここを通る)
 *
 * ★なぜ要るか(2026-10-14・ユーザー「/live/ の安定性を全部移植して」)
 *   /live/ は「サーバが1本で集計し、ブラウザは読むだけ」で軽く安定している。拡張は人物集約が6通り・段分けが3通り・
 *   配信者uid源が4通りあり、画面ごとに食い違う(調査: docs/MAP・計画 I0〜I5)。その解は
 *   【集計器を1本にする】こと。これはその第1段=/live/ と同じ集計を拡張の中でも走らせ、現行と【並走して差を数える】(影運用)。
 *   まだ何も表示を変えない。実機の差が安定してから(I3)切り替える。
 *   ★実測(12配信・scripts/perf-ab/lane-import-diff.mjs): 匿名(たぬ姉)の集合は一致、並びだけ別(拡張=uid昇順/ /live/=件数降順)、
 *     拡張の「りんく」は /live/ の「こん太」に近い。
 *
 * @module laneImportShadow
 */

import { createCommentTally } from './liveCommentTally.js';
import { laneBuckets } from './liveLaneBuckets.js';

/** 影運用の最小間隔(ms)。集計は件数に比例するので、毎描画では走らせない。 */
export const LANE_IMPORT_SHADOW_MIN_GAP_MS = 15_000;

/** @param {unknown} u @returns {string} */
function uidOfUserPageUrl(u) {
  const m = /\/user\/(\d+)/.exec(String(u || ''));
  return m ? m[1] : '';
}

/**
 * 拡張が保存した【正規化済み】ギフト貢献度の行を、/live/ の API と同じ「生の形」へ戻す(liveRankingView が食える形)。
 * @param {unknown} rows
 * @returns {Array<Record<string, unknown>>}
 */
export function rawGiftRankers(rows) {
  return (Array.isArray(rows) ? rows : []).map((r, i) => ({
    rank: r?.rank ?? i + 1,
    supporterId: uidOfUserPageUrl(r?.userPageUrl) || undefined,
    supporterName: r?.name,
    supporterThumbnailUrl: r?.thumbnailUrl || '',
    contribution: r?.contribution,
    userPageUrl: r?.userPageUrl || ''
  }));
}

/**
 * 同じく広告貢献度(ニコニ広告)の行を /live/ の API と同じ「生の形」へ。
 * @param {unknown} rows
 * @returns {Array<Record<string, unknown>>}
 */
export function rawAdRanking(rows) {
  return (Array.isArray(rows) ? rows : []).map((r, i) => ({
    rank: r?.rank ?? i + 1,
    userId: uidOfUserPageUrl(r?.userPageUrl) || undefined,
    advertiserName: r?.name,
    totalContribution: r?.contribution,
    userPageUrl: r?.userPageUrl || '',
    thumbnailUrl: r?.thumbnailUrl || ''
  }));
}

/**
 * /live/ と同じ規則で応援レーンを作る(配信者を除外・userId 空は捨てる・件数降順)。
 * @param {{ comments?: unknown, kokenRows?: unknown, nicoadRows?: unknown, broadcasterUid?: unknown, liveId?: unknown }} input
 *   comments: { userId, commentNo, nickname } を持つ行の配列(拡張の保存コメント)
 *   kokenRows / nicoadRows: 拡張が保存した正規化済みの公式順位の行
 * @returns {{ buckets: ReturnType<typeof laneBuckets>, commenters: number, comments: number }}
 */
export function buildImportedLaneView(input) {
  const tally = createCommentTally({
    broadcasterUid: input?.broadcasterUid,
    limit: 1e9 // 全員(/live/ は top10 だが、拡張は「全員を出す」方針なので比較は全員で)
  });
  tally.add(Array.isArray(input?.comments) ? input.comments : []);
  const r = tally.result();
  const live = {
    liveId: String(input?.liveId ?? ''),
    gift: { rankers: rawGiftRankers(input?.kokenRows) },
    ad: { ranking: rawAdRanking(input?.nicoadRows) },
    comment: { rankers: r.rankers, commenters: r.commenters, comments: r.comments }
  };
  return { buckets: laneBuckets(live), commenters: r.commenters, comments: r.comments };
}

const EXT_TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);
const LIVE_TIERS = /** @type {const} */ (['link', 'konta', 'gift', 'tanu']);

/** 先頭から何人の並びを比べるか。 */
const ORDER_HEAD = 10;

/**
 * 拡張の現行レーン(鏡)と、輸入したレーンの差を数える。
 * @param {{ buckets: any }} imported buildImportedLaneView の戻り
 * @param {Record<string, unknown>|null|undefined} mirror 拡張の鏡(link/gift/ad/konta/tanu の各セル配列。セルは userId を持つ)
 * @returns {{
 *   tanu: { ext: number, live: number, both: number, onlyExt: number, onlyLive: number, headSame: number, headN: number },
 *   everyone: { ext: number, live: number, both: number },
 *   perTier: Record<string, number>,
 *   livePerTier: Record<string, number>
 * }}
 */
export function compareImportedToMirror(imported, mirror) {
  const m = mirror && typeof mirror === 'object' ? /** @type {Record<string, any>} */ (mirror) : {};
  const extUids = (/** @type {string} */ t) =>
    (Array.isArray(m[t]) ? m[t] : []).map((c) => String(c?.userId || '').trim()).filter(Boolean);
  const liveUids = (/** @type {string} */ t) =>
    ((imported?.buckets && /** @type {any} */ (imported.buckets)[t]) || []).map((/** @type {any} */ x) => String(x?.uid || '').trim()).filter(Boolean);

  const extTanu = extUids('tanu');
  const liveTanu = liveUids('tanu');
  const liveTanuSet = new Set(liveTanu);
  const extTanuSet = new Set(extTanu);
  let both = 0;
  for (const u of extTanuSet) if (liveTanuSet.has(u)) both += 1;
  const headN = Math.min(ORDER_HEAD, extTanu.length, liveTanu.length);
  let headSame = 0;
  for (let i = 0; i < headN; i += 1) if (extTanu[i] === liveTanu[i]) headSame += 1;

  const extAll = new Set(EXT_TIERS.flatMap((t) => extUids(t)));
  const liveAll = new Set(LIVE_TIERS.flatMap((t) => liveUids(t)));
  let bothAll = 0;
  for (const u of extAll) if (liveAll.has(u)) bothAll += 1;

  /** @type {Record<string, number>} */
  const perTier = {};
  for (const t of EXT_TIERS) perTier[t] = extUids(t).length;
  /** @type {Record<string, number>} */
  const livePerTier = {};
  for (const t of LIVE_TIERS) livePerTier[t] = liveUids(t).length;

  return {
    tanu: {
      ext: extTanuSet.size,
      live: liveTanuSet.size,
      both,
      onlyExt: extTanuSet.size - both,
      onlyLive: liveTanuSet.size - both,
      headSame,
      headN
    },
    everyone: { ext: extAll.size, live: liveAll.size, both: bothAll },
    perTier,
    livePerTier
  };
}

/**
 * @typedef {{
 *   calls: number, skipped: number, lastMs: number, maxMs: number, lastAtMs: number,
 *   last: ReturnType<typeof compareImportedToMirror>|null, comments: number
 * }} LaneImportShadowState
 */

/** @returns {LaneImportShadowState} */
export function createLaneImportShadowState() {
  return { calls: 0, skipped: 0, lastMs: 0, maxMs: 0, lastAtMs: 0, last: null, comments: 0 };
}

/**
 * 影運用の1回分。間隔が足りなければ何もしない(skipped を数えるだけ)。失敗しても例外を投げない。
 * @param {LaneImportShadowState} state in-place
 * @param {{ comments?: unknown, kokenRows?: unknown, nicoadRows?: unknown, broadcasterUid?: unknown, liveId?: unknown, mirror?: unknown }} input
 * @param {{ nowMs: number, perfNow?: () => number }} clock nowMs=壁時計(間引き用) / perfNow=経過時間の計測用(省略可)
 * @returns {boolean} 実際に計算したか
 */
export function observeLaneImportShadow(state, input, clock) {
  try {
    if (!state || typeof state !== 'object') return false;
    const nowMs = Number(clock?.nowMs) || 0;
    if (state.lastAtMs > 0 && nowMs - state.lastAtMs < LANE_IMPORT_SHADOW_MIN_GAP_MS) {
      state.skipped += 1;
      return false;
    }
    const perf = typeof clock?.perfNow === 'function' ? clock.perfNow : () => 0;
    const t0 = perf();
    const imported = buildImportedLaneView(input || {});
    const cmp = compareImportedToMirror(imported, /** @type {any} */ (input)?.mirror);
    const ms = Math.max(0, perf() - t0);
    state.calls += 1;
    state.lastAtMs = nowMs;
    state.lastMs = Math.round(ms * 10) / 10;
    if (state.lastMs > state.maxMs) state.maxMs = state.lastMs;
    state.last = cmp;
    state.comments = imported.comments;
    return true;
  } catch {
    return false;
  }
}

/**
 * 状態速報の1行。観測前は空。
 * @param {LaneImportShadowState|null|undefined} state
 * @returns {string}
 */
export function formatLaneImportShadowLine(state) {
  const c = state?.last;
  if (!state || !c || !(state.calls > 0)) return '';
  const t = c.tanu;
  const setOk = t.onlyExt === 0 && t.onlyLive === 0;
  const orderOk = t.headN === 0 || t.headSame === t.headN;
  const mark = setOk && orderOk ? '✅' : setOk ? '🟡' : '🔴';
  const head = t.headN > 0 ? `先頭${t.headN}人の並び一致${t.headSame}/${t.headN}` : '先頭の並び比較なし';
  return (
    `/live/規則との差 ${mark} たぬ姉の人物: 拡張${t.ext}/規則${t.live}(同じ人${t.both}・拡張だけ${t.onlyExt}・規則だけ${t.onlyLive}) / ${head}` +
    ` / 全段の同じ人 ${c.everyone.both}(拡張${c.everyone.ext}・規則${c.everyone.live}) / 計算${state.calls}回・最大${state.maxMs}ms`
  );
}
