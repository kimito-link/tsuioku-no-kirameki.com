/**

 * popup / content から service-worker 経由で koken ギフト履歴 API を叩く薄いクライアント。

 */



import {

  KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE,

  readKokenGiftHistoryNextCursor

} from './kokenGiftHistoryApi.js';



/**

 * @typedef {{ ok?: boolean, status?: number, json?: unknown }} KokenGiftHistoryFetchResponse

 */



/**

 * @param {string} liveId

 * @param {{ timeoutMs?: number, nextCursor?: number|null }} [opts]

 * @returns {Promise<KokenGiftHistoryFetchResponse|null>}

 */

export function fetchKokenGiftHistoryViaExtension(liveId, opts = {}) {

  const lid = String(liveId || '').trim().toLowerCase();

  if (!/^lv\d{1,15}$/.test(lid)) return Promise.resolve(null);

  const timeoutMs =

    typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0

      ? Math.trunc(opts.timeoutMs)

      : 10_000;

  const nextCursor =

    opts.nextCursor != null && Number.isFinite(Number(opts.nextCursor)) && Number(opts.nextCursor) > 0

      ? Math.floor(Number(opts.nextCursor))

      : null;



  return new Promise((resolve) => {

    let settled = false;

    const finish = (/** @type {KokenGiftHistoryFetchResponse|null} */ v) => {

      if (settled) return;

      settled = true;

      resolve(v);

    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    try {

      chrome.runtime.sendMessage(

        {

          type: KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE,

          liveId: lid,

          ...(nextCursor != null ? { nextCursor } : {})

        },

        (resp) => {

          clearTimeout(timer);

          try {

            if (chrome.runtime.lastError) {

              finish(null);

              return;

            }

            finish(resp && typeof resp === 'object' ? /** @type {KokenGiftHistoryFetchResponse} */ (resp) : null);

          } catch {

            finish(null);

          }

        }

      );

    } catch {

      clearTimeout(timer);

      finish(null);

    }

  });

}



/**

 * nextCount ページングで全ページを取得（長時間配信の histories 切れ対策）。

 *

 * @param {string} liveId

 * @param {{ timeoutMs?: number, maxPages?: number }} [opts]

 * @returns {Promise<readonly unknown[]>}

 */

export async function fetchKokenGiftHistoryAllViaExtension(liveId, opts = {}) {

  const maxPages =

    typeof opts.maxPages === 'number' && opts.maxPages > 0 ? Math.trunc(opts.maxPages) : 15;

  /** @type {unknown[]} */

  const pages = [];

  /** @type {Set<string>} v0.1.600: 同一 cursor の無限/重複ページ取得を防ぐ */

  const seenCursors = new Set();

  let cursor = null;

  for (let i = 0; i < maxPages; i += 1) {

    const resp = await fetchKokenGiftHistoryViaExtension(liveId, {

      timeoutMs: opts.timeoutMs,

      nextCursor: cursor

    });

    if (!resp?.ok || resp.json == null) break;

    pages.push(resp.json);

    const next = readKokenGiftHistoryNextCursor(resp.json);

    if (next == null) break;

    // サーバが同じ nextCount を返し続ける場合は打ち切り（同一ページ重複取得の根本封じ）。

    const nextKey = String(next);

    if (seenCursors.has(nextKey)) break;

    seenCursors.add(nextKey);

    cursor = next;

  }

  return pages;

}


