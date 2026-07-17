/**
 * broadcasterUidTracker — 配信者UIDの sticky 解決(この機能群で唯一の stateful 部品)。
 *
 * 【入力の出どころ】
 *   - liveId: STORY_SOURCE_STATE.liveId(popup)。配信の同一性判定にのみ使用。
 *   - entries: 保存済みコメント storageCtx(全件)。ニックネーム一致推定の材料。
 *   - snapshot: watchMetaCache.snapshot(embedded-data 由来)。explicit/pageUrl の正。
 * 【出力の使われ方】
 *   - .uid は renderStoryUserLane の数値ID段ガードと、鏡 publish の broadcasterUserId
 *     (会場・③WEBが同じ値を見る)に使う。ガードと publish は必ず同源にすること。
 * 【担う責務】
 *   - 推定候補数が 0→1→2 と揺れても、一度確定した uid を同一配信内で手放さないこと
 *     (チャンネル放送で snapshot.broadcasterUserId が構造的に取れず、コメントの
 *     ニックネーム一致推定に頼らざるを得ない場合の揺れ対策)。
 *   - explicit/pageUrl(confidence=2)による矯正と、liveId 切替での即時全リセット。
 * 【担わない責務】
 *   - uid の一次推定そのもの(正本: inferBroadcasterUserIdFromComments.js)。
 *   - 配信者アイコンの取り違え検査(正本: avatarBroadcasterGuard.js)。
 *   - 永続化。popup を閉じたら忘れる(前配信の uid 持ち越し事故 > 再確定の一瞬、の判断)。
 *
 * 設計正本: user-identity-unification-DESIGN.md(会議→Fable、2026-07-17)。
 */

import { inferBroadcasterUserIdDetailed } from './inferBroadcasterUserIdFromComments.js';

/**
 * @typedef {{
 *   uid: string,
 *   confidence: 0|1|2,
 *   source: 'none'|'inferred'|'pageUrl'|'explicit',
 *   liveId: string,
 *   heldSinceMs: number,
 *   diag: { emptyStreak: number, conflictCount: number }
 * }} BroadcasterUidState
 */

/** @type {BroadcasterUidState} */
const EMPTY_STATE = Object.freeze({
  uid: '',
  confidence: 0,
  source: 'none',
  liveId: '',
  heldSinceMs: 0,
  diag: Object.freeze({ emptyStreak: 0, conflictCount: 0 })
});

/** @param {'none'|'inferred'|'pageUrl'|'explicit'} source @returns {0|1|2} */
function confidenceForSource(source) {
  if (source === 'explicit' || source === 'pageUrl') return 2;
  if (source === 'inferred') return 1;
  return 0;
}

/**
 * @param {() => number} [nowFn]
 * @returns {{
 *   update: (input: { liveId: string, entries: readonly unknown[], snapshot: object }) => BroadcasterUidState,
 *   current: () => BroadcasterUidState
 * }}
 */
export function createBroadcasterUidTracker(nowFn = Date.now) {
  /** @type {BroadcasterUidState} */
  let state = EMPTY_STATE;

  return {
    update({ liveId, entries, snapshot }) {
      const lid = String(liveId || '').trim().toLowerCase();

      // 規則1: liveId が変わったら全リセット(前配信の uid を1msも持ち越さない)。
      if (lid !== state.liveId) {
        state = { ...EMPTY_STATE, liveId: lid };
      }

      const detailed = inferBroadcasterUserIdDetailed(entries, snapshot);
      const nextConfidence = confidenceForSource(detailed.source);

      // 規則2: explicit/pageUrl(confidence=2)は無条件採用(構造的ソースが常に正)。
      if (nextConfidence === 2) {
        if (detailed.uid !== state.uid || state.confidence !== 2) {
          state = {
            uid: detailed.uid,
            confidence: 2,
            source: detailed.source,
            liveId: lid,
            heldSinceMs: nowFn(),
            diag: { emptyStreak: 0, conflictCount: state.diag.conflictCount }
          };
        }
        return state;
      }

      // 規則3: inferred 一意(candidateCount===1 相当・source='inferred')。
      if (detailed.source === 'inferred') {
        if (state.confidence === 2) {
          // 格下の推定で confidence=2 を上書きしない。
          return state;
        }
        if (!state.uid) {
          state = {
            uid: detailed.uid,
            confidence: 1,
            source: 'inferred',
            liveId: lid,
            heldSinceMs: nowFn(),
            diag: { emptyStreak: 0, conflictCount: state.diag.conflictCount }
          };
          return state;
        }
        if (detailed.uid === state.uid) {
          // 同一 uid の再確認。emptyStreak をリセットするだけ。
          state = { ...state, diag: { ...state.diag, emptyStreak: 0 } };
          return state;
        }
        // 異なる uid の推定 = 先勝ちで保持を維持(同名視聴者ノイズの可能性)。
        state = {
          ...state,
          diag: { ...state.diag, conflictCount: state.diag.conflictCount + 1 }
        };
        return state;
      }

      // 規則4: inferred 空(候補0件 or 2件以上) = 保持を維持(sticky の核心)。
      state = {
        ...state,
        diag: { ...state.diag, emptyStreak: state.diag.emptyStreak + 1 }
      };
      return state;
    },
    current() {
      return state;
    }
  };
}
