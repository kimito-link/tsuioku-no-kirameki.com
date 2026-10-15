import { describe, expect, it } from 'vitest';
import {
  STATUS_PUBLISHER_LOCK,
  STATUS_PUBLISHER_PATH,
  STATUS_PUBLISHER_START_DELAY_MS,
  acquireStatusPublisherLock,
  decideStatusPublisherStart,
  isStatusPublisherLockHeld,
  isStatusPublisherMode
} from './statusPublisherPlan.js';

/** 2026-10-15: サイドパネルの中の見えない状態画面(送信担当)を起動してよいかの判定と、排他。 */

describe('decideStatusPublisherStart', () => {
  const ok = { hasKeys: true, optedIn: true, lockHeld: false, alreadyStarted: false, hidden: false };
  it('★キーと同意が揃い、他に担当がいなければ起動する', () => {
    expect(decideStatusPublisherStart(ok)).toEqual({ start: true, reason: 'ok' });
  });
  it('★同意が無ければ、他が全部揃っていても起動しない(同意が最優先)', () => {
    expect(decideStatusPublisherStart({ ...ok, optedIn: false }).reason).toBe('no_consent');
    expect(decideStatusPublisherStart({ ...ok, optedIn: undefined }).start).toBe(false);
    // "true" や 1 は同意として扱わない
    expect(decideStatusPublisherStart({ ...ok, optedIn: /** @type {any} */ ('true') }).start).toBe(false);
    expect(decideStatusPublisherStart({ ...ok, optedIn: /** @type {any} */ (1) }).start).toBe(false);
  });
  it('★キーが無ければ起動しない', () => {
    expect(decideStatusPublisherStart({ ...ok, hasKeys: false }).reason).toBe('no_keys');
  });
  it('★パネルが隠れている・別の担当がいる・もう起動済みなら起動しない', () => {
    expect(decideStatusPublisherStart({ ...ok, hidden: true }).reason).toBe('panel_hidden');
    expect(decideStatusPublisherStart({ ...ok, lockHeld: true }).reason).toBe('another_publisher');
    expect(decideStatusPublisherStart({ ...ok, alreadyStarted: true }).reason).toBe('already_started');
  });
  it('不正な入力でも落ちない(何も起動しない)', () => {
    expect(decideStatusPublisherStart(/** @type {any} */ (null)).start).toBe(false);
    expect(decideStatusPublisherStart(/** @type {any} */ (undefined)).start).toBe(false);
  });
});

describe('isStatusPublisherMode', () => {
  it('★?publisher=1 のときだけ送信担当モード', () => {
    expect(isStatusPublisherMode('?publisher=1')).toBe(true);
    expect(isStatusPublisherMode('?a=1&publisher=1')).toBe(true);
    expect(isStatusPublisherMode('')).toBe(false);
    expect(isStatusPublisherMode('?publisher=0')).toBe(false);
    expect(isStatusPublisherMode('?publisher=true')).toBe(false);
    expect(isStatusPublisherMode(undefined)).toBe(false);
  });
  it('起動の相対URLは publisher=1 を含む', () => {
    expect(isStatusPublisherMode(STATUS_PUBLISHER_PATH.slice(STATUS_PUBLISHER_PATH.indexOf('?')))).toBe(true);
  });
});

describe('acquireStatusPublisherLock', () => {
  it('★取れたら true・保持し続ける(コールバックが解決しない)', async () => {
    let held = null;
    const locks = { request: (name, opts, cb) => { held = { name, opts, result: cb({ name }) }; return held.result; } };
    await expect(acquireStatusPublisherLock(locks)).resolves.toBe(true);
    expect(held.name).toBe(STATUS_PUBLISHER_LOCK);
    expect(held.opts).toEqual({ ifAvailable: true });
    let settled = false;
    held.result.then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 5));
    expect(settled).toBe(false); // 保持している
  });
  it('★取れなければ false(別の担当がいる)', async () => {
    const locks = { request: (_n, _o, cb) => Promise.resolve(cb(null)) };
    await expect(acquireStatusPublisherLock(locks)).resolves.toBe(false);
  });
  it('★Web Locks が無い/壊れている環境は true(排他なしで動く=機能を失わない)', async () => {
    await expect(acquireStatusPublisherLock(undefined)).resolves.toBe(true);
    await expect(acquireStatusPublisherLock({})).resolves.toBe(true);
    await expect(acquireStatusPublisherLock({ request: () => { throw new Error('x'); } })).resolves.toBe(true);
    await expect(acquireStatusPublisherLock({ request: () => Promise.reject(new Error('x')) })).resolves.toBe(true);
  });
});

describe('isStatusPublisherLockHeld', () => {
  it('★保持中のロックにその名前があれば true', async () => {
    expect(await isStatusPublisherLockHeld({ query: async () => ({ held: [{ name: STATUS_PUBLISHER_LOCK }] }) })).toBe(true);
    expect(await isStatusPublisherLockHeld({ query: async () => ({ held: [{ name: 'other' }] }) })).toBe(false);
    expect(await isStatusPublisherLockHeld({ query: async () => ({ held: [] }) })).toBe(false);
  });
  it('調べられない環境では false(起動を妨げない)', async () => {
    expect(await isStatusPublisherLockHeld(undefined)).toBe(false);
    expect(await isStatusPublisherLockHeld({ query: async () => { throw new Error('x'); } })).toBe(false);
  });
});

it('既定の待ちは15秒(開いた直後の幕を重くしない)', () => {
  expect(STATUS_PUBLISHER_START_DELAY_MS).toBe(15_000);
});
