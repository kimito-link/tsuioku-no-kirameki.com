import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';
import { anonymousDisplayLabel } from './nicoUserPage.js';
import { storyUserLaneMetaLines } from './storyUserLaneMeta.js';
import { bucketStoryUserLanePicks } from './storyUserLaneBuckets.js';
import { compareStoryUserLaneCandidates } from './storyUserLaneSort.js';
import { supportGridDisplayTier } from './supportGridDisplayTier.js';
import {
  isAnonymousStyleNicoUserId,
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
  userLaneResolvedThumbScore
} from './supportGrowthTileSrc.js';
import { deriveNicoUserIconUrl } from './venueSeats.js';
// v0.1.1117 白円根治(P3・reference_venue_pop_copy_SYNTHESIS.md §C-2): displaySrc の導出を
//   ①POP の正本チェーン(resolveStoryLaneAvatarSrc→buildStoryUserLaneCandidateRow)へ委譲する。
import { buildStoryUserLaneCandidateRow } from './storyUserLaneRowModel.js';
import { resolveStoryLaneAvatarSrc } from './storyLaneAvatarSrc.js';

const TIER_PROFILE = { link: 3, konta: 2, tanu: 1 };

/**
 * 会場座席の participant を、応援レーンDOMが描ける item へ変換する。
 * 配信者ID未確定時でもここでは数値ID候補を落とさない。席資格の正本は venueSeats.js であり、
 * 会場は「アクティブユーザーは全員着席」の哲学を保つ。
 *
 * v0.1.1117 白円根治(P3): displaySrc は①正本(buildStoryUserLaneCandidateRow)へ委譲する。
 *   旧実装は推測URL(deriveNicoUserIconUrl)を無フィルタで displaySrc に直入れし、①と違う
 *   (短いIDでは必ず404の)URLやプローブ未成功の blank.jpg 白円を生んでいた(実配信スクショの真因)。
 *   委譲後は①と同じ規則: 匿名(a:系)=identicon / 個人サムネ既知=実URL(取り違えガード込み) /
 *   数値ID未解決=①と同一の合成URL(404時は①と同じ tv-fallback 様式=パリティ上「正」)。
 *   ★_venueIsVip だけは旧式据え置き(このpatchで金縁の顔ぶれを変えない=1変更1patch)。
 *
 * @param {{ seatIndex?: number, participant?: { key?: string, userId?: string, name?: string, avatar?: string, lastAt?: number }, venueRank?: number }} seatEntry
 * @param {{ fallbackLabel?: string,
 *           pickCtx?: { yukkuriSrc?: string, tvSrc?: string, anonymousIdenticonEnabled?: boolean } }} [opts]
 *   - pickCtx: ①の lanePickCtx 相当(拡張アセットURL等)。lib既定は①既定と同値
 *     (tvSrc=blank.jpg・identicon有効)=呼び出し側が渡し忘れても匿名の顔が崩れない(地雷#3の構造防止)。
 * @returns {null | {
 *   entryIndex: number,
 *   profileTier: number,
 *   thumbScore: number,
 *   displaySrc: string,
 *   title: string,
 *   entry: { userId: string },
 *   meta: { idLine: string, nameLine: string },
 *   _venueSeatIndex: number,
 *   _venueParticipantKey: string,
 *   _venueRank: number,
 *   _venueIsVip: boolean,
 *   _venueSpeakerKey: string,
 *   _venueAvatarUrl: string,
 *   _venueRawName: string
 * }}
 */
export function venueSeatEntryToLaneItem(seatEntry, opts = {}) {
  if (!seatEntry || typeof seatEntry !== 'object') return null;
  const participant = seatEntry.participant && typeof seatEntry.participant === 'object'
    ? seatEntry.participant
    : null;
  if (!participant) return null;

  const uid = String(participant.userId || '').trim();
  const key = String(participant.key || (uid ? `u:${uid}` : '')).trim();
  if (!uid && !key) return null;

  const seatIndex = Math.max(0, Math.floor(Number(seatEntry.seatIndex) || 0));
  const fallbackLabel = String(opts.fallbackLabel || `会場${seatIndex + 1}`);
  const rawName = String(participant.name || '').trim();
  const displayName =
    rawName || (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(key || fallbackLabel));
  const avatarUrl = String(participant.avatar || '').trim();
  const entryIndex = Number.isFinite(Number(participant.lastAt))
    ? Math.max(0, Math.floor(Number(participant.lastAt)))
    : seatIndex;

  // --- ①正本への委譲(uid 持ちのみ。①も uid 無しはレーン候補にならない) ---
  const pickCtxIn = opts.pickCtx && typeof opts.pickCtx === 'object' ? opts.pickCtx : {};
  const entryModel = { userId: uid, nickname: rawName, avatarUrl };
  /** @type {ReturnType<typeof buildStoryUserLaneCandidateRow>} */
  let row = null;
  if (uid) {
    try {
      row = buildStoryUserLaneCandidateRow(
        entryModel,
        entryIndex,
        // ①の storyGrowthAvatarSrcCandidate 相当。会場は popup 固有 state(watchMeta/own判定/
        //   remembered)を持たないため snapshot=null/own=false/remembered='' で渡す
        //   =avatar 取り違えガードだけ①と同じ経路を通す(enrich 済み participant.avatar が入力)。
        //
        //   ★avatar-stability-DESIGN.md §A 裁定(2026-07-18・意図的・未実装の穴ではない):
        //   rememberedAvatar='' は popup の rememberedAvatarUrlForUserId の【第2分岐】
        //   (STORY_SOURCE_STATE.entries 逆順走査=popup 専用のメモリ上生コメント配列)相当を
        //   「埋めない」という確定裁定。第1分岐(profileCache)相当は entryModel.avatarUrl 経由で
        //   既に enrichVenueRowsWithProfileAvatars(venueAvatar.js)がカバー済みなので、
        //   ここで欠けているのは第2分岐の狭い残余窓だけ(白丸ではなく UID 合成 URL に落ちる)。
        //   会場に生 entries 配列相当の新 state を持たせるコストに見合わないため埋めない。
        //   再裁定条件: popup 側 avatarRememberedDiag.hitEntriesScan の実配信比率が無視できない
        //   (目安1%超)なら再検討(avatar-stability-DESIGN.md §A/§E 参照)。
        resolveStoryLaneAvatarSrc(entryModel, { snapshot: null, isOwnPosted: false, rememberedAvatar: '' }),
        {
          yukkuriSrc: String(pickCtxIn.yukkuriSrc || ''),
          tvSrc: String(pickCtxIn.tvSrc || NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS),
          anonymousIdenticonEnabled: pickCtxIn.anonymousIdenticonEnabled !== false,
          // ①の getCachedAnonymousIdenticonDataUrl と同条件(匿名系IDのみ生成)。
          anonymousIdenticonDataUrl: isAnonymousStyleNicoUserId(uid) ? anonymousIdenticonDataUrl(uid) : ''
        }
      );
    } catch {
      row = null; // 導出失敗でも席は落とさない(会場は「全員着席」哲学)
    }
  }
  const httpForLane = row ? String(row.httpForLane || '') : '';
  const displaySrc = row
    ? row.displaySrc
    : uid
      ? anonymousIdenticonDataUrl(uid, 64)
      : anonymousIdenticonDataUrl(key || fallbackLabel, 64);
  // 旧式の推測URL(deriveNicoUserIconUrl)は displaySrc からは撤去。VIP判定(金縁の顔ぶれ)と
  //   委譲失敗時の thumbScore だけ旧式のまま=このpatchの挙動変更を displaySrc に閉じる。
  const legacyHttpAvatar = avatarUrl || deriveNicoUserIconUrl(uid);
  const legacyTierName = supportGridDisplayTier({
    userId: uid,
    nickname: rawName,
    httpAvatarCandidate: legacyHttpAvatar,
    storedAvatarUrl: avatarUrl,
    avatarObserved: false
  });
  const meta = storyUserLaneMetaLines({ userId: uid, nickname: rawName }, httpForLane, key);
  const speakerKey = uid ? `u:${uid}` : rawName ? `n:${rawName}` : '';

  return {
    entryIndex,
    profileTier: row ? row.profileTier : TIER_PROFILE[legacyTierName] || 1,
    thumbScore: row ? row.thumbScore : userLaneResolvedThumbScore(uid, legacyHttpAvatar),
    displaySrc,
    title: displayName,
    entry: { userId: uid },
    meta,
    _venueSeatIndex: seatIndex,
    _venueParticipantKey: key,
    _venueRank: Math.max(0, Math.floor(Number(seatEntry.venueRank) || 0)),
    _venueIsVip: Boolean(legacyHttpAvatar),
    _venueSpeakerKey: speakerKey,
    _venueAvatarUrl: avatarUrl,
    _venueRawName: rawName
  };
}

/**
 * v0.1.1138(2026-07-14 会場独自受け皿の撤去): 段(5段)には常に①と同じ判定基準を適用し、
 *   uid 無しは段から除外する(会場独自の受け皿は持たない=①と完全に同じ顔ぶれだけを描く)。
 *   境界は【ID種別のみ】で機械判定(表示名は使わない=enrich後着で籍が揺れる churn 源を作らない)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★v0.1.1375: 【匿名系IDの除外を撤回】。会場が「りんくのみ」になる真因だった。
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ■ ユーザー実機(2026-08-12)
 *   「会場モードが りんくのみで こん太 たぬ姉が反映されてない」
 *   速報の会場行も `link7 gift0 ad4 konta0 tanu332` と konta0 を示していた。
 *
 * ■ 真因: 旧実装は bucket に渡す【前】に匿名系IDを全除外していた。
 *   ところが段の正本 `src/domain/lane/tier.js` は **匿名を必ず たぬ姉段(tier1)に置く**
 *   のが契約(`matchesTanuPolicy` が最優先で評価される=たぬ姉段の存在理由そのもの)。
 *   ＝会場だけが「たぬ姉段に入るはずの人」を消していたので、
 *   たぬ姉段が空になり、結果として りんく段しか見えなかった。
 *
 * ■ なぜ「①と同じ」の意図に反していたか
 *   ①POP(popup-entry.js:6957)は候補をそのまま bucketStoryUserLanePicks に渡し、
 *   **匿名を除外していない**。つまり旧実装のこの行こそが【会場独自のルール】で、
 *   コメントが掲げた「①と完全に同じ顔ぶれ」を自分で破っていた。
 *   ★uid 無しの除外(tier=0)は正本と一致するので**維持**する。
 *
 * ★[[venue-equals-lane-same-layout]] / [[venue-mirror-is-the-primary-path-2026-08-01]]:
 *   会場は①の鏡。①に無いフィルタを会場側に足すと必ず顔ぶれがズレる。
 *
 * @param {Array<{ seatIndex?: number, participant?: object, venueRank?: number }>} seatEntries
 * @param {{ maxTotal?: number, pickCtx?: { yukkuriSrc?: string, tvSrc?: string, anonymousIdenticonEnabled?: boolean } }} [opts]
 * @returns {{ link: any[], gift: any[], ad: any[], konta: any[], tanu: any[] }}
 */
export function bucketVenueLaneSeats(seatEntries, opts = {}) {
  const list = Array.isArray(seatEntries) ? seatEntries : [];
  const maxTotal = Number.isFinite(Number(opts.maxTotal))
    ? Math.max(0, Math.floor(Number(opts.maxTotal)))
    : list.length;
  const candidates = list
    .map((entry) => venueSeatEntryToLaneItem(entry, { pickCtx: opts.pickCtx }))
    .filter(Boolean)
    .sort(compareStoryUserLaneCandidates);
  /*
   * ★v0.1.1375: uid 無し【だけ】を落とす(匿名系IDは落とさない)。
   *   uid 無しは正本 resolveLaneTier でも tier=0(候補除外)なので①と一致する。
   *   匿名系IDは正本では tier=1(たぬ姉段)＝落としてはいけない。
   */
  const laneCands = candidates.filter((it) => String(it?.entry?.userId || '').trim() !== '');
  const b = bucketStoryUserLanePicks(laneCands, maxTotal);
  return { link: b.link, gift: [], ad: [], konta: b.konta, tanu: b.tanu };
}

/**
 * @param {{ link: any[], gift?: any[], ad?: any[], konta: any[], tanu: any[] }} buckets
 * @returns {any[]}
 */
export function flattenVenueLaneBuckets(buckets) {
  return [
    ...(Array.isArray(buckets.link) ? buckets.link : []),
    ...(Array.isArray(buckets.gift) ? buckets.gift : []),
    ...(Array.isArray(buckets.ad) ? buckets.ad : []),
    ...(Array.isArray(buckets.konta) ? buckets.konta : []),
    ...(Array.isArray(buckets.tanu) ? buckets.tanu : [])
  ];
}
