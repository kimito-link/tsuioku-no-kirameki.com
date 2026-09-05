import { describe, expect, it } from 'vitest';
import {
  COMEVIEW_WINDOW_DEFAULT,
  buildComeviewWindowOptions,
  normalizeComeviewWindowGeometry,
  pickComeviewGeometryToSave
} from './comeviewWindowGeometry.js';

/*
 * ★守るのは「便利さ」ではなく【壊れた窓を作らないこと】。
 *   OBS はウィンドウキャプチャで配信画面に重ねるので、
 *   潰れた窓・画面外の窓が出ると配信事故になる。
 */

describe('normalizeComeviewWindowGeometry — 壊れた値は既定へ倒す', () => {
  it('値が無ければ従来の決め打ち(400x640)', () => {
    expect(normalizeComeviewWindowGeometry(null)).toEqual({
      width: 400, height: 640, left: null, top: null
    });
    expect(normalizeComeviewWindowGeometry(undefined).width).toBe(COMEVIEW_WINDOW_DEFAULT.width);
  });

  it('正常な値はそのまま通す', () => {
    expect(normalizeComeviewWindowGeometry({ width: 520, height: 900, left: 100, top: 50 }))
      .toEqual({ width: 520, height: 900, left: 100, top: 50 });
  });

  it('★小さすぎる値は既定へ(潰れた窓を作らない)', () => {
    const g = normalizeComeviewWindowGeometry({ width: 10, height: 5 });
    expect(g.width).toBe(400);
    expect(g.height).toBe(640);
  });

  it('★大きすぎる値も既定へ', () => {
    const g = normalizeComeviewWindowGeometry({ width: 99999, height: 99999 });
    expect(g.width).toBe(400);
    expect(g.height).toBe(640);
  });

  it('★極端な位置は捨てる(画面外の窓を作らない)', () => {
    const g = normalizeComeviewWindowGeometry({ width: 400, height: 640, left: -99999, top: 99999 });
    expect(g.left).toBeNull();
    expect(g.top).toBeNull();
  });

  it('小数は丸める', () => {
    expect(normalizeComeviewWindowGeometry({ width: 500.6, height: 700.2 }).width).toBe(501);
  });

  it('文字列やオブジェクトでも落ちない', () => {
    expect(() => normalizeComeviewWindowGeometry('x')).not.toThrow();
    expect(normalizeComeviewWindowGeometry({ width: 'abc', height: {} }).width).toBe(400);
  });
});

describe('buildComeviewWindowOptions — chrome.windows.create の引数', () => {
  it('保存が無ければ従来と同じ(400x640・位置指定なし)', () => {
    const o = buildComeviewWindowOptions('x.html', null);
    expect(o).toEqual({ url: 'x.html', type: 'popup', width: 400, height: 640 });
    expect('left' in o).toBe(false);
  });

  it('★位置が分かるときだけ left/top を入れる', () => {
    const o = buildComeviewWindowOptions('x.html', { width: 500, height: 800, left: 10, top: 20 });
    expect(o.left).toBe(10);
    expect(o.top).toBe(20);
  });

  it('★位置が片方だけなら入れない(中途半端に置かない)', () => {
    const o = buildComeviewWindowOptions('x.html', { width: 500, height: 800, left: 10 });
    expect('left' in o).toBe(false);
    expect(o.width).toBe(500);
  });
});

describe('pickComeviewGeometryToSave — ★保存してよいかの門', () => {
  it('通常のサイズは保存する', () => {
    expect(pickComeviewGeometryToSave({ width: 520, height: 900, left: 5, top: 6 }))
      .toEqual({ width: 520, height: 900, left: 5, top: 6 });
  });

  it('★最小化(0x0)は保存しない(次に潰れた窓が出る事故を防ぐ)', () => {
    expect(pickComeviewGeometryToSave({ width: 0, height: 0 })).toBeNull();
  });

  it('★極端に小さい窓も保存しない', () => {
    expect(pickComeviewGeometryToSave({ width: 100, height: 100 })).toBeNull();
  });

  it('数値でなければ保存しない', () => {
    expect(pickComeviewGeometryToSave({ width: null, height: 640 })).toBeNull();
    expect(pickComeviewGeometryToSave({})).toBeNull();
  });

  it('★保存→復元が往復して一致する(実運用の本筋)', () => {
    const saved = pickComeviewGeometryToSave({ width: 640, height: 1080, left: 200, top: 100 });
    const restored = buildComeviewWindowOptions('u', saved);
    expect(restored.width).toBe(640);
    expect(restored.height).toBe(1080);
    expect(restored.left).toBe(200);
    expect(restored.top).toBe(100);
  });
});
