import { describe, it, expect, vi } from 'vitest';
import {
  safeStorageLocalGet,
  safeStorageLocalSet,
  safeStorageLocalRemove,
  safeStorageOnChangedAddListener,
  safeStorageLocalRef
} from './safeStorageLocal.js';

describe('safeStorageLocalGet', () => {
  it('chrome 未定義(chromeRef=undefined を明示注入) → 空オブジェクト解決', async () => {
    const result = await safeStorageLocalGet('key', { chromeRef: null });
    expect(result).toEqual({});
  });

  it('chrome.storage が undefined → 空オブジェクト解決(同期 throw を吸収)', async () => {
    const chromeRef = { runtime: { id: 'abc' }, storage: undefined };
    const result = await safeStorageLocalGet('key', { chromeRef });
    expect(result).toEqual({});
  });

  it('chrome.storage.local が undefined → 空オブジェクト解決', async () => {
    const chromeRef = { runtime: { id: 'abc' }, storage: {} };
    const result = await safeStorageLocalGet('key', { chromeRef });
    expect(result).toEqual({});
  });

  it('正常環境 → chrome.storage.local.get の結果をそのまま返す(挙動不変)', async () => {
    const get = vi.fn().mockResolvedValue({ key: 'value' });
    const chromeRef = { runtime: { id: 'abc' }, storage: { local: { get } } };
    const result = await safeStorageLocalGet('key', { chromeRef });
    expect(result).toEqual({ key: 'value' });
    expect(get).toHaveBeenCalledWith('key');
  });

  it('get が reject しても空オブジェクト解決(context invalidated 等の黙過)', async () => {
    const get = vi.fn().mockRejectedValue(new Error('Extension context invalidated'));
    const chromeRef = { runtime: { id: 'abc' }, storage: { local: { get } } };
    const result = await safeStorageLocalGet('key', { chromeRef });
    expect(result).toEqual({});
  });

  it('get が null 解決しても空オブジェクトに正規化', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const chromeRef = { runtime: { id: 'abc' }, storage: { local: { get } } };
    const result = await safeStorageLocalGet('key', { chromeRef });
    expect(result).toEqual({});
  });
});

describe('safeStorageLocalSet', () => {
  it('chrome.storage が undefined でも例外を投げず no-op', async () => {
    const chromeRef = { runtime: { id: 'abc' }, storage: undefined };
    await expect(safeStorageLocalSet({ a: 1 }, { chromeRef })).resolves.toBeUndefined();
  });

  it('runtime.id が undefined(拡張リロード後の古いタブ)→ no-op', async () => {
    const set = vi.fn();
    const chromeRef = { runtime: { id: undefined }, storage: { local: { set } } };
    await safeStorageLocalSet({ a: 1 }, { chromeRef });
    expect(set).not.toHaveBeenCalled();
  });

  it('正常環境 → chrome.storage.local.set をそのまま呼ぶ(挙動不変)', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const chromeRef = { runtime: { id: 'abc' }, storage: { local: { set } } };
    await safeStorageLocalSet({ a: 1 }, { chromeRef });
    expect(set).toHaveBeenCalledWith({ a: 1 });
  });

  it('set が reject/throw しても伝播しない', async () => {
    const set = vi.fn().mockRejectedValue(new Error('boom'));
    const chromeRef = { runtime: { id: 'abc' }, storage: { local: { set } } };
    await expect(safeStorageLocalSet({ a: 1 }, { chromeRef })).resolves.toBeUndefined();
  });

  it('set 呼び出し自体が同期 throw しても伝播しない', async () => {
    const chromeRef = {
      runtime: { id: 'abc' },
      storage: {
        local: {
          set: () => {
            throw new Error('sync boom');
          }
        }
      }
    };
    await expect(safeStorageLocalSet({ a: 1 }, { chromeRef })).resolves.toBeUndefined();
  });
});

describe('safeStorageLocalRemove', () => {
  it('chrome.storage が undefined でも no-op', async () => {
    const chromeRef = { runtime: { id: 'abc' }, storage: undefined };
    await expect(safeStorageLocalRemove('key', { chromeRef })).resolves.toBeUndefined();
  });

  it('正常環境 → chrome.storage.local.remove をそのまま呼ぶ', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const chromeRef = { runtime: { id: 'abc' }, storage: { local: { remove } } };
    await safeStorageLocalRemove('key', { chromeRef });
    expect(remove).toHaveBeenCalledWith('key');
  });
});

describe('safeStorageOnChangedAddListener', () => {
  it('chrome 未定義相当 → 登録せず false', () => {
    const ok = safeStorageOnChangedAddListener(() => {}, { chromeRef: null });
    expect(ok).toBe(false);
  });

  it('chrome.storage.onChanged が無い → false', () => {
    const chromeRef = { runtime: { id: 'abc' }, storage: { local: {} } };
    const ok = safeStorageOnChangedAddListener(() => {}, { chromeRef });
    expect(ok).toBe(false);
  });

  it('正常環境 → addListener を呼び true を返す(挙動不変)', () => {
    const addListener = vi.fn();
    const chromeRef = {
      runtime: { id: 'abc' },
      storage: { local: {}, onChanged: { addListener } }
    };
    const listener = () => {};
    const ok = safeStorageOnChangedAddListener(listener, { chromeRef });
    expect(ok).toBe(true);
    expect(addListener).toHaveBeenCalledWith(listener);
  });

  it('addListener 自体が同期 throw しても伝播せず false', () => {
    const chromeRef = {
      runtime: { id: 'abc' },
      storage: {
        local: {},
        onChanged: {
          addListener: () => {
            throw new Error('boom');
          }
        }
      }
    };
    const ok = safeStorageOnChangedAddListener(() => {}, { chromeRef });
    expect(ok).toBe(false);
  });
});

describe('safeStorageLocalRef', () => {
  it('chrome.storage が undefined でも { get, set } を返し呼び出し可能', async () => {
    const chromeRef = { runtime: { id: 'abc' }, storage: undefined };
    const ref = safeStorageLocalRef({ chromeRef });
    await expect(ref.get('key')).resolves.toEqual({});
    await expect(ref.set({ a: 1 })).resolves.toBeUndefined();
  });

  it('runtime.id が無い(古いタブ)でも安全な shim を返す', async () => {
    const chromeRef = { runtime: { id: undefined }, storage: { local: { get: vi.fn(), set: vi.fn() } } };
    const ref = safeStorageLocalRef({ chromeRef });
    await expect(ref.get('key')).resolves.toEqual({});
  });

  it('正常環境 → 本物の chrome.storage.local 参照をそのまま返す(挙動不変)', () => {
    const local = { get: vi.fn(), set: vi.fn() };
    const chromeRef = { runtime: { id: 'abc' }, storage: { local } };
    const ref = safeStorageLocalRef({ chromeRef });
    expect(ref).toBe(local);
  });
});
