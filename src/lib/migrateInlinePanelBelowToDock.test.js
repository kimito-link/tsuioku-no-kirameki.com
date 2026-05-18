import { describe, it, expect } from 'vitest';
import { migrateBelowInlinePanelToDockOnce } from './migrateInlinePanelBelowToDock.js';
import {
  KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED,
  KEY_INLINE_PANEL_PLACEMENT,
  KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT
} from './storageKeys.js';

/**
 * @param {Record<string, unknown>} initial
 */
function makeMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    get: async (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of arr) {
        if (k in store) out[k] = store[k];
      }
      return out;
    },
    set: async (o) => {
      Object.assign(store, o);
    }
  };
}

describe('migrateBelowInlinePanelToDockOnce', () => {
  it('placement=below のとき dock_bottom に移行 + 移行 flag を立てる', async () => {
    const storage = makeMockStorage({
      [KEY_INLINE_PANEL_PLACEMENT]: 'below'
    });
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(true);
    expect(storage.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('dock_bottom');
    expect(storage.store[KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]).toBe(true);
  });

  it('既に dock_bottom のときは値を変えず、flag だけ立てる', async () => {
    const storage = makeMockStorage({
      [KEY_INLINE_PANEL_PLACEMENT]: 'dock_bottom'
    });
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(false);
    expect(storage.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('dock_bottom');
    expect(storage.store[KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]).toBe(true);
  });

  it('未設定のときも flag だけ立てる（dock_bottom が既定）', async () => {
    const storage = makeMockStorage({});
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(false);
    expect(storage.store[KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]).toBe(true);
  });

  it('flag が既に true のときは何もしない（再実行で上書きしない）', async () => {
    const storage = makeMockStorage({
      [KEY_INLINE_PANEL_PLACEMENT]: 'below',
      [KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]: true
    });
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(false);
    // ユーザーが意図的に below に戻した場合は尊重する
    expect(storage.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('below');
  });

  it('placement=floating はそのまま（floating→dock の別 migration が担当）', async () => {
    const storage = makeMockStorage({
      [KEY_INLINE_PANEL_PLACEMENT]: 'floating'
    });
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(false);
    expect(storage.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('floating');
    expect(storage.store[KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]).toBe(true);
  });

  it('placement=beside もそのまま', async () => {
    const storage = makeMockStorage({
      [KEY_INLINE_PANEL_PLACEMENT]: 'beside'
    });
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(false);
    expect(storage.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('beside');
  });

  it('前後空白付きの below 値も拾って移行する', async () => {
    const storage = makeMockStorage({
      [KEY_INLINE_PANEL_PLACEMENT]: '  below  '
    });
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(true);
    expect(storage.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('dock_bottom');
  });

  it('明示選択フラグが true なら placement も移行 flag も一切触らない', async () => {
    const storage = makeMockStorage({
      [KEY_INLINE_PANEL_PLACEMENT]: 'below',
      [KEY_INLINE_PANEL_PLACEMENT_USER_EXPLICIT]: true
    });
    const r = await migrateBelowInlinePanelToDockOnce(storage);
    expect(r.changed).toBe(false);
    // ユーザー明示選択を移行が巻き戻さない（dock_bottom 化しない）
    expect(storage.store[KEY_INLINE_PANEL_PLACEMENT]).toBe('below');
    // 副作用ゼロ：done flag も立てない
    expect(
      storage.store[KEY_INLINE_PANEL_BELOW_TO_DOCK_MIGRATED]
    ).toBeUndefined();
  });
});
