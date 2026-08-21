import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAutoSectionCensus,
  noteAutoSection,
  formatAutoSectionLines,
  AUTO_SECTION_SLOW_MS,
  AUTO_SECTION_COVERAGE_WARN_PCT
} from './autoSectionCensus.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★「囲んだ3箇所しか犯人にできない」を構造で終わらせる。
 *
 * ■ ★ユーザー指示(2026-08-21)がこのモジュールの出発点
 *   「表面的なものを考えるんじゃなくて、まず DOM を全部把握して
 *     それを計器に入れる基本から見直すべき」
 *   → DOM Tree Visualizer を見て「これでできたものを計器にいれればいいかも」
 *   ★あのツールの本質は「絵」ではない。**全要素を機械的に測ること**。
 *     人が「ここが怪しい」と当たりをつける余地が無い＝**見落としが起きない**。
 *
 * ■ ★いまの計器の構造的欠陥(コードで確認・推測ではない)
 *   `mainThreadBlockerBoot.js` の `markBlockerSection` は
 *   **区間名のラベルを置くだけで、自分では何も測っていない**。
 *   実測しているのは 250ms ごとのハートビートで、遅れを見つけた時点の
 *   `_currentSection` を読む。ところが `markBlockerSection` は `finally` で
 *   ★**区間を抜けた瞬間にラベルを戻す**(`:60`)。
 *   ＝ ハートビートが鳴るのは区間が終わった後のことが多く、
 *     ★**実際には拡張が止めていても「(拡張の外)」と出る**。
 *
 *   さらに囲みは実測で **3箇所しかない**
 *   (renderCommentTicker / renderStoryCommentDetailPanel / renderCharacterScene)。
 *   ★私が事前に怪しいと思った所だけ＝**推測が計器に混入している**。
 *
 * ■ このモジュールの契約
 *   1. ★**区間そのものを実測する**(ラベルではなく所要時間を持つ)。
 *      ハートビートの取りこぼしに依存しない。
 *   2. ★**測っていない時間を数える**(カバー率)。
 *      「囲み忘れ」が数字で見える＝黙って見落とさない
 *      ([[zero-count-may-mean-unmeasured-2026-08-04]])。
 *   3. 純関数・DOM/chrome 非依存。時刻は呼び出し側が渡す。
 */
describe('★全経路を機械的に測る(囲み忘れを数字にする)', () => {
  it('★測れないときは na(「異常なし」と言わない)', () => {
    const c = createAutoSectionCensus();
    expect(formatAutoSectionLines(c, { elapsedMs: 0 }).level).toBe('na');
  });

  it('★区間の所要を実測して名前ごとに積む', () => {
    const c = createAutoSectionCensus();
    noteAutoSection(c, { name: 'renderCharacterScene', ms: 120 });
    noteAutoSection(c, { name: 'renderCharacterScene', ms: 80 });
    noteAutoSection(c, { name: 'laneRepaint', ms: 300 });
    expect(c.byName.renderCharacterScene.ms).toBe(200);
    expect(c.byName.renderCharacterScene.count).toBe(2);
    expect(c.byName.laneRepaint.worstMs).toBe(300);
  });

  it('★★遅い区間だけでなく【全区間】を積む(50ms未満も落とさない)', () => {
    /*
     * ★既存の noteBlocker は LONG_TASK_MS(50ms)未満を捨てる。
     *   それだと「20msの処理が100回」= 2秒 が**完全に見えない**。
     *   ★実機は 16.7秒中15.9秒停止。細かい積み上げを捨てたら真因に届かない。
     */
    const c = createAutoSectionCensus();
    for (let i = 0; i < 100; i += 1) noteAutoSection(c, { name: 'tinyButOften', ms: 20 });
    expect(c.byName.tinyButOften.ms).toBe(2000);
    expect(c.totalMs).toBe(2000);
  });

  it('★★測っていない時間を出す(囲み忘れが数字で見える)', () => {
    const c = createAutoSectionCensus();
    noteAutoSection(c, { name: 'a', ms: 1000 });
    // 10秒のうち1秒しか測れていない = カバー率10%
    const v = formatAutoSectionLines(c, { elapsedMs: 10_000 });
    expect(v.coveragePct).toBe(10);
    expect(v.uncoveredMs).toBe(9000);
  });

  it('★★カバー率が低いときは「計器が足りない」と自分で言う', () => {
    const c = createAutoSectionCensus();
    noteAutoSection(c, { name: 'a', ms: 100 });
    const v = formatAutoSectionLines(c, { elapsedMs: 10_000 });
    expect(v.coveragePct).toBeLessThan(AUTO_SECTION_COVERAGE_WARN_PCT);
    /*
     * ★ここが要。カバー率が低いのに「犯人は○○」と断言すると誤診する。
     *   計器自身が「まだ測れていない」と言えなければならない。
     */
    expect(v.line).toContain('測れていない');
  });

  it('★カバー率が十分なら犯人を名指しする', () => {
    const c = createAutoSectionCensus();
    noteAutoSection(c, { name: 'laneRepaint', ms: 8000 });
    noteAutoSection(c, { name: 'small', ms: 500 });
    const v = formatAutoSectionLines(c, { elapsedMs: 10_000 });
    expect(v.coveragePct).toBeGreaterThanOrEqual(AUTO_SECTION_COVERAGE_WARN_PCT);
    expect(v.line).toContain('laneRepaint');
    expect(v.worstName).toBe('laneRepaint');
  });

  it('★遅い1回は別に残す(平均に埋もれさせない)', () => {
    const c = createAutoSectionCensus();
    noteAutoSection(c, { name: 'x', ms: AUTO_SECTION_SLOW_MS + 10 });
    expect(c.slowSamples.length).toBe(1);
    expect(c.slowSamples[0].name).toBe('x');
  });

  it('★壊れた入力でも落ちない(計器が本体を壊さない)', () => {
    const c = createAutoSectionCensus();
    for (const bad of [null, undefined, {}, { name: 'x' }, { ms: 'abc' }]) {
      expect(() => noteAutoSection(c, bad)).not.toThrow();
    }
    expect(c.totalMs).toBe(0);
  });

  it('★Number(null)=0 の穴を塞ぐ(過去に2回踏んだ)', () => {
    const c = createAutoSectionCensus();
    noteAutoSection(c, { name: 'x', ms: null });
    expect(c.totalMs).toBe(0);
    expect(formatAutoSectionLines(c, { elapsedMs: null }).level).toBe('na');
  });

  it('★★実装(popup-entry.js)がこの計器を使っている', () => {
    /*
     * ★純関数を作っただけで使われないと意味がない
     *   ([[unwired-judgement-is-systemic-2026-08-12]])。
     */
    const src = read('src/extension/popup-entry.js');
    expect(src, '自動計測モジュールを import していない')
      .toContain('autoSectionCensus.js');
  });
});
