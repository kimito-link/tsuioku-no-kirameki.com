// comeviewLivePush.js — コメビュ(別窓)の読み上げへ、届いたコメントを storage を待たずに渡す(P5b・2026-10-29)。
//   DOM も chrome API も触らない純関数。配線は content 側 src/extension/comeviewLivePushHost.js と comeview-entry.js。
//
// 背景(計画書 voice-lag-volume-plan.md P5b):
//   会場は v0.1.752 から同じ content script 内で新着を即受け取る(onLiveComments)。
//   コメビュは storage 経由だけで、保存のまとめ書き(persistCoalescer・最大1.5秒)と書き込み・onChanged を
//   待ってから読み上げに入っていた。コメビュ側から watch タブへ port を開いたときだけ、新着をその port へも流す。
//   ★表示は今までどおり storage 経由(この経路は読み上げ専用)。同じコメントは commentNo で1回だけ読む。
//   ★コメビュが開いていなければ port が無い=content 側は何もしない(費用ゼロ)。

/** コメビュ → watch タブの port 名。 */
export const COMEVIEW_LIVE_PORT_NAME = 'nls-comeview-live-v1';

/** port で流すメッセージの種類。 */
export const COMEVIEW_LIVE_ROWS_TYPE = 'nls_comeview_live_rows';

/** 1回に流す最大件数(一気に来たときに port を詰まらせない。読み上げの列も8件まで)。 */
export const COMEVIEW_LIVE_PUSH_MAX_ROWS = 50;

/** 読んだ commentNo を覚えておく件数。 */
export const COMEVIEW_VOICE_READ_NOS_LIMIT = 2000;

/**
 * コメビュへ流す行。commentNo のある行だけ(storage 経由で後から来る同じ行と突き合わせるため)。
 *   一気に来たときは新しい方の COMEVIEW_LIVE_PUSH_MAX_ROWS 件。
 * @param {unknown} rows
 * @returns {Record<string, unknown>[]}
 */
export function pickComeviewPushRows(rows) {
  if (!Array.isArray(rows)) return [];
  const picked = rows.filter((r) => r && typeof r === 'object' && String(/** @type {any} */ (r).commentNo || '').trim() !== '');
  return /** @type {Record<string, unknown>[]} */ (picked.slice(-COMEVIEW_LIVE_PUSH_MAX_ROWS));
}

/**
 * port のメッセージを検証する。形が違えば null(壊れたメッセージで読み上げを止めない)。
 * @param {unknown} msg
 * @returns {{ liveId: string, rows: Record<string, unknown>[] } | null}
 */
export function parseComeviewLiveMessage(msg) {
  const m = /** @type {any} */ (msg);
  if (!m || typeof m !== 'object' || m.type !== COMEVIEW_LIVE_ROWS_TYPE) return null;
  const liveId = String(m.liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(liveId) || !Array.isArray(m.rows)) return null;
  return { liveId, rows: pickComeviewPushRows(m.rows) };
}

/**
 * まだ読んでいないコメントだけ通し、通した commentNo を覚える。番号の無い項目(ギフト等)はそのまま通す。
 * @template T
 * @param {readonly T[]} items
 * @param {Set<string>} readNos 呼び出し側が持つ(この関数が書き足す)
 * @param {(item: T) => unknown} noOf
 * @param {number} [limit]
 * @returns {T[]}
 */
export function takeUnreadVoiceItems(items, readNos, noOf, limit = COMEVIEW_VOICE_READ_NOS_LIMIT) {
  if (!Array.isArray(items) || !(readNos instanceof Set)) return Array.isArray(items) ? [...items] : [];
  /** @type {T[]} */
  const out = [];
  for (const item of items) {
    const no = String(noOf(item) ?? '').trim();
    if (!no) { out.push(item); continue; }
    if (readNos.has(no)) continue;
    readNos.add(no);
    out.push(item);
  }
  while (readNos.size > limit) {
    const oldest = readNos.values().next().value;
    if (oldest === undefined) break;
    readNos.delete(oldest);
  }
  return out;
}

/**
 * コメビュが繋ぐ watch タブを選ぶ。URL にその配信の lv を含むタブのうち、最後に使ったもの。
 * @param {readonly { id?: number, url?: string, lastAccessed?: number }[]} tabs
 * @param {string} liveId
 * @returns {number | null}
 */
export function pickWatchTabIdForLive(tabs, liveId) {
  const lv = String(liveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lv) || !Array.isArray(tabs)) return null;
  let best = null;
  let bestAt = -Infinity;
  for (const t of tabs) {
    if (!t || typeof t.id !== 'number') continue;
    const url = String(t.url || '').toLowerCase();
    if (!/\/watch\//.test(url)) continue;
    const m = url.match(/lv\d{1,15}/);
    if (!m || m[0] !== lv) continue;
    const at = Number(t.lastAccessed) || 0;
    if (at > bestAt) { best = t.id; bestAt = at; }
  }
  return best;
}
