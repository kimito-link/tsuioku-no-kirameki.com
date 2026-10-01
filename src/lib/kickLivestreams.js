/**
 * kickLivestreams.js — Kick 公式 API(v2 livestreams)の応答を「1 配信」の共通形にする純関数。
 *
 * ■ なぜ要るか(2026-10-01・設計 docs/handoff/live-multiplatform-kick-youtube-SPEC.md)
 *   /live/ にニコ生とは【別セクション】で Kick の日本語配信を同時視聴の多い順に並べる。
 *   ニコ生の lives[] とは型も鍵も混ぜない(推定値と実数を同じ順位表にしない・lv 前提の部品に渡さない)。
 *
 * ■ この箱に入るもの: 形の検証・正規化・並べ替え・保存してよいかの判定。I/O(fetch/Redis)は入れない。
 *   ★推定・増分・順位推移(前回比)の部品は import しない。YouTube を同じ型に乗せるとき、
 *     YouTube 規約(自前の指標・順位の推移を作らない)を構造で守るため(テストで固定)。
 *
 * ■ 未確認(実測前に確定扱いしない・SPEC の assumption)
 *   A1 応答は { data: [...] }。A2 配信ページは https://kick.com/<slug>。
 *   A3 thumbnail は文字列 URL か { src }。A4 started_at は ISO 8601。
 *   並び順は docs に「oldest to newest」とある＝同時視聴順はこちらで並べる。
 */
import { safeHttpUrl } from './htmlText.js';
import { toEpochMs } from './timeAuthority.js';

/** @typedef {{ platform:'kick'|'youtube', id:string, url:string, title:string, thumbnail:string,
 *   channel:{ name:string, icon:string, url:string }, viewers:number, startedAt:number,
 *   category:string, mature:boolean, language:string }} PlatformLive */

export const KICK_LIVESTREAMS_URL = 'https://api.kick.com/public/v2/livestreams';
export const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';
export const KICK_LANGUAGE_CODE = 'ja';
export const KICK_PAGE_LIMIT = 100;
/** ★ニコ生の MAX_LIVES(20)と同値。実測前に増やさない。 */
export const KICK_MAX_LIVES = 20;
/** ニコ生 probeWatchPage の title 上限(120)と同値。 */
export const KICK_TITLE_MAX = 120;
/** ニコ生 streamer.name の上限(80)と同値。 */
export const KICK_NAME_MAX = 80;
const KICK_CATEGORY_MAX = 80;
const KICK_LANGUAGE_MAX = 16;
const SLUG_RE = /^[a-z0-9_-]{1,64}$/i;

/**
 * 空白を 1 つに潰して前後を落とし、max 字で切る。
 * @param {unknown} v @param {number} max
 */
function clip(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * @param {unknown} json
 * @returns {boolean} data が配列なら true(包みの形は未確認のため data だけ見る)
 */
export function isLikelyKickLivestreamsShape(json) {
  return !!json && typeof json === 'object' && Array.isArray(/** @type {any} */ (json).data);
}

/**
 * 配信ページ URL。slug が許す形のときだけ組み立てる(それ以外は '')。
 * @param {unknown} slug
 * @returns {string}
 */
export function kickChannelUrl(slug) {
  const s = String(slug == null ? '' : slug).trim();
  return SLUG_RE.test(s) ? `https://kick.com/${s}` : '';
}

/**
 * 1 件を PlatformLive に。id か配信ページ URL が作れなければ null(その 1 件だけ捨てる)。
 * @param {unknown} raw
 * @returns {PlatformLive|null}
 */
export function normalizeKickLivestream(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {any} */ (raw);
  const id = r.id == null ? '' : String(r.id).trim();
  if (!id) return null;
  const url = kickChannelUrl(r.channel && typeof r.channel === 'object' ? r.channel.slug : '');
  if (!url) return null;
  const thumbSrc = r.thumbnail && typeof r.thumbnail === 'object' ? r.thumbnail.src : r.thumbnail;
  const user = r.broadcaster_user && typeof r.broadcaster_user === 'object' ? r.broadcaster_user : {};
  const vc = Number(r.viewer_count);
  return {
    platform: 'kick',
    id,
    url,
    title: clip(r.title, KICK_TITLE_MAX),
    thumbnail: safeHttpUrl(thumbSrc),
    channel: { name: clip(user.username, KICK_NAME_MAX), icon: safeHttpUrl(user.profile_picture), url },
    viewers: Number.isFinite(vc) && vc > 0 ? Math.floor(vc) : 0,
    startedAt: toEpochMs(r.started_at) || 0,
    category: clip(r.category && typeof r.category === 'object' ? r.category.name : '', KICK_CATEGORY_MAX),
    mature: r.has_mature_content === true,
    language: clip(r.language_code, KICK_LANGUAGE_MAX)
  };
}

/**
 * 形検証 → 各件正規化 → 壊れた件を捨てる。★形が違えば null(空配列ではない＝「0 件」と区別する)。
 * @param {unknown} json
 * @returns {PlatformLive[]|null}
 */
export function normalizeKickLivestreams(json) {
  if (!isLikelyKickLivestreamsShape(json)) return null;
  /** @type {PlatformLive[]} */
  const out = [];
  for (const raw of /** @type {any} */ (json).data) {
    const v = normalizeKickLivestream(raw);
    if (v) out.push(v);
  }
  return out;
}

/**
 * 同時視聴の多い順。同点は元の順(API の古い順)のまま。★元の配列は壊さない。
 * @param {PlatformLive[]} lives
 * @returns {PlatformLive[]}
 */
export function sortByViewers(lives) {
  const arr = Array.isArray(lives) ? lives.slice() : [];
  return arr
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (Number(b.l && b.l.viewers) || 0) - (Number(a.l && a.l.viewers) || 0) || a.i - b.i)
    .map((x) => x.l);
}

/**
 * 保存してよいか。★0 件は保存する(「配信が 0 件だった」は正常)。形が違う/取得失敗は保存しない
 *   (良い値を空や壊れた値で上書きしない・api/live-ranking.js と同じ掟)。
 * @param {{ ok: boolean, lives: PlatformLive[]|null }} r
 * @returns {{ store: boolean, reason: string }}
 */
export function decideKickStore(r) {
  if (!r || !r.ok) return { store: false, reason: 'api failed' };
  if (!Array.isArray(r.lives)) return { store: false, reason: 'shape invalid' };
  return { store: true, reason: '' };
}

/**
 * 1 ページで切れているか(次ページの cursor があり、件数が limit に達している)。
 * ★cursor の置き場所は未確認なので pagination.next_cursor / next_cursor / cursor のどれでも見る。
 * @param {unknown} json @param {number} limit
 * @returns {boolean}
 */
export function isTruncated(json, limit) {
  if (!isLikelyKickLivestreamsShape(json)) return false;
  const j = /** @type {any} */ (json);
  const p = j.pagination && typeof j.pagination === 'object' ? j.pagination : {};
  const cursor = p.next_cursor || j.next_cursor || j.cursor || '';
  return !!String(cursor) && j.data.length >= limit;
}
