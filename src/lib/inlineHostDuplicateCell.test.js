import { describe, it, expect } from 'vitest';
import { buildBuriedCells } from './buriedInstrumentCells.js';

/**
 * ★パネルの重複生成(duplicateSeen)を速報のセルに出す。
 *
 * ■ なぜ要るか(2026-08-19・1.51倍の調査で判明)
 *   `recordInlineHostDuplicateSeen`(`inlineHostMoveProbe.js:64`)は
 *   **v0.1.1125 から重複を数えていた**。`summarizeInlineHostMoveDiag` が
 *   `duplicateSeen` を返し、`statusFastDiagLite` が `hostMoveDiag` を
 *   印字まで通している。**つまり JSON には出ていた。**
 *
 *   ★しかし読み手(`buriedInstrumentCells.js` の 'host-move' セル)は
 *   `moveCount` しか見ておらず、しかも `moves > 0` のときだけセルを出していた。
 *   ＝**重複が何回起きても、引っ越しが0なら画面に何も出ない。**
 *
 *   即時プッシュの「受信/送信」比を読むとき、**重複パネルの実在が決め手**なのに
 *   その数字が枠から引けなかった([[screen-only-info-never-reaches-the-report-2026-08-11]])。
 *
 * ■ 掟(buriedInstrumentCells.js 冒頭)
 *   「使っていない0」と「動くはずなのに0」を区別する。
 *   ★重複は **0が正常**。だから観測が無いときは出さない(na にしない)。
 *     出すのは「重複を1回以上見た」ときだけ＝出たら必ず意味がある。
 */
describe('★パネル重複(duplicateSeen)が速報のセルに出る', () => {
  /** hostMoveDiag だけを持つ最小の入力を作る。 */
  const withHostMove = (hostMoveDiag) => ({ fastDiag: { content: { hostMoveDiag } } });
  const find = (cells, id) => cells.find((c) => c.id === id) || null;

  it('★重複を見たらセルが出る(引っ越しが0でも出る)', () => {
    // ★ここが本丸: moveCount=0 でも duplicateSeen>0 なら出さねばならない。
    //   旧実装は moves>0 を条件にしていたので、この入力では何も出なかった。
    const cells = buildBuriedCells(withHostMove({ moveCount: 0, duplicateSeen: 3 }));
    const c = find(cells, 'host-duplicate');
    expect(c, 'duplicateSeen=3 なのにセルが無い').toBeTruthy();
    expect(c.text).toContain('3');
  });

  it('★重複は 0 が正常＝観測ゼロならセルを出さない(枠を無駄にしない)', () => {
    const cells = buildBuriedCells(withHostMove({ moveCount: 5, duplicateSeen: 0 }));
    expect(find(cells, 'host-duplicate')).toBeNull();
  });

  it('★hostMoveDiag 自体が無ければ出さない(未観測を異常と呼ばない)', () => {
    expect(find(buildBuriedCells({}), 'host-duplicate')).toBeNull();
    expect(find(buildBuriedCells(withHostMove(null)), 'host-duplicate')).toBeNull();
  });

  it('★1回でも warn(重複は仕様上あってはならない=見えたら必ず知らせる)', () => {
    const c = find(buildBuriedCells(withHostMove({ duplicateSeen: 1 })), 'host-duplicate');
    expect(c.level).toBe('warn');
  });

  it('★既存の「記録役の引っ越し」セルを壊していない', () => {
    const cells = buildBuriedCells(withHostMove({ moveCount: 4, duplicateSeen: 0 }));
    const move = find(cells, 'host-move');
    expect(move, 'host-move が消えた=退化').toBeTruthy();
    expect(move.text).toContain('4');
  });

  it('★数値でない duplicateSeen は出さない(推測で断定しない)', () => {
    for (const bad of [null, undefined, 'たくさん', NaN]) {
      const cells = buildBuriedCells(withHostMove({ duplicateSeen: bad }));
      expect(find(cells, 'host-duplicate'), `${String(bad)} で出てしまった`).toBeNull();
    }
  });
});
