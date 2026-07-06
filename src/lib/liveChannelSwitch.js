/**
 * liveChannelSwitch.js
 *
 * 「別の配信へ移動(SPA遷移)するとパネルが壊れる」問題の修正(2026-07-06)。
 *
 * 背景: ニコ生の watch→watch は SPA 遷移(ページリロードなし)。従来は content-entry.js が
 *   SPA 遷移(lv 変化)を検知するたびに、インラインパネル iframe の src に新しい `lv=` を
 *   焼き込み直して `iframe.setAttribute('src', ...)` していた。これは同一 iframe でも
 *   ブラウザに完全なドキュメント再読み込みを起こさせ、
 *     (a) popup-entry.js の全モジュール state が初期化され、送信ボタンが一瞬「watch ページ
 *         なし」判定(灰色)に戻る
 *     (b) 初回ロード同様のローディング演出+全件 storage 読み直しが走る
 *         (ユーザー確立ルール「切替時に前回状態を破棄して全件取得し直すのは禁止」に違反)
 *   という 2 つの実害を生んでいた。
 *
 * 修正方針: iframe を作り直さず、既存の即時プッシュチャネル(instantCommentPush.js)と同じ
 *   nonce 機構で `NLS_LIVE_CHANNEL_SWITCH { lv, nonce }` を postMessage する。popup-entry.js は
 *   受信したら INLINE_OWN_WATCH_URL 相当の内部状態だけを新 lv へ更新し、per-live キャッシュを
 *   リセットしてから軽量な再描画(既存 refresh() の非初回パス=ローディング幕なし)に乗る。
 *
 * 副作用なし、純関数のみ(postMessage 送受信自体は content-entry.js / popup-entry.js 側)。
 */

/** postMessage の type 文字列(content→iframe 直送・storage 非経由)。 */
export const NLS_LIVE_CHANNEL_SWITCH_TYPE = 'NLS_LIVE_CHANNEL_SWITCH';

/**
 * 受信メッセージが「自分宛の配信切替通知」として妥当かを検証する。
 *   nonce は instantCommentPush.js と同じ値(iframe src の `pn=`)を共用する
 *   (同一 iframe 内で完結する経路という性質が同じため、専用 nonce を別途持つ必要がない)。
 * @param {{ data?: unknown }|null|undefined} eventLike window 'message' イベント相当
 * @param {string} expectedNonce iframe src の `pn=` から読んだ自分の nonce
 * @returns {boolean}
 */
export function isLiveChannelSwitchMessageValid(eventLike, expectedNonce) {
  if (!expectedNonce) return false;
  if (!eventLike || !eventLike.data || typeof eventLike.data !== 'object') return false;
  const d = /** @type {{ type?: unknown, nonce?: unknown, lv?: unknown }} */ (eventLike.data);
  if (d.type !== NLS_LIVE_CHANNEL_SWITCH_TYPE) return false;
  if (typeof d.nonce !== 'string' || d.nonce !== expectedNonce) return false;
  return typeof d.lv === 'string' && /^lv\d{1,15}$/.test(d.lv);
}

/**
 * 受信メッセージから正規化済みの lv を取り出す(妥当性は呼び出し側で
 * isLiveChannelSwitchMessageValid 済みである前提だが、防御的に再チェックする)。
 * @param {{ data?: { lv?: unknown } }|null|undefined} eventLike
 * @returns {string} 妥当な lv 文字列、不正なら空文字
 */
export function extractSwitchedLiveIdFromMessage(eventLike) {
  const lv = String(eventLike?.data?.lv || '')
    .trim()
    .toLowerCase();
  return /^lv\d{1,15}$/.test(lv) ? lv : '';
}

/**
 * content-entry.js 側で postMessage する payload を組み立てる純関数。
 * @param {string} lv 切替後の lv(`lv12345` 形式)
 * @param {string} nonce iframe src の `pn=` と同じ値
 * @returns {{ type: string, lv: string, nonce: string, sentAt: number }|null} 不正な lv は null
 */
export function buildLiveChannelSwitchPayload(lv, nonce) {
  const norm = String(lv || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(norm)) return null;
  if (!nonce) return null;
  return {
    type: NLS_LIVE_CHANNEL_SWITCH_TYPE,
    lv: norm,
    nonce: String(nonce),
    sentAt: Date.now()
  };
}
