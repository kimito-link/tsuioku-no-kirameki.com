/**
 * 応援レーン(アイコン列)のタイル画像 URL 解決（state 注入型の純関数）。
 *
 * 元は popup-entry.js の `storyGrowthAvatarSrcCandidate`(クロージャで watchMetaCache/
 * STORY_SOURCE_STATE/rememberedAvatarUrlForUserId に依存)。会場(venueBar.js)でも popup と
 * 【完全に同じ顔ぶれ・同じ順序】を出すために、popup 固有 state への依存を引数(ctx)へ追い出して
 * 純関数化した。profileTier(りんく/こん太/たぬ姉 の振り分け)は httpForLane(=この関数の結果)に
 * 依存する(storyUserLaneRowModel.js)ので、avatar 解決を popup と会場で揃えないと順序がズレる。
 *
 * ★挙動は popup-entry.js の原実装と1mm 不変(characterization test で保証)。own-posted 判定と
 *   remembered avatar は呼び出し側が計算して渡す(それぞれ entries/profileMap 依存=呼び出し側の
 *   state なので注入する)。
 */
import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';
import { isSameAvatarUrl } from './avatarUrlCompare.js';
import {
  isAvatarUrlForUserId,
  shouldAssociateAvatarWithUser
} from './avatarBroadcasterGuard.js';
import { resolveSupportGrowthTileSrc } from './supportGrowthTileSrc.js';

/**
 * @typedef {{
 *   broadcasterUserId?: string,
 *   broadcasterIconUrl?: string,
 *   viewerAvatarUrl?: string,
 *   viewerUserId?: string
 * }} StoryLaneAvatarSnapshot
 */
// v0.1.1142(gift-lane-thumb-own-posted-mismatch根治): INV-1のみ意図的に加法拡張。
//   entry.userId が snapshot.viewerUserId と等値なら own=true(呼び出し側の isOwnPosted が
//   false でも)。呼び出し側の own-posted 集合(コメント照合)が不完全(ギフトのみ投げてコメント
//   未投稿等)でも、本人の正当なサムネ解決を誤帰属防止ガードが握り潰さないための最後の砦。
//   false→true 方向にしか動かない(加法のみ)ので、viewerUserId 未注入の既存呼び出しは挙動不変。

/**
 * @param {{ userId?: unknown, avatarUrl?: unknown }|null|undefined} entry
 * @param {{
 *   snapshot: StoryLaneAvatarSnapshot|null|undefined,
 *   isOwnPosted: boolean,
 *   rememberedAvatar: string
 * }} ctx
 *   - snapshot: watch メタ(配信者/視聴者の uid・iconUrl・avatarUrl)。popup は watchMetaCache.snapshot。
 *   - isOwnPosted: この entry が自分の投稿か(呼び出し側が entries で判定して渡す)。
 *   - rememberedAvatar: この userId の記憶済み avatar URL(呼び出し側が profileMap/entries で解決して渡す)。
 * @returns {string} 解決した http(s) URL。解決不能なら ''。
 */
export function resolveStoryLaneAvatarSrc(entry, ctx) {
  const snap = ctx?.snapshot;
  const bc = String(snap?.broadcasterUserId || '').trim();
  const broadcasterIconUrl = String(snap?.broadcasterIconUrl || '').trim();
  const entUid = String(entry?.userId || '').trim();
  const viewerUid = String(snap?.viewerUserId || '').trim();
  const own =
    ctx?.isOwnPosted === true || Boolean(viewerUid && entUid && entUid === viewerUid);
  const guardedRememberedSource = String(ctx?.rememberedAvatar ?? '').trim();
  const avatarUrl = String(entry?.avatarUrl || '').trim();
  const viewerAvatarUrl = String(snap?.viewerAvatarUrl || '').trim();
  const mistakenBroadcaster =
    !own && Boolean(bc && entUid && bc === entUid);

  // 0.1.81/0.1.83: avatar 取り違えガード
  //   - 0.1.83 普遍ルール: URL 埋め込み uid とエントリ uid の不一致は必ず弾く
  //   - 0.1.81 broadcaster ガード: 上記で uid 抽出不能だった場合の補助
  /** @param {string} av */
  const guardAv = (av) => {
    if (!av) return '';
    if (!isAvatarUrlForUserId(av, entUid)) return '';
    return shouldAssociateAvatarWithUser({
      uid: entUid,
      av,
      broadcasterUid: bc,
      broadcasterIconUrl
    })
      ? av
      : '';
  };
  const guardedRememberedAvatar = guardAv(guardedRememberedSource);
  const guardedAvatarUrl = guardAv(avatarUrl);

  const fallbackAvatar =
    mistakenBroadcaster ||
    (viewerAvatarUrl && isSameAvatarUrl(guardedAvatarUrl, viewerAvatarUrl) && !own)
      ? ''
      : guardedRememberedAvatar;
  const effectiveAvatar =
    viewerAvatarUrl && isSameAvatarUrl(guardedAvatarUrl, viewerAvatarUrl) && !own
      ? ''
      : guardedAvatarUrl;
  // 元実装は `entry?.userId ?? null`(undefined/null のみ null・空文字 '' はそのまま)。
  //   1mm 不変のため空文字も保つ。userId が string でなければ null に倒す(型安全)。
  const rawUserId = entry?.userId;
  const userIdForResolve =
    typeof rawUserId === 'string' ? rawUserId : rawUserId == null ? null : String(rawUserId);
  const src = resolveSupportGrowthTileSrc({
    entryAvatarUrl: effectiveAvatar || fallbackAvatar,
    userId: mistakenBroadcaster ? null : userIdForResolve,
    isOwnPosted: own,
    viewerAvatarUrl: snap?.viewerAvatarUrl,
    defaultSrc: ''
  });
  return isHttpOrHttpsUrl(src) ? src : '';
}
