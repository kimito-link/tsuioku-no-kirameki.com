import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ドラッグ直後の click 飲み込み(v0.1.1646)の寿命ガード。
 *   以前は「次の click を1回飲む」リスナーを付けっぱなしにしていた。ボタンを会場の外で離す(pointerleave)・pointercancel・
 *   タッチのネイティブスクロールで終わると click が来ず、リスナーが残って【次の正規クリック(タイルの発言パネルなど)を1回食って】いた。
 *   クロージャ内なので実行時テストは書けない=文字列スキャンで「時間で外れる」「次の pointerdown で外れる」を固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');
const a = src.indexOf('let venueDrag = initVenueDragState();');
const b = src.indexOf('seatsHost.addEventListener(\'pointercancel\', endVenueDragHandler);', a);
const block = src.slice(a, b);

describe('ドラッグ直後の click 飲み込みの寿命', () => {
  it('★範囲の切り出しが空でない(0件で緑にしない)', () => {
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(block.length).toBeGreaterThan(500);
  });

  it('★時間で外れる(タイマー付き)', () => {
    expect(block).toMatch(/VENUE_DRAG_SWALLOW_MS\s*=\s*\d+/);
    expect(block).toContain('window.setTimeout(clearVenueSwallow, VENUE_DRAG_SWALLOW_MS)');
  });

  it('★次の pointerdown で必ず外す(左ボタンの判定より前ではなく、判定の直後)', () => {
    const down = block.indexOf("seatsHost.addEventListener('pointerdown'");
    const clear = block.indexOf('clearVenueSwallow(); // 前のドラッグ');
    expect(down).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(down);
  });

  it('★飲み込んだ click 自身も外す(1回だけ)', () => {
    const fn = block.slice(block.indexOf('const swallow = (ev) =>'), block.indexOf('venueSwallow = {'));
    expect(fn).toContain('clearVenueSwallow()');
  });

  it('★素の removeEventListener(swallow) だけに戻っていない(外す入口は clearVenueSwallow に一本化)', () => {
    expect(block).not.toContain("removeEventListener('click', swallow, true)");
  });
});
