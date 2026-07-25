/** @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSupportAvatarLoadGuard, isProbeRetryEligible } from './supportGrowthAvatarLoad.js';
import { NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS } from './supportGrowthTileSrc.js';

const FALLBACK = NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS;
const REMOTE = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/123456789.jpg';

afterEach(() => {
  vi.useRealTimers();
});

describe('createSupportAvatarLoadGuard', () => {
  it('pickDisplaySrc はローカル相対パスをそのまま返す', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    expect(g.pickDisplaySrc(FALLBACK)).toBe(FALLBACK);
  });

  it('pickDisplaySrc は未確認の https をフォールバックに返す（フリッカー防止）', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
  });

  it('markSucceededForTests 後は https をそのまま返す', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markSucceededForTests(REMOTE);
    expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
  });

  it('markFailedForTests 後は同一 URL をフォールバックに差し替える', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markFailedForTests(REMOTE);
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
  });

  it('noteRemoteAttempt はプローブ Image を返し、error でフォールバック登録', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    const img = document.createElement('img');
    img.src = FALLBACK;
    const probe = g.noteRemoteAttempt(img, REMOTE);
    expect(probe).toBeInstanceOf(HTMLImageElement);
    probe.dispatchEvent(new Event('error'));
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
    expect(img.src).toContain('nicoaccount/usericon/defaults');
  });

  it('noteRemoteAttempt + probe load で img.src が差し替わり succeeded 登録', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    const img = document.createElement('img');
    img.src = FALLBACK;
    const probe = g.noteRemoteAttempt(img, REMOTE);
    expect(probe).toBeInstanceOf(HTMLImageElement);
    probe.dispatchEvent(new Event('load'));
    expect(img.src).toContain('123456789');
    expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
  });

  it('フォールバック登録後に error を再送してもリスナは再登録されず例外にならない', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    const img = document.createElement('img');
    img.src = FALLBACK;
    const probe = g.noteRemoteAttempt(img, REMOTE);
    probe.dispatchEvent(new Event('error'));
    expect(() => probe.dispatchEvent(new Event('error'))).not.toThrow();
  });

  it('pick が既にフォールバックなら noteRemoteAttempt はプローブを作らない', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markFailedForTests(REMOTE);
    const img = document.createElement('img');
    img.src = g.pickDisplaySrc(REMOTE);
    const probe = g.noteRemoteAttempt(img, REMOTE);
    expect(probe).toBeNull();
  });

  it('error 時に onFallbackApplied を呼ぶ', () => {
    let called = 0;
    const g = createSupportAvatarLoadGuard({
      fallbackSrc: FALLBACK,
      onFallbackApplied: () => {
        called += 1;
      }
    });
    const img = document.createElement('img');
    img.className = 'nl-story-growth-icon';
    img.src = FALLBACK;
    const probe = g.noteRemoteAttempt(img, REMOTE);
    probe.dispatchEvent(new Event('error'));
    expect(called).toBe(1);
  });

  it('load 成功時に onRemoteSuccess を呼ぶ', () => {
    let called = 0;
    const g = createSupportAvatarLoadGuard({
      fallbackSrc: FALLBACK,
      onRemoteSuccess: () => {
        called += 1;
      }
    });
    const img = document.createElement('img');
    img.src = FALLBACK;
    const probe = g.noteRemoteAttempt(img, REMOTE);
    probe.dispatchEvent(new Event('load'));
    expect(called).toBe(1);
    expect(img.src).toContain('123456789');
  });

  it('clearFailedUrls で再びプローブ対象になる', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markFailedForTests(REMOTE);
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
    g.clearFailedUrls();
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
    const img = document.createElement('img');
    const probe = g.noteRemoteAttempt(img, REMOTE);
    expect(probe).toBeInstanceOf(HTMLImageElement);
  });

  it('noteRemoteAttempt は timeoutMs 経過で failedKeys に登録', () => {
    vi.useFakeTimers();
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK, timeoutMs: 3000 });
    const img = document.createElement('img');
    img.src = FALLBACK;
    g.noteRemoteAttempt(img, REMOTE);
    vi.advanceTimersByTime(3001);
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
  });

  it('load 済みなら timeout 経過しても failedKeys に入らない', () => {
    vi.useFakeTimers();
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK, timeoutMs: 3000 });
    const img = document.createElement('img');
    img.src = FALLBACK;
    const probe = g.noteRemoteAttempt(img, REMOTE);
    probe.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(3001);
    expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
  });

  it('同一 img で URL が変わるとき古いプローブがキャンセルされる', () => {
    const REMOTE2 = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/2/222222222.jpg';
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    const img = document.createElement('img');
    img.src = FALLBACK;
    const probe1 = g.noteRemoteAttempt(img, REMOTE);
    const probe2 = g.noteRemoteAttempt(img, REMOTE2);
    expect(probe2).toBeInstanceOf(HTMLImageElement);
    probe1.dispatchEvent(new Event('load'));
    expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
    probe2.dispatchEvent(new Event('load'));
    expect(g.pickDisplaySrc(REMOTE2)).toBe(REMOTE2);
    expect(img.src).toContain('222222222');
  });

  it('succeeded な URL は noteRemoteAttempt でプローブ不要、即 img.src 設定', () => {
    const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
    g.markSucceededForTests(REMOTE);
    const img = document.createElement('img');
    img.src = FALLBACK;
    const probe = g.noteRemoteAttempt(img, REMOTE);
    expect(probe).toBeNull();
    expect(img.src).toContain('123456789');
  });

  describe('getDiagnostics（②サムネ未表示の実機切り分け）', () => {
    it('usericon URL の成功/失敗を集計し、失敗サンプルを最大5件返す', () => {
      const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
      g.markSucceededForTests(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/100000.jpg'
      );
      for (let i = 0; i < 7; i += 1) {
        g.markFailedForTests(
          `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${i}/${i}99999.jpg`
        );
      }
      // usericon でない URL（成否集計には含むが usericon カウントには含めない）
      g.markFailedForTests('https://example.com/other.png');
      const d = g.getDiagnostics();
      expect(d.usericonSucceeded).toBe(1);
      expect(d.usericonFailed).toBe(7);
      expect(d.failedTotal).toBe(8); // usericon7 + other1
      expect(d.succeededTotal).toBe(1);
      expect(d.failedUsericonSamples.length).toBe(5); // 最大5件
      expect(d.failedUsericonSamples.every((s) => s.includes('usericon'))).toBe(true);
    });

    it('何も無いときは全て 0 / 空配列', () => {
      const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
      const d = g.getDiagnostics();
      expect(d).toEqual({
        succeededTotal: 0,
        failedTotal: 0,
        usericonSucceeded: 0,
        usericonFailed: 0,
        failedUsericonSamples: [],
        failedTimeout: 0,
        failedError: 0,
        retriedTotal: 0,
        lastFailAgoMs: null
      });
    });

    it('venue-avatar-stale-mirror-DESIGN.md §D: 失敗種別(timeout/error)を分けて集計する', () => {
      const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
      g.markFailedForTests(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/111111.jpg',
        'timeout'
      );
      g.markFailedForTests(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/2/222222.jpg',
        'error'
      );
      g.markFailedForTests(
        'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/3/333333.jpg',
        'timeout'
      );
      const d = g.getDiagnostics();
      expect(d.failedTimeout).toBe(2);
      expect(d.failedError).toBe(1);
      expect(d.retriedTotal).toBe(0);
      expect(d.lastFailAgoMs).not.toBeNull();
      expect(d.lastFailAgoMs).toBeGreaterThanOrEqual(0);
    });

    it('noteRemoteAttempt の timeout 失敗は getDiagnostics().failedTimeout に、error 失敗は failedError に計上される', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK, timeoutMs: 3000 });
      const imgTimeout = document.createElement('img');
      imgTimeout.src = FALLBACK;
      g.noteRemoteAttempt(imgTimeout, REMOTE);
      vi.advanceTimersByTime(3001);

      const REMOTE2 = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/9/999999999.jpg';
      const imgError = document.createElement('img');
      imgError.src = FALLBACK;
      const probe = g.noteRemoteAttempt(imgError, REMOTE2);
      probe.dispatchEvent(new Event('error'));

      const d = g.getDiagnostics();
      expect(d.failedTimeout).toBe(1);
      expect(d.failedError).toBe(1);
    });
  });

  describe('isProbeRetryEligible(venue-avatar-stale-mirror-DESIGN.md §C-1b・純関数)', () => {
    const policy = { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 };

    it('policyがnull/undefinedなら常にfalse(従来の恒久負キャッシュ=後方互換)', () => {
      const rec = { failCount: 1, lastFailAt: 0 };
      expect(isProbeRetryEligible(rec, 1_000_000, null)).toBe(false);
      expect(isProbeRetryEligible(rec, 1_000_000, undefined)).toBe(false);
    });

    it('recがnull/undefinedならfalse', () => {
      expect(isProbeRetryEligible(null, 1_000_000, policy)).toBe(false);
      expect(isProbeRetryEligible(undefined, 1_000_000, policy)).toBe(false);
    });

    it('baseMs未経過ならfalse', () => {
      const rec = { failCount: 1, lastFailAt: 1000 };
      expect(isProbeRetryEligible(rec, 1000 + 29_000, policy)).toBe(false);
    });

    it('baseMs経過後はtrue(failCount=1の初回バックオフ)', () => {
      const rec = { failCount: 1, lastFailAt: 1000 };
      expect(isProbeRetryEligible(rec, 1000 + 30_001, policy)).toBe(true);
    });

    it('failCountが増えるほど指数バックオフで長く待つ', () => {
      // failCount=3 → backoff = 30_000 * 2^2 = 120_000
      const rec = { failCount: 3, lastFailAt: 1000 };
      expect(isProbeRetryEligible(rec, 1000 + 119_000, policy)).toBe(false);
      expect(isProbeRetryEligible(rec, 1000 + 120_001, policy)).toBe(true);
    });

    it('maxMsで頭打ちになる', () => {
      // failCount=10なら 30_000*2^9 は maxMs(600_000)を大幅に超えるが、頭打ちされる
      const rec = { failCount: 10, lastFailAt: 1000 };
      // maxAttempts=5なのでこのfailCountは既にeligible対象外(下のテストで別途検証)。
      // ここではmaxAttemptsを緩めたpolicyでbackoff頭打ちだけを検証する。
      const loosePolicy = { baseMs: 30_000, maxMs: 600_000, maxAttempts: 100 };
      expect(isProbeRetryEligible(rec, 1000 + 599_000, loosePolicy)).toBe(false);
      expect(isProbeRetryEligible(rec, 1000 + 600_001, loosePolicy)).toBe(true);
    });

    it('failCountがmaxAttempts以上ならfalse(404恒久URLへの無限リトライを止める)', () => {
      const rec = { failCount: 5, lastFailAt: 1000 };
      expect(isProbeRetryEligible(rec, 1000 + 10_000_000, policy)).toBe(false);
    });

    it('lastFailAtが無い(0)ならfalse', () => {
      const rec = { failCount: 1, lastFailAt: 0 };
      expect(isProbeRetryEligible(rec, 1_000_000, policy)).toBe(false);
    });
  });

  describe('retryPolicy opt-in(venue-avatar-stale-mirror-DESIGN.md §C-1b/1c・段階1)', () => {
    it('retryPolicy未指定(既定null)なら、timeout失敗後もbackoff経過で再プローブされない(popup互換)', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK, timeoutMs: 3000 });
      const img = document.createElement('img');
      img.src = FALLBACK;
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001);
      expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
      // 30秒以上経過してもretryPolicy無しなら拒否されたまま。
      vi.advanceTimersByTime(60_000);
      const probe2 = g.noteRemoteAttempt(img, REMOTE);
      expect(probe2).toBeNull();
    });

    it('retryPolicy指定時、backoff経過後の再noteRemoteAttemptはeligibleならプローブを再発行する', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 }
      });
      const img = document.createElement('img');
      img.src = FALLBACK;
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001); // timeout失敗登録
      expect(g.pickDisplaySrc(REMOTE)).toBe(FALLBACK);
      vi.advanceTimersByTime(30_001); // backoff経過
      const probe2 = g.noteRemoteAttempt(img, REMOTE);
      expect(probe2).toBeInstanceOf(HTMLImageElement);
      expect(g.getDiagnostics().retriedTotal).toBe(1);
      // 再プローブが成功すればgetDiagnostics().retriedTotalは1のまま(成功はretriedとは別集計)、
      // かつpickDisplaySrcが正URLへ復帰する。
      probe2.dispatchEvent(new Event('load'));
      expect(g.pickDisplaySrc(REMOTE)).toBe(REMOTE);
    });

    it('noteRemoteAttemptは失敗キーへの再試行時、img.dataset.nlsbAvatarRetrySrcを刻む', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 }
      });
      const img = document.createElement('img');
      img.src = FALLBACK;
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001);
      expect(img.dataset.nlsbAvatarRetrySrc).toBe(REMOTE);
    });

    it('プローブ成功時、img.dataset.nlsbAvatarRetrySrcが削除される', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 }
      });
      const img = document.createElement('img');
      img.src = FALLBACK;
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001);
      vi.advanceTimersByTime(30_001);
      const probe2 = g.noteRemoteAttempt(img, REMOTE);
      probe2.dispatchEvent(new Event('load'));
      expect(img.dataset.nlsbAvatarRetrySrc).toBeUndefined();
    });

    it('maxAttempts到達後はretryPolicy指定でも再プローブされない(404恒久URLの無限リトライ防止)', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 1000, maxMs: 5000, maxAttempts: 2 }
      });
      const img = document.createElement('img');
      img.src = FALLBACK;
      // 1回目失敗
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001);
      // backoff経過→2回目のnoteRemoteAttemptでeligible(failCount=1<maxAttempts=2)、再度失敗させる
      vi.advanceTimersByTime(1001);
      const probe2 = g.noteRemoteAttempt(img, REMOTE);
      expect(probe2).toBeInstanceOf(HTMLImageElement);
      probe2.dispatchEvent(new Event('error'));
      // 3回目: failCount=2>=maxAttempts=2 なのでeligible=false
      vi.advanceTimersByTime(10_000);
      const probe3 = g.noteRemoteAttempt(img, REMOTE);
      expect(probe3).toBeNull();
    });
  });

  describe('clearTimedOutFailures(venue-avatar-stale-mirror-DESIGN.md §C-1d)', () => {
    it('timeout種別のみ削除し、error種別とsucceededKeysは維持する', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 }
      });
      const REMOTE_ERROR = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/9/errorurl.jpg';
      const REMOTE_SUCCESS = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/8/okurl.jpg';
      g.markFailedForTests(REMOTE, 'timeout');
      g.markFailedForTests(REMOTE_ERROR, 'error');
      g.markSucceededForTests(REMOTE_SUCCESS);

      g.clearTimedOutFailures();

      // timeout種別は消えて再プローブ対象(fallback判定を抜ける=noteRemoteAttemptがプローブを作る)
      const imgTimeout = document.createElement('img');
      imgTimeout.src = FALLBACK;
      expect(g.noteRemoteAttempt(imgTimeout, REMOTE)).toBeInstanceOf(HTMLImageElement);
      // error種別は維持(依然fallback)
      expect(g.pickDisplaySrc(REMOTE_ERROR)).toBe(FALLBACK);
      // succeededKeysは無傷(全消しちらつき防止)
      expect(g.pickDisplaySrc(REMOTE_SUCCESS)).toBe(REMOTE_SUCCESS);
    });
  });

  describe('retrySweep(venue-avatar-stale-mirror-DESIGN.md §C-1c)', () => {
    it('retryPolicy未指定なら常にno-op(scanned:0, retried:0)', () => {
      const g = createSupportAvatarLoadGuard({ fallbackSrc: FALLBACK });
      const root = document.createElement('div');
      const result = g.retrySweep(root, Date.now());
      expect(result).toEqual({ scanned: 0, retried: 0 });
    });

    it('rootEl配下のretry刻印付きimgをeligibleなら再プローブする', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 }
      });
      const root = document.createElement('div');
      const img = document.createElement('img');
      img.src = FALLBACK;
      root.appendChild(img);
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001); // timeout失敗→刻印される
      expect(img.dataset.nlsbAvatarRetrySrc).toBe(REMOTE);

      vi.advanceTimersByTime(30_001); // backoff経過
      const result = g.retrySweep(root, Date.now());
      expect(result.scanned).toBe(1);
      expect(result.retried).toBe(1);
      expect(g.getDiagnostics().retriedTotal).toBe(1);
    });

    it('backoff未経過のimgはscannedされるがretriedされない', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 }
      });
      const root = document.createElement('div');
      const img = document.createElement('img');
      img.src = FALLBACK;
      root.appendChild(img);
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001);
      const result = g.retrySweep(root, Date.now()); // backoff(30s)未経過
      expect(result.scanned).toBe(1);
      expect(result.retried).toBe(0);
    });

    it('rootEl/nullが渡されても例外にならない', () => {
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        retryPolicy: {}
      });
      expect(() => g.retrySweep(null, Date.now())).not.toThrow();
      expect(g.retrySweep(null, Date.now())).toEqual({ scanned: 0, retried: 0 });
    });

    it('進行中プローブがあるimgは二重発行しない', () => {
      vi.useFakeTimers();
      const g = createSupportAvatarLoadGuard({
        fallbackSrc: FALLBACK,
        timeoutMs: 3000,
        retryPolicy: { baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 }
      });
      const root = document.createElement('div');
      const img = document.createElement('img');
      img.src = FALLBACK;
      root.appendChild(img);
      g.noteRemoteAttempt(img, REMOTE);
      vi.advanceTimersByTime(3001);
      vi.advanceTimersByTime(30_001);
      // 1回目のsweepでプローブ発行(activeProbesに登録される)
      const r1 = g.retrySweep(root, Date.now());
      expect(r1.retried).toBe(1);
      // 直後の2回目sweep(まだプローブ未解決)は二重発行しない
      const r2 = g.retrySweep(root, Date.now());
      expect(r2.retried).toBe(0);
    });
  });
});
