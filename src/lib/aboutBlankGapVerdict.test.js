import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  judgeAboutBlankGap,
  EXHAUSTED_APPROACHES,
  ABOUT_BLANK_GAP_TYPICAL_MS,
  ABOUT_BLANK_GAP_REGRESSION_MS
} from './aboutBlankGapVerdict.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★「85版目」を機械的に止める赤。
 *
 * 2026-08-05 以降だけで **84版** 同じ症状を追った(`git log --all --grep=黒` は92件)。
 * 結論は `docs/handoff/HANDOFF-2026-08-17-sidepanel-black-NEXT.md` に
 * 「直せない。追わない」と**文書では既に書かれていた**。それでも版は積まれ続けた。
 * ★文書は読まれないことがある。テストは赤くなる。
 */
describe('★about:blank の隙間に対する確定判定(85版目を止める)', () => {
  it('★実測32msは【受け入れる】(仕様由来)', () => {
    const v = judgeAboutBlankGap({ residualMs: ABOUT_BLANK_GAP_TYPICAL_MS });
    expect(v.action).toBe('accept');
    expect(v.specDefined).toBe(true);
  });

  it('★空振り済みの手口は【着手前に拒否する】', () => {
    for (const approach of EXHAUSTED_APPROACHES) {
      const v = judgeAboutBlankGap({ residualMs: 32, approach });
      expect(v.action, `${approach} を許してしまった`).toBe('reject');
      expect(v.reason).toContain('84版');
    }
  });

  it('★未知の手口は拒否しない(構造で直す道を塞がない)', () => {
    // ★iframe廃止・srcdoc等の【構造を変える】案までブロックしたら、
    //   これは「思考停止の装置」になってしまう。そうしない。
    const v = judgeAboutBlankGap({ residualMs: 32, approach: 'drop-iframe' });
    expect(v.action).toBe('accept');
  });

  it('★仕様で説明がつかない大きさは【追う】(見逃す装置にしない)', () => {
    const v = judgeAboutBlankGap({ residualMs: ABOUT_BLANK_GAP_REGRESSION_MS + 1 });
    expect(v.action).toBe('investigate');
    expect(v.specDefined).toBe(false);
    // 次に見る場所を必ず名指しする(計器は原因を出す)。
    expect(v.reason).toContain('changelogBundleBudget');
  });

  it('★1,373ms(分割前の実測)は必ず investigate になる', () => {
    // 主因が再発したら、この関数は「受け入れ」を返してはならない。
    expect(judgeAboutBlankGap({ residualMs: 1373 }).action).toBe('investigate');
  });

  it('★測っていないものは【判定不能】と返す(推測で断定しない)', () => {
    for (const bad of [undefined, null, NaN, -1, 'いっしゅん']) {
      expect(judgeAboutBlankGap({ residualMs: bad }).action).toBe('unknown');
    }
    expect(judgeAboutBlankGap(undefined).action).toBe('unknown');
  });

  /*
   * ★ここから下は「判定が実際に文書へ届いているか」の配線検査。
   *   判定を書いただけで誰も読まないなら、また版が積まれる
   *   ([[unwired-judgement-is-systemic-2026-08-12]])。
   */
  it('★引き継ぎ文書がこの判定を名指ししている(次の人が必ず出会う)', () => {
    const handoff = read('docs/handoff/HANDOFF-2026-08-17-sidepanel-black-NEXT.md');
    expect(
      handoff,
      '引き継ぎに aboutBlankGapVerdict.js への導線が無い＝次の人は判定に出会えない'
    ).toContain('aboutBlankGapVerdict');
  });

  it('★空振り記録が4件そろっている(数で固定=黙って減らせない)', () => {
    // 手口を1つ消して「効くはず」と再挑戦する変異を止める。
    expect(EXHAUSTED_APPROACHES).toHaveLength(4);
    expect(EXHAUSTED_APPROACHES).toContain('transparent');
    expect(EXHAUSTED_APPROACHES).toContain('curtain');
  });
});
