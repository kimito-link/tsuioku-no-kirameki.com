// historyBackfill.js — 配信中コメントの過去分さかのぼり(ページ送り・リトライ・上限判定)の共通純粋ロジック
// @layer L0 — 純粋計算(I/O 関数は呼び出し側から注入する)

export const BACKFILL_PAGE_GAP_MS = 550;
export const BACKFILL_MAX_ITEMS = 20_000;
export const BACKFILL_MAX_PAGES = 1_000;
export const BACKFILL_MAX_RETRIES = 4;

/**
 * 失敗・429 時の待ち時間(ms)。倍々バックオフ(1s → 2s → 4s → 8s、最大 16s)。
 * Retry-After(秒)があれば尊重しつつ最大 30s に丸める。
 * @param {number} attempt 0 始まりのリトライ回数
 * @param {unknown} [retryAfterRaw]
 */
export function backfillRetryDelayMs(attempt, retryAfterRaw) {
  const n = Math.max(0, Math.floor(Number(attempt) || 0));
  const base = Math.min(16_000, 1000 * 2 ** n);
  const ra = Number(retryAfterRaw);
  if (Number.isFinite(ra) && ra > 0) {
    return Math.min(30_000, Math.max(base, Math.ceil(ra * 1000)));
  }
  return base;
}

/**
 * 1 配信あたりの安全上限に達したか判定する。達していなければ ''。
 * @param {{ pages: number, items: number, maxPages?: number, maxItems?: number }} state
 * @returns {'' | 'max-pages' | 'max-items'}
 */
export function backfillBudgetStopReason(state) {
  const maxItems = state.maxItems ?? BACKFILL_MAX_ITEMS;
  const maxPages = state.maxPages ?? BACKFILL_MAX_PAGES;
  if (state.items >= maxItems) return 'max-items';
  if (state.pages >= maxPages) return 'max-pages';
  return '';
}

/**
 * 共通ページ送りループ。
 * fetchPage(cursor) は { ok: true, items: any[], nextCursor: any, stopReason?: string }
 *   または { ok: false, retryable: boolean, status?: number, retryAfter?: unknown, reason?: string } を返す。
 * @template TCursor
 * @param {{
 *   initialCursor: TCursor,
 *   fetchPage: (cursor: TCursor, pageIndex: number) => Promise<
 *     | { ok: true, items: any[], nextCursor: TCursor, stopReason?: string }
 *     | { ok: false, retryable?: boolean, status?: number, retryAfter?: unknown, reason?: string }
 *   >,
 *   onItems: (items: any[], pageIndex: number) => Promise<number> | number,
 *   isStopped?: () => boolean,
 *   sleep?: (ms: number) => Promise<void>,
 *   maxPages?: number,
 *   maxItems?: number,
 *   pageGapMs?: number,
 *   maxRetries?: number,
 * }} opts
 * @returns {Promise<{ pages: number, items: number, fails: number, stopReason: string }>}
 */
export async function runBackfillLoop(opts) {
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const isStopped = opts.isStopped || (() => false);
  const maxPages = opts.maxPages ?? BACKFILL_MAX_PAGES;
  const maxItems = opts.maxItems ?? BACKFILL_MAX_ITEMS;
  const pageGapMs = opts.pageGapMs ?? BACKFILL_PAGE_GAP_MS;
  const maxRetries = opts.maxRetries ?? BACKFILL_MAX_RETRIES;

  let cursor = opts.initialCursor;
  let pages = 0;
  let items = 0;
  let fails = 0;
  let stopReason = '';

  while (!isStopped()) {
    const budgetStop = backfillBudgetStopReason({ pages, items, maxPages, maxItems });
    if (budgetStop) {
      stopReason = budgetStop;
      break;
    }

    if (pages > 0 && pageGapMs > 0) {
      await sleep(pageGapMs);
      if (isStopped()) {
        stopReason = 'stopped';
        break;
      }
    }

    let res = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (isStopped()) {
        stopReason = 'stopped';
        break;
      }
      const r = await opts.fetchPage(cursor, pages);
      res = r;
      if (r.ok) break;
      const err = /** @type {{ retryable?: boolean, status?: number, retryAfter?: unknown, reason?: string }} */ (r);
      fails += 1;
      if (!err.retryable || attempt >= maxRetries) {
        stopReason = err.reason || (err.status === 429 ? 'rate-limit' : 'error');
        break;
      }
      await sleep(backfillRetryDelayMs(attempt, err.retryAfter));
    }

    if (stopReason || !res || !res.ok) break;

    pages += 1;
    const added = await opts.onItems(res.items, pages - 1);
    items += Math.max(0, Number(added) || 0);

    if (res.stopReason) {
      stopReason = res.stopReason;
      break;
    }
    cursor = res.nextCursor;
  }

  if (!stopReason && isStopped()) stopReason = 'stopped';
  return { pages, items, fails, stopReason: stopReason || 'done' };
}
