import { describe, expect, it } from 'vitest';
import { migrateSuggestInitialInlinePanelPlacementOnce } from './migrateSuggestInitialInlinePanelPlacement.js';
import {
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT,
  KEY_INSTALL_PANEL_PLACEMENT_PENDING,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE
} from './storageKeys.js';

function createMemoryStorage(initial) {
  const store = { ...initial };
  return {
    store,
    async get(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of arr) {
        if (Object.prototype.hasOwnProperty.call(store, k)) {
          out[k] = store[k];
        }
      }
      return out;
    },
    async set(o) {
      Object.assign(store, o);
    }
  };
}

describe('migrateSuggestInitialInlinePanelPlacementOnce', () => {
  it('pending で配置未設定なら幅に応じて書き込み pending を下ろす', async () => {
    const mem = createMemoryStorage({
      [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: true
    });
    const r = await migrateSuggestInitialInlinePanelPlacementOnce({
      get: mem.get,
      set: mem.set,
      layoutInnerWidth: 1920
    });
    expect(r.changed).toBe(true);
    expect(r.suggested).toBe(INLINE_PANEL_PLACEMENT_BESIDE);
    expect(mem.store[KEY_INLINE_PANEL_PLACEMENT]).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
    expect(mem.store[KEY_INSTALL_PANEL_PLACEMENT_PENDING]).toBe(false);
  });

  it('配置キーが既にあるときは上書きせず pending だけ下ろす', async () => {
    const mem = createMemoryStorage({
      [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: true,
      [KEY_INLINE_PANEL_PLACEMENT]: 'dock_bottom'
    });
    const r = await migrateSuggestInitialInlinePanelPlacementOnce({
      get: mem.get,
      set: mem.set,
      layoutInnerWidth: 1920
    });
    expect(r.changed).toBe(false);
    expect(mem.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('dock_bottom');
    expect(mem.store[KEY_INSTALL_PANEL_PLACEMENT_PENDING]).toBe(false);
  });

  it('pending が無ければ何もしない', async () => {
    const mem = createMemoryStorage({});
    const r = await migrateSuggestInitialInlinePanelPlacementOnce({
      get: mem.get,
      set: mem.set,
      layoutInnerWidth: 1920
    });
    expect(r.changed).toBe(false);
    expect(mem.store[KEY_INLINE_PANEL_PLACEMENT]).toBeUndefined();
  });

  it('pending で beside 閾値未満なら below を書き込む', async () => {
    // v0.1.284: 閾値が 1200→1100 に下がったので、below 領域のテスト幅も
    // 1099 へ。閾値ちょうど (1100) は beside 提案になる（既存検証あり）。
    const mem = createMemoryStorage({
      [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: true
    });
    const r = await migrateSuggestInitialInlinePanelPlacementOnce({
      get: mem.get,
      set: mem.set,
      layoutInnerWidth: 1099
    });
    expect(r.changed).toBe(true);
    expect(r.suggested).toBe(INLINE_PANEL_PLACEMENT_BELOW);
    expect(mem.store[KEY_INLINE_PANEL_PLACEMENT]).toBe(
      INLINE_PANEL_PLACEMENT_BELOW
    );
    expect(mem.store[KEY_INSTALL_PANEL_PLACEMENT_PENDING]).toBe(false);
  });

  it('明示選択フラグ true なら提案で上書きせず pending だけ下ろす', async () => {
    const mem = createMemoryStorage({
      [KEY_INSTALL_PANEL_PLACEMENT_PENDING]: true,
      [KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT]: true
    });
    const r = await migrateSuggestInitialInlinePanelPlacementOnce({
      get: mem.get,
      set: mem.set,
      layoutInnerWidth: 1920
    });
    expect(r.changed).toBe(false);
    // 幅 1920 でも suggested(beside) で明示選択を上書きしない
    expect(mem.store[KEY_INLINE_PANEL_PLACEMENT]).toBeUndefined();
    // 再評価ループを止めるため pending は下ろす
    expect(mem.store[KEY_INSTALL_PANEL_PLACEMENT_PENDING]).toBe(false);
  });

  it('明示選択フラグ true かつ pending 無しなら完全に無操作', async () => {
    const mem = createMemoryStorage({
      [KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT]: true
    });
    const r = await migrateSuggestInitialInlinePanelPlacementOnce({
      get: mem.get,
      set: mem.set,
      layoutInnerWidth: 1920
    });
    expect(r.changed).toBe(false);
    expect(mem.store[KEY_INLINE_PANEL_PLACEMENT]).toBeUndefined();
    expect(mem.store[KEY_INSTALL_PANEL_PLACEMENT_PENDING]).toBeUndefined();
  });
});
