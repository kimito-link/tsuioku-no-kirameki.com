/**
 * 応援レーン候補の生成(profileTier 付与・整列)— popup と会場で共有する正本の純関数。
 *
 * 元は popup-entry.js renderStoryUserLane のループ(aggList を1件ずつ profileTier/thumbScore/
 * displaySrc 付きの候補に変換し、profileTier→thumbScore→uidRank→entryIndex で sort)。
 * 会場(venueBar.js)でも【popup と完全に同じ顔ぶれ・同じ順序】の席を出すために、この変換を
 * 共有純関数化した。bucketStoryUserLanePicks はこの出力(profileTier 付き候補)にかける。
 *
 * ★設計: bucket/sort に必要な部分(profileTier/thumbScore/displaySrc/entry/entryIndex)だけを
 *   共通生成する。popup 固有の title(ラベル)・meta・診断カウントは呼び出し側のコールバックで
 *   後付けする(会場はこれらを渡さない=席は userId/nickname/avatar しか使わないため不要)。
 *   こうして popup の挙動を1mm 変えず(コールバックで従来の title/meta/diag を注入)、会場は
 *   同じ候補集合・同じ順序を最小依存で得る。
 *
 * own-posted 判定と remembered avatar は entries/profileMap に依存するため、呼び出し側が
 * これらを解決する関数(isOwnPosted/resolveRememberedAvatar)を注入する(popup と会場で
 * それぞれの state から同じ純関数経由で渡す=ズレない)。
 */
import { buildStoryUserLaneCandidateRow } from './storyUserLaneRowModel.js';
import { userLaneDedupeKey } from './supportGrowthTileSrc.js';
import { resolveStoryLaneAvatarSrc } from './storyLaneAvatarSrc.js';
import { shouldSkipStoryUserLaneCandidateByContamination } from './storyUserLaneContaminationGuard.js';
import { explainSupportGridDisplayTier } from './supportGridDisplayTier.js';

/**
 * @param {string} uidRaw
 * @returns {number} 数値ID=0 / a:匿名=1 / その他=2(sort のグループ順)
 */
export function laneUidSortRank(uidRaw) {
  const s = String(uidRaw || '').trim();
  if (/^\d{5,14}$/.test(s)) return 0;
  if (/^a:/i.test(s)) return 1;
  return 2;
}

/**
 * @typedef {{
 *   entryIndex: number,
 *   profileTier: number,
 *   thumbScore: number,
 *   displaySrc: string,
 *   httpForLane: string,
 *   entry: Record<string, unknown>,
 *   tierExplain: { strongNick?: boolean, hasPersonalThumb?: boolean }
 * }} StoryUserLaneCandidate
 */

/**
 * @param {{
 *   aggList: readonly unknown[],
 *   liveId: string,
 *   broadcasterUid: string,
 *   viewerUid: string,
 *   snapshot: import('./storyLaneAvatarSrc.js').StoryLaneAvatarSnapshot|null|undefined,
 *   pickCtxBase: { yukkuriSrc: string, tvSrc: string, anonymousIdenticonEnabled: boolean },
 *   isOwnPosted: (entry: Record<string, unknown>) => boolean,
 *   resolveRememberedAvatar: (userId: string) => string,
 *   resolveAnonymousIdenticon: (userId: string) => string,
 *   isAvatarObserved: (entry: Record<string, unknown>) => boolean,
 *   onTierExplain?: (e: { strongNick?: boolean, hasPersonalThumb?: boolean }, profileTier: number) => void
 * }} input
 * @returns {StoryUserLaneCandidate[]} sort 済み候補(profileTier→thumbScore→uidRank→entryIndex)
 */
export function buildStoryUserLaneCandidates(input) {
  const aggList = Array.isArray(input?.aggList) ? input.aggList : [];
  const liveId = String(input?.liveId || '');
  const broadcasterUid = String(input?.broadcasterUid || '').trim();
  const viewerUid = String(input?.viewerUid || '').trim();
  const snapshot = input?.snapshot;
  const isOwnPosted = typeof input?.isOwnPosted === 'function' ? input.isOwnPosted : () => false;
  const resolveRememberedAvatar =
    typeof input?.resolveRememberedAvatar === 'function' ? input.resolveRememberedAvatar : () => '';
  const resolveAnonymousIdenticon =
    typeof input?.resolveAnonymousIdenticon === 'function' ? input.resolveAnonymousIdenticon : () => '';
  const isAvatarObserved =
    typeof input?.isAvatarObserved === 'function' ? input.isAvatarObserved : () => false;
  const onTierExplain = typeof input?.onTierExplain === 'function' ? input.onTierExplain : null;
  const pickCtxBase = input?.pickCtxBase || {
    yukkuriSrc: '',
    tvSrc: '',
    anonymousIdenticonEnabled: false
  };

  /** @type {StoryUserLaneCandidate[]} */
  const candidates = [];
  const seen = new Set();

  for (let i = aggList.length - 1; i >= 0; i -= 1) {
    const agg = /** @type {{ userId?: unknown, nickname?: unknown, avatarUrl?: unknown, avatarObserved?: unknown, selfPosted?: unknown }} */ (
      aggList[i]
    );
    const uidRaw = String(agg?.userId || '').trim();
    if (!uidRaw) continue;
    const ownPostedForUid = isOwnPosted(/** @type {Record<string, unknown>} */ (agg));
    // 配信者ID未確定で numeric userId 段を出すと配信者/周辺ユーザーを誤表示するので匿名段に倒す。
    //   own-posted(=自分)は確実に本人なので numeric でも通す。
    if (!broadcasterUid && !ownPostedForUid && /^\d{5,14}$/.test(uidRaw)) continue;

    /** @type {Record<string, unknown>} */
    const e = {
      id: `nl-lane:${uidRaw}`,
      liveId,
      userId: uidRaw,
      nickname: String(agg?.nickname || ''),
      avatarUrl: String(agg?.avatarUrl || ''),
      ...(agg?.avatarObserved || isAvatarObserved(/** @type {Record<string, unknown>} */ (agg))
        ? { avatarObserved: true }
        : {}),
      ...(ownPostedForUid ? { selfPosted: true } : {}),
      text: '',
      commentNo: ''
    };

    if (
      shouldSkipStoryUserLaneCandidateByContamination({
        candidateUserId: uidRaw,
        viewerUserId: viewerUid,
        broadcasterUserId: broadcasterUid,
        isOwnPosted: ownPostedForUid
      })
    ) {
      continue;
    }

    const httpFromGrowth = resolveStoryLaneAvatarSrc(e, {
      snapshot,
      isOwnPosted: ownPostedForUid,
      rememberedAvatar: resolveRememberedAvatar(uidRaw)
    });
    const dedupeKey = userLaneDedupeKey({
      userId: uidRaw,
      avatarHttpCandidate: '',
      stableId: ''
    });
    if (!dedupeKey) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const pickCtx = {
      yukkuriSrc: pickCtxBase.yukkuriSrc,
      tvSrc: pickCtxBase.tvSrc,
      anonymousIdenticonEnabled: pickCtxBase.anonymousIdenticonEnabled,
      anonymousIdenticonDataUrl: resolveAnonymousIdenticon(uidRaw)
    };
    const row = buildStoryUserLaneCandidateRow(e, i, httpFromGrowth, pickCtx);
    if (!row) continue;

    // popup の diag(strongNick/personalThumb 件数)再現用。元 popup-entry は row の後に
    //   同じ引数で explainSupportGridDisplayTier を呼んでいた(挙動1mm不変)。
    const ex = explainSupportGridDisplayTier({
      userId: uidRaw,
      nickname: String(e?.nickname || ''),
      httpAvatarCandidate: row.httpForLane,
      storedAvatarUrl: String(e?.avatarUrl || ''),
      avatarObserved: Boolean(e?.avatarObserved)
    });
    if (onTierExplain) {
      onTierExplain(ex, row.profileTier);
    }
    candidates.push({
      entryIndex: row.entryIndex,
      profileTier: row.profileTier,
      thumbScore: row.thumbScore,
      displaySrc: row.displaySrc,
      httpForLane: row.httpForLane,
      entry: /** @type {Record<string, unknown>} */ (row.entry),
      tierExplain: { strongNick: ex.strongNick, hasPersonalThumb: ex.hasPersonalThumb }
    });
  }

  candidates.sort((a, b) => {
    if (b.profileTier !== a.profileTier) return b.profileTier - a.profileTier;
    if (b.thumbScore !== a.thumbScore) return b.thumbScore - a.thumbScore;
    const ua = String(a.entry?.userId || '').trim();
    const ub = String(b.entry?.userId || '').trim();
    const ra = laneUidSortRank(ua);
    const rb = laneUidSortRank(ub);
    if (ra !== rb) return ra - rb;
    if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;
    return b.entryIndex - a.entryIndex;
  });

  return candidates;
}

/**
 * bucket/整列済みの候補(picked)を、元の集約候補(aggList)の順に並べ替えて返す。
 *
 * 会場で席 row を作るときに使う: picked(popup と同じ顔ぶれ・順序)の userId をキーに、
 * 元の集約候補(commentCount/giftCount/_laneSortAt を持つ=VIP/常連/着席順/吹き出しの演出に必要)を
 * 引いて返す。これで「並ぶ人・順序は popup と一致」「席の演出データは元のまま」を両立する。
 *
 * ★退化防止: 元候補が見つかればそれ(演出データ付き)を、無ければ picked の entry をフォールバック。
 * picked は aggList 由来なので通常は必ずヒットする(フォールバックは contract 破れの保険)。
 *
 * @param {ReadonlyArray<{ entry?: { userId?: unknown } }>} picked bucket→flatten 済み候補
 * @param {readonly unknown[]} aggList 元の集約候補(userId 付き・演出データ持ち)
 * @returns {unknown[]} picked の順で、元の集約候補(無ければ picked.entry)を並べた配列
 */
export function orderVenueAggsByPickedCandidates(picked, aggList) {
  const list = Array.isArray(aggList) ? aggList : [];
  const byUid = new Map();
  for (const c of list) {
    const uid = String(/** @type {{ userId?: unknown }} */ (c)?.userId || '').trim();
    if (uid && !byUid.has(uid)) byUid.set(uid, c);
  }
  const pickedList = Array.isArray(picked) ? picked : [];
  /** @type {unknown[]} */
  const out = [];
  for (const p of pickedList) {
    const uid = String(/** @type {{ entry?: { userId?: unknown } }} */ (p)?.entry?.userId || '').trim();
    const agg = byUid.get(uid);
    const row = agg !== undefined ? agg : /** @type {{ entry?: unknown }} */ (p)?.entry;
    if (row) out.push(row);
  }
  return out;
}
