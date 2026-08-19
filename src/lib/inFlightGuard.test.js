import { describe, it, expect, vi } from 'vitest';
import { createInFlightGuard, createStaleGuardedRead } from './inFlightGuard.js';

describe('createInFlightGuard', () => {
  it('解決済みなら次回 run() は opFn を再発行する', async () => {
    let calls = 0;
    const opFn = vi.fn(async () => {
      calls += 1;
      return `ok-${calls}`;
    });
    const guard = createInFlightGuard(opFn);

    const r1 = await guard.run('fallback');
    expect(r1).toBe('ok-1');
    expect(guard.isInFlight()).toBe(false);

    const r2 = await guard.run('fallback');
    expect(r2).toBe('ok-2');
    expect(opFn).toHaveBeenCalledTimes(2);
  });

  it('未解決中に呼ばれたら fallback を返し、新規発行を抑制する', async () => {
    let resolveFirst;
    const opFn = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const guard = createInFlightGuard(opFn);

    const p1 = guard.run('fallback1');
    expect(guard.isInFlight()).toBe(true);

    // 未解決の間に2回目を発行 → opFn は再度呼ばれず fallback が返る。
    const r2 = await guard.run('fallback2');
    expect(r2).toBe('fallback2');
    expect(opFn).toHaveBeenCalledTimes(1);

    resolveFirst('resolved');
    const r1 = await p1;
    expect(r1).toBe('resolved');
    expect(guard.isInFlight()).toBe(false);
  });

  it('ceilingMs 超過で固着とみなし再発行を許可する(now 注入)', async () => {
    let nowMs = 0;
    const now = () => nowMs;
    let firstResolve;
    let secondCallStarted = false;
    const opFn = vi.fn(() => {
      if (!secondCallStarted && firstResolve === undefined) {
        return new Promise((resolve) => {
          firstResolve = resolve;
        });
      }
      secondCallStarted = true;
      return Promise.resolve('second-result');
    });
    const guard = createInFlightGuard(opFn, { ceilingMs: 1000, now });

    const p1 = guard.run('fallback');
    expect(guard.isInFlight()).toBe(true);

    // ceiling 未満: まだ fallback。
    nowMs = 500;
    const rBefore = await guard.run('fallback');
    expect(rBefore).toBe('fallback');
    expect(opFn).toHaveBeenCalledTimes(1);

    // ceiling 超過: 再発行を許可。
    nowMs = 1500;
    const rAfter = await guard.run('fallback');
    expect(rAfter).toBe('second-result');
    expect(opFn).toHaveBeenCalledTimes(2);

    // 元の Promise がその後解決しても呼び出し元は既に fallback 経路を終えている。
    firstResolve('late-resolved');
    await p1;
  });

  it('opFn が reject したら isInFlight は false に戻る', async () => {
    const opFn = vi.fn(async () => {
      throw new Error('boom');
    });
    const guard = createInFlightGuard(opFn);

    await expect(guard.run('fallback')).rejects.toThrow('boom');
    expect(guard.isInFlight()).toBe(false);
  });

  it('既定 ceilingMs は 15000ms(now 注入で境界確認)', async () => {
    let nowMs = 0;
    const now = () => nowMs;
    let calls = 0;
    const opFn = vi.fn(() => {
      calls += 1;
      // 1回目は未解決のまま留める(in-flight 状態を作る)。2回目(ceiling超過後の再発行)は即解決。
      return calls === 1 ? new Promise(() => {}) : Promise.resolve('second-result');
    });
    const guard = createInFlightGuard(opFn, { now });

    void guard.run('fallback');
    nowMs = 14999;
    expect(await guard.run('fallback')).toBe('fallback');
    expect(opFn).toHaveBeenCalledTimes(1);

    nowMs = 15000;
    // ceiling ちょうどは超過扱い(elapsed(15000) < ceilingMs(15000) が false)→ 再発行される。
    const opFn2Result = await guard.run('fallback');
    expect(opFn2Result).toBe('second-result');
    expect(opFn).toHaveBeenCalledTimes(2);
  });
});

describe('createStaleGuardedRead（2026-07-14 診断ページ608秒固まり根治: stale-while-revalidate）', () => {
  it('初回・成功時は fresh を返し last-good を更新する', async () => {
    const opFn = vi.fn().mockResolvedValue('v1');
    const guard = createStaleGuardedRead(opFn, { emptyValue: null });
    const r = await guard.read({ timeoutMs: 4000 });
    expect(r).toEqual({ value: 'v1', stale: false, hadData: true, ageMs: 0, reason: 'fresh' });
  });

  it('in-flight 中は新規発行せず stale(last-good)を返す(幽霊readの多重発行防止)', async () => {
    let nowMs = 0;
    const now = () => nowMs;
    let resolveFirst;
    const opFn = vi.fn(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const guard = createStaleGuardedRead(opFn, { emptyValue: null, now });

    const p1 = guard.read({ timeoutMs: 100 });
    // race が timeout する前に、in-flight 中の2回目呼び出しは新規発行せず stale を返す。
    const r2 = await guard.read({ timeoutMs: 100 });
    expect(r2.stale).toBe(true);
    expect(r2.reason).toBe('in-flight');
    expect(r2.hadData).toBe(false); // 初回成功が無いのでデータ無し
    expect(opFn).toHaveBeenCalledTimes(1);

    resolveFirst('v1');
    nowMs += 200;
    await p1;
  });

  it('timeout しても throw せず、直近の last-good を stale で返す(refresh全体のcatch転落を防ぐ)', async () => {
    let resolveFirst;
    const opFn = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce('v1');
    const guard = createStaleGuardedRead(opFn, { emptyValue: null, reissueCeilingMs: 60000 });

    // 1回目: 解決させて last-good='v1' を作る前に、まずは "空のstale" を確認する経路にする。
    // (このテストは timeout 経路の断言に専念するため、1回目自体を timeout させる)
    const r1 = await guard.read({ timeoutMs: 10 });
    expect(r1.stale).toBe(true);
    expect(r1.reason).toBe('timeout');
    expect(r1.hadData).toBe(false);
    resolveFirst && resolveFirst('late');
  });

  it('幽霊readが遅延resolveしたら last-good を自動更新する(harvest)', async () => {
    let resolveFirst;
    const opFn = vi.fn(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const guard = createStaleGuardedRead(opFn, { emptyValue: null });

    const r1 = await guard.read({ timeoutMs: 10 });
    expect(r1.stale).toBe(true);
    expect(r1.reason).toBe('timeout');

    // 幽霊(1回目のopFn)が遅れて解決 → harvest されて次回 read で fresh に近い stale ではなく
    // 実際に in-flight が解除され、次回は新規発行できる。
    resolveFirst('late-value');
    await new Promise((r) => setTimeout(r, 0)); // harvest の then チェーンを流す

    const statsAfter = guard.getStats();
    expect(statsAfter.lateHarvestCount).toBe(1);
  });

  it('60秒天井を超えたら固着とみなし強制再発行する(seq逆転を防ぎつつ)', async () => {
    let nowMs = 0;
    const now = () => nowMs;
    const opFn = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {})) // 永久pending(固着模擬)
      .mockResolvedValueOnce('v-reissued');
    const guard = createStaleGuardedRead(opFn, { emptyValue: null, now, reissueCeilingMs: 60000 });

    void guard.read({ timeoutMs: 100000 }); // in-flightにする(timeoutは長め=timeoutさせない)
    nowMs = 61000;
    const r = await guard.read({ timeoutMs: 100000 });
    expect(opFn).toHaveBeenCalledTimes(2);
    expect(r.value).toBe('v-reissued');
  });

  it('emptyValue が初期値として使われる(一度も成功していない場合)', async () => {
    const opFn = vi.fn(() => new Promise(() => {}));
    const guard = createStaleGuardedRead(opFn, { emptyValue: [] });
    const r = await guard.read({ timeoutMs: 10 });
    expect(r.value).toEqual([]);
    expect(r.hadData).toBe(false);
  });

  /*
   * v0.1.1446: peek(read を発行せず last-good だけ返す)。
   * 「読む」か「読まない(=値が無い)」の2択しか無かったのを、
   * **「読まないが前回値は出す」**という第3の選択肢で埋める。
   */
  it('★peek は opFn を発行せず last-good を返す(譲る=読まない、の核心)', async () => {
    const opFn = vi.fn().mockResolvedValue('v1');
    const guard = createStaleGuardedRead(opFn, { emptyValue: null });
    await guard.read({ timeoutMs: 4000 });
    expect(opFn).toHaveBeenCalledTimes(1);

    const p1 = guard.peek();
    const p2 = guard.peek();
    // ★数で断言: 何回 peek しても read は増えない(peek が read を呼ぶ変異を殺す)。
    expect(opFn).toHaveBeenCalledTimes(1);
    expect(p1.value).toBe('v1');
    expect(p2.value).toBe('v1');
    expect(guard.getStats().peekServeCount).toBe(2);
  });

  it('★peek は必ず stale=true / reason="peek"(新鮮を装うと鮮度表示が出ず嘘になる)', async () => {
    const guard = createStaleGuardedRead(vi.fn().mockResolvedValue('v1'), { emptyValue: null });
    await guard.read({ timeoutMs: 4000 });
    const p = guard.peek();
    // stale=false に変える変異 = status のヘッダーに「⏳N秒前の値」が出なくなる
    // = 古い値を新品として出す(嘘をつかない作法が壊れる)。
    expect(p.stale).toBe(true);
    expect(p.reason).toBe('peek');
    expect(p.hadData).toBe(true);
  });

  it('★一度も成功していない peek は hadData=false / ageMs=-1(空を「0秒前」と偽らない)', () => {
    const guard = createStaleGuardedRead(vi.fn(() => new Promise(() => {})), { emptyValue: null });
    const p = guard.peek();
    expect(p.hadData).toBe(false);
    expect(p.ageMs).toBe(-1);
    expect(p.value).toBe(null);
  });

  it('★peek の ageMs は last-good の経過を返す(注入 now で厳密に)', async () => {
    let nowMs = 1000;
    const guard = createStaleGuardedRead(vi.fn().mockResolvedValue('v1'), {
      emptyValue: null,
      now: () => nowMs
    });
    await guard.read({ timeoutMs: 4000 });
    nowMs = 13000;
    expect(guard.peek().ageMs).toBe(12000);
  });

  it('★幽霊の harvest が peek にも反映される(別キャッシュを持つとズレる箇所)', async () => {
    /** @type {(v: string) => void} */
    let resolveFirst = () => {};
    const guard = createStaleGuardedRead(
      vi.fn(() => new Promise((r) => { resolveFirst = r; })),
      { emptyValue: null }
    );
    await guard.read({ timeoutMs: 10 }); // timeout → stale(まだ値が無い)
    expect(guard.peek().hadData).toBe(false);

    resolveFirst('late-value'); // 幽霊が遅れて解決
    await new Promise((r) => setTimeout(r, 0));

    // ★_coreCache のような別キャッシュ方式では絶対に取れない値。
    //   peek を選んだ根拠そのもの(値と鮮度表示が食い違わない)。
    expect(guard.peek().value).toBe('late-value');
    expect(guard.peek().hadData).toBe(true);
  });
});
