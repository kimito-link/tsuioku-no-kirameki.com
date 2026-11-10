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

// ---- 公式の応援ランキング(Bits・ギフトサブ)----
//   twitch.tv のチャット欄の上に出る順位表。ページ自身は ChannelLeaderboards(登録済みの問い合わせ)で読む。
//   ログインなし・公開の Client-Id だけで読める(2026-11-08 PC 実測・12チャンネルすべて 200)。
//   期間はチャンネルごとに違う(累計・今月・今週・今日)ので、期間も一緒に返す。
//   登録済みの問い合わせの番号(sha256)は Twitch の更新で変わりうるので、通らなければ手書きの問い合わせで読む。
const TW_LEADERBOARDS_HASH = 'b6ac858ea030b53622847fcede494c33405175090ac139300c08c79d00dc239e';

/** @param {string} channelId 数字の id */
export function buildTwLeaderboardsQuery(channelId) {
  const id = String(channelId || '');
  if (!/^\d{1,20}$/.test(id)) return null;
  return {
    operationName: 'ChannelLeaderboards',
    variables: { first: 10, channelID: id, rankContextSize: 2 },
    extensions: { persistedQuery: { version: 1, sha256Hash: TW_LEADERBOARDS_HASH } },
  };
}

/** 登録済みの問い合わせが通らないとき @param {string} login */
export function buildTwLeaderboardsFallbackQuery(login) {
  const l = String(login || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!l) return null;
  const items = 'items{edges{node{rank score user{login displayName}}}}';
  return { query: `query{user(login:"${l}"){channel{leaderboardTimePeriod leaderboardSet(first:10){bits{${items}} subGift{${items}}}}}}` };
}

/** @typedef {'ALLTIME' | 'MONTH' | 'WEEK' | 'DAY'} TwBoardPeriod */
const TW_PERIODS = new Set(['ALLTIME', 'MONTH', 'WEEK', 'DAY']);

/**
 * @param {any} edges
 * @returns {Array<{ rank: number, name: string, login: string, xp: number, iconUrl: string }>}
 */
function twBoardRows(edges) {
  /** @type {Array<{ rank: number, name: string, login: string, xp: number, iconUrl: string }>} */
  const out = [];
  if (!Array.isArray(edges)) return out;
  for (const e of edges.slice(0, 50)) {
    const n = e?.node;
    const login = String(n?.user?.login || '').toLowerCase();
    const score = Number(n?.score);
    // 退会した人(user が null)・数の無い行は捨てる(1行のために全部を捨てない)
    if (!/^[a-z0-9_]{1,25}$/.test(login) || !Number.isFinite(score) || score <= 0) continue;
    out.push({ rank: out.length + 1, name: String(n.user.displayName || login), login, xp: Math.floor(score), iconUrl: '' });
  }
  return out;
}

/**
 * ChannelLeaderboards の応答(配列で来ることもある)→ 期間と Bits・ギフトサブの順位。読めなければ null。
 * @param {any} json
 * @returns {null | { period: TwBoardPeriod, bits: ReturnType<typeof twBoardRows>, subGift: ReturnType<typeof twBoardRows> }}
 */
export function parseTwLeaderboards(json) {
  const one = Array.isArray(json) ? json[0] : json;
  const ch = one?.data?.user?.channel;
  const set = ch?.leaderboardSet;
  if (!ch || typeof ch !== 'object' || !set || typeof set !== 'object') return null;
  const p = String(ch.leaderboardTimePeriod || '').toUpperCase();
  return {
    period: /** @type {TwBoardPeriod} */ (TW_PERIODS.has(p) ? p : 'ALLTIME'),
    bits: twBoardRows(set.bits?.items?.edges),
    subGift: twBoardRows(set.subGift?.items?.edges),
  };
}
