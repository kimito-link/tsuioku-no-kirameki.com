// broadcastContext.js
// v0.1.793: 「この配信の配信者(broadcaster)情報」を 1 か所で型定義し、storage キー・
//   正規化・空値を一元管理する純関数モジュール。
//
// 動機(実バグ・2026-06-17): 会場モード(venueBar.js)に配信者本人のサムネが「匿名」として
//   混入した。真因は、content-entry.js が DOM 観測で持つ broadcasterUid / broadcasterIconUrl が
//   venueBar.js に【届く経路が無い】こと。venueBar は別バンドルで content のモジュール変数を
//   参照できず、storage にも書かれていなかった=データの流れが途切れていた。
//
//   userLaneCandidatesFromStorage(opts) は broadcasterUid と broadcasterIconUrl を【両方】渡すと
//   broadcasterGuard が有効になり「配信者アイコンが付いた viewer 行」を弾く。だが venueBar は
//   その2値を知らないため guard が常に無効だった。
//
// 解決(会議4役一致+司令塔裏取り): content-entry.js が broadcaster 情報を storage に書き、
//   venueBar.js / popup などが storage から読む「1 経路」にする。inline も standalone(venue.html)も
//   storage 経由なら同じく読める(options で渡す案は standalone で content が動かず届かない)。
//
// このモジュールは I/O を持たない純関数。storage の get/set は呼び出し側が行う。

/** broadcaster コンテキストの storage キー(local only・PII は uid/iconUrl のみで公開情報)。 */
export const KEY_LIVE_BROADCASTER_CTX = 'nls_live_broadcaster_ctx_v1';

/**
 * @typedef {Object} BroadcasterCtx
 * @property {string} uid       配信者の数値 userId(未取得は '')
 * @property {string} iconUrl   配信者アイコン URL(未取得は '')
 * @property {string} liveId    この ctx が属する配信 ID(lv...・別配信の取り違え防止)
 * @property {number} updatedAt 書き込み時刻(epoch ms・鮮度判定用・0 は未設定)
 */

/**
 * 空の broadcaster コンテキストを返す。
 * @returns {BroadcasterCtx}
 */
export function emptyBroadcasterCtx() {
  return { uid: '', iconUrl: '', liveId: '', updatedAt: 0 };
}

/**
 * storage から読んだ raw 値を安全な BroadcasterCtx に正規化する純関数。
 * null/型違い/欠損フィールドは空値へ倒す(consumer 側で雑に使っても落ちない)。
 * @param {unknown} raw
 * @returns {BroadcasterCtx}
 */
export function normalizeBroadcasterCtx(raw) {
  if (!raw || typeof raw !== 'object') return emptyBroadcasterCtx();
  const o = /** @type {Record<string, unknown>} */ (raw);
  const updatedAtNum = Number(o.updatedAt);
  return {
    uid: String(o.uid ?? '').trim(),
    iconUrl: String(o.iconUrl ?? '').trim(),
    liveId: String(o.liveId ?? '').trim(),
    updatedAt: Number.isFinite(updatedAtNum) && updatedAtNum > 0 ? updatedAtNum : 0
  };
}

/**
 * content-entry.js が storage に書く前の値を組み立てる純関数。
 * uid/iconUrl のどちらも空なら null を返す(空 ctx を書いて consumer を惑わせない)。
 * @param {{ uid?: string, iconUrl?: string, liveId?: string, nowMs?: number }} input
 * @returns {BroadcasterCtx|null}
 */
export function buildBroadcasterCtxForWrite(input) {
  const uid = String(input?.uid ?? '').trim();
  const iconUrl = String(input?.iconUrl ?? '').trim();
  const liveId = String(input?.liveId ?? '').trim();
  if (!uid && !iconUrl) return null;
  const nowMs = Number(input?.nowMs);
  return {
    uid,
    iconUrl,
    liveId,
    updatedAt: Number.isFinite(nowMs) && nowMs > 0 ? nowMs : 0
  };
}

/**
 * 読んだ ctx が「現在の配信のものとして使える」かを判定する純関数。
 * 別配信の古い ctx を誤って使わないよう liveId 一致を要求する(liveId 未指定の ctx は
 * 後方互換で許容=昔の書き込み)。userLaneCandidatesFromStorage に渡すのは uid+iconUrl が
 * 両方そろっているときだけ(片方では guard が無効=渡す意味がない)。
 * @param {BroadcasterCtx} ctx
 * @param {string} currentLiveId
 * @returns {boolean} guard を有効化できるか(uid+iconUrl 両方あり & 配信一致)
 */
export function isBroadcasterCtxUsableForGuard(ctx, currentLiveId) {
  if (!ctx || !ctx.uid || !ctx.iconUrl) return false;
  const cur = String(currentLiveId ?? '').trim().toLowerCase();
  const own = String(ctx.liveId ?? '').trim().toLowerCase();
  // ctx.liveId が空(旧データ)なら配信判定を諦めて許容。両方あるなら一致を要求。
  if (cur && own && cur !== own) return false;
  return true;
}
