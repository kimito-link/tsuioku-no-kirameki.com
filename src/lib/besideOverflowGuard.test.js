import { describe, it, expect } from 'vitest';
import {
  decideBesideOverflow,
  createBesideOverflowMemory,
  besideOverflowFor,
  rememberBesideOverflow
} from './besideOverflowGuard.js';

describe('decideBesideOverflow', () => {
  it('はみ出していなければ何もしない', () => {
    expect(decideBesideOverflow({ viewportWidth: 1920, hostRect: { right: 1500, width: 640 }, trailingRights: [1900] })).toEqual({ action: 'none' });
  });
  it('実機 1252px: パネル右 1336・コメ列 1721 → 縮めても 280 未満なので below', () => {
    expect(decideBesideOverflow({ viewportWidth: 1252, hostRect: { right: 1336, width: 640 }, trailingRights: [1721] })).toEqual({ action: 'below' });
  });
  it('パネルだけ少しはみ出す → 幅を上限する', () => {
    expect(decideBesideOverflow({ viewportWidth: 1252, hostRect: { right: 1336, width: 640 } })).toEqual({ action: 'cap', capPx: 640 - 84 - 12 });
  });
  it('横スクロール済みでも文書座標で測る', () => {
    expect(decideBesideOverflow({ viewportWidth: 1000, hostRect: { right: 900, width: 500 }, scrollX: 200 }).action).toBe('cap');
  });
  it('壊れた入力は none', () => {
    expect(decideBesideOverflow({ viewportWidth: 0, hostRect: { right: 1, width: 1 } })).toEqual({ action: 'none' });
    expect(decideBesideOverflow(/** @type {any} */ (null))).toEqual({ action: 'none' });
  });
});

describe('はみ出しの記憶', () => {
  it('締める方向にだけ更新し、幅が変わると忘れる', () => {
    const m = createBesideOverflowMemory();
    expect(besideOverflowFor(m, 1252)).toBeNull();
    expect(rememberBesideOverflow(m, 1252, { action: 'cap', capPx: 500 })).toBe(true);
    expect(rememberBesideOverflow(m, 1252, { action: 'cap', capPx: 520 })).toBe(false);
    expect(rememberBesideOverflow(m, 1252, { action: 'cap', capPx: 450 })).toBe(true);
    expect(besideOverflowFor(m, 1252)).toEqual({ capPx: 450, below: false });
    expect(rememberBesideOverflow(m, 1252, { action: 'below' })).toBe(true);
    expect(rememberBesideOverflow(m, 1252, { action: 'cap', capPx: 300 })).toBe(false);
    expect(besideOverflowFor(m, 1252)?.below).toBe(true);
    expect(besideOverflowFor(m, 1600)).toBeNull();
    expect(rememberBesideOverflow(m, 1600, { action: 'none' })).toBe(false);
    expect(besideOverflowFor(m, 1252)?.below).toBe(true);
  });
});
