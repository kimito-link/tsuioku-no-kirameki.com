import { describe, expect, it } from 'vitest';
import { migrateSuggestInitialInlinePanelPlacementOnce } from './migrateSuggestInitialInlinePanelPlacement.js';
import {
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INSTALL_PANEL_PLACEMENT_PENDING,
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
});
