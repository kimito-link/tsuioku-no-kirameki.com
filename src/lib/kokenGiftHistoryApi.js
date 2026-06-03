/**
 * koken 公式「ギフト履歴（個別イベント）」無認証 JSON API の URL 組立 & 正規化（純関数）。
 *
 * 背景・経緯（2026-06-01 実機特定）:
 *   ギフト履歴は従来、watch サイドバーの koken iframe（`koken.nicovideo.jp/supporter/
 *   contents/<lv>/gift`）の `ul.gift-history-list` を scrape する経路（NLS_GIFT_HISTORY_
 *   FROM_IFRAME → aggregateGiftHistoryThrows → nls_gift_history_throws_<lv>）でしか
 *   取れず、「ギフトタブを開いたときだけ更新」＝開かないと出ない/古いままという痛点が
 *   あった（ユーザー要望「ギフト履歴もすぐとりたい」）。
 *
 *   koken の貢献度ランキング API（kokenContributionRankingApi.js）と同じ
 *   `userperspective` 名前空間に、個別ギフト履歴を返す兄弟エンドポイントが在ることを
 *   実機ネットワーク観測で特定した:
 *
 *     GET https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/<lv>/histories
 *
 *   - 認証不要（cookie / X-Frontend-Id 全省略・credentials:'omit' でも 200）。CORS の都合上
 *     本文を読めるのは拡張 service-worker（host_permissions 特権 fetch）のみ＝koken ランキング
 *     と同じ制約。本モジュールは URL 組立 + 生 JSON 正規化だけを純粋に担い、fetch は SW が行う。
 *   - レスポンス（実機確認の正本スキーマ）:
 *       { meta:{status:200},
 *         data:{ nextCount, totalPoint, showTimeBeginAt,
 *                histories:[ { id, supporterId, supporterName, supporterThumbnailUrl,
 *                              itemName, itemThumbnailUrl, point, contribution, publishedAt } ] } }
 *     ★ `supporterId` は**数値 uid**（DOM scrape では取れなかった）。記名行はそのまま
 *       リンク化できる（popup は userKey が数値 uid なら user ページへリンクする）。
 *
 *   正規化先は既存の保存形 `StoredGiftUserWithThrows[]`（mergeGiftHistoryThrows.js）と
 *   完全互換にする。これにより popup 側の既存「ギフト履歴」レーン読み取り
 *   （nls_gift_history_throws_<lv> fallback）をそのまま流用でき、新規描画コードは不要。
 *   さらに DOM scrape 版の `__anon_<senderName>` キーと違い、本経路は記名行に**数値 uid**
 *   を入れるためリンクが効く（匿名行のみ `__anon_<senderName>` に倒す）。
 *
 * 副作用なし、純関数（fetch も storage も触らない）。
 *
 * @see src/lib/mergeGiftHistoryThrows.js - StoredGiftUserWithThrows（保存形の正本）
 * @see src/lib/kokenContributionRankingApi.js - 同 namespace の貢献度ランキング API（手本）
 */

/**
 * @typedef {import('./mergeGiftHistoryThrows.js').StoredGiftUserWithThrows} StoredGiftUserWithThrows
 */

/**
 * content → service-worker の fetch 依頼メッセージ type。
 * service-worker（extension/background.js）は本定数を import できない（手書きの
 * build 成果物）ため、background 側は同じ文字列リテラルを直接使う（要・同期＝契約 test）。
 */
export const KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE = 'NLS_KOKEN_GIFT_HISTORY_FETCH';

/** ニコ生 liveId（`lv` + 数字）の厳格パターン。任意 URL 注入 / SSRF 面を塞ぐ。 */
const LIVE_ID_RE = /^lv\d{1,15}$/;

/** 数値 uid（記名）の厳格パターン。先頭ゼロ・符号・小数を弾く。 */
const NUMERIC_UID_RE = /^[1-9]\d{0,17}$/;

/**
 * ギフト履歴（throws 集計）を置く chrome.storage.local キー。content 既存の inline
 * `nls_gift_history_throws_<lv>` と同一文字列を返す（ドリフト防止に集約）。
 *
 * @param {string} liveId 例 "lv350658954"
 * @returns {string}
 */
export function giftHistoryThrowsStorageKey(liveId) {
  return 'nls_gift_history_throws_' + String(liveId == null ? '' : liveId).trim().toLowerCase();
}

/** {@link giftHistoryThrowsStorageKey} の固定 prefix（prune 側の startsWith 判定用）。 */
export const GIFT_HISTORY_THROWS_STORAGE_PREFIX = 'nls_gift_history_throws_';

/**
 * koken 公式ギフト履歴 API の URL を組み立てる。
 *
 * liveId は厳格に検証する（SW が任意文字列を fetch しないよう、不正なら null）。
 *
 * @param {string} liveId 例 "lv350658954"
 * @returns {string|null} 不正 liveId なら null
 */
/**
 * @param {unknown} json
 * @returns {number|null} 次ページ取得用 cursor（0 なら null）
 */
export function readKokenGiftHistoryNextCursor(json) {
  if (!isLikelyKokenGiftHistoryShape(json)) return null;
  const n = Number(/** @type {Record<string, any>} */ (/** @type {any} */ (json).data).nextCount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * @param {string} liveId
 * @param {number|null|undefined} [nextCursor] API の nextCount（2 ページ目以降）
 * @returns {string|null}
 */
export function buildKokenGiftHistoryUrl(liveId, nextCursor) {
  const lid = String(liveId == null ? '' : liveId).trim();
  if (!LIVE_ID_RE.test(lid)) return null;
  const base =
    'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/' +
    encodeURIComponent(lid) +
    '/histories';
  const cursor =
    nextCursor != null && Number.isFinite(Number(nextCursor)) && Number(nextCursor) > 0
      ? Math.floor(Number(nextCursor))
      : null;
  if (cursor == null) return base;
  return `${base}?nextCount=${encodeURIComponent(String(cursor))}`;
}

/**
 * 生 JSON が koken ギフト履歴レスポンスの概形か（meta.status と data.histories 配列）。
 *
 * @param {unknown} json
 * @returns {boolean}
 */
export function isLikelyKokenGiftHistoryShape(json) {
  if (!json || typeof json !== 'object') return false;
  const j = /** @type {Record<string, any>} */ (json);
  if (j.meta && typeof j.meta === 'object' && j.meta.status != null) {
    if (Number(j.meta.status) !== 200) return false;
  }
  return !!(j.data && typeof j.data === 'object' && Array.isArray(j.data.histories));
}

/**
 * http(s) URL だけ通す（サムネ/アバター）。それ以外は空に倒す。
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeHttpUrl(value) {
  const s = String(value == null ? '' : value).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/**
 * @param {unknown} v
 * @returns {number} 0 以上の整数（不正は 0）
 */
function nonNegativeInt(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return 0;
}

/**
 * koken 公式ギフト履歴 API の生 JSON を、既存保存形 StoredGiftUserWithThrows[] に
 * 正規化（送り主ごとに throwCount + totalPoints を集計）する。
 *
 * 設計上の安全条件（koken ランキングと同じ規約 + 本経路固有）:
 *   - meta.status!==200 / data.histories 非配列 → null（呼び出し側は「rows>0 のときだけ
 *     既存 storage を上書き」するので、null/空は既存値を保全＝fail-soft）。
 *   - 送り主は数値 supporterId があれば `userId=<uid>`（リンク可能）、無ければ
 *     `__anon_<senderName>`（DOM scrape 版と同じ匿名キー・リンク不可）に集約。
 *   - senderName 空かつ uid 無しの壊れ行は skip。senderName 空で uid 在りなら uid を表示名に。
 *   - totalPoints は `point`（履歴行に出る pt）を合算（contribution は別指標なので使わない）。
 *   - capturedAt は now（呼び出し側が渡す。fresh 判定に使う）。
 *   - 1 件も組み立てられなければ null（空配列でなく null。既存規約に合わせる）。
 *   - 並べ替えはしない（popup 側が totalPoints 降順に並べる）。
 *
 * @param {unknown} json koken API レスポンスの生 JSON（SW が res.json() したもの）
 * @param {{ now?: number }} [options] now=capturedAt（既定 Date.now()）
 * @returns {StoredGiftUserWithThrows[]|null}
 */
/**
 * 配信開始 epoch（秒）とギフト公開 epoch から、ニコ生履歴タブと同型の H:MM:SS を作る。
 *
 * @param {unknown} publishedAt
 * @param {unknown} showTimeBeginAt
 * @returns {{ timeLabel: string, sortKey: number }}
 */
export function formatKokenGiftStreamTimeLabel(publishedAt, showTimeBeginAt) {
  const pub = Number(publishedAt);
  if (!Number.isFinite(pub) || pub <= 0) {
    return { timeLabel: '—', sortKey: 0 };
  }
  const begin = Number(showTimeBeginAt);
  let offsetSec = pub;
  if (Number.isFinite(begin) && begin > 0) {
    offsetSec = Math.max(0, Math.floor(pub - begin));
  }
  const h = Math.floor(offsetSec / 3600);
  const m = Math.floor((offsetSec % 3600) / 60);
  const s = Math.floor(offsetSec % 60);
  const timeLabel = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { timeLabel, sortKey: offsetSec };
}

/**
 * koken API 1 レスポンスを、マーケ「ギフト投げ履歴」と popup sub-app 表示用 payload に変換。
 *
 * @param {unknown} json
 * @param {{ now?: number, liveId?: string }} [options]
 * @returns {{ liveId: string, capturedAt: number, source: 'koken-api', history: object[], totalCounts: object[] }|null}
 */
export function buildGiftSubAppPayloadFromKokenJson(json, options = {}) {
  if (!isLikelyKokenGiftHistoryShape(json)) return null;
  const data = /** @type {Record<string, any>} */ (/** @type {any} */ (json).data);
  const histories = Array.isArray(data.histories) ? data.histories : [];
  if (!histories.length) return null;
  const showTimeBeginAt = data.showTimeBeginAt;
  const now =
    options && Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const liveId = String(options?.liveId || '').trim().toLowerCase();

  /** @type {object[]} */
  const history = [];
  /** @type {Map<string, { itemName: string, count: number, thumbnailUrl: string }>} */
  const itemMap = new Map();

  for (const h of histories) {
    if (!h || typeof h !== 'object') continue;
    const sidRaw = String(h.supporterId == null ? '' : h.supporterId).trim();
    const hasUid = NUMERIC_UID_RE.test(sidRaw);
    let senderName = String(h.supporterName == null ? '' : h.supporterName).trim();
    if (!senderName) {
      if (hasUid) senderName = sidRaw;
      else continue;
    }
    const itemName = String(h.itemName == null ? '' : h.itemName).trim() || '（名称未取得）';
    const points = nonNegativeInt(h.point);
    if (!points) continue;
    const { timeLabel, sortKey } = formatKokenGiftStreamTimeLabel(
      h.publishedAt,
      showTimeBeginAt
    );
    const thumbnailUrl = sanitizeHttpUrl(h.itemThumbnailUrl);
    history.push({
      itemName,
      senderName,
      points,
      time: timeLabel,
      sortKey,
      thumbnailUrl,
      senderAvatarUrl: sanitizeHttpUrl(h.supporterThumbnailUrl),
      userId: hasUid ? sidRaw : '',
      kokenHistoryId: String(h.id == null ? '' : h.id).trim()
    });
    const key = itemName.toLowerCase();
    const cur = itemMap.get(key) || { itemName, count: 0, thumbnailUrl: '' };
    cur.count += 1;
    if (thumbnailUrl) cur.thumbnailUrl = thumbnailUrl;
    itemMap.set(key, cur);
  }
  if (!history.length) return null;
  history.sort(
    (a, b) =>
      Number(/** @type {{ sortKey?: number }} */ (b).sortKey) -
      Number(/** @type {{ sortKey?: number }} */ (a).sortKey)
  );

  return {
    liveId,
    capturedAt: now,
    source: 'koken-api',
    history,
    totalCounts: [...itemMap.values()].sort((a, b) => b.count - a.count)
  };
}

/**
 * ギフト iframe リレー / 同一 origin DOM スクレイプ結果を sub-app storage 形に変換。
 *
 * @param {readonly unknown[]} items scrapeGiftHistoryList の行
 * @param {readonly unknown[]} totalCounts scrapeTotalGiftCountList の行
 * @param {{ now?: number, liveId?: string }} [options]
 * @returns {{ liveId: string, capturedAt: number, source: 'dom-scrape', history: object[], totalCounts: object[] }|null}
 */
export function buildGiftSubAppPayloadFromDomRelay(items, totalCounts, options = {}) {
  const liveId = String(options?.liveId || '').trim().toLowerCase();
  const now =
    options && Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const historyIn = Array.isArray(items) ? items : [];
  const countsIn = Array.isArray(totalCounts) ? totalCounts : [];

  /** @type {object[]} */
  const history = [];
  for (const raw of historyIn) {
    const r = /** @type {Record<string, unknown>} */ (raw || {});
    const points = nonNegativeInt(r.points);
    const pointsRaw = String(r.pointsRaw || '').trim();
    if (!points && !pointsRaw) continue;
    const itemName = String(r.itemName || '').trim() || '（名称未取得）';
    const senderName = String(r.senderName || '').trim() || '名無し';
    const time = String(r.time || '').trim();
    history.push({
      itemName,
      senderName,
      points: points || nonNegativeInt(pointsRaw.replace(/[^\d]/g, '')),
      pointsRaw: pointsRaw || String(points),
      time,
      sortKey: parseGiftStreamTimeSortKey(time),
      thumbnailUrl: sanitizeHttpUrl(r.thumbnailUrl),
      senderAvatarUrl: sanitizeHttpUrl(r.senderAvatarUrl),
      userId: String(r.userId || '').trim()
    });
  }
  if (history.length) {
    history.sort(
      (a, b) =>
        Number(/** @type {{ sortKey?: number }} */ (b).sortKey) -
        Number(/** @type {{ sortKey?: number }} */ (a).sortKey)
    );
  }

  const totalCountsOut = countsIn
    .map((raw) => {
      const c = /** @type {Record<string, unknown>} */ (raw || {});
      const itemName = String(c.itemName || '').trim();
      const count = nonNegativeInt(c.count);
      if (!itemName || !count) return null;
      return {
        itemName,
        count,
        thumbnailUrl: sanitizeHttpUrl(c.thumbnailUrl)
      };
    })
    .filter(Boolean);

  if (!history.length && !totalCountsOut.length) return null;

  return {
    liveId,
    capturedAt: now,
    source: 'dom-scrape',
    history,
    totalCounts: /** @type {object[]} */ (totalCountsOut)
  };
}

/**
 * 複数ページの koken JSON を 1 payload に畳む（nextCount ページング用）。
 *
 * @param {readonly unknown[]} jsonPages
 * @param {{ now?: number, liveId?: string }} [options]
 * @returns {ReturnType<typeof mergeGiftSubAppHistoryPayload>}
 */
export function buildGiftSubAppPayloadFromKokenJsonPages(jsonPages, options = {}) {
  let acc = null;
  for (const page of jsonPages) {
    const chunk = buildGiftSubAppPayloadFromKokenJson(page, options);
    if (!chunk) continue;
    acc = acc ? mergeGiftSubAppHistoryPayload(acc, chunk) : chunk;
  }
  return acc;
}

/**
 * koken API 全ページ + 既存 sub-app をマージし、storage 書き込み用 payload を組み立てる。
 *
 * @param {readonly unknown[]} jsonPages
 * @param {{ history?: readonly unknown[] }|null|undefined} prevSubApp
 * @param {{ now?: number, liveId?: string }} [options]
 * @returns {{ subApp: { history: object[], totalCounts: object[], capturedAt: number, source: string, liveId: string }|null, throws: object[]|null }}
 */
export function buildKokenGiftPersistPayload(jsonPages, prevSubApp, options = {}) {
  if (!jsonPages.length) return { subApp: null, throws: null };
  const now =
    options && Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const kokenPayload = buildGiftSubAppPayloadFromKokenJsonPages(jsonPages, {
    ...options,
    now
  });
  const subApp = mergeGiftSubAppHistoryPayload(prevSubApp, kokenPayload);

  // throws（送り主別集計）は dedup 済みの subApp.history から導出する。
  // v0.1.600: ページ重複（同一 nextCount cursor がサーバから返る等）で
  //   normalizeKokenGiftHistoryResponse をページ毎に足すと throwCount/totalPoints が
  //   二重加算され、kokenHistoryId で dedup 済みの history と乖離する不具合があった。
  //   history は giftSubAppHistoryItemKey（kokenHistoryId 優先）で 1 件に畳まれているので、
  //   そこから集計すれば構造的に二重加算が消え、貢献度表示と常に整合する。
  const throws = aggregateGiftThrowsFromSubAppHistory(subApp?.history, now);
  return { subApp, throws };
}

/**
 * dedup 済みの sub-app `history[]` を、記名（数値 uid）ユーザだけの送り主別 throws に集計する。
 * 出力は nls_gift_history_throws_<lv> へ保存される形（userId/nickname/throwCount/totalPoints）。
 *
 * @param {readonly unknown[]|null|undefined} history
 * @param {number} now
 * @returns {{ userId: string, nickname: string, throwCount: number, totalPoints: number, capturedAt: number, avatarUrl?: string }[]|null}
 */
export function aggregateGiftThrowsFromSubAppHistory(history, now) {
  if (!Array.isArray(history) || history.length === 0) return null;
  /** @type {Map<string, { userId: string, nickname: string, throwCount: number, totalPoints: number, capturedAt: number, avatarUrl?: string }>} */
  const throwsByUser = new Map();
  for (const raw of history) {
    const r = /** @type {Record<string, unknown>} */ (raw || {});
    const uid = String(r.userId || '').trim();
    if (!NUMERIC_UID_RE.test(uid)) continue; // 匿名/名無しは throws に載せない（従来契約）
    const points = nonNegativeInt(r.points);
    const avatarUrl = sanitizeHttpUrl(r.senderAvatarUrl);
    const ex = throwsByUser.get(uid);
    if (ex) {
      ex.throwCount += 1;
      ex.totalPoints += points;
      if (avatarUrl) ex.avatarUrl = avatarUrl;
    } else {
      throwsByUser.set(uid, {
        userId: uid,
        nickname: String(r.senderName || '').trim() || uid,
        throwCount: 1,
        totalPoints: points,
        capturedAt: Number(r.capturedAt) || now,
        ...(avatarUrl ? { avatarUrl } : {})
      });
    }
  }
  return throwsByUser.size > 0 ? [...throwsByUser.values()] : null;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {object}
 */
function pickRicherGiftSubAppHistoryRow(a, b) {
  const score = (/** @type {unknown} */ raw) => {
    const r = /** @type {Record<string, unknown>} */ (raw || {});
    let s = 0;
    if (/^\d{1,18}$/.test(String(r.userId || '').trim())) s += 8;
    if (sanitizeHttpUrl(r.thumbnailUrl)) s += 4;
    if (sanitizeHttpUrl(r.senderAvatarUrl)) s += 2;
    const name = String(r.itemName || '').trim();
    if (name && name !== '（名称未取得）') s += 6;
    return s;
  };
  return score(a) >= score(b) ? /** @type {object} */ (a) : /** @type {object} */ (b);
}

/**
 * @param {unknown} item
 */
function giftSubAppHistoryItemKey(item) {
  const r = /** @type {Record<string, unknown>} */ (item || {});
  const kid = String(r.kokenHistoryId || '').trim();
  if (kid) return `koken:${kid}`;
  return `${String(r.time || '').trim()}\t${String(r.senderName || '').trim()}\t${String(r.itemName || '').trim()}\t${Number(r.points)}`;
}

/**
 * DOM/sub-app 由来 payload と koken API payload をマージ（重複行は 1 件に）。
 *
 * @param {{ history?: readonly unknown[], totalCounts?: readonly unknown[], capturedAt?: number, source?: string, liveId?: string }|null|undefined} prev
 * @param {{ history?: readonly unknown[], totalCounts?: readonly unknown[], capturedAt?: number, source?: string, liveId?: string }|null|undefined} next
 * @returns {{ history: object[], totalCounts: object[], capturedAt: number, source: string, liveId: string }|null}
 */
export function mergeGiftSubAppHistoryPayload(prev, next) {
  const n = next && typeof next === 'object' ? next : null;
  const p = prev && typeof prev === 'object' ? prev : null;
  if (!n || !Array.isArray(n.history) || n.history.length === 0) {
    if (!p || !Array.isArray(p.history) || p.history.length === 0) return null;
    return {
      history: [...p.history],
      totalCounts: Array.isArray(p.totalCounts) ? [...p.totalCounts] : [],
      capturedAt: Number(p.capturedAt) || Date.now(),
      source: String(p.source || 'dom-scrape'),
      liveId: String(p.liveId || '')
    };
  }
  if (!p || !Array.isArray(p.history) || p.history.length === 0) {
    return {
      history: [...n.history],
      totalCounts: Array.isArray(n.totalCounts) ? [...n.totalCounts] : [],
      capturedAt: Number(n.capturedAt) || Date.now(),
      source: String(n.source || 'koken-api'),
      liveId: String(n.liveId || '')
    };
  }

  /** @type {Map<string, object>} */
  const byKey = new Map();
  for (const raw of p.history) {
    const key = giftSubAppHistoryItemKey(raw);
    if (!key) continue;
    const prev = byKey.get(key);
    byKey.set(key, prev ? pickRicherGiftSubAppHistoryRow(prev, raw) : /** @type {object} */ (raw));
  }
  for (const raw of n.history) {
    const key = giftSubAppHistoryItemKey(raw);
    if (!key) continue;
    const prev = byKey.get(key);
    byKey.set(key, prev ? pickRicherGiftSubAppHistoryRow(prev, raw) : /** @type {object} */ (raw));
  }
  const history = [...byKey.values()].sort((a, b) => {
    const ra = /** @type {{ sortKey?: unknown, time?: unknown }} */ (a);
    const rb = /** @type {{ sortKey?: unknown, time?: unknown }} */ (b);
    const sa = Number(ra.sortKey);
    const sb = Number(rb.sortKey);
    if (Number.isFinite(sa) && Number.isFinite(sb) && sb !== sa) return sb - sa;
    return parseGiftStreamTimeSortKey(String(rb.time || '')) -
      parseGiftStreamTimeSortKey(String(ra.time || ''));
  });

  /** @type {Map<string, { itemName: string, count: number, thumbnailUrl: string }>} */
  const itemMap = new Map();
  const allCounts = [
    ...(Array.isArray(p.totalCounts) ? p.totalCounts : []),
    ...(Array.isArray(n.totalCounts) ? n.totalCounts : [])
  ];
  for (const raw of allCounts) {
    const r = /** @type {Record<string, unknown>} */ (raw || {});
    const name = String(r.itemName || '').trim();
    const count = nonNegativeInt(r.count);
    if (!name || !count) continue;
    const key = name.toLowerCase();
    const cur = itemMap.get(key) || { itemName: name, count: 0, thumbnailUrl: '' };
    cur.count = Math.max(cur.count, count);
    const thumb = sanitizeHttpUrl(r.thumbnailUrl);
    if (thumb) cur.thumbnailUrl = thumb;
    itemMap.set(key, cur);
  }
  for (const row of history) {
    const r = /** @type {Record<string, unknown>} */ (row);
    const name = String(r.itemName || '').trim();
    const key = name.toLowerCase();
    if (!key) continue;
    const cur = itemMap.get(key) || { itemName: name, count: 0, thumbnailUrl: '' };
    cur.count += 1;
    const thumb = sanitizeHttpUrl(r.thumbnailUrl);
    if (thumb) cur.thumbnailUrl = thumb;
    itemMap.set(key, cur);
  }

  const sources = new Set([String(p.source || ''), String(n.source || '')].filter(Boolean));
  let source = 'merged';
  if (sources.has('koken-api') && sources.has('dom-scrape')) source = 'merged';
  else if (sources.has('koken-api')) source = 'koken-api';
  else if (sources.has('dom-scrape')) source = 'dom-scrape';

  return {
    history,
    totalCounts: [...itemMap.values()].sort((a, b) => b.count - a.count),
    capturedAt: Math.max(Number(p.capturedAt) || 0, Number(n.capturedAt) || 0) || Date.now(),
    source,
    liveId: String(n.liveId || p.liveId || '')
  };
}

/**
 * 配信内オフセット時刻文字列をソート用秒数に（marketingGiftThrowLedger と共有）。
 * @param {string} timeLabel
 */
function parseGiftStreamTimeSortKey(timeLabel) {
  const s = String(timeLabel || '').trim();
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(String(p).replace(/[^\d]/g, ''), 10));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/**
 * @param {unknown} json
 * @param {{ now?: number }} [options]
 * @returns {StoredGiftUserWithThrows[]|null}
 */
export function normalizeKokenGiftHistoryResponse(json, options = {}) {
  if (!isLikelyKokenGiftHistoryShape(json)) return null;
  const histories = /** @type {any[]} */ (
    /** @type {Record<string, any>} */ (json).data.histories
  );
  const now =
    options && Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();

  /** @type {Map<string, StoredGiftUserWithThrows>} */
  const byKey = new Map();
  for (let i = 0; i < histories.length; i++) {
    const h = histories[i];
    if (!h || typeof h !== 'object') continue;

    const sidRaw = String(h.supporterId == null ? '' : h.supporterId).trim();
    const hasUid = NUMERIC_UID_RE.test(sidRaw);
    let name = String(h.supporterName == null ? '' : h.supporterName).trim();
    if (!name) {
      if (hasUid) name = sidRaw; // 表示名欠落＋記名 → uid を表示名に
      else continue; // 名無し＋匿名の壊れ行は捨てる
    }

    const userId = hasUid ? sidRaw : `__anon_${name}`;
    const points = nonNegativeInt(h.point);
    const avatarUrl = sanitizeHttpUrl(h.supporterThumbnailUrl);

    const ex = byKey.get(userId);
    if (ex) {
      ex.throwCount += 1;
      ex.totalPoints += points;
      if (avatarUrl) ex.avatarUrl = avatarUrl;
    } else {
      byKey.set(userId, {
        userId,
        nickname: name,
        throwCount: 1,
        totalPoints: points,
        capturedAt: now,
        ...(avatarUrl ? { avatarUrl } : {})
      });
    }
  }

  if (byKey.size === 0) return null;
  return [...byKey.values()];
}

/**
 * sub-app / koken `history[]` を北極星・ランク帯用の rooms 形に集計（送り主別 pt 降順）。
 *
 * @param {{ history?: readonly unknown[], capturedAt?: number, source?: string }|null|undefined} payload
 * @param {{ maxRooms?: number }} [opts]
 * @returns {{
 *   rooms: { userKey: string; nickname: string; count: number; avatarUrl: string }[];
 *   throwCount: number;
 *   senderCount: number;
 *   pointsSumAll: number;
 *   pointsSumDisplayed: number;
 *   capturedAt: number;
 *   source: string;
 * }|null}
 */
export function aggregateGiftSubAppHistoryBySender(payload, opts = {}) {
  const history = Array.isArray(payload?.history) ? payload.history : [];
  if (!history.length) return null;
  const maxRooms =
    typeof opts.maxRooms === 'number' && opts.maxRooms > 0 ? Math.trunc(opts.maxRooms) : 10;

  /** @type {Map<string, { nickname: string; count: number; avatarUrl: string; throwCount: number }>} */
  const byKey = new Map();

  for (const raw of history) {
    const r = /** @type {Record<string, unknown>} */ (raw || {});
    const points = nonNegativeInt(r.points);
    if (!points) continue;
    const uid = String(r.userId || '').trim();
    const hasUid = NUMERIC_UID_RE.test(uid);
    const nickname = String(r.senderName || '').trim() || (hasUid ? uid : '名無し');
    const userKey = hasUid ? uid : `__anon_${nickname}`;
    const avatarUrl = sanitizeHttpUrl(r.senderAvatarUrl);
    const cur = byKey.get(userKey) || {
      nickname,
      count: 0,
      avatarUrl: '',
      throwCount: 0
    };
    cur.count += points;
    cur.throwCount += 1;
    if (avatarUrl) cur.avatarUrl = avatarUrl;
    if (!cur.nickname && nickname) cur.nickname = nickname;
    byKey.set(userKey, cur);
  }

  if (!byKey.size) return null;
  const allSenders = [...byKey.entries()]
    .map(([userKey, v]) => ({
      userKey,
      nickname: v.nickname,
      count: v.count,
      avatarUrl: v.avatarUrl
    }))
    .sort((a, b) => b.count - a.count || a.nickname.localeCompare(b.nickname, 'ja'));
  const rooms = allSenders.slice(0, maxRooms);
  const pointsSumAll = allSenders.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const pointsSumDisplayed = rooms.reduce((s, r) => s + (Number(r.count) || 0), 0);

  return {
    rooms,
    throwCount: history.length,
    senderCount: allSenders.length,
    pointsSumAll,
    pointsSumDisplayed,
    capturedAt:
      typeof payload?.capturedAt === 'number' && Number.isFinite(payload.capturedAt)
        ? payload.capturedAt
        : 0,
    source: String(payload?.source || 'gift-sub-app').trim() || 'gift-sub-app'
  };
}
