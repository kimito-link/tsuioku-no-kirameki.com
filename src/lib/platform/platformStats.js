/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】各サービスのページが出している「そのサービス特有の公式の数字」(イベント順位・レベル等)の読み取り
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* ・どの数字を画面に出すか(platformMetrics.js)
 *
 * platformStats.js — りんく 2026-11-11「それぞれのプラットフォーム特有のランキングや機能をちゃんと合わせて実装してほしい」。
 *   SHOWROOM のイベント順位・イベントpt・目標レベル、ミクチャのレベル・ファン・スーパーファン・ライバーランク、
 *   ふわっちのイベント順位・累計視聴を、ページが読んでいる API の値そのままで拾う(数を作らない・推定しない)。
 *   形の出典: 2026-11-11 PC 実測(.artifacts/rank-shapes/summary.md・ログインなし)。
 *
 * 流れ: 入口(sr/mx/ww-content-entry)→ YT_STREAM_META { platformStats } → まとめ(yt_stream_summaries)の platformStats
 *   → ytNicoShim の platformFacts.official → platformMetrics.panelExtraChips がチップにする。
 *   入口・background の両方で normalizePlatformStats を通す(知らない欄・壊れた値は落とす)。
 */

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : null;
}

/** 0 以上の整数(大きすぎる・数でないものは null) @param {unknown} v */
function count(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.floor(n) : null;
}

/** 順位(1 以上) @param {unknown} v */
function rank(v) {
  const n = count(v);
  return n != null && n >= 1 && n <= 1e7 ? n : null;
}

/** @param {unknown} s @param {number} max */
function text(s, max) {
  return String(s ?? '')
    .replace(/[<>]/g, '')
    .split('').filter((c) => c.charCodeAt(0) >= 0x20).join('')
    .trim()
    .slice(0, max);
}

/** 数の欄(すべて 0 以上の整数) */
const COUNT_KEYS = Object.freeze([
  'eventPoint',
  'eventGap',
  'questLevel',
  'questPoint',
  'questGoal',
  'level',
  'fans',
  'superfans',
  'liverRankScore',
  'superfanBonus',
  'totalViews',
  // ツイキャスの画面のコメント数(#comment-count・配信全体の公式の数)
  'commentTotal',
]);
/** 順位の欄 */
const RANK_KEYS = Object.freeze(['eventRank']);

/**
 * 置く前の検疫。知らない欄は落とす。中身が1つも無ければ null。
 * @param {unknown} raw
 * @returns {null | Record<string, any>}
 */
export function normalizePlatformStats(raw) {
  const o = obj(raw);
  if (!o) return null;
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of COUNT_KEYS) {
    const n = count(o[k]);
    if (n != null) out[k] = n;
  }
  for (const k of RANK_KEYS) {
    const n = rank(o[k]);
    if (n != null) out[k] = n;
  }
  const eventName = text(o.eventName, 80);
  if (eventName) out.eventName = eventName;
  if (Array.isArray(o.events)) {
    const events = o.events
      .slice(0, 10)
      .map((/** @type {any} */ e) => ({ name: text(e?.name, 80), group: text(e?.group, 40), rank: rank(e?.rank) }))
      .filter((/** @type {any} */ e) => e.name && e.rank != null);
    if (events.length) out.events = events;
  }
  return Object.keys(out).length ? out : null;
}

// ---- SHOWROOM ----

/** /api/room/event_and_support?room_id= の URL @param {string} roomId */
export function srEventAndSupportUrl(roomId) {
  return /^\d{1,20}$/.test(String(roomId)) ? `https://www.showroom-live.com/api/room/event_and_support?room_id=${roomId}` : '';
}

/**
 * SHOWROOM のイベントの数字。部屋の画面の「現在のランキング・支援pt」「目標Lv」と同じ値(2026-11-11 PC で照合)。
 *   イベントに出ていない部屋は null。
 * @param {unknown} json
 */
export function parseSrEventStats(json) {
  const ev = obj(obj(json)?.event);
  if (!ev) return null;
  const r = obj(ev.ranking);
  const sup = obj(obj(ev.quest)?.support);
  return normalizePlatformStats({
    eventName: ev.event_name,
    eventRank: r?.rank,
    eventPoint: r?.point,
    // 画面の「-◯pt」が gap と lower_gap のどちらかは確かめられていないので、出すのは gap(上との差)を title にだけ
    eventGap: r?.gap,
    questLevel: sup?.next_level,
    questPoint: sup?.current_point,
    questGoal: sup?.goal_point,
  });
}

/**
 * SHOWROOM のイベントの貢献ランキング(部屋の画面の「貢献ユーザー」)→ 2つめの順位表(platformSubBoard)の形。
 * @param {unknown} json
 */
export function parseSrEventBoard(json) {
  const ev = obj(obj(json)?.event);
  const list = Array.isArray(ev?.contribution_ranking) ? ev.contribution_ranking : [];
  const rows = list
    .map((/** @type {any} */ r) => ({ rank: rank(r?.rank) ?? 1e9, name: text(r?.name, 60), xp: count(r?.point) ?? 0, iconUrl: String(r?.avatar_url || '') }))
    .filter((/** @type {any} */ r) => r.name && r.xp > 0)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.rank - b.rank)
    .map(({ name, xp, iconUrl }) => ({ name, xp, iconUrl }));
  if (!rows.length) return null;
  return { slot: 'sub', title: 'イベント貢献ランキング', unit: 'pt', period: 'EVENT', rows };
}

// ---- ミクチャ ----

/**
 * ミクチャの /api-web/users/<n>/live。画面の名前の下のレベル・ファン・スーパーファン・ライバーランクと同じ値(2026-11-11 PC で照合)。
 *   画面の「S◯」「±◯圏内」は API の値と一致しなかったので出さない。
 * @param {unknown} json
 */
export function parseMxLiveStats(json) {
  const o = obj(json);
  if (!o) return null;
  const bi = obj(o.broadcasterInfo);
  const lv = obj(o.broadcasterLevel);
  const sr = obj(o.streamerRank);
  const ev = obj(o.eventInfo);
  const rankOk = sr && sr.available !== false && sr.available !== 0;
  return normalizePlatformStats({
    level: lv?.level,
    fans: bi?.fan,
    superfans: bi?.superfan,
    liverRankScore: rankOk ? sr?.score : null,
    superfanBonus: rankOk ? sr?.superfan_bonus : null,
    eventName: ev?.title,
    eventRank: ev?.rank,
    eventPoint: ev?.point,
  });
}

// ---- ふわっち ----

/** GET api.whowatch.tv/events/event_info?live_id= @param {string} liveId */
export function wwEventInfoUrl(liveId) {
  return /^\d{1,20}$/.test(String(liveId)) ? `https://api.whowatch.tv/events/event_info?live_id=${liveId}` : '';
}

/**
 * ふわっちのイベント順位(1つの配信が複数のイベント・部門に同時に出ていることがある・2026-11-11 実測で6件)。
 * @param {unknown} json
 */
export function parseWwEventInfo(json) {
  const list = Array.isArray(json) ? json : Array.isArray(obj(json)?.events) ? obj(json)?.events : [];
  const events = list
    .map((/** @type {any} */ e) => ({ name: text(e?.event_name, 80), group: text(e?.group_name, 40), rank: rank(e?.rank) }))
    .filter((/** @type {any} */ e) => e.name && e.rank != null)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.rank - b.rank);
  if (!events.length) return null;
  return normalizePlatformStats({ events, eventRank: events[0].rank, eventName: events[0].name });
}

/** ふわっちの lives/<番号> の累計視聴(live.total_view_count) @param {unknown} json */
export function parseWwLiveStats(json) {
  const live = obj(obj(json)?.live);
  return normalizePlatformStats({ totalViews: live?.total_view_count });
}

/** 2つを重ねる(後ろが勝つ・どちらも無ければ null) @param {...(Record<string, any>|null|undefined)} parts */
export function mergePlatformStats(...parts) {
  return normalizePlatformStats(Object.assign({}, ...parts.filter(Boolean)));
}
