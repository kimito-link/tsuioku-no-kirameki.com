import { describe, it, expect, vi } from 'vitest';
import { createSingleFlightByKey } from './singleFlightByKey.js';

/** @returns {{ promise: Promise<string>, resolve: (v: string) => void, reject: (e: unknown) => void }} */
function deferred() {
  /** @type {(v: string) => void} */
  let resolve = () => {};
  /** @type {(e: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSingleFlightByKey', () => {
  it('同一 key の呼び出しは進行中 promise に合流する(新規 fn を呼ばない)', async () => {
    const sf = createSingleFlightByKey();
    const d = deferred();
    const fn = vi.fn(() => d.promise);

    const p1 = sf.run('lv1', fn);
    const p2 = sf.run('lv1', fn); // 進行中なので fn は呼ばれず p1 に合流

    expect(fn).toHaveBeenCalledTimes(1);
    expect(p1).toBe(p2);
    expect(sf.joinCount()).toBe(1);

    d.resolve('done');
    await expect(p1).resolves.toBe('done');
  });

  it('別 key の呼び出しは合流しない(それぞれ新規 fn を呼ぶ)', async () => {
    const sf = createSingleFlightByKey();
    const d1 = deferred();
    const d2 = deferred();
    const fn1 = vi.fn(() => d1.promise);
    const fn2 = vi.fn(() => d2.promise);

    const p1 = sf.run('lv1', fn1);
    const p2 = sf.run('lv2', fn2);

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(p1).not.toBe(p2);
    expect(sf.joinCount()).toBe(0);

    d1.resolve('a');
    d2.resolve('b');
    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');
  });

  it('完了後は inflight がクリアされ、次の同一 key 呼び出しは新規 fn を呼ぶ', async () => {
    const sf = createSingleFlightByKey();
    const fn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await sf.run('lv1', fn);
    const p2 = sf.run('lv1', fn);

    expect(fn).toHaveBeenCalledTimes(2);
    await expect(p2).resolves.toBe('second');
    expect(sf.joinCount()).toBe(0);
  });

  it('reject 後も inflight がクリアされる(次呼び出しが古い reject 済み promise へ永久合流しない)', async () => {
    const sf = createSingleFlightByKey();
    const err = new Error('boom');
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('recovered');

    const p1 = sf.run('lv1', fn);
    await expect(p1).rejects.toBe(err);

    const p2 = sf.run('lv1', fn);
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(p2).resolves.toBe('recovered');
  });

  it('先行 read が完了(finally)しても、新しい read が既に inflight を上書きしていれば消さない', async () => {
    const sf = createSingleFlightByKey();
    const d1 = deferred();
    const d2 = deferred();
    let call = 0;
    const fn = vi.fn(() => (call++ === 0 ? d1.promise : d2.promise));

    const p1 = sf.run('lv1', fn); // 1回目
    d1.resolve('a');
    await p1; // finally が走り、この時点で inflight===null に戻る

    const p2 = sf.run('lv1', fn); // 2回目(別 promise)
    // p1 の finally は既に処理済みなので p2 の inflight を誤って消さない
    const p3 = sf.run('lv1', fn); // p2 に合流するはず
    expect(p2).toBe(p3);

    d2.resolve('b');
    await expect(p2).resolves.toBe('b');
  });

  it('joinCount は合流回数のみを数える(初回実行はカウントしない)', async () => {
    const sf = createSingleFlightByKey();
    const d = deferred();
    const fn = vi.fn(() => d.promise);

    sf.run('lv1', fn);
    sf.run('lv1', fn);
    sf.run('lv1', fn);
    expect(sf.joinCount()).toBe(2);

    d.resolve('done');
    await d.promise;
  });
});
