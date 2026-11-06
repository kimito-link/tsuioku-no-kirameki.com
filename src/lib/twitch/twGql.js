// twGql.js — twitch.tv の画面自身が使っている GQL の応答を「形から検証して」読む(純関数)
// @layer L0 — 純粋計算(fetch は呼び出し側)
//
// ★IRC には「配信の番号・開始時刻・同接・顔の画像」が無い。twitch.tv の視聴ページ自身が読んでいる
//   gql.twitch.tv の応答から読む(BetterTTV・7TV など広く使われている拡張と同じ入口)。
//   非公式なので、AGENTS.md §3.6 のとおり形を必ず確かめ、取れなければ null を返す(記録は止めない)。

/** twitch.tv の Web が使う公開の Client-ID(ページの中に平文で書かれている・秘密ではない) */
export const TW_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
export const TW_GQL_URL = 'https://gql.twitch.tv/gql';

/** @param {string} login */
export function buildTwStreamInfoQuery(login) {
  const l = String(login || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return {
    query: `query{user(login:"${l}"){id login displayName profileImageURL(width:70) broadcastSettings{title} stream{id createdAt viewersCount}}}`,
  };
}

/** 上の問い合わせが通らなかったとき(項目名が変わった等)の、いちばん小さい問い合わせ @param {string} login */
export function buildTwStreamInfoMinimalQuery(login) {
  const l = String(login || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return { query: `query{user(login:"${l}"){id login displayName stream{id}}}` };
}

/** @param {string[]} logins 最大 100 人 */
export function buildTwUsersIconQuery(logins) {
  const ls = [...new Set((logins || []).map((x) => String(x || '').toLowerCase()).filter((x) => /^[a-z0-9_]{3,25}$/.test(x)))].slice(0, 100);
  return { query: `query{users(logins:${JSON.stringify(ls)}){login profileImageURL(width:70)}}`, logins: ls };
}

/** 画像 URL は Twitch の CDN だけ受け取る @param {unknown} u */
export function safeTwImageUrl(u) {
  const s = String(u || '');
  if (!/^https:\/\/static-cdn\.jtvnw\.net\//.test(s)) return '';
  // 顔を設定していない人の既定画像(user-default-pictures)は「顔が無い」扱いにする(ゆっくり顔を出す・§3.6 の blank.jpg と同じ教訓)
  if (/\/user-default-pictures/.test(s)) return '';
  return s;
}

/**
 * @param {any} json
 * @returns {null | { userId: string, login: string, displayName: string, iconUrl: string,
 *   live: boolean, streamId: string, startedAtMs: number, viewers: number | null, title: string }}
 */
export function parseTwStreamInfo(json) {
  const u = json?.data?.user;
  if (!u || typeof u !== 'object' || typeof u.login !== 'string') return null;
  const s = u.stream && typeof u.stream === 'object' ? u.stream : null;
  const startedAtMs = s?.createdAt ? Date.parse(String(s.createdAt)) : NaN;
  return {
    userId: String(u.id || ''),
    login: String(u.login).toLowerCase(),
    displayName: String(u.displayName || u.login),
    iconUrl: safeTwImageUrl(u.profileImageURL),
    live: Boolean(s && s.id),
    streamId: s && /^\d{1,20}$/.test(String(s.id)) ? String(s.id) : '',
    startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : 0,
    viewers: s && Number.isFinite(Number(s.viewersCount)) ? Number(s.viewersCount) : null,
    title: String(u.broadcastSettings?.title || ''),
  };
}

/**
 * @param {any} json
 * @returns {Map<string, string>} login → 顔の URL(顔の無い人・壊れた行は入れない)
 */
export function parseTwUsersIcons(json) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const arr = json?.data?.users;
  if (!Array.isArray(arr)) return out;
  for (const u of arr) {
    if (!u || typeof u.login !== 'string') continue; // 退会した人は null で来る
    const url = safeTwImageUrl(u.profileImageURL);
    if (url) out.set(u.login.toLowerCase(), url);
  }
  return out;
}
