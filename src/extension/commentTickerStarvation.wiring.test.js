import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'popup-entry.js'), 'utf8');

/**
 * v0.1.1227 回帰: コメントティッカーが「餓死しない描画経路」から呼ばれることを断言する。
 *
 * 【なぜ必要か】
 * v0.1.1226 でピックアップ選定を入れたが、`renderCommentTicker` の呼び出しが
 * **重い refresh() の中だけ**にあった。応援レーンは v0.1.976 で
 * 「重い storage read の後ろで餓死させない」ために独立経路
 * (paintStoryUserLaneCoalesced)を持っており、実配信ではそちらで描かれる。
 * 結果、実測で **laneTickProbe.runs=9(レーンは9回描画) なのに tickerPick は全0**
 * =ピックアップが一度も動いていなかった。
 *
 * ★教訓: 「実装した」と「呼ばれている」は別。計器がゼロのままなら配線を疑う。
 */
describe('コメントティッカーは餓死しない経路から呼ばれる (popup-entry.js)', () => {
  /** paintStoryUserLaneCoalesced の本体を切り出す。 */
  const coalescedBlock = (() => {
    const start = src.indexOf('async function paintStoryUserLaneCoalesced(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('\n  let giftUsers = [];', start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  })();

  it('★独立経路(paintStoryUserLaneCoalesced)から renderCommentTicker を呼んでいる', () => {
    expect(coalescedBlock).toContain('renderCommentTicker(');
  });

  it('★レーン描画と同じガードの中で呼ぶ(レーンが描けるときは必ず更新される)', () => {
    const guardIdx = coalescedBlock.indexOf('renderStoryUserLane();');
    const tickerIdx = coalescedBlock.indexOf('renderCommentTicker(');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    // レーン描画の直後にあること(別のガード条件に入れ替わっていない)。
    expect(tickerIdx).toBeGreaterThan(guardIdx);
    expect(tickerIdx - guardIdx).toBeLessThan(600);
  });

  it('従来の refresh() 経路からの呼び出しも残っている(二重描画は diff-skip が吸収)', () => {
    // 片方だけに寄せると、もう片方のモードで出なくなる。両方に残すのが正。
    const calls = src.split('renderCommentTicker(').length - 1;
    // 定義1 + 空リセット2 + refresh経路1 + 独立経路1 = 5箇所以上
    expect(calls).toBeGreaterThanOrEqual(5);
  });

  it('選定と計器の呼び出しが renderCommentTicker 本体に無条件で入っている', () => {
    const start = src.indexOf('function renderCommentTicker(comments) {');
    expect(start).toBeGreaterThanOrEqual(0);
    const body = src.slice(start, start + 1200);
    const pickIdx = body.indexOf('pickTickerHighlightEntry(');
    expect(pickIdx).toBeGreaterThanOrEqual(0);
    // ★if(false) 等の前置で殺されていないこと(行頭からの並びを見る)。
    const lineStart = body.lastIndexOf('\n', pickIdx) + 1;
    expect(body.slice(lineStart, pickIdx).trim()).toBe('const _picked =');
    expect(body).toContain('recordTickerPick(_tickerPickDiag, _picked)');
  });
});
