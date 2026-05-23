/** @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSupportAvatarLoadGuard } from './supportGrowthAvatarLoad.js';
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
        failedUsericonSamples: []
      });
    });
  });
});
