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
export function buildKokenGiftHistoryUrl(liveId) {
  const lid = String(liveId == null ? '' : liveId).trim();
  if (!LIVE_ID_RE.test(lid)) return null;
  return (
    'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/' +
    encodeURIComponent(lid) +
    '/histories'
  );
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
