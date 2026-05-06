/**
 * v0.1.203 Patch 3: niconico watch ページの `<script id="embedded-data" data-props='{...}'>`
 * から viewer (login user) 情報を抽出する純関数。
 *
 * streamlink / yt-dlp / その他多数の OSS が同じ経路で `user.id` `user.isLoggedIn` 等を
 * 取得しており、niconico 公式 frontend が SSR で必ず埋め込む安定経路。
 *
 * 既存 `watchPageViewerProfile.js` の DOM スコアリングがフロントエンド構造変更で空に
 * なったため、本経路を first-class に昇格させる。DOM スコアリングは fallback として残す。
 *
 * 副作用なし。document も渡しで受け取る。
 */

/**
 * @typedef {{
 *   userId: string,
 *   isLoggedIn: boolean,
 *   isBroadcaster: boolean,
 *   nickname: string
 * }} EmbeddedViewerInfo
 */

const EMPTY_INFO = Object.freeze({
  userId: '',
  isLoggedIn: false,
  isBroadcaster: false,
  nickname: ''
});

/**
 * @param {Document|null|undefined} doc
 * @returns {EmbeddedViewerInfo}
 */
export function parseEmbeddedDataViewerInfo(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return EMPTY_INFO;

  let raw = '';
  try {
    const el = doc.querySelector('script#embedded-data');
    if (!el) return EMPTY_INFO;
    raw = el.getAttribute('data-props') || '';
  } catch {
    return EMPTY_INFO;
  }
  if (!raw) return EMPTY_INFO;

  /** @type {any} */
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_INFO;
  }
  if (!data || typeof data !== 'object') return EMPTY_INFO;

  const user = data.user;
  if (!user || typeof user !== 'object') return EMPTY_INFO;

  const userId =
    typeof user.id === 'string' || typeof user.id === 'number'
      ? String(user.id).trim()
      : '';
  const isLoggedIn = user.isLoggedIn === true;
  const isBroadcaster = user.isBroadcaster === true;
  const nickname =
    typeof user.nickname === 'string' ? user.nickname.slice(0, 80) : '';

  return Object.freeze({
    userId,
    isLoggedIn,
    isBroadcaster,
    nickname
  });
}
