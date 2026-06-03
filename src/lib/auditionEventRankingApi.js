/**
 * audition 公式「イベント💎ランキング」無認証 JSON API の URL 組立 & 正規化（純関数）。
 *
 * 背景・経緯（2026-06-01 実機特定）:
 *   イベント💎ランキング（プレイヤー「RANK」💎 → richview iframe に出る「ゴリアテ1位…」）は
 *   従来、audition richview iframe（`audition.nicovideo.jp/embedded/richview/live`）の DOM を
 *   relay scrape する経路でしか取れず、**RANK パネルを開いて iframe が mount されないと出ない**
 *   ＝開かないと出ないという痛点があった（ユーザー要望「対象の場所をひらかないとでない…
 *   さっと出す方法は？」）。
 *
 *   richview SPA が内部で叩く無認証の公式 capi を実機ネットワーク観測で特定した（2 段）:
 *
 *     (1) live → audition の対応付け:
 *       GET https://audition.nicovideo.jp/capi/v1/entry_items?item_type=live&item_id=<lv>&include_owner_items=true&expose_platform=live
 *       → data.entry_items[0].audition.key（イベント slug）、.id（entryId）、
 *         自分の rank/total_score、audition.title（イベント名）、item.nickname（配信者名）。
 *         entry_items が空 = そのイベントに参加していない（非イベント）。
 *
 *     (2) イベント全体ランキング:
 *       GET https://audition.nicovideo.jp/capi/v1/auditions/<key>/rankings?limit=25
 *       → data.entry_items[]:{ item_id(uid), name, total_score(💎), rank, thumbnail_url }, total_count
 *
 *   - いずれも認証不要（cookie / x-frontend-id 全省略・credentials:'omit' でも 200）。CORS の
 *     都合上、本文を読めるのは拡張 service-worker（host_permissions 特権 fetch）のみ。本モジュールは
 *     URL 組立 + 生 JSON 正規化だけを純粋に担い、2 段 fetch 自体は SW が行う。
 *
 *   正規化先は既存の relay 保存形（eventScoreRankingRelay.js の nls_event_score_ranking_<lv>）
 *   と互換にする（rows:{rank,score,name,userId,thumbnailUrl}[] + selfStatus）。これにより
 *   popup 側の既存イベントランキング描画（uid→リンク経路含む）をそのまま流用でき、
 *   新規描画コードは不要。
 *
 * 副作用なし、純関数（fetch も storage も触らない）。
 *
 * @see src/lib/eventScoreRankingRelay.js - relay 保存形・storage キーの正本
 * @see src/lib/kokenContributionRankingApi.js - 同型 SW fetch の手本
 */

/**
 * content → service-worker の fetch 依頼メッセージ type。
 * service-worker は本定数を import できない（手書きの build 成果物）ため、background 側は
 * 同じ文字列リテラルを直接使う（要・同期＝契約 test）。SW は liveId だけ受け取り、
 * (1) entry_items を引いて audition.key を取り、(2) rankings を引く 2 段 fetch を行う。
 */
export const AUDITION_EVENT_RANKING_FETCH_MESSAGE_TYPE = 'NLS_AUDITION_EVENT_RANKING_FETCH';

/** ニコ生 liveId（`lv` + 数字）の厳格パターン。任意 URL 注入 / SSRF 面を塞ぐ。 */
const LIVE_ID_RE = /^lv\d{1,15}$/;

/** entry_item id / 数値 uid の厳格パターン（先頭ゼロ・符号・小数を弾く）。 */
const POSITIVE_INT_RE = /^[1-9]\d{0,17}$/;

/**
 * audition slug（イベント key）の厳格パターン。SW が entry_items 応答から取り出した
 * key で rankings URL を組む前に必ずこれで検証する（任意文字列 fetch=SSRF 防止）。
 * 実例 "202606-nicoadevent-sweets"。英数・ハイフン・アンダースコアのみ・先頭は英数。
 */
export const AUDITION_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,80}$/i;

/** 数値 uid の厳格パターン。 */
const NUMERIC_UID_RE = POSITIVE_INT_RE;

/**
 * イベント「応援者ランキング（投票）」を置く chrome.storage.local キー。視聴中の自分の
 * liveId 単位（popup が読める単位）。content（書込）/ popup（読込）/ prune の 3 箇所で合意。
 *
 * @param {string} liveId 例 "lv350658954"
 * @returns {string}
 */
export function eventVotingRankingStorageKey(liveId) {
  return (
    'nls_event_voting_ranking_' +
    String(liveId == null ? '' : liveId).trim().toLowerCase()
  );
}

/** {@link eventVotingRankingStorageKey} の固定 prefix（prune 側の startsWith 判定用）。 */
export const EVENT_VOTING_RANKING_STORAGE_PREFIX = 'nls_event_voting_ranking_';

/**
 * entry_items API（live→audition 対応付け）の URL を組み立てる。
 * @param {string} liveId 例 "lv350658954"
 * @returns {string|null} 不正 liveId なら null
 */
export function buildAuditionEntryItemsUrl(liveId) {
  const lid = String(liveId == null ? '' : liveId).trim();
  if (!LIVE_ID_RE.test(lid)) return null;
  return (
    'https://audition.nicovideo.jp/capi/v1/entry_items?item_type=live&item_id=' +
    encodeURIComponent(lid) +
    '&include_owner_items=true&expose_platform=live'
  );
}

/**
 * イベント全体ランキング API の URL を組み立てる。
 * @param {string} auditionKey 例 "202606-nicoadevent-sweets"
 * @param {{ limit?: number }} [options] limit=取得件数。既定 25、1..100 に clamp。
 * @returns {string|null} 不正 key なら null
 */
export function buildAuditionRankingsUrl(auditionKey, options = {}) {
  const key = String(auditionKey == null ? '' : auditionKey).trim();
  if (!AUDITION_KEY_RE.test(key)) return null;
  let limit = options && Number.isFinite(Number(options.limit)) ? Number(options.limit) : 25;
  limit = Math.trunc(limit);
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  return (
    'https://audition.nicovideo.jp/capi/v1/auditions/' +
    encodeURIComponent(key) +
    '/rankings?limit=' +
    limit
  );
}

/**
 * @param {unknown} v
 * @returns {number|null} 0 以上の有限数のみ（それ以外は null）
 */
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * http(s) URL だけ通す。それ以外は空に倒す。
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const s = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * entry_items 応答（生 JSON）から audition の文脈を取り出す。
 *   - auditionKey: rankings URL を組むのに必須（無ければイベント非参加）。
 *   - entryId: voting_user_ranking 等の将来用（数値）。
 *   - selfStatus: 自分（配信者）の rank/score/eventName/broadcasterName。
 *
 * @param {unknown} json entry_items API レスポンスの生 JSON
 * @returns {{
 *   auditionKey: string,
 *   entryId: number|null,
 *   selfStatus: {
 *     rank: number|null, score: number|null,
 *     eventName: string, broadcasterName: string
 *   }
 * }|null} 非イベント/壊れた応答は null
 */
export function pickAuditionContextFromEntryItems(json) {
  if (!json || typeof json !== 'object') return null;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return null;
  }
  const data = j.data && typeof j.data === 'object' ? j.data : null;
  const items = data && Array.isArray(data.entry_items) ? data.entry_items : null;
  if (!items || items.length === 0) return null;
  const e0 = items[0];
  if (!e0 || typeof e0 !== 'object') return null;

  const audition = e0.audition && typeof e0.audition === 'object' ? e0.audition : null;
  const key = String((audition && audition.key) == null ? '' : audition.key).trim();
  if (!AUDITION_KEY_RE.test(key)) return null;

  const item = e0.item && typeof e0.item === 'object' ? e0.item : {};
  const eventName = String((audition && audition.title) == null ? '' : audition.title)
    .trim()
    .slice(0, 80);
  const broadcasterName = String(item.nickname == null ? '' : item.nickname)
    .trim()
    .slice(0, 80);
  const entryIdNum = Number(e0.id);

  return {
    auditionKey: key,
    entryId: Number.isFinite(entryIdNum) && entryIdNum > 0 ? Math.trunc(entryIdNum) : null,
    selfStatus: {
      rank: numOrNull(e0.rank),
      score: numOrNull(e0.total_score),
      eventName,
      broadcasterName
    }
  };
}

/**
 * rankings 応答（生 JSON）を、既存 relay 保存形の rows[] に正規化する。
 *
 * 設計上の安全条件:
 *   - meta.status!==200 / data.entry_items 非配列 → null（fail-soft）。
 *   - 各行は rank(number)・total_score(number)・name(非空) が揃う行のみ採用。
 *   - userId は数値 item_id（記名）のときだけ入れる（popup の uid→リンク経路が効く）。
 *   - 1 件も無ければ null。max（既定 10）に丸める（popup は上位のみ表示）。
 *
 * @param {unknown} json rankings API レスポンスの生 JSON
 * @param {{ max?: number }} [options] max=行数上限（既定 10、1..25）
 * @returns {{
 *   rows: Array<{rank:number, score:number, name:string, userId?:string, thumbnailUrl?:string}>,
 *   totalCount: number
 * }|null}
 */
export function normalizeAuditionRankingsResponse(json, options = {}) {
  if (!json || typeof json !== 'object') return null;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return null;
  }
  const data = j.data && typeof j.data === 'object' ? j.data : null;
  const list = data && Array.isArray(data.entry_items) ? data.entry_items : null;
  if (!list) return null;

  let max = options && Number.isFinite(Number(options.max)) ? Number(options.max) : 10;
  max = Math.trunc(max);
  if (max < 1) max = 1;
  if (max > 25) max = 25;

  /** @type {Array<{rank:number, score:number, name:string, userId?:string, thumbnailUrl?:string}>} */
  const rows = [];
  for (let i = 0; i < list.length && rows.length < max; i++) {
    const r = list[i];
    if (!r || typeof r !== 'object') continue;
    const rank = Number(r.rank);
    const score = Number(r.total_score);
    const name = String(r.name == null ? '' : r.name).trim();
    if (!Number.isFinite(rank) || rank <= 0) continue;
    if (!Number.isFinite(score) || score < 0) continue;
    if (!name) continue;

    /** @type {{rank:number, score:number, name:string, userId?:string, thumbnailUrl?:string}} */
    const row = { rank: Math.trunc(rank), score: Math.trunc(score), name };
    const uid = String(r.item_id == null ? '' : r.item_id).trim();
    if (String(r.item_type == null ? '' : r.item_type).trim() === 'user' && NUMERIC_UID_RE.test(uid)) {
      row.userId = uid;
    }
    const thumb = sanitizeHttpUrl(r.thumbnail_url);
    if (thumb) row.thumbnailUrl = thumb;
    rows.push(row);
  }

  if (rows.length === 0) return null;
  const totalCountNum = Number(data.total_count);
  return {
    rows,
    totalCount: Number.isFinite(totalCountNum) && totalCountNum >= 0 ? Math.trunc(totalCountNum) : rows.length
  };
}

/**
 * 応援者ランキング（イベント投票）API の URL を組み立てる。
 *   GET .../capi/v1/entry_items/<entryId>/voting_user_ranking?limit=<n>
 * entryId は pickAuditionContextFromEntryItems の entryId（entry_items[0].id）。
 *
 * @param {string|number} entryId entry_item id（正の整数）
 * @param {{ limit?: number }} [options] limit=取得件数。既定 20、1..100 に clamp。
 * @returns {string|null} 不正 entryId なら null
 */
export function buildAuditionVotingUserRankingUrl(entryId, options = {}) {
  const id = String(entryId == null ? '' : entryId).trim();
  if (!POSITIVE_INT_RE.test(id)) return null;
  let limit = options && Number.isFinite(Number(options.limit)) ? Number(options.limit) : 20;
  limit = Math.trunc(limit);
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  return (
    'https://audition.nicovideo.jp/capi/v1/entry_items/' +
    encodeURIComponent(id) +
    '/voting_user_ranking?limit=' +
    limit
  );
}

/**
 * 応援者ランキング（投票）API の生 JSON を、既存の貢献度ランキング描画
 * （officialDomRankingRowsToStripRooms / paintTopSupportRankStyleIntoElement）が読む
 * 行形に正規化する。
 *
 * レスポンス: { meta:{status}, data:{ users:[ { nickname, icon_url, account_type, id, rank, score } ] } }
 *
 * 設計上の安全条件:
 *   - meta.status!==200 / data.users 非配列 → null（fail-soft）。
 *   - id が数値（記名）の行のみ採用（投票ユーザーは必ず記名。匿名は出ない想定だが念のため
 *     数値 id 必須にして誤リンクを防ぐ）。name 空は uid を表示名に。
 *   - contribution には投票 score を載せる（💎ではなく投票スコア＝UI で単位を明示）。
 *   - accountType（'premium'|'regular'）も載せる（将来バッジ表示用・現描画は無視で無害）。
 *   - 1 件も無ければ null。max（既定 10、1..20）に丸める。
 *
 * @param {unknown} json voting_user_ranking API レスポンスの生 JSON
 * @param {{ max?: number }} [options]
 * @returns {Array<{rank:number, name:string, contribution:number, isAnonymous:boolean, thumbnailUrl:string, userPageUrl?:string, accountType?:string}>|null}
 */
export function normalizeAuditionVotingUserRankingResponse(json, options = {}) {
  if (!json || typeof json !== 'object') return null;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return null;
  }
  const data = j.data && typeof j.data === 'object' ? j.data : null;
  const users = data && Array.isArray(data.users) ? data.users : null;
  if (!users) return null;

  let max = options && Number.isFinite(Number(options.max)) ? Number(options.max) : 10;
  max = Math.trunc(max);
  if (max < 1) max = 1;
  if (max > 20) max = 20;

  /** @type {Array<{rank:number, name:string, contribution:number, isAnonymous:boolean, thumbnailUrl:string, userPageUrl?:string, accountType?:string}>} */
  const rows = [];
  for (let i = 0; i < users.length && rows.length < max; i++) {
    const u = users[i];
    if (!u || typeof u !== 'object') continue;
    const uid = String(u.id == null ? '' : u.id).trim();
    if (!POSITIVE_INT_RE.test(uid)) continue; // 投票ユーザーは記名・数値 id 必須
    let name = String(u.nickname == null ? '' : u.nickname).trim();
    if (!name) name = uid;
    let rank = Number(u.rank);
    if (!Number.isFinite(rank) || rank <= 0) rank = rows.length + 1;
    let score = Number(u.score);
    if (!Number.isFinite(score) || score < 0) score = 0;
    const accountType =
      String(u.account_type == null ? '' : u.account_type).trim().toLowerCase() === 'premium'
        ? 'premium'
        : 'regular';
    rows.push({
      rank: Math.trunc(rank),
      name,
      contribution: Math.trunc(score),
      isAnonymous: false,
      thumbnailUrl: sanitizeHttpUrl(u.icon_url),
      userPageUrl: `https://www.nicovideo.jp/user/${uid}`,
      accountType
    });
  }

  return rows.length > 0 ? rows : null;
}
