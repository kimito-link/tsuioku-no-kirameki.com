import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  publishReportPreviewThrottled,
  _resetReportPreviewThrottleForTest
} from './reportPreviewPublish.js';
import { KEY_REPORT_PREVIEW } from './reportPreviewKey.js';

const t = Date.parse('2026-05-29T12:00:00.000Z');

/** chrome.storage.local.set をスパイ化して書き込みレコードを captures に貯める。 */
function installChromeSpy() {
  const captures = [];
  globalThis.chrome = {
    storage: {
      local: {
        set: vi.fn(async (bag) => {
          captures.push(bag);
        })
      }
    }
  };
  return captures;
}

function makeComments(n, lv = 'lv1') {
  return Array.from({ length: n }, (_, i) => ({
    liveId: lv,
    text: `c${i}`,
    userId: String(1000 + (i % 5)),
    capturedAt: t + i * 1000
  }));
}

/** 非同期 IIFE(publishRecord)が走り切るのを待つ。 */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('publishReportPreviewThrottled', () => {
  beforeEach(() => {
    _resetReportPreviewThrottleForTest();
  });

  it('コメントを集計して KEY_REPORT_PREVIEW へ書く', async () => {
    const captures = installChromeSpy();
    publishReportPreviewThrottled('lv1', {
      resolveComments: async () => makeComments(20, 'lv1'),
      getSnapshot: () => ({ viewerCountFromDom: 300, broadcasterUserId: '' }),
      now: () => t
    });
    await flush();
    expect(captures).toHaveLength(1);
    const rec = captures[0][KEY_REPORT_PREVIEW];
    expect(rec.liveId).toBe('lv1');
    expect(rec.totalComments).toBe(20);
    expect(rec.uniqueUsers).toBe(5);
    expect(rec.visitors).toBe(300);
    expect(rec.at).toBe(t); // record に at が付く
  });

  it('liveId 空は何もしない', async () => {
    const captures = installChromeSpy();
    publishReportPreviewThrottled('', { resolveComments: async () => [], getSnapshot: () => ({}), now: () => t });
    await flush();
    expect(captures).toHaveLength(0);
  });

  it('minGap 以内の連続呼び出しは間引く(1回だけ書く)', async () => {
    const captures = installChromeSpy();
    const deps = {
      resolveComments: async () => makeComments(3, 'lv1'),
      getSnapshot: () => ({}),
      now: () => t,
      minGapMs: 15_000
    };
    publishReportPreviewThrottled('lv1', deps);
    await flush();
    publishReportPreviewThrottled('lv1', deps); // 同時刻=間引き
    await flush();
    expect(captures).toHaveLength(1);
  });

  it('minGap を超えたら再度書く', async () => {
    const captures = installChromeSpy();
    publishReportPreviewThrottled('lv1', {
      resolveComments: async () => makeComments(3, 'lv1'),
      getSnapshot: () => ({}),
      now: () => t,
      minGapMs: 15_000
    });
    await flush();
    publishReportPreviewThrottled('lv1', {
      resolveComments: async () => makeComments(3, 'lv1'),
      getSnapshot: () => ({}),
      now: () => t + 15_001,
      minGapMs: 15_000
    });
    await flush();
    expect(captures).toHaveLength(2);
  });

  it('force:true は minGap 以内でも即publishする(SC3: 配信終了検知時の確定値publish)', async () => {
    const captures = installChromeSpy();
    const baseDeps = {
      resolveComments: async () => makeComments(3, 'lv1'),
      getSnapshot: () => ({}),
      now: () => t,
      minGapMs: 15_000
    };
    publishReportPreviewThrottled('lv1', baseDeps);
    await flush();
    publishReportPreviewThrottled('lv1', { ...baseDeps, force: true }); // 同時刻でもforceで即publish
    await flush();
    expect(captures).toHaveLength(2);
  });

  it('force:true でも再入中(_busy)なら二重実行しない', async () => {
    const captures = installChromeSpy();
    let resolveFirst;
    const slowDeps = {
      resolveComments: () => new Promise((r) => { resolveFirst = r; }),
      getSnapshot: () => ({}),
      now: () => t,
      minGapMs: 15_000
    };
    publishReportPreviewThrottled('lv1', slowDeps); // _busyになるが未解決のまま
    publishReportPreviewThrottled('lv1', { ...slowDeps, force: true }); // _busy中は弾かれる
    resolveFirst(makeComments(3, 'lv1'));
    await flush();
    expect(captures).toHaveLength(1);
  });

  it('resolveComments が throw しても落ちない(best-effort)', async () => {
    const captures = installChromeSpy();
    expect(() =>
      publishReportPreviewThrottled('lv1', {
        resolveComments: async () => {
          throw new Error('boom');
        },
        getSnapshot: () => ({}),
        now: () => t
      })
    ).not.toThrow();
    await flush();
    expect(captures).toHaveLength(0); // 書き込みには至らない
  });
});
