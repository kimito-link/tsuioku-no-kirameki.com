import { describe, expect, it } from 'vitest';
import { buildStatusMindmapSignature, isElapsedValue } from './statusMindmapSignature.js';

/**
 * ★この検査が守っているのは「軽くすること」ではなく
 *   【異常の見落としを作らずに、秒の刻みだけ無視すること】。
 *
 *   このリポは「保存値/署名に時刻を混ぜて毎回別物になる」を
 *   v0.1.1409(健全度セル) / v0.1.1320(elapsedSec) / v0.1.1412(samples,lastAt) と
 *   ★3回踏んでいる。マインドマップは4回目だった。
 */

describe('isElapsedValue — 時間の経過だけを見分ける', () => {
  it('★「◯秒前」は時間の経過(署名から外す)', () => {
    expect(isElapsedValue('3 秒前')).toBe(true);
    expect(isElapsedValue('120 秒前')).toBe(true);
    expect(isElapsedValue('5 分前')).toBe(true);
  });

  it('★件数・パーセントは外さない(中身が変わったら再描画したい)', () => {
    expect(isElapsedValue('128 件')).toBe(false);
    expect(isElapsedValue('23% (記録 128 / 公式 554)')).toBe(false);
    expect(isElapsedValue('747 人')).toBe(false);
  });

  it('文字列以外は対象外', () => {
    expect(isElapsedValue(null)).toBe(false);
    expect(isElapsedValue(123)).toBe(false);
    expect(isElapsedValue(undefined)).toBe(false);
  });
});

describe('buildStatusMindmapSignature — 秒の刻みでは変わらない', () => {
  const model = (ago) => ({
    label: '根',
    badge: 'info',
    children: [
      { label: '概要', children: [{ label: '累計 記録', value: '128 件' }] },
      { label: '配信', children: [{ label: '最終取り込み', value: `${ago} 秒前`, badge: 'ok' }] }
    ]
  });

  it('★「秒前」だけが違うモデルは同じ署名(=再描画しない)', () => {
    expect(buildStatusMindmapSignature(model(3))).toBe(buildStatusMindmapSignature(model(99)));
  });

  it('★件数が変われば署名も変わる(=必ず再描画される)', () => {
    const a = model(3);
    const b = model(3);
    b.children[0].children[0].value = '572 件';
    expect(buildStatusMindmapSignature(a)).not.toBe(buildStatusMindmapSignature(b));
  });

  it('★badge(異常の色)が変われば署名も変わる — 見落としを作らない', () => {
    const a = model(3);
    const b = model(3);
    b.children[1].children[0].badge = 'bad';
    expect(buildStatusMindmapSignature(a)).not.toBe(buildStatusMindmapSignature(b));
  });

  it('★枝が増減すれば署名も変わる', () => {
    const a = model(3);
    const b = model(3);
    b.children.push({ label: '新しい枝' });
    expect(buildStatusMindmapSignature(a)).not.toBe(buildStatusMindmapSignature(b));
  });

  it('label が変われば署名も変わる', () => {
    const a = model(3);
    const b = model(3);
    b.children[0].label = '別の見出し';
    expect(buildStatusMindmapSignature(a)).not.toBe(buildStatusMindmapSignature(b));
  });

  it('壊れた入力でも落ちない(空署名=呼び出し側は従来どおり描く)', () => {
    expect(() => buildStatusMindmapSignature(null)).not.toThrow();
    expect(buildStatusMindmapSignature(null)).toBe('');
    expect(() => buildStatusMindmapSignature({ children: 'x' })).not.toThrow();
  });

  it('★同じモデルなら何度呼んでも同じ署名(安定)', () => {
    const m = model(7);
    expect(buildStatusMindmapSignature(m)).toBe(buildStatusMindmapSignature(m));
  });
});
