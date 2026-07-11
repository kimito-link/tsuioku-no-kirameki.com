/**
 * liveviewErrorReport.js — 純Web③(app.tsuioku-no-kirameki.com)専用の最小エラーレポータ(v0.1.1130)。
 *
 * 背景: ③は「他人のスマホ」で動く=状態速報のコピペを頼めない唯一の場所。JSが死んでも観測手段が
 * 無かった。Sentry(besttrust org・無料枠)へ未捕捉例外だけを送る。
 *
 * ★設計判断(会話 2026-07-11):
 *   - 拡張本体には入れない(consoleErrorProbe+状態速報が同役割・CWS/プライバシーリスク)。③のみ。
 *   - @sentry/browser SDK(~70KB)は使わず、Sentry envelope API へ直接 POST する最小実装(~100行)。
 *     breadcrumbs/トレースは不要=「どのページで・どのエラーが・どの版で」だけ届けば足りる。
 *   - PIIスクラビングは構造で保証: (1)URLは origin+pathname のみ(query/hash 全落とし=viewToken を
 *     絶対に送らない) (2)コメント本文などページ内容は一切収集しない(エラー message/stack のみ・
 *     長さ上限つき) (3)cookie/ユーザー識別子を載せない。
 *   - DSN はビルド同梱の公開値(Sentryの設計上secret ではない)。空文字なら全機能 no-op。
 *   - 送信上限: 1ページ滞在あたり MAX 8 件+同一メッセージは1回(嵐でSentry枠を食い潰さない)。
 *
 * DOM/network を触るのは installLiveviewErrorReporter だけ。他は純関数(全てユニットテスト対象)。
 */

/** 1ページ滞在で送る最大イベント数(無料枠5k/月の自衛)。 */
export const LIVEVIEW_ERROR_REPORT_MAX_PER_PAGE = 8;
/** message の送信上限文字数(想定外にユーザー内容が混ざっても切り詰める)。 */
export const LIVEVIEW_ERROR_MESSAGE_CAP = 300;
/** stack の送信上限文字数。 */
export const LIVEVIEW_ERROR_STACK_CAP = 4000;

/**
 * Sentry DSN をパースする。形: https://<publicKey>@<host>/<projectId>
 * @param {unknown} dsn
 * @returns {{ publicKey: string, host: string, projectId: string }|null} 不正なら null(=no-op)
 */
export function parseSentryDsn(dsn) {
  const s = String(dsn || '').trim();
  if (!s) return null;
  const m = /^https:\/\/([a-f0-9]+)@([^/]+)\/(\d+)$/i.exec(s);
  if (!m) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

/**
 * レポートに載せるURLから query/hash を全て落とす(viewToken 等の秘匿値を構造的に送らない)。
 * @param {unknown} rawUrl
 * @returns {string} origin+pathname のみ(パース不能なら空文字)
 */
export function scrubUrlForReport(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    return `${u.origin}${u.pathname}`;
  } catch {
    return '';
  }
}

/**
 * 未捕捉エラー1件を Sentry event 形へ(純関数)。
 * @param {{ name?: unknown, message?: unknown, stack?: unknown, pageUrl?: unknown, release?: unknown, eventId: string, nowIso: string }} input
 * @returns {LiveviewErrorEvent} Sentry event JSON
 */
export function buildLiveviewErrorEvent(input) {
  const name = String(input?.name || 'Error').slice(0, 100);
  const message = String(input?.message || '(no message)').slice(0, LIVEVIEW_ERROR_MESSAGE_CAP);
  const stack = String(input?.stack || '').slice(0, LIVEVIEW_ERROR_STACK_CAP);
  return {
    event_id: input.eventId,
    timestamp: input.nowIso,
    platform: 'javascript',
    level: 'error',
    logger: 'liveview-web',
    release: String(input?.release || 'unknown').slice(0, 60),
    environment: 'production',
    request: { url: scrubUrlForReport(input?.pageUrl) },
    exception: { values: [{ type: name, value: message }] },
    extra: stack ? { stack } : {}
  };
}

/**
 * @typedef {{ event_id: string, timestamp: string, platform: string, level: string, logger: string,
 *   release: string, environment: string, request: { url: string },
 *   exception: { values: Array<{ type: string, value: string }> }, extra: Record<string, string> }} LiveviewErrorEvent
 */

/**
 * envelope API への POST 先とボディを組む(純関数)。
 * @param {{ publicKey: string, host: string, projectId: string }} dsnParts
 * @param {LiveviewErrorEvent} event buildLiveviewErrorEvent の戻り
 * @returns {{ url: string, body: string }}
 */
export function buildSentryEnvelopeRequest(dsnParts, event) {
  const url =
    `https://${dsnParts.host}/api/${dsnParts.projectId}/envelope/` +
    `?sentry_key=${dsnParts.publicKey}&sentry_version=7&sentry_client=nls-liveview%2F1`;
  const header = JSON.stringify({ event_id: event.event_id, sent_at: event.timestamp });
  const item = JSON.stringify({ type: 'event' });
  const body = `${header}\n${item}\n${JSON.stringify(event)}`;
  return { url, body };
}

/**
 * 送信ゲート(破壊的更新): 同一メッセージは1回・1ページ MAX_PER_PAGE 件まで。
 * @param {{ sent?: number, seen?: Set<string> }} state
 * @param {string} messageKey
 * @returns {boolean} true=送ってよい
 */
export function shouldReportLiveviewError(state, messageKey) {
  if (!state || typeof state !== 'object') return false;
  if (!(state.seen instanceof Set)) state.seen = new Set();
  if (typeof state.sent !== 'number') state.sent = 0;
  if (state.sent >= LIVEVIEW_ERROR_REPORT_MAX_PER_PAGE) return false;
  const key = String(messageKey || '').slice(0, 200);
  if (state.seen.has(key)) return false;
  state.seen.add(key);
  state.sent += 1;
  return true;
}

/**
 * window.error / unhandledrejection を購読して Sentry へ送る(③エントリから1回だけ呼ぶ)。
 * DSN が空/不正なら何もしない(no-op)。fetch 失敗は握りつぶす(レポータが本体を壊さない)。
 * @param {{ dsn: unknown, release?: unknown, win?: Window, fetchFn?: typeof fetch, randomHex?: () => string }} opts
 * @returns {{ active: boolean }}
 */
export function installLiveviewErrorReporter(opts) {
  const dsnParts = parseSentryDsn(opts?.dsn);
  if (!dsnParts) return { active: false };
  const win = opts?.win || (typeof window !== 'undefined' ? window : null);
  if (!win) return { active: false };
  const fetchFn = opts?.fetchFn || ((u, i) => fetch(u, i));
  const randomHex =
    opts?.randomHex ||
    (() => {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
    });
  const state = { sent: 0, seen: new Set() };
  /** @param {{ name?: unknown, message?: unknown, stack?: unknown }} err */
  const report = (err) => {
    try {
      const message = String(err?.message || '(no message)');
      if (!shouldReportLiveviewError(state, message)) return;
      const event = buildLiveviewErrorEvent({
        name: err?.name,
        message,
        stack: err?.stack,
        pageUrl: win.location?.href,
        release: opts?.release,
        eventId: randomHex(),
        nowIso: new Date().toISOString()
      });
      const req = buildSentryEnvelopeRequest(dsnParts, event);
      // text/plain=プリフライト無し。keepalive=ページ離脱直前のエラーも届く。
      void fetchFn(req.url, {
        method: 'POST',
        body: req.body,
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
      }).catch(() => {});
    } catch {
      // レポータの失敗は本体に影響させない
    }
  };
  win.addEventListener('error', (ev) => {
    const e = /** @type {ErrorEvent} */ (ev);
    report(e?.error || { message: e?.message });
  });
  win.addEventListener('unhandledrejection', (ev) => {
    const r = /** @type {PromiseRejectionEvent} */ (ev)?.reason;
    report(r instanceof Error ? r : { message: String(r) });
  });
  return { active: true };
}
