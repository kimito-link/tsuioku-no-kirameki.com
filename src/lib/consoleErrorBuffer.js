/**
 * v0.1.201: window.error / unhandledrejection を捕捉する ring buffer。
 *
 * 診断 JSON `consoleErrorProbe` ブロックに格納するための pure-ish module。
 * 副作用は次の 2 つに限定：
 *   1. 自身の内部 buffer 更新（record / reset）
 *   2. install/uninstall で window.addEventListener / removeEventListener
 *
 * content-entry.js が boot 時に install して、診断ペイロード生成時に snapshot を読む。
 *
 * 既知の「ノイズ」エラー（ブラウザ内部の cosmetic warning や 拡張ブロックなど）は
 * 別カウンタ ignoredCount に振り分け、recentErrors には載せない（実害があるエラー
 * だけが ring buffer に残る）。
 */

/**
 * @typedef {{
 *   message: string,
 *   stack?: string,
 *   source: 'window.error' | 'unhandledrejection',
 *   timestamp: number
 * }} ConsoleErrorEntry
 *
 * @typedef {{
 *   recentErrors: ConsoleErrorEntry[],
 *   totalCount: number,
 *   ignoredCount: number
 * }} ConsoleErrorProbeSnapshot
 */

/**
 * 「実害なし」「拡張のせいではない」と判断する正規表現群。
 * - ERR_BLOCKED_BY_CLIENT: ad blocker 等で発生（ニコ生本体由来）
 * - ResizeObserver loop completed: Chrome 内部の cosmetic warning
 * - Script error.: cross-origin script の anonymized error（情報なし）
 * @type {RegExp[]}
 */
const IGNORED_PATTERNS = [
  /ERR_BLOCKED_BY_CLIENT/,
  /ResizeObserver loop completed/,
  /^Script error\.?$/i
];

/**
 * 与えられた message を「無視リスト」に該当するか判定する。
 * null/undefined/空文字は情報なしとして無視扱い（true）。
 *
 * @param {string|null|undefined} message
 * @returns {boolean}
 */
export function isIgnoredErrorMessage(message) {
  if (message == null) return true;
  const s = String(message);
  if (s.trim() === '') return true;
  for (const p of IGNORED_PATTERNS) {
    if (p.test(s)) return true;
  }
  return false;
}

/**
 * Ring buffer + window.error/unhandledrejection 自動捕捉。
 *
 * @param {{ capacity?: number }} [opts]
 * @returns {{
 *   record: (entry: Partial<ConsoleErrorEntry>) => void,
 *   snapshot: () => ConsoleErrorProbeSnapshot,
 *   reset: () => void,
 *   install: (target: { addEventListener: Function, removeEventListener: Function }) => void,
 *   uninstall: () => void
 * }}
 */
export function createConsoleErrorBuffer(opts = {}) {
  const capacity = Math.max(1, Number(opts?.capacity) || 20);
  /** @type {ConsoleErrorEntry[]} */
  let buffer = [];
  let totalCount = 0;
  let ignoredCount = 0;

  /** @type {{ target: any, errorListener: Function, rejectionListener: Function }|null} */
  let installation = null;

  /** @param {Partial<ConsoleErrorEntry>} entry */
  function record(entry) {
    if (!entry || typeof entry !== 'object') return;
    const message = typeof entry.message === 'string' ? entry.message : '';
    const stack = typeof entry.stack === 'string' ? entry.stack : undefined;
    const source =
      entry.source === 'unhandledrejection' || entry.source === 'window.error'
        ? entry.source
        : 'window.error';
    const timestamp =
      typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)
        ? entry.timestamp
        : Date.now();

    if (isIgnoredErrorMessage(message)) {
      // 「情報なし」(null/空) も ignored 集計だが、totally empty entry は
      // 何も記録すべきものがないので skip
      if (message === '' && !stack) return;
      ignoredCount += 1;
      return;
    }
    totalCount += 1;
    /** @type {ConsoleErrorEntry} */
    const rec = { message, source, timestamp };
    if (stack) rec.stack = stack;
    buffer.push(rec);
    while (buffer.length > capacity) buffer.shift();
  }

  /** @returns {ConsoleErrorProbeSnapshot} */
  function snapshot() {
    return {
      recentErrors: buffer.slice(),
      totalCount,
      ignoredCount
    };
  }

  function reset() {
    buffer = [];
    totalCount = 0;
    ignoredCount = 0;
  }

  /** @param {any} target */
  function install(target) {
    if (installation) return; // idempotent
    if (!target || typeof target.addEventListener !== 'function') return;
    /** @param {ErrorEvent} e */
    const errorListener = (e) => {
      try {
        record({
          message: String(e?.message || (e?.error && e.error.message) || ''),
          stack: e?.error?.stack ? String(e.error.stack) : undefined,
          source: 'window.error',
          timestamp: Date.now()
        });
      } catch {
        // 観測自体は壊さない
      }
    };
    /** @param {PromiseRejectionEvent} e */
    const rejectionListener = (e) => {
      try {
        const reason = /** @type {any} */ (e)?.reason;
        const message =
          typeof reason === 'string'
            ? reason
            : reason && typeof reason.message === 'string'
              ? reason.message
              : 'unhandled rejection';
        const stack =
          reason && typeof reason.stack === 'string' ? reason.stack : undefined;
        record({
          message,
          stack,
          source: 'unhandledrejection',
          timestamp: Date.now()
        });
      } catch {
        // 観測自体は壊さない
      }
    };
    target.addEventListener('error', errorListener);
    target.addEventListener('unhandledrejection', rejectionListener);
    installation = { target, errorListener, rejectionListener };
  }

  function uninstall() {
    if (!installation) return;
    const { target, errorListener, rejectionListener } = installation;
    try {
      target.removeEventListener('error', errorListener);
      target.removeEventListener('unhandledrejection', rejectionListener);
    } catch {
      // ignore
    }
    installation = null;
  }

  return { record, snapshot, reset, install, uninstall };
}
