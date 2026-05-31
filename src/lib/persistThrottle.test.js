import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPersistCoalescer } from './persistThrottle.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createPersistCoalescer', () => {
  it('初回 enqueue は delay=0 で即 flush される', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][1]).toEqual({ sources: [] });
    expect(c.pending()).toBe(0);
  });

  it('2回目の enqueue 後 minIntervalMs 以内は flush されない', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    c.enqueue([{ id: '2' }]);
    vi.advanceTimersByTime(200);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(1);
  });

  it('初回の複数 enqueue は delay=0 でまとめて flush される', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }]);
    c.enqueue([{ id: '2' }, { id: '3' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ id: '1' }, { id: '2' }, { id: '3' }], {
      sources: []
    });
    expect(c.pending()).toBe(0);
  });

  it('初回の連続 enqueue は delay=0 で1回の flush にまとまる', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    for (let i = 0; i < 10; i++) c.enqueue([{ id: String(i) }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toHaveLength(10);
    expect(flush.mock.calls[0][1]).toEqual({ sources: [] });
  });

  it('enqueue の第2引数 source が flush の meta.sources に順に積まれる', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: 'a' }], 'ndgr');
    c.enqueue([{ id: 'b' }], 'mutation');
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0][0]).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(flush.mock.calls[0][1]).toEqual({ sources: ['ndgr', 'mutation'] });
  });

  it('clear でバッファがリセットされる', () => {
    const flush = vi.fn();
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: '1' }, { id: '2' }]);
    c.clear();
    expect(c.pending()).toBe(0);
    vi.advanceTimersByTime(500);
    expect(flush).not.toHaveBeenCalled();
  });

  it('前回 flush から十分経過していれば遅延なく flush される', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flush, 300);
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(300);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(400);
    c.enqueue([{ id: 'second' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[1][0]).toEqual([{ id: 'second' }]);
    expect(flush.mock.calls[1][1]).toEqual({ sources: [] });
  });

  it('手動 flush で即座にバッファを処理できる', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300);
    c.enqueue([{ id: '1' }]);
    await c.flush();
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(0);
  });

  it('burstThreshold を超えると minIntervalMs を待たず flush される', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300, 5);
    // 初回 flush を消化し、lastFlushTime をセット
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(1);

    // クールダウン中（300ms 以内）でもバースト閾値到達で即 flush
    vi.advanceTimersByTime(50);
    c.enqueue([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }]);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(2);
    expect(flushFn.mock.calls[1][0]).toHaveLength(5);
    expect(flushFn.mock.calls[1][1]).toEqual({ sources: [] });
    expect(c.pending()).toBe(0);
  });

  it('burstThreshold 未満のときは通常の throttle 挙動', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300, 100);
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    c.enqueue([{ id: '1' }, { id: '2' }]);
    vi.advanceTimersByTime(100);
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(2);
  });

  it('burstThreshold=0 は無効（既定 throttle のまま）', async () => {
    const flushFn = vi.fn().mockResolvedValue(undefined);
    const c = createPersistCoalescer(flushFn, 300, 0);
    c.enqueue([{ id: 'first' }]);
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
    expect(flushFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    // 大量 enqueue しても 0 は「無効」扱い
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    c.enqueue(rows);
    vi.advanceTimersByTime(100);
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(500);
  });

  it('await flushFn の途中で追加入力されても flushFn が重ならず直列フラッシュできる', async () => {
    // burst + Promise の順序だけに依存しないよう実タイマ
    vi.useRealTimers();

    try {
      /** @type {(() => void) | null} */
      let gateOpen = null;
      const barrier = new Promise((resolve) => {
        gateOpen = resolve;
      });

      /** @returns {{ id: string }[]} */
      const batch = (pfx) =>
        [...Array.from({ length: 5 }, (_, i) => ({ id: `${pfx}${i}` }))];

      /** @type {ReturnType<typeof createPersistCoalescer> | null} */
      let sink = null;

      let seededSecondBatch = false;
      let overlap = 0;
      let maxOverlap = 0;

      const flushFn = vi.fn(async () => {
        overlap += 1;
        maxOverlap = Math.max(maxOverlap, overlap);
        try {
          if (!seededSecondBatch) {
            seededSecondBatch = true;
            /* flushBody の drain 〜 await flush の間にもう一通り「積める」状態を再現する */
            sink?.enqueue(batch('b'));
          }
          await barrier;
        } finally {
          overlap -= 1;
        }
      });

      // v0.1.431: 連続 flush 間 yield は「重ならない直列性」の検証には無関係なので、
      //   この test では microtask 解決の no-op yield を注入し従来のタイミングを保つ
      //   （setTimeout(0) のマクロタスク待ちを増やさずに直列性だけを見る）。
      sink = createPersistCoalescer(flushFn, 600_000, 5, () => Promise.resolve());

      sink.enqueue(batch('a'));

      await new Promise((r) => queueMicrotask(r));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();

      expect(maxOverlap).toBe(1);
      expect(flushFn).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      /** キュー済みフラッシュまで */
      await new Promise((r) => queueMicrotask(r));

      expect(maxOverlap).toBe(1);
      expect(flushFn).toHaveBeenCalledTimes(1);
      gateOpen?.();
      await barrier;
      /** @type {Promise<void>} */
      const job0 = flushFn.mock.results[0]?.value;
      if (job0 && typeof /** @type {any} */ (job0)?.then === 'function') await job0;
      // v0.1.431: flush1 完了後、while ループは yieldBetweenFlushes（注入の no-op）を 1 拍
      //   挟んでから flush2 を呼ぶ。その microtask を消化してから flush2 を待つ。
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
      /** @type {Promise<void>} */
      const job1 = flushFn.mock.results[1]?.value;
      if (job1 && typeof /** @type {any} */ (job1)?.then === 'function') await job1;

      expect(flushFn).toHaveBeenCalledTimes(2);
      expect(flushFn.mock.calls[0][0]).toHaveLength(5);
      expect(flushFn.mock.calls[1][0]).toHaveLength(5);
      expect(maxOverlap).toBe(1);
      expect(sink.pending()).toBe(0);
    } finally {
      vi.useFakeTimers();
    }
  });

  it('連続フラッシュの合間に yield してメインスレッドを離す（v0.1.431・固まり防止）', async () => {
    // ⛔ 実機 4 万コメ配信で「ページが応答しません」になる主因: バッファが連続して埋まると
    //   flushBody の while ループが巨大配列 O(N) マージを背中合わせに走らせメインスレッドを
    //   離さない。2 回目以降の flush 手前で yield が呼ばれることを検証する（初回は呼ばない）。
    vi.useRealTimers();
    try {
      let yieldCount = 0;
      const yieldFn = () => {
        yieldCount += 1;
        return Promise.resolve();
      };
      let seeded = false;
      /** @type {ReturnType<typeof createPersistCoalescer>|null} */
      let sink = null;
      const flushFn = vi.fn(async () => {
        // 1 回目の flush 実行中に 2 回目ぶんを積む → while ループが 2 周する。
        if (!seeded) {
          seeded = true;
          sink?.enqueue([{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }, { id: 'x4' }, { id: 'x5' }]);
        }
      });
      sink = createPersistCoalescer(flushFn, 600_000, 5, yieldFn);
      sink.enqueue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }, { id: 'a5' }]);

      // フラッシュ連鎖が落ち着くまで待つ。
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      await sink.flush();
      for (let i = 0; i < 20; i += 1) await Promise.resolve();

      expect(flushFn).toHaveBeenCalledTimes(2); // 2 回 flush した
      expect(yieldCount).toBeGreaterThanOrEqual(1); // 2 回目の手前で最低 1 回 yield した
    } finally {
      vi.useFakeTimers();
    }
  });

  it('1 回で終わる通常フローでは yield しない（RT 記録の体感レイテンシ不変）', async () => {
    vi.useRealTimers();
    try {
      let yieldCount = 0;
      const yieldFn = () => { yieldCount += 1; return Promise.resolve(); };
      const flushFn = vi.fn().mockResolvedValue(undefined);
      const sink = createPersistCoalescer(flushFn, 0, 0, yieldFn);
      sink.enqueue([{ id: '1' }]);
      await sink.flush();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(flushFn).toHaveBeenCalledTimes(1);
      expect(yieldCount).toBe(0); // 連続 flush でないので yield しない
    } finally {
      vi.useFakeTimers();
    }
  });

  it('遅い flushFn が一旦 settle すれば後続 flush は実行される（v0.1.502・flushMutex が永久ブロックしない）', async () => {
    // 多タブ stall 退行の核: 1 回目の flush（書き込み）がハングすると flushMutex が
    //   永久ポイズンされ、以降の flush が一切走らない（=「最終取り込み ◯秒前」固定）。
    //   修正後は content 側で必ず settle させる前提なので、コアレッサ契約として
    //   「遅い flushFn でも settle すれば後続が再開する」ことを担保する回帰テスト。
    vi.useRealTimers();
    try {
      /** @type {(() => void)|null} */
      let releaseFirst = null;
      const firstGate = new Promise((resolve) => {
        releaseFirst = /** @type {() => void} */ (resolve);
      });
      let call = 0;
      const flushFn = vi.fn(async () => {
        call += 1;
        if (call === 1) await firstGate; // 1 回目だけ「ハング」を模擬（後で解放）
      });
      const sink = createPersistCoalescer(flushFn, 0, 0);

      // flush() で即トリガー（setTimeout マクロタスクに依存しない）。1 回目は firstGate で停止。
      sink.enqueue([{ id: 'a' }]);
      const firstFlush = sink.flush();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(flushFn).toHaveBeenCalledTimes(1); // 1 回目は走ったが未解決

      // 1 回目がまだ pending の間に 2 回目を積んでも、まだ flush されない（直列待ち）。
      sink.enqueue([{ id: 'b' }]);
      const secondFlush = sink.flush();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      expect(flushFn).toHaveBeenCalledTimes(1);

      // 1 回目が settle すれば、待っていた 2 回目が走る（永久ブロックしない）。
      releaseFirst?.();
      await firstFlush;
      await secondFlush;
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      expect(flushFn).toHaveBeenCalledTimes(2);
      expect(sink.pending()).toBe(0);
    } finally {
      vi.useFakeTimers();
    }
  });
});
