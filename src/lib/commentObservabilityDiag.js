/**
 * v0.1.225: コメント記録の uid 解決経路を AI 共有診断 JSON に自動で乗せる純関数。
 *
 * 背景: niconico の最新 frontend で uid を DOM/NDGR から取れない事象の root cause を
 * F12 不要で特定できるよう、観測値だけを増やす。挙動は一切変更しない。
 *
 * 副作用なし。
 */

import { normalizeCommentText } from './commentRecord.js';
import { parseGiftCommentText } from './parseGiftComment.js';
import { shouldAcceptNdgrChatAsComment } from './ndgrDecode.js';

const USER_ID_LIKE_ATTRS = Object.freeze([
  'data-user-id',
  'data-userid',
  'data-owner-id',
  'data-ownerid',
  'data-uid',
  'data-account-id',
  'data-account-no',
  'data-comment-user-id',
  'data-commenter-id',
  'data-poster-id'
]);

/**
 * @typedef {{
 *   sampledRows: number,
 *   rowsWithUserIdLikeAttr: number,
 *   rowsWithoutUserIdLikeAttr: number,
 *   userIdLikeAttributesFound: string[],
 *   attributeKeysSample: string[][]
 * }} CommentRowDataAttributesProbe
 */

/**
 * 直近のコメ table-row Element を sampling し、uid 系属性の有無を判定する。
 * @param {ArrayLike<Element>|null|undefined} rowElements
 * @param {{ limit?: number }} [opts]
 * @returns {CommentRowDataAttributesProbe}
 */
export function probeCommentRowDataAttributes(rowElements, opts) {
  const limit = Math.max(1, Math.min(10, Number(opts?.limit) || 5));
  /** @type {Element[]} */
  const rows = [];
  if (rowElements && typeof rowElements.length === 'number') {
    for (let i = 0; i < rowElements.length && rows.length < limit; i += 1) {
      const el = rowElements[i];
      if (el && typeof el.getAttribute === 'function') rows.push(el);
    }
  }
  /** @type {Set<string>} */
  const foundAttrs = new Set();
  /** @type {string[][]} */
  const keysSample = [];
  let withUid = 0;
  for (const el of rows) {
    /** @type {string[]} */
    let names = [];
    if (typeof el.getAttributeNames === 'function') {
      try { names = Array.from(el.getAttributeNames()); } catch { /* no-op */ }
    }
    keysSample.push(names);
    let hasUid = false;
    for (const candidate of USER_ID_LIKE_ATTRS) {
      if (typeof el.hasAttribute === 'function' && el.hasAttribute(candidate)) {
        foundAttrs.add(candidate);
        hasUid = true;
      }
    }
    if (hasUid) withUid += 1;
  }
  return {
    sampledRows: rows.length,
    rowsWithUserIdLikeAttr: withUid,
    rowsWithoutUserIdLikeAttr: rows.length - withUid,
    userIdLikeAttributesFound: [...foundAttrs],
    attributeKeysSample: keysSample
  };
}

/**
 * @typedef {{
 *   totalInput: number,
 *   noNumberSkip: number,
 *   emptyTextSkip: number,
 *   giftSystemMsgSkip: number,
 *   accepted: number
 * }} NdgrChatRejectionStats
 */

/**
 * NDGR chats を `ndgrChatsToMergeRows` と同じ条件で walk し、reject 理由別カウントを返す。
 * 採用判定は本体と同じ `shouldAcceptNdgrChatAsComment` を使い、ドリフトを防ぐ。
 * @param {ReadonlyArray<{ no?: number|string|null, content?: string, rawUserId?: number|string|null, hashedUserId?: string }>|null|undefined} chats
 * @returns {NdgrChatRejectionStats}
 */
export function analyzeNdgrChatRejection(chats) {
  const list = Array.isArray(chats) ? chats : [];
  let noNumberSkip = 0;
  let emptyTextSkip = 0;
  let giftSystemMsgSkip = 0;
  let accepted = 0;
  for (const chat of list) {
    if (!chat) {
      noNumberSkip += 1;
      continue;
    }
    const text = normalizeCommentText(chat.content);
    if (!text) {
      // 本体(ndgrChatsToMergeRows)が text 空を先に skip するのに合わせる。
      emptyTextSkip += 1;
      continue;
    }
    if (parseGiftCommentText(text)) {
      giftSystemMsgSkip += 1;
      continue;
    }
    // v0.1.803(星野ロミ式最大化): 採用判定は本体と同じ shouldAcceptNdgrChatAsComment。
    //   no があるか、または「content 非空 かつ userId 有り」(匿名コメント)なら採用。
    //   no も userId も無い(同定不能・gift payload 誤読等)は noNumberSkip に計上。
    if (shouldAcceptNdgrChatAsComment(chat)) {
      accepted += 1;
    } else {
      noNumberSkip += 1;
    }
  }
  return {
    totalInput: list.length,
    noNumberSkip,
    emptyTextSkip,
    giftSystemMsgSkip,
    accepted
  };
}

/**
 * @typedef {{
 *   totalSaved: number,
 *   withUid: number,
 *   withoutUid: number,
 *   withUidPercent: number,
 *   commentNoLess: number,
 *   commentNoLessPercent: number
 * }} SavedCommentsUidStats
 */

/**
 * 保存済 entry を userId あり/なし・commentNo あり/なしで集計（同一 walk・副作用なし）。
 *
 * v0.1.1001 計器(記録>本家 104% の切り分け): commentNo を持たない行(匿名184主体)は
 *   dedup キーが `liveId||text|sec|uid` の capturedAt 秒依存フォールバックになり、ライブと
 *   backfill で capturedAt 導出が違うと二重計上し得る(commentRecord.js:75-84)。
 *   「記録のうち何%が commentNo 欠落か」を状態速報に出せば、104% の内訳が「二重計上の温床
 *   (欠落行が多い)」か「本家統計の数え方差(欠落行は少ない)」かをスクショ1枚で切り分けられる。
 *
 * @param {ReadonlyArray<{ userId?: string|null, commentNo?: string|number|null }>|null|undefined} entries
 * @returns {SavedCommentsUidStats}
 */
export function aggregateSavedCommentsUidStats(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let withUid = 0;
  let noLess = 0;
  for (const e of list) {
    const uid = e?.userId ? String(e.userId).trim() : '';
    if (uid) withUid += 1;
    const no = e?.commentNo != null ? String(e.commentNo).trim() : '';
    if (!no) noLess += 1;
  }
  const total = list.length;
  const without = total - withUid;
  const percent = total > 0 ? Math.round((withUid / total) * 1000) / 10 : 0;
  const noLessPercent = total > 0 ? Math.round((noLess / total) * 1000) / 10 : 0;
  return {
    totalSaved: total,
    withUid,
    withoutUid: without,
    withUidPercent: percent,
    commentNoLess: noLess,
    commentNoLessPercent: noLessPercent
  };
}

/**
 * v0.1.1011: チャンクモードの「記録全件の uid/commentNo 集計」を O(追加分) で正しく保つ純関数。
 *
 * 背景(totalSaved:0 の根治): チャンクモードでは aggregateSavedCommentsUidStats に渡る next が
 *   【そのフラッシュの新規行だけ】になり、新規0件のフラッシュで totalSaved:0 と誤集計していた
 *   (記録は全件あるのに母数が直近差分)。毎フラッシュ全件 read は重い(O(N))ので不可。そこで
 *   seed 時に1回 aggregateSavedCommentsUidStats(全件 main) で running を作り、以後は incremental
 *   に added 行だけ加算する=母数を「記録全件」に保ちつつ O(追加分)。
 *
 * @param {ReturnType<typeof aggregateSavedCommentsUidStats>|null|undefined} running 直前の running(seed 由来)
 * @param {ReadonlyArray<{ userId?: string|null, commentNo?: string|number|null }>|null|undefined} added 新規行
 * @returns {ReturnType<typeof aggregateSavedCommentsUidStats>} 加算後の running(% も再計算済み)
 */
export function accumulateSavedCommentsUidStats(running, added) {
  const base =
    running && typeof running === 'object'
      ? {
          totalSaved: Number(running.totalSaved) || 0,
          withUid: Number(running.withUid) || 0,
          withoutUid: Number(running.withoutUid) || 0,
          commentNoLess: Number(running.commentNoLess) || 0
        }
      : { totalSaved: 0, withUid: 0, withoutUid: 0, commentNoLess: 0 };
  const rows = Array.isArray(added) ? added : [];
  for (const e of rows) {
    const uid = e?.userId ? String(e.userId).trim() : '';
    if (uid) base.withUid += 1;
    else base.withoutUid += 1;
    const no = e?.commentNo != null ? String(e.commentNo).trim() : '';
    if (!no) base.commentNoLess += 1;
    base.totalSaved += 1;
  }
  /** @param {number} n */
  const pct = (n) => (base.totalSaved > 0 ? Math.round((n / base.totalSaved) * 1000) / 10 : 0);
  return {
    totalSaved: base.totalSaved,
    withUid: base.withUid,
    withoutUid: base.withoutUid,
    withUidPercent: pct(base.withUid),
    commentNoLess: base.commentNoLess,
    commentNoLessPercent: pct(base.commentNoLess)
  };
}

/**
 * page-intercept-entry.js が `data-nls-fetch-log` 属性に `' | '` 区切りで蓄積する
 * fetch hit 履歴（最新 20 件、URL pathname と Content-Type の短縮形）を配列化。
 * @param {string|null|undefined} attrValue
 * @returns {string[]}
 */
export function parseInterceptFetchLog(attrValue) {
  if (typeof attrValue !== 'string' || !attrValue) return [];
  return attrValue
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @typedef {{
 *   seedSkipCount: number,
 *   seedRebuildCount: number,
 *   seedRequeueCount: number,
 *   lastIncrementalAddedCount: number,
 *   maxIncrementalAddedCount: number,
 *   suspiciousAddedCount: number,
 *   addedNoLessCount: number,
 *   addedTotalCount: number
 * }} DedupeSeedDiag
 */

/**
 * v0.1.1186 計器(記録が本家を上回る異常の切り分け): ensureLiveDedupeStateSeeded が
 *   「storedTotal===myTotal 一致→既存 state 再利用(skip)」と「不一致→全チャンク read
 *   で作り直し(rebuild)」のどちらの経路を通ったか、そして incrementalMode の1回のマージで
 *   何件 added になったかを数えるだけの計器(観測のみ・挙動変更ゼロ)。
 *
 * 仮説: skip 経路で再利用した liveDedupeState が実は不完全(古いタブ切替・seed 時点の
 *   部分読み等)だと、後続の mergeNewCommentsIncremental が既存コメントを新規誤判定し、
 *   1回の incrementalAdded が桁違いに膨らむ(=記録の瞬間的な過剰増)。
 *   suspiciousAddedCount は「1回のマージで100件を超える added」が出た回数(通常の新着
 *   コメントペースでは起こり得ない規模を機械的にフラグする閾値)。
 *
 * @returns {DedupeSeedDiag}
 */
export function createDedupeSeedDiagState() {
  return {
    seedSkipCount: 0,
    seedRebuildCount: 0,
    seedRequeueCount: 0,
    lastIncrementalAddedCount: 0,
    maxIncrementalAddedCount: 0,
    suspiciousAddedCount: 0,
    addedNoLessCount: 0,
    addedTotalCount: 0
  };
}

/**
 * ensureLiveDedupeStateSeeded の分岐結果を観測する。
 * @param {DedupeSeedDiag|null|undefined} state
 * @param {'skip'|'rebuild'|'requeue'} outcome
 */
export function noteDedupeSeedOutcome(state, outcome) {
  if (!state || typeof state !== 'object') return;
  if (outcome === 'skip') state.seedSkipCount += 1;
  else if (outcome === 'rebuild') state.seedRebuildCount += 1;
  else if (outcome === 'requeue') state.seedRequeueCount += 1;
}

/**
 * incrementalMode の1回のマージで確定した added 件数を観測する。
 * @param {DedupeSeedDiag|null|undefined} state
 * @param {number} addedCount
 * @param {{ suspiciousThreshold?: number }} [opts]
 */
export function noteIncrementalAddedCount(state, addedCount, opts) {
  if (!state || typeof state !== 'object') return;
  const n = Number(addedCount) || 0;
  const threshold = Math.max(1, Number(opts?.suspiciousThreshold) || 100);
  state.lastIncrementalAddedCount = n;
  if (n > state.maxIncrementalAddedCount) state.maxIncrementalAddedCount = n;
  if (n > threshold) state.suspiciousAddedCount += 1;
}

/**
 * added 行のうち「コメント番号を持たない行」の件数を積む(v0.1.1196 計器・観測のみ)。
 *
 * ★これが二重計上の候補を切り分ける決定打になる。
 *
 * dedup キー(commentRecord.js:75-84 buildDedupeKey)は commentNo の有無で構造が変わる:
 *   - commentNo あり: `${liveId}|${no}|${text}`            ← capturedAt に依存しない
 *   - commentNo 無し: `${liveId}||${text}|${sec}|${uid}`   ← capturedAt の「秒」が混ざる
 *
 * そして capturedAt はコメントの取得経路によって導出が異なる:
 *   - ライブNDGR / DOM harvest / intercept_post : capturedAt 無し → createCommentEntry が Date.now() を押す
 *   - backfill / NDGR_FORWARD                   : 配信開始+vpos で算出した値を持つ
 *
 * よって同じ匿名コメントがライブ経路と backfill 経路の両方から入ると、`sec` 成分が
 * 数十分〜数時間ずれてキーが一致せず、dedup をすり抜けて二重計上される——という仮説が立つ。
 * この機序は commentNo 欠落行でしか成立しない(番号があればキーは capturedAt 非依存)。
 *
 * したがって:
 *   - addedNoLessCount がほぼ 0 → 上記仮説は棄却でき、seed skip 経路(別候補)に絞れる
 *   - addedNoLessCount が大きい → 仮説が有力。capturedAt 正規化の設計に進む
 *
 * ⚠️ 修正ではなく観測に留めている理由: dedup キーの意味論を変えると既存の全保存データの
 *    キーと非互換になり、誤ると逆に大量の二重計上を招く。実測で候補を絞ってから設計する。
 *
 * @param {DedupeSeedDiag|null|undefined} state
 * @param {ReadonlyArray<{ commentNo?: unknown }>|null|undefined} addedRows
 *   mergeNewCommentsIncremental が返した added 行。
 */
export function noteAddedCommentNoLess(state, addedRows) {
  if (!state || typeof state !== 'object') return;
  const rows = Array.isArray(addedRows) ? addedRows : [];
  if (!rows.length) return;
  let noLess = 0;
  for (const row of rows) {
    // ⚠️ 判定は buildDedupeKey(commentRecord.js:76-79)と1バイト単位でそろえること。
    //    あちらは `String(rec.commentNo ?? '').trim()` が非空かどうかだけを見る
    //    (`no` フィールドは見ない・数値化もしない)。ここがズレると「キーがどちらの
    //    構造で作られたか」を取り違え、計器が嘘をつく。
    const no = String(row?.commentNo ?? '').trim();
    if (!no) noLess += 1;
  }
  state.addedTotalCount += rows.length;
  state.addedNoLessCount += noLess;
}

/**
 * 状態速報向けの snapshot(コピー・副作用なし)。
 * @param {DedupeSeedDiag|null|undefined} state
 * @returns {DedupeSeedDiag}
 */
export function snapshotDedupeSeedDiag(state) {
  if (!state || typeof state !== 'object') return createDedupeSeedDiagState();
  return {
    seedSkipCount: Number(state.seedSkipCount) || 0,
    seedRebuildCount: Number(state.seedRebuildCount) || 0,
    seedRequeueCount: Number(state.seedRequeueCount) || 0,
    lastIncrementalAddedCount: Number(state.lastIncrementalAddedCount) || 0,
    maxIncrementalAddedCount: Number(state.maxIncrementalAddedCount) || 0,
    suspiciousAddedCount: Number(state.suspiciousAddedCount) || 0,
    addedNoLessCount: Number(state.addedNoLessCount) || 0,
    addedTotalCount: Number(state.addedTotalCount) || 0
  };
}

/**
 * 累積カウンタ（commentIngestBySource 等）を snapshot として安全にコピーする。
 * @param {Record<string, number>|null|undefined} counters
 * @returns {Record<string, number>}
 */
export function snapshotCommentIngestCounters(counters) {
  if (!counters || typeof counters !== 'object') return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of Object.keys(counters)) {
    const v = Number(counters[key]);
    out[key] = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  return out;
}
