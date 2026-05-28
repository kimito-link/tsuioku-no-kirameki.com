/**
 * PR1（feat/multitab-scale-ultraC）: 外部 API poll を Service Worker に集約するための純ロジック。
 *
 * 背景（[[reference_multitab_scale_ultraC_leader_election]] / [[plan_multitab_scale_ultraC]]）:
 *   koken/nicoad/event-participation/profile などの外部 API は、同一 liveId を見ている各 watch
 *   タブが独立に 30 秒ごとに fetch していた（N タブ＝N×fetch・同じ per-liveId キーへ重複書込）。
 *   SW が「いま記録中の liveId 集合」を1か所で持ち、alarm 発火時に liveId ごと 1 回だけ fetch
 *   すれば 7×→1× になる。
 *
 *   この純関数は「アクティブ liveId 集合」の正規化・TTL 期限切れ除去・自己登録のマージだけを
 *   担う（chrome 非依存・vitest 可能）。SW は ESM import 不可の手書き成果物なので、SW へは
 *   この lib の挙動を手書きコピーし、契約はここの test で固定する（koken の文字列同期と同運用）。
 *
 * @module externalPollCoordinator
 */

/** SW がアクティブ liveId 集合を持つ storage キー（SW と手書き同期）。 */
export const KEY_ACTIVE_LIVE_IDS = 'nls_active_live_ids_v1';

/** 自己登録の有効期限（ms）。この時間タブから ping が来なければ集合から落とす。 */
export const ACTIVE_LIVE_ID_TTL_MS = 90_000;

/** lv 形式（lv + 1〜15 桁数字）。それ以外は集合に入れない（SSRF/異常値ガード）。 */
const LIVE_ID_RE = /^lv\d{1,15}$/;

/**
 * @typedef {{ lv: string, ts: number }} ActiveLiveIdEntry
 */

/**
 * 保存済みの集合（任意形）を `ActiveLiveIdEntry[]` に正規化する。
 * - lv 形式でないもの・ts 不正は捨てる。
 * - 同一 lv は最新 ts を残す（重複除去）。
 *
 * @param {unknown} raw chrome.storage.local.get(KEY_ACTIVE_LIVE_IDS) の値
 * @returns {ActiveLiveIdEntry[]}
 */
export function normalizeActiveLiveIds(raw) {
  /** @type {unknown[]} */
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object' && Array.isArray(/** @type {any} */ (raw).items)) {
    list = /** @type {any} */ (raw).items;
  }
  /** @type {Map<string, number>} */
  const byLv = new Map();
  for (const item of list) {
    const lv = String(/** @type {any} */ (item)?.lv || '').trim().toLowerCase();
    if (!LIVE_ID_RE.test(lv)) continue;
    const ts = Number(/** @type {any} */ (item)?.ts);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const prev = byLv.get(lv);
    if (prev == null || ts > prev) byLv.set(lv, ts);
  }
  return [...byLv.entries()].map(([lv, ts]) => ({ lv, ts }));
}

/**
 * TTL 期限切れエントリを除いた、いま「生きている」 liveId 配列を返す（lv の文字列配列）。
 *
 * @param {unknown} raw 保存済み集合
 * @param {number} nowMs
 * @param {number} [ttlMs]
 * @returns {string[]} 生存 lv（重複なし）
 */
export function liveActiveLiveIds(raw, nowMs, ttlMs = ACTIVE_LIVE_ID_TTL_MS) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : ACTIVE_LIVE_ID_TTL_MS;
  return normalizeActiveLiveIds(raw)
    .filter((e) => now - e.ts < ttl)
    .map((e) => e.lv);
}

/**
 * 自タブの liveId を集合に登録（または ts 更新）した次の集合を返す。期限切れも同時に掃除する。
 * 保存形は `{ items: ActiveLiveIdEntry[] }`（将来フィールド追加に強い形）。
 *
 * @param {unknown} raw 現在の保存済み集合
 * @param {string} liveId 自タブの記録中 liveId
 * @param {number} nowMs
 * @param {number} [ttlMs]
 * @returns {{ items: ActiveLiveIdEntry[] }}
 */
export function upsertActiveLiveId(raw, liveId, nowMs, ttlMs = ACTIVE_LIVE_ID_TTL_MS) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : ACTIVE_LIVE_ID_TTL_MS;
  const lv = String(liveId || '').trim().toLowerCase();
  /** @type {Map<string, number>} */
  const byLv = new Map();
  for (const e of normalizeActiveLiveIds(raw)) {
    if (now - e.ts < ttl) byLv.set(e.lv, e.ts); // 期限切れは落とす
  }
  if (LIVE_ID_RE.test(lv)) byLv.set(lv, now); // 自分を最新 ts で登録
  return { items: [...byLv.entries()].map(([k, v]) => ({ lv: k, ts: v })) };
}

/**
 * content 側の fail-open セーフティ判定: SW が一定時間 per-liveId キーを書いていなければ
 * 自タブが 1 回だけ直接 fetch すべきか。SW 集約が動いていない環境（SW 落ち・古い版）でも
 * データが来るようにする保険。
 *
 * @param {number|null|undefined} lastWrittenAtMs 該当 per-liveId キーの最終 capturedAt（無ければ null）
 * @param {number} nowMs
 * @param {number} staleMs この時間 SW が書いていなければ self-fetch 許可
 * @returns {boolean}
 */
export function shouldSelfFetchAsFallback(lastWrittenAtMs, nowMs, staleMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const stale = Number.isFinite(staleMs) && staleMs > 0 ? staleMs : 60_000;
  const last = Number(lastWrittenAtMs);
  if (!Number.isFinite(last) || last <= 0) return true; // 一度も書かれていない → self-fetch
  return now - last >= stale;
}
