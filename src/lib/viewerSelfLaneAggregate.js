// viewerSelfLaneAggregate.js
// v0.1.775: popup の応援アイコン列(りんく段)に「自分(視聴者)」を出すための合成集約。
//
// 背景(ユーザー): 自分のコメントはコメビュ/コメントレーンには出るが、アイコン列に出ない。
//   ニコ生では自分のコメントは匿名(184 / a:HASH / userId 空)で流れるため、userId で集約する
//   アイコン列の「数値ID＋個人サムネ」条件を満たさず、集約自体が作られない。一方、拡張は
//   ログイン中の視聴者プロフィール(viewerUserId=数値 / viewerAvatarUrl=個人アイコン / viewerNickname)
//   を watch ページから取得済み。これを使って自分用の合成集約を1件足し、自分をアイコン列に出す。
//   会場(venue)では匿名席として既に並ぶが、こちらは「自分」を実 ID/アイコンで明示する。
//
// 安全:
//   - 数値 viewerUserId と個人 viewerAvatarUrl が両方揃うときだけ作る(でないと匿名段に落ちる)。
//   - 「この配信で自分が実際に投稿した(own-posted)」ときだけ出す(投稿してないのに自分を出さない)。
//   - 既に同 userId の集約があれば重複させず、アイコン/observed を補強してそれを返す。
//   - contamination guard は isOwnPosted=true を除外しないので、viewerUserId を own-posted 集合へ
//     入れる前提(呼び出し側が ownPostedUidSet に追加する)。本関数は集約の生成/マージだけを担う。

/**
 * @typedef {{ userId: string, nickname: string, avatarUrl: string, avatarObserved: boolean,
 *   liveId: string, commentCount: number, giftCount: number, _laneSortAt: number }} LaneAggregate
 */

/**
 * 数値ユーザーID(5〜14桁)か。
 * @param {string} uid
 */
function isNumericUserId(uid) {
  return /^\d{5,14}$/.test(uid);
}

/**
 * 視聴者(自分)の合成集約を必要なら足した集約配列を返す純関数。
 *
 * @param {ReadonlyArray<LaneAggregate>|null|undefined} aggregates 既存のレーン集約
 * @param {{
 *   viewerUserId?: unknown,
 *   viewerNickname?: unknown,
 *   viewerAvatarUrl?: unknown,
 *   liveId?: unknown,
 *   ownPostedCount?: unknown,   // この配信で自分が投稿した件数(>0 のときだけ出す)
 *   nowMs?: unknown,            // 並び順用の最新時刻(最前面寄りに出すため大きめ)
 *   isHttpUrl?: (u: string) => boolean  // http(s) 判定(呼び出し側の実装を注入)
 * }} opts
 * @returns {{ aggregates: ReadonlyArray<LaneAggregate>, viewerUserId: string, injected: boolean }}
 *   aggregates: 合成済み配列(変更不要なら入力をそのまま) /
 *   viewerUserId: own-posted 集合に足すべき自分の uid(injected/merged 時のみ非空) /
 *   injected: 自分の集約を新規追加または補強したか。
 */
export function appendViewerSelfLaneAggregate(aggregates, opts) {
  const list = Array.isArray(aggregates) ? aggregates : [];
  const uid = String(opts?.viewerUserId ?? '').trim();
  const avatar = String(opts?.viewerAvatarUrl ?? '').trim();
  const nickname = String(opts?.viewerNickname ?? '').trim();
  const lid = String(opts?.liveId ?? '').trim();
  const ownPostedCount = Number(opts?.ownPostedCount) || 0;
  const isHttpUrl = typeof opts?.isHttpUrl === 'function' ? opts.isHttpUrl : (/** @type {string} */ u) => /^https?:\/\//i.test(String(u || ''));
  const nowMs = Number(opts?.nowMs) || 0;

  // 数値ID + 個人アイコン + 自分が投稿済み、の3条件が揃わなければ何もしない(匿名段に委ねる)。
  if (!uid || !isNumericUserId(uid) || !avatar || !isHttpUrl(avatar) || ownPostedCount <= 0) {
    return { aggregates: list, viewerUserId: '', injected: false };
  }

  const idx = list.findIndex((a) => String(a?.userId ?? '').trim() === uid);
  if (idx >= 0) {
    // 既に自分の集約がある(数値IDで観測できた稀ケース): アイコン/observed を補強して返す。
    const existing = list[idx];
    const merged = {
      ...existing,
      userId: uid,
      nickname: nickname || String(existing?.nickname ?? ''),
      avatarUrl: isHttpUrl(String(existing?.avatarUrl ?? '')) ? existing.avatarUrl : avatar,
      avatarObserved: true
    };
    const next = list.slice();
    next[idx] = merged;
    return { aggregates: next, viewerUserId: uid, injected: true };
  }

  /** @type {LaneAggregate} */
  const self = {
    userId: uid,
    nickname,
    avatarUrl: avatar,
    avatarObserved: true,
    liveId: lid,
    commentCount: ownPostedCount,
    giftCount: 0,
    // 自分は最前面寄りに出したいので最新時刻を入れる(レーンは _laneSortAt 降順)。
    _laneSortAt: nowMs > 0 ? nowMs : Number.MAX_SAFE_INTEGER
  };
  // 先頭に足す(降順ソート前提だが、同点時も自分が前に来るよう先頭)。
  return { aggregates: [self, ...list], viewerUserId: uid, injected: true };
}
