import { describe, it, expect } from 'vitest';
import {
  EXIT,
  normalizeProbeResult,
  computeExitCode,
  formatProbeReport,
  runSelfTest
} from '../../scripts/lib/instrument-core.mjs';

/**
 * ★45リポから収穫した「計器の作り方」を実装した土台のテスト。
 *
 * ■ ★ユーザー指示(2026-08-21)「github から学べるもの全部いれて計器を最強にして」
 *
 * ■ ★実測して分かった、このリポに無かったもの
 *   scripts/ 53本のうち `--selftest` を持つもの **0本** /
 *   ゲートで `exit 2`(測れなかった)を出すもの **0本**。
 *   ＝ ★**「測れなかった」を緑に混ぜていた**。
 *
 * ■ 収穫元(すべて実ファイルで確認済み)
 *   - soushin-suggest.link/scripts/blank-map.mjs:17  … 0/1/2 の3値規約
 *   - kimitolink-linktree/scripts/lib/diag-core.mjs:18 … 根拠なき pass を降格
 *   - soushin-suggest.link/scripts/blank-map.mjs:556 … --selftest(毒→赤)
 *   - ai-hub/bin/ci-audit.mjs:212 … 「N件監査できなかった」を緑にしない
 */
describe('★計器の土台: 根拠なき緑を作らない', () => {
  it('★★pass なのに根拠が無ければ inconclusive へ降格する', () => {
    /*
     * ★これがこのリポで実際に起きた事故と同型:
     *   「カウンタ0を『起きなかった』と読んだが、真実は『一度も測っていなかった』」
     *   ([[zero-count-may-mean-unmeasured-2026-08-04]])
     */
    const r = normalizeProbeResult({ probe: 'x', verdict: 'pass', evidence: null });
    expect(r.verdict).toBe('inconclusive');
    expect(normalizeProbeResult({ probe: 'x', verdict: 'pass', evidence: {} }).verdict)
      .toBe('inconclusive');
  });

  it('★根拠があれば pass を名乗れる', () => {
    const r = normalizeProbeResult({ probe: 'x', verdict: 'pass', evidence: { 件数: 41 } });
    expect(r.verdict).toBe('pass');
  });

  it('★知らない verdict は inconclusive(黙って緑にしない)', () => {
    for (const bad of ['ok', 'green', '', null, undefined, 123]) {
      expect(normalizeProbeResult({ probe: 'x', verdict: bad, evidence: { a: 1 } }).verdict)
        .toBe('inconclusive');
    }
  });

  it('★壊れた入力でも落ちない(計器が本体を壊さない)', () => {
    for (const bad of [null, undefined, {}, 42, 'x']) {
      expect(() => normalizeProbeResult(bad)).not.toThrow();
    }
  });
});

describe('★終了コードの3値規約(0=合格 / 1=赤 / ★2=測れなかった)', () => {
  const ev = { n: 1 };

  it('★★1件でも「測れなかった」があれば緑にしない', () => {
    /*
     * ★収穫元 ai-hub/bin/ci-audit.mjs:212 の
     *   「指摘は無いが N リポを監査できなかった(緑と判定しない)」と同じ。
     */
    const code = computeExitCode([
      { probe: 'a', verdict: 'pass', evidence: ev },
      { probe: 'b', verdict: 'inconclusive', evidence: null }
    ]);
    expect(code).toBe(EXIT.INCONCLUSIVE);
    expect(code).not.toBe(EXIT.PASS);
  });

  it('★赤が最優先(赤と測れなかったが混在したら赤)', () => {
    expect(computeExitCode([
      { probe: 'a', verdict: 'inconclusive', evidence: null },
      { probe: 'b', verdict: 'fail', evidence: ev }
    ])).toBe(EXIT.FAIL);
  });

  it('★全部が根拠つき pass のときだけ 0', () => {
    expect(computeExitCode([
      { probe: 'a', verdict: 'pass', evidence: ev },
      { probe: 'b', verdict: 'pass', evidence: ev }
    ])).toBe(EXIT.PASS);
  });

  it('★★何も測っていないなら緑にしない(空配列は 2)', () => {
    /*
     * ★「検査を書いたが1件も走っていない」を緑にすると、
     *   守っているつもりで守れていない状態になる。
     */
    expect(computeExitCode([])).toBe(EXIT.INCONCLUSIVE);
    expect(computeExitCode(null)).toBe(EXIT.INCONCLUSIVE);
  });

  it('★2 は 0 と別物であることを定数で固定する', () => {
    expect(EXIT.PASS).toBe(0);
    expect(EXIT.FAIL).toBe(1);
    expect(EXIT.INCONCLUSIVE).toBe(2);
  });
});

describe('★出力の型(何が/直し方/この検査の限界)', () => {
  it('★★赤のときは「直し方」と「限界」を出す', () => {
    /*
     * ★収穫元 check-boundaries.ps1:132。
     *   ★3行目(限界)が要る理由は実損記録にある:
     *   計器が「可視先頭2行」しか測っていないのに全体だと解釈し、
     *   会議メンバー全員が前提を誤った(PAINT-CHAIN-INSTRUMENT-DESIGN.md)。
     */
    const out = formatProbeReport([{
      probe: '純粋性', verdict: 'fail', evidence: { n: 1 },
      detail: 'domTreeCensus.js が document を使った',
      howToFix: 'I/O を entry へ移すか baseline に理由付きで追記',
      limitation: '設計の良し悪しは判定しません。増えたことに気づかせるだけです'
    }]);
    expect(out).toContain('🔴');
    expect(out).toContain('直し方');
    expect(out, '★限界を書かないと過信される').toContain('この検査が判定しないこと');
  });

  it('★★「測れなかった」を緑と並べない(はっきり別扱い)', () => {
    const out = formatProbeReport([{ probe: 'x', verdict: 'inconclusive', evidence: null }]);
    expect(out).toContain('🟡');
    expect(out, '緑ではないと明示していない').toContain('緑ではありません');
  });

  it('★合格は根拠の件数つきで出す(空の緑を出さない)', () => {
    const out = formatProbeReport([{ probe: 'x', verdict: 'pass', evidence: { n: 1 } }]);
    expect(out).toContain('✅');
    expect(out).toContain('根拠あり');
  });
});

describe('★selftest(毒を食わせて赤になるか)', () => {
  it('★★赤くなる検知器は合格', () => {
    let poisoned = false;
    const r = runSelfTest([{
      name: 'D1',
      poison: () => { poisoned = true; },
      restore: () => { poisoned = false; },
      isRed: () => poisoned
    }]);
    expect(r.ok).toBe(true);
    expect(poisoned, '★復帰していない(本体を壊す)').toBe(false);
  });

  it('★★毒を入れても赤くならない検知器は不合格として名指しする', () => {
    /*
     * ★これが selftest の存在意義。
     *   「検査を書いた」と「検査が効いている」は別物
     *   ([[wiring-test-mutation-check-2026-08-01]])。
     */
    const r = runSelfTest([{
      name: 'ざる検知器',
      poison: () => {},
      restore: () => {},
      isRed: () => false
    }]);
    expect(r.ok).toBe(false);
    expect(r.fails[0]).toContain('ざる検知器');
    expect(r.fails[0]).toContain('赤にならなかった');
  });

  it('★★毒で例外が出ても必ず原状復帰する', () => {
    let state = 'clean';
    const r = runSelfTest([{
      name: '例外',
      poison: () => { state = 'dirty'; throw new Error('boom'); },
      restore: () => { state = 'clean'; },
      isRed: () => true
    }]);
    expect(r.ok).toBe(false);
    expect(state, '★例外時に戻さないと本体が壊れたまま残る').toBe('clean');
  });

  it('★壊れた入力でも落ちない', () => {
    expect(() => runSelfTest(null)).not.toThrow();
    expect(runSelfTest([]).ok).toBe(true);
  });
});
