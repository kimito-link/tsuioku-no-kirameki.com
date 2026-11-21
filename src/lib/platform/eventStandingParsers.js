/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ふわっち・SHOWROOM・ミクチャの「イベントの今の順位・pt・次の順位まで」と参加者一覧の読み取り
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* ・表示(eventStandingHtml.js)
 *
 * りんく 2026-11-21「拡張はそれぞれのプラットフォーム対応もして」。形の出典はすべて 2026-11-21 08:12〜08:47 JST の
 *   実測(ログインなし・公開の口・/workspace/aud-platforms/ の生データ)。数を作らない・推定しない。
 *   - ふわっち: api.whowatch.tv/rankings/<type> は応答の title が「リアルタイム更新中」で、5分ごとに値が動いた。
 *     publisher_ranking.{rank, point, next_rank, ranking_up_point} は公式の「次の順位まで」(22,940 と 1つ上 22,950 で 11)。
 *   - SHOWROOM: /api/room/event_and_support の event.ranking.{rank, point, gap, next_rank, lower_gap}。
 *     next_rank>0 のとき gap は1つ上までの差、1位(next_rank=0)のとき gap は lower_gap と同じ(=下との差)。
 *     ブロックのあるイベントでは rank はブロックの中の順位(イベント全体の順位とは違う・実測で 1位 と 3位)。
 *     参加者一覧は公式のイベントページと同じ /api/event/<url_key>/ranking。is_point_visible_period=false の間は
 *     公式が pt を 0 で隠しているので、一覧には pt を出さない(公式が隠すものは出さない)。
 *   - ミクチャ: /api-web/live/events/<id>/users/ranking の並び=順位・score=pt(公式のイベントページと同じ数・最大50人)。
 *     /api-web/users/<id>/live の eventInfo.point は順位2位の配信でも 0 のままだった → pt はここから取らない。
 */

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : null;
}
/** 0 以上の整数(数でなければ null) @param {unknown} v */
function count(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1e13 ? Math.floor(n) : null;
}
/** 1 以上の順位 @param {unknown} v */
function rank(v) {
  const n = count(v);
  return n != null && n >= 1 && n <= 1e7 ? n : null;
}
/** @param {unknown} s @param {number} max */
function text(s, max) {
  return String(s ?? '')
    .split('')
    .filter((c) => c.charCodeAt(0) >= 0x20)
    .join('')
    .trim()
    .slice(0, max);
}
/** @param {unknown} s */
function idStr(s) {
  const v = String(s ?? '').trim();
  return /^\d{1,20}$/.test(v) ? v : '';
}

/**
 * @typedef {{ id: string, name: string, rank: number, point: number|null }} StandingRow
 * @typedef {{
 *   platform: 'whowatch'|'showroom'|'mixch',
 *   eventName: string,
 *   group: string,
 *   scope: 'group'|'block'|'event',
 *   rank: number|null,
 *   point: number|null,
 *   nextRank: number|null,
 *   toNext: number|null,
 *   toNextSource: 'official'|'derived'|'',
 *   toNextKind: 'pass'|'diff'|'',
 *   realtimeLabel: string,
 *   total: number|null,
 * }} Standing
 */

// ---- ふわっち ----

const WW_API = 'https://api.whowatch.tv';

/** @param {string} liveId */
export function wwEventInfoUrlForStanding(liveId) {
  return /^\d{1,20}$/.test(String(liveId)) ? `${WW_API}/events/event_info?live_id=${liveId}` : '';
}

/**
 * events/event_info → 出ているランキング(部門)の一覧。ボタンの ranking_type が一覧の口の名前。
 * @param {unknown} json
 * @returns {Array<{ eventKey: string, rankingType: string, eventName: string, group: string, rank: number|null }>}
 */
export function parseWwEventGroups(json) {
  const list = Array.isArray(json) ? json : [];
  /** @type {Array<{ eventKey: string, rankingType: string, eventName: string, group: string, rank: number|null }>} */
  const out = [];
  for (const e of list) {
    const o = obj(e);
    if (!o) continue;
    const btn = (Array.isArray(o.buttons) ? o.buttons : []).map(obj).find((b) => b && b.type === 'RANKING' && b.ranking_type);
    const rankingType = String(btn?.ranking_type || '').trim();
    const eventKey = String(o.event_key || '').trim();
    if (!/^[A-Za-z0-9_]{1,80}$/.test(rankingType) || !/^[A-Za-z0-9_]{1,80}$/.test(eventKey)) continue;
    out.push({ eventKey, rankingType, eventName: text(o.event_name, 80), group: text(o.group_name, 60), rank: rank(o.rank) });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * ふわっちの順位の口。limit=1 なら自分の順位だけ(約1.4KB)、一覧は limit を大きく。
 * @param {{ rankingType: string, eventKey: string }} g @param {string} publisherId @param {{ limit?: number, detail?: boolean }} [opts]
 */
export function wwRankingUrl(g, publisherId, opts = {}) {
  if (!g || !/^[A-Za-z0-9_]{1,80}$/.test(g.rankingType) || !/^[A-Za-z0-9_]{1,80}$/.test(g.eventKey)) return '';
  const q = new URLSearchParams();
  if (opts.limit) q.set('limit', String(Math.max(1, Math.min(1000, Math.floor(opts.limit)))));
  if (opts.detail) q.set('detail', 'true');
  q.set('event_key', g.eventKey);
  if (/^\d{1,20}$/.test(String(publisherId || ''))) q.set('publisher_id', String(publisherId));
  return `${WW_API}/rankings/${g.rankingType.toLowerCase()}?${q.toString()}`;
}

/**
 * rankings/<type> の応答 → 自分の順位と一覧。
 * @param {unknown} json @param {{ eventName?: string, group?: string }} [meta]
 * @returns {null | { standing: Standing, rows: StandingRow[] }}
 */
export function parseWwRanking(json, meta = {}) {
  const top = Array.isArray(json) ? obj(json[0]) : obj(json);
  if (!top) return null;
  const rows = (Array.isArray(top.rankings) ? top.rankings : [])
    .map((/** @type {any} */ r) => ({ id: idStr(r?.user?.id), name: text(r?.user?.name, 60), rank: rank(r?.rank), point: count(r?.point) }))
    .filter((/** @type {any} */ r) => r.id && r.rank != null)
    .map((/** @type {any} */ r) => /** @type {StandingRow} */ (r));
  const pr = obj(top.publisher_ranking);
  const myRank = rank(pr?.rank);
  const nextRank = rank(pr?.next_rank);
  const toNext = count(pr?.ranking_up_point);
  return {
    standing: {
      platform: 'whowatch',
      eventName: text(meta.eventName || top.name, 80),
      group: text(meta.group || top.short_name || top.name, 60),
      scope: 'group',
      rank: myRank,
      point: count(pr?.point),
      nextRank: myRank != null && myRank > 1 ? nextRank : null,
      toNext: myRank != null && myRank > 1 && nextRank != null ? toNext : null,
      toNextSource: myRank != null && myRank > 1 && nextRank != null && toNext != null ? 'official' : '',
      // ふわっちの ranking_up_point は「抜くのに要る pt」(差 10 のとき 11)
      toNextKind: 'pass',
      realtimeLabel: text(top.title, 30),
      total: null,
    },
    rows,
  };
}

// ---- SHOWROOM ----

const SR = 'https://www.showroom-live.com';

/** @param {string} roomId */
export function srEventAndSupportUrlForStanding(roomId) {
  return /^\d{1,20}$/.test(String(roomId)) ? `${SR}/api/room/event_and_support?room_id=${roomId}` : '';
}

/**
 * event_url(https://www.showroom-live.com/event/<url_key>?block_id=<n>)→ url_key と block_id。
 * @param {unknown} url
 */
export function parseSrEventUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return { urlKey: '', blockId: '' };
  }
  if (u.hostname !== 'www.showroom-live.com') return { urlKey: '', blockId: '' };
  const m = /^\/event\/([A-Za-z0-9_-]{1,80})\/?$/.exec(u.pathname);
  return { urlKey: m ? m[1] : '', blockId: idStr(u.searchParams.get('block_id')) };
}

/**
 * event_and_support → 自分の順位。イベントに出ていなければ null。
 * @param {unknown} json
 * @returns {null | { standing: Standing, urlKey: string, blockId: string, eventId: string }}
 */
export function parseSrStanding(json) {
  const ev = obj(obj(json)?.event);
  if (!ev) return null;
  const r = obj(ev.ranking);
  const myRank = rank(r?.rank);
  if (myRank == null) return null;
  const { urlKey, blockId } = parseSrEventUrl(ev.event_url);
  const nextRank = count(r?.next_rank);
  const hasUpper = nextRank != null && nextRank >= 1 && myRank > 1;
  const name = text(ev.event_name, 120);
  // ブロック名は、ブロックのあるイベント(event_url に block_id が付く)だけ名前の末尾から読む。
  // 例「…Bブロック」→ Bブロック、「…[Gold]1」→ Gold 1(公式のブロック表示 show_rank_label + label と同じ形)。
  // 読めなければ空(「ブロックの中の順位」とだけ出す)。
  let blockLabel = '';
  if (blockId) {
    const jp = /([A-Za-z0-9Ａ-Ｚ一-龠ぁ-んァ-ヶー]+ブロック)\s*$/.exec(name);
    const br = /\[([A-Za-z0-9 ~〜-]{1,24})\]\s*([A-Za-z0-9-]{1,8})\s*$/.exec(name);
    blockLabel = jp ? jp[1] : br ? `${br[1]} ${br[2]}` : '';
  }
  return {
    standing: {
      platform: 'showroom',
      eventName: name,
      group: blockLabel,
      scope: blockId ? 'block' : 'event',
      rank: myRank,
      point: count(r?.point),
      nextRank: hasUpper ? nextRank : null,
      toNext: hasUpper ? count(r?.gap) : null,
      toNextSource: hasUpper && count(r?.gap) != null ? 'official' : '',
      // SHOWROOM の gap は1つ上との差そのもの(実測 959,025 + 1,065,286 = 2,024,311 = 1つ上の部屋の pt)
      toNextKind: 'diff',
      realtimeLabel: '',
      total: null,
    },
    urlKey,
    blockId,
    eventId: idStr(ev.event_id),
  };
}

/**
 * 公式のイベントページと同じ順位の口。
 * ブロックのあるイベントは /api/event/block_ranking?event_id=&block_id=(公式ページの「ブロック」タブと同じ)。
 * /api/event/<url_key>/ranking は block_id を付けても全体(All Livers)が返る(2026-11-21 実測)。
 * @param {string} urlKey @param {string} blockId @param {number} page @param {string} [eventId]
 */
export function srEventRankingUrl(urlKey, blockId, page = 1, eventId = '') {
  const pg = String(Math.max(1, Math.floor(page) || 1));
  const okBlock = /^\d{1,20}$/.test(String(blockId || ''));
  if (okBlock && /^\d{1,20}$/.test(String(eventId || ''))) {
    return `${SR}/api/event/block_ranking?event_id=${eventId}&block_id=${blockId}&page=${pg}`;
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(urlKey || ''))) return '';
  return `${SR}/api/event/${urlKey}/ranking?page=${pg}`;
}

/**
 * /api/event/<url_key>/ranking の1ページ。pt は公式が見せている間(is_point_visible_period)だけ。
 * @param {unknown} json
 * @returns {null | { rows: StandingRow[], pointsVisible: boolean, isBlock: boolean, lastPage: number, total: number|null }}
 */
export function parseSrEventRankingPage(json) {
  const o = obj(json);
  if (!o) return null;
  const isBlockList = Array.isArray(o.block_ranking_list);
  const list = isBlockList ? o.block_ranking_list : o.ranking;
  if (!Array.isArray(list)) return null;
  // 全体の口は is_point_visible_period で決まる。ブロックの口にはその印が無いので、
  // 公式が 0 で返している(隠している)間は出さない = 0 より大きい pt が1つも無ければ隠れている扱い。
  const pointsVisible =
    o.is_point_visible_period === true ||
    (isBlockList && o.is_point_visible_period !== false && list.some((/** @type {any} */ r) => (count(r?.point) || 0) > 0));
  const rows = list
    .map((/** @type {any} */ r) => ({ id: idStr(r?.room_id), name: text(r?.room_name, 60), rank: rank(r?.rank), point: pointsVisible ? count(r?.point) : null }))
    .filter((/** @type {any} */ r) => r.id && r.rank != null)
    .map((/** @type {any} */ r) => /** @type {StandingRow} */ (r));
  const total = count(o.total_entries);
  const per = count(o.entries_per_page);
  const lp = isBlockList ? (total && per ? Math.ceil(total / per) : 1) : count(o.last_page);
  return { rows, pointsVisible, isBlock: isBlockList || o.is_event_block === true, lastPage: lp && lp >= 1 ? Math.min(lp, 40) : 1, total };
}

// ---- ミクチャ ----

const MX = 'https://mixch.tv';

/** @param {string} userId */
export function mxLiveUrlForStanding(userId) {
  return /^\d{1,15}$/.test(String(userId)) ? `${MX}/api-web/users/${userId}/live` : '';
}

/**
 * /api-web/users/<n>/live → 出ているイベント(番号・名前・順位)。pt はここから取らない(実測で 0 のまま)。
 * @param {unknown} json
 */
export function parseMxEventRef(json) {
  const ev = obj(obj(json)?.eventInfo);
  const id = idStr(ev?.id);
  if (!ev || !id) return null;
  return { eventId: id, eventName: text(ev.title, 80), rank: rank(ev.rank) };
}

/** @param {string} eventId */
export function mxEventRankingUrl(eventId) {
  return /^\d{1,20}$/.test(String(eventId)) ? `${MX}/api-web/live/events/${eventId}/users/ranking?event_id=${eventId}` : '';
}

/** 公式が出す一覧の上限(page/offset/limit を付けても 50 人のまま・2026-11-21 実測) */
export const MX_RANKING_MAX_ROWS = 50;

/**
 * ランキングの応答 → 一覧と自分の順位。「次の順位まで」は公式の2つの pt の差(計算したことを書く)。
 * @param {unknown} json @param {string} userId @param {{ eventName?: string, rank?: number|null }} [ref]
 * @returns {null | { standing: Standing, rows: StandingRow[], capped: boolean }}
 */
export function parseMxEventRanking(json, userId, ref = {}) {
  const o = obj(json);
  if (!o || !Array.isArray(o.ranking)) return null;
  /** @type {StandingRow[]} */
  const rows = [];
  for (const r of o.ranking) {
    const id = idStr(r?.id);
    if (!id) continue;
    rows.push({ id, name: text(r?.name, 60), rank: rows.length + 1, point: count(r?.score) });
    if (rows.length >= 200) break;
  }
  const uid = String(userId || '');
  const idx = rows.findIndex((r) => r.id === uid);
  const me = idx >= 0 ? rows[idx] : null;
  const up = idx > 0 ? rows[idx - 1] : null;
  const toNext = me && up && me.point != null && up.point != null ? Math.max(0, up.point - me.point) : null;
  return {
    standing: {
      platform: 'mixch',
      eventName: text(ref.eventName, 80),
      group: '',
      scope: 'event',
      rank: me ? me.rank : rank(ref.rank),
      point: me ? me.point : null,
      nextRank: me && up ? up.rank : null,
      toNext,
      toNextSource: toNext != null ? 'derived' : '',
      toNextKind: 'diff',
      realtimeLabel: '',
      total: null,
    },
    rows,
    capped: rows.length >= MX_RANKING_MAX_ROWS,
  };
}
