import { describe, expect, it, vi } from 'vitest';
import {
  parseSentryDsn,
  scrubUrlForReport,
  buildLiveviewErrorEvent,
  buildSentryEnvelopeRequest,
  shouldReportLiveviewError,
  installLiveviewErrorReporter,
  LIVEVIEW_ERROR_REPORT_MAX_PER_PAGE,
  LIVEVIEW_ERROR_MESSAGE_CAP
} from './liveviewErrorReport.js';

const DSN = 'https://abc123def@o450791.ingest.us.sentry.io/4510791371';

describe('parseSentryDsn', () => {
  it('正しい DSN を分解する', () => {
    expect(parseSentryDsn(DSN)).toEqual({
      publicKey: 'abc123def',
      host: 'o450791.ingest.us.sentry.io',
      projectId: '4510791371'
    });
  });

  it('空/不正は null(=レポータ全体が no-op)', () => {
    for (const bad of ['', null, undefined, 'http://x@y/1', 'https://key@host/abc', 'garbage']) {
      expect(parseSentryDsn(bad)).toBeNull();
    }
  });
});

describe('scrubUrlForReport(PIIスクラビングの核心)', () => {
  it('query/hash を全て落とす=viewToken を構造的に送らない', () => {
    expect(
      scrubUrlForReport('https://app.tsuioku-no-kirameki.com/live-view?v=SECRET_TOKEN&lv=lv123#frag')
    ).toBe('https://app.tsuioku-no-kirameki.com/live-view');
  });

  it('パース不能は空文字(落ちない)', () => {
    expect(scrubUrlForReport('not a url')).toBe('');
    expect(scrubUrlForReport(null)).toBe('');
  });
});

describe('buildLiveviewErrorEvent', () => {
  it('message/stack を上限で切り詰め、URLはスクラブ済みで載る', () => {
    const ev = buildLiveviewErrorEvent({
      name: 'TypeError',
      message: 'x'.repeat(1000),
      stack: 's'.repeat(9000),
      pageUrl: 'https://app.tsuioku-no-kirameki.com/live-view?v=TOKEN',
      release: '0711-020001',
      eventId: 'e'.repeat(32),
      nowIso: '2026-07-11T00:00:00.000Z'
    });
    expect(ev.exception.values[0].value.length).toBe(LIVEVIEW_ERROR_MESSAGE_CAP);
    expect(ev.extra.stack.length).toBe(4000);
    expect(ev.request.url).toBe('https://app.tsuioku-no-kirameki.com/live-view');
    expect(ev.request.url).not.toContain('TOKEN');
    expect(ev.release).toBe('0711-020001');
    expect(ev.platform).toBe('javascript');
  });
});

describe('buildSentryEnvelopeRequest', () => {
  it('envelope API の URL と 3行ボディを組む', () => {
    const parts = parseSentryDsn(DSN);
    const ev = buildLiveviewErrorEvent({
      message: 'boom', eventId: 'a'.repeat(32), nowIso: '2026-07-11T00:00:00.000Z'
    });
    const req = buildSentryEnvelopeRequest(parts, ev);
    expect(req.url).toBe(
      'https://o450791.ingest.us.sentry.io/api/4510791371/envelope/?sentry_key=abc123def&sentry_version=7&sentry_client=nls-liveview%2F1'
    );
    const lines = req.body.split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).event_id).toBe('a'.repeat(32));
    expect(JSON.parse(lines[1]).type).toBe('event');
    expect(JSON.parse(lines[2]).exception.values[0].value).toBe('boom');
  });
});

describe('shouldReportLiveviewError(送信ゲート)', () => {
  it('同一メッセージは1回だけ・上限で打ち止め', () => {
    const s = {};
    expect(shouldReportLiveviewError(s, 'same')).toBe(true);
    expect(shouldReportLiveviewError(s, 'same')).toBe(false); // dedupe
    for (let i = 0; i < LIVEVIEW_ERROR_REPORT_MAX_PER_PAGE - 1; i += 1) {
      expect(shouldReportLiveviewError(s, `m${i}`)).toBe(true);
    }
    expect(shouldReportLiveviewError(s, 'overflow')).toBe(false); // cap 到達
  });
});

describe('installLiveviewErrorReporter', () => {
  const makeWin = () => {
    /** @type {Record<string, Function[]>} */
    const listeners = {};
    return {
      location: { href: 'https://app.tsuioku-no-kirameki.com/live-view?v=TOKEN' },
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
      fire: (type, ev) => { for (const fn of listeners[type] || []) fn(ev); }
    };
  };

  it('DSN 空なら no-op(リスナも張らない)', () => {
    const win = makeWin();
    const r = installLiveviewErrorReporter({ dsn: '', win });
    expect(r.active).toBe(false);
  });

  it('window.error → envelope が fetch され、URLに TOKEN が含まれない', () => {
    const win = makeWin();
    const fetchFn = vi.fn(() => Promise.resolve({ ok: true }));
    installLiveviewErrorReporter({
      dsn: DSN, release: 'test-rel', win, fetchFn, randomHex: () => 'f'.repeat(32)
    });
    win.fire('error', { error: new Error('kaboom') });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('/envelope/');
    expect(init.body).toContain('kaboom');
    expect(init.body).not.toContain('TOKEN');
    expect(init.keepalive).toBe(true);
  });

  it('unhandledrejection(非Error reason)も送れる+同一メッセージは1回', () => {
    const win = makeWin();
    const fetchFn = vi.fn(() => Promise.resolve({ ok: true }));
    installLiveviewErrorReporter({
      dsn: DSN, win, fetchFn, randomHex: () => 'f'.repeat(32)
    });
    win.fire('unhandledrejection', { reason: 'plain string reason' });
    win.fire('unhandledrejection', { reason: 'plain string reason' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1].body).toContain('plain string reason');
  });

  it('fetch が reject しても throw しない(レポータは本体を壊さない)', () => {
    const win = makeWin();
    const fetchFn = vi.fn(() => Promise.reject(new Error('offline')));
    installLiveviewErrorReporter({ dsn: DSN, win, fetchFn, randomHex: () => 'f'.repeat(32) });
    expect(() => win.fire('error', { error: new Error('x') })).not.toThrow();
  });
});
