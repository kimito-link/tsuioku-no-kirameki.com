import { describe, it, expect, vi } from 'vitest';
import { isWebLocksAvailable, runIfTabLeader } from './tabLeaderLock.js';

/** 単純な Web Locks モック: 同名ロックは同時に1つだけ holder を許す。 */
function makeMockNavigator() {
  /** @type {Set<string>} */
  const held = new Set();
  return {
    locks: {
      async request(name, opts, cb) {
        if (opts && opts.ifAvailable) {
          if (held.has(name)) {
            // 取れない → lock=null でコールバック（フォロワー）
            return cb(null);
          }
          held.add(name);
          try {
            return await cb({ name });
          } finally {
            held.delete(name);
          }
        }
        // ifAvailable でない場合は順番待ち（このテストでは未使用）
        held.add(name);
        try {
          return await cb({ name });
        } finally {
          held.delete(name);
        }
      }
    },
    _held: held
  };
}

describe('isWebLocksAvailable', () => {
  it('locks.request がある→true', () => {
    expect(isWebLocksAvailable({ locks: { request: () => {} } })).toBe(true);
  });
  it('無い→false', () => {
    expect(isWebLocksAvailable({})).toBe(false);
    expect(isWebLocksAvailable(null)).toBe(false);
    expect(isWebLocksAvailable({ locks: {} })).toBe(false);
  });
});

describe('runIfTabLeader', () => {
  it('単独タブはリーダーとして fn 実行（ran=true）', async () => {
    const nav = makeMockNavigator();
    const fn = vi.fn();
    const r = await runIfTabLeader('lock-a', fn, { navigatorOverride: nav });
    expect(r.ran).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('2タブ目（既にロック保持中）は fn を実行しない（ran=false・フォロワー）', async () => {
    const nav = makeMockNavigator();
    // タブ1がロックを握って長く保持している状態を作る
    let releaseTab1;
    const tab1Held = new Promise((resolve) => {
      releaseTab1 = resolve;
    });
    const tab1 = runIfTabLeader('lock-shared', async () => {
      await tab1Held; // 保持しっぱなし
    }, { navigatorOverride: nav });

    // タブ1がロックを取った後、タブ2が試す
    await new Promise((r) => setTimeout(r, 5));
    const fn2 = vi.fn();
    const r2 = await runIfTabLeader('lock-shared', fn2, { navigatorOverride: nav });
    expect(r2.ran).toBe(false);
    expect(fn2).not.toHaveBeenCalled();

    // タブ1を解放
    releaseTab1();
    await tab1;
  });

  it('タブ1解放後はタブ2がリーダーになれる（自動引き継ぎ）', async () => {
    const nav = makeMockNavigator();
    const fn1 = vi.fn();
    await runIfTabLeader('lock-handoff', fn1, { navigatorOverride: nav });
    expect(fn1).toHaveBeenCalledTimes(1);
    // タブ1の fn は同期的に終わりロック解放済み → タブ2が取れる
    const fn2 = vi.fn();
    const r2 = await runIfTabLeader('lock-handoff', fn2, { navigatorOverride: nav });
    expect(r2.ran).toBe(true);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('Web Locks 非対応環境は fail-open で必ず実行（従来動作）', async () => {
    const fn = vi.fn();
    const r = await runIfTabLeader('lock-x', fn, { navigatorOverride: {} });
    expect(r.ran).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('locks.request が例外を投げても fail-open で実行', async () => {
    const fn = vi.fn();
    const badNav = {
      locks: {
        request() {
          throw new Error('boom');
        }
      }
    };
    const r = await runIfTabLeader('lock-y', fn, { navigatorOverride: badNav });
    expect(r.ran).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('名前空 / fn 非関数は何もしない', async () => {
    const nav = makeMockNavigator();
    expect((await runIfTabLeader('', () => {}, { navigatorOverride: nav })).ran).toBe(false);
    expect(
      (await runIfTabLeader('n', /** @type {any} */ (null), { navigatorOverride: nav })).ran
    ).toBe(false);
  });
});
