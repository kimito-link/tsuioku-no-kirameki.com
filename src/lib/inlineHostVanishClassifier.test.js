import { describe, it, expect } from 'vitest';
import {
  classifyVanishSnapshot,
  assessVanishPhase,
  formatVanishPhaseLine,
  VANISH_HINTS,
  PHASE_MIN_SAMPLES
} from './inlineHostVanishClassifier.js';

/**
 * v0.1.1267: 消失分類の判定順序を固定する。
 * ★順序そのものが仕様。順序が崩れると犯人の名指しを誤り、また誤診に戻る。
 */

/** 正常に見えている祖先(潰れていない)。 */
const okAncestors = [
  { tag: 'DIV', display: 'block', w: 933, h: 600 },
  { tag: 'DIV', display: 'flex', w: 1280, h: 720 }
];

describe('classifyVanishSnapshot — 6分岐', () => {
  it('1. 属性が付いていれば ext-attr-hide(拡張が意図して消した)', () => {
    expect(
      classifyVanishSnapshot({
        hiddenAttr: '1',
        styleAttr: 'display:none',
        hostDisplay: 'none',
        ancestors: okAncestors,
        cssAlive: true
      }).hint
    ).toBe(VANISH_HINTS.EXT_ATTR_HIDE);
  });

  it('2. 拡張の<style>が消えていれば css-removed', () => {
    expect(
      classifyVanishSnapshot({
        hiddenAttr: null,
        styleAttr: 'width:100%',
        hostDisplay: 'none',
        ancestors: okAncestors,
        cssAlive: false
      }).hint
    ).toBe(VANISH_HINTS.CSS_REMOVED);
  });

  it('3. 祖先が display:none なら ancestor-collapsed(何段目かを名指し)', () => {
    const r = classifyVanishSnapshot({
      hiddenAttr: null,
      styleAttr: 'display:block',
      hostDisplay: 'none',
      ancestors: [
        { tag: 'DIV', display: 'block', w: 933, h: 600 },
        { tag: 'SECTION', display: 'none', w: 0, h: 0 }
      ],
      cssAlive: true
    });
    expect(r.hint).toBe(VANISH_HINTS.ANCESTOR_COLLAPSED);
    expect(r.detail).toContain('ancestor[1]');
    expect(r.detail).toContain('SECTION');
  });

  it('3b. 祖先が 0x0 でも ancestor-collapsed(display は block のまま潰れる場合)', () => {
    const r = classifyVanishSnapshot({
      hiddenAttr: null,
      styleAttr: 'display:block',
      hostDisplay: 'none',
      ancestors: [{ tag: 'DIV', display: 'block', w: 0, h: 0 }],
      cssAlive: true
    });
    expect(r.hint).toBe(VANISH_HINTS.ANCESTOR_COLLAPSED);
    expect(r.detail).toContain('0x0');
  });

  it('4. computed none かつ inline に display が無い → style-wiped(上書きが失われた)', () => {
    expect(
      classifyVanishSnapshot({
        hiddenAttr: null,
        styleAttr: 'width:100%;opacity:1',
        hostDisplay: 'none',
        ancestors: okAncestors,
        cssAlive: true
      }).hint
    ).toBe(VANISH_HINTS.STYLE_WIPED);
  });

  it('5. display は生きているのに 0x0 → geometry-only', () => {
    expect(
      classifyVanishSnapshot({
        hiddenAttr: null,
        styleAttr: 'display:block',
        hostDisplay: 'block',
        ancestors: okAncestors,
        cssAlive: true
      }).hint
    ).toBe(VANISH_HINTS.GEOMETRY_ONLY);
  });

  it('6. 入力が無い/欠けている → unknown(既定値で断定しない)', () => {
    expect(classifyVanishSnapshot(null).hint).toBe(VANISH_HINTS.UNKNOWN);
    expect(classifyVanishSnapshot(undefined).hint).toBe(VANISH_HINTS.UNKNOWN);
    expect(classifyVanishSnapshot({}).hint).toBe(VANISH_HINTS.UNKNOWN);
  });

  it('★style属性が取得できない時は unknown(style-wiped と断定しない)', () => {
    const r = classifyVanishSnapshot({
      hiddenAttr: null,
      hostDisplay: 'none',
      ancestors: okAncestors,
      cssAlive: true
    });
    expect(r.hint).toBe(VANISH_HINTS.UNKNOWN);
    expect(r.detail).toBe('style-attr-unavailable');
  });

  it('★inline に display:none が有る=拡張以外の書き手 → unknown(style-wipedではない)', () => {
    const r = classifyVanishSnapshot({
      hiddenAttr: null,
      styleAttr: 'display:none;width:100%',
      hostDisplay: 'none',
      ancestors: okAncestors,
      cssAlive: true
    });
    expect(r.hint).toBe(VANISH_HINTS.UNKNOWN);
    expect(r.detail).toContain('unknown writer');
  });

  it('★cssAlive:undefined を「消えた」と誤判定しない(未取得と false を区別)', () => {
    const r = classifyVanishSnapshot({
      hiddenAttr: null,
      styleAttr: 'width:100%',
      hostDisplay: 'none',
      ancestors: okAncestors
    });
    expect(r.hint).not.toBe(VANISH_HINTS.CSS_REMOVED);
  });
});

describe('classifyVanishSnapshot — 判定順序(優先順位)', () => {
  it('★属性ありが最優先: 親も潰れていても ext-attr-hide が勝つ', () => {
    // 属性が付いているなら「拡張が消した」が確定。親の状態は結果に過ぎない。
    expect(
      classifyVanishSnapshot({
        hiddenAttr: '1',
        styleAttr: '',
        hostDisplay: 'none',
        ancestors: [{ tag: 'DIV', display: 'none', w: 0, h: 0 }],
        cssAlive: false
      }).hint
    ).toBe(VANISH_HINTS.EXT_ATTR_HIDE);
  });

  it('★css-removed は ancestor-collapsed より優先(ルールごと消滅が根本)', () => {
    expect(
      classifyVanishSnapshot({
        hiddenAttr: null,
        styleAttr: '',
        hostDisplay: 'none',
        ancestors: [{ tag: 'DIV', display: 'none', w: 0, h: 0 }],
        cssAlive: false
      }).hint
    ).toBe(VANISH_HINTS.CSS_REMOVED);
  });

  it('★ancestor-collapsed は style-wiped より優先(親が原因なら host の style は結果)', () => {
    expect(
      classifyVanishSnapshot({
        hiddenAttr: null,
        styleAttr: 'width:100%',
        hostDisplay: 'none',
        ancestors: [{ tag: 'DIV', display: 'none', w: 0, h: 0 }],
        cssAlive: true
      }).hint
    ).toBe(VANISH_HINTS.ANCESTOR_COLLAPSED);
  });
});

describe('assessVanishPhase — 3分岐', () => {
  it('サンプル不足は insufficient(0件・2件)', () => {
    expect(assessVanishPhase([]).phase).toBe('insufficient');
    expect(assessVanishPhase([100, 110]).phase).toBe('insufficient');
    expect(assessVanishPhase(null).phase).toBe('insufficient');
  });

  it('★ばらつきが小さい=locked(拡張の時計が上流)', () => {
    const a = assessVanishPhase([1832, 1840, 1828]);
    expect(a.phase).toBe('locked');
    expect(a.spreadMs).toBe(12);
    expect(a.n).toBe(3);
  });

  it('★ばらつきが大きい=walking(別の時計=外部要因)', () => {
    const a = assessVanishPhase([100, 1200, 2600]);
    expect(a.phase).toBe('walking');
    expect(a.spreadMs).toBe(2500);
  });

  it('★境界: 許容未満は locked / 許容ちょうどは walking', () => {
    expect(assessVanishPhase([0, 0, 119]).phase).toBe('locked');
    expect(assessVanishPhase([0, 0, 120]).phase).toBe('walking');
  });

  it('数値でない要素は無視する(NaN混入で誤判定しない)', () => {
    const a = assessVanishPhase([100, 'x', null, 110, 105]);
    expect(a.n).toBe(3);
    expect(a.phase).toBe('locked');
  });

  it(`最小サンプル数は ${PHASE_MIN_SAMPLES}`, () => {
    expect(assessVanishPhase([1, 2]).phase).toBe('insufficient');
    expect(assessVanishPhase([1, 2, 3]).phase).not.toBe('insufficient');
  });
});

describe('formatVanishPhaseLine — 意味を言い切る', () => {
  it('locked は「内部が上流」と書く', () => {
    const line = formatVanishPhaseLine(assessVanishPhase([1832, 1840, 1828]), [1832, 1840, 1828]);
    expect(line).toContain('locked');
    expect(line).toContain('内部が上流');
  });

  it('★walking は「区別不能」と書く(外部要因と断定しない)', () => {
    // ★v0.1.1268 訂正: 旧実装は walking を「別の時計=外部要因」と断定していたが誤り。
    //   内部の4秒tickの非同期後段(microtask/rAF/observer)でも Δ はばらつく。
    //   断定に戻す変異はここで赤になる。
    const line = formatVanishPhaseLine(assessVanishPhase([0, 1200, 2600]), [0, 1200, 2600]);
    expect(line).toContain('walking');
    expect(line).toContain('区別不能');
    expect(line).not.toMatch(/=外部要因\)/);
  });

  it('★insufficient は「何件で判定できるか」を出す(0の意味を区別)', () => {
    const line = formatVanishPhaseLine(assessVanishPhase([1]), [1]);
    expect(line).toContain('insufficient');
    expect(line).toContain('1件');
  });
});
