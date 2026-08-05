import { describe, it, expect } from 'vitest';
import {
  buildInlineHostVisibilityIntent,
  isInlineHostVisibilityUnchanged
} from './inlineHostVisibilityIntent.js';

describe('buildInlineHostVisibilityIntent — 値は必ずセット', () => {
  it('★見せるとき: 4つの値が全部そろう(1つでも欠けたら中途半端＝事故1の再現)', () => {
    // 実コードの見せる側4箇所(floating_show/dock_show/anchored_show/nonvideo_show)が
    // 書いていた値と一致すること。ここが崩れると挙動が変わる。
    expect(buildInlineHostVisibilityIntent({ visible: true, cause: 'anchored_show' })).toEqual({
      display: 'block',
      opacity: '1',
      pointerEvents: 'auto',
      ariaHidden: 'false',
      cause: 'anchored_show'
    });
  });

  it('★消すとき: 4つの値が全部そろう(実コード overlay_hidden と一致)', () => {
    expect(buildInlineHostVisibilityIntent({ visible: false, cause: 'overlay_hidden' })).toEqual({
      display: 'none',
      opacity: '0',
      pointerEvents: 'none',
      ariaHidden: 'true',
      cause: 'overlay_hidden'
    });
  });

  it('★display と opacity が食い違わない(片方だけ変える変異を殺す)', () => {
    const shown = buildInlineHostVisibilityIntent({ visible: true, cause: 'x' });
    const hidden = buildInlineHostVisibilityIntent({ visible: false, cause: 'x' });
    // 見せるなら全部「見せる側」、消すなら全部「消す側」。混在は許さない。
    expect([shown.display, shown.opacity, shown.pointerEvents, shown.ariaHidden])
      .toEqual(['block', '1', 'auto', 'false']);
    expect([hidden.display, hidden.opacity, hidden.pointerEvents, hidden.ariaHidden])
      .toEqual(['none', '0', 'none', 'true']);
  });

  it('visible が明示的な true でなければ消す側(暗黙の true を作らない)', () => {
    for (const v of [undefined, null, 0, '', 'true', 1, {}]) {
      expect(buildInlineHostVisibilityIntent({ visible: v, cause: 'c' }).display).toBe('none');
    }
  });

  it('cause は文字列化される(速報にそのまま出るため)', () => {
    expect(buildInlineHostVisibilityIntent({ visible: true }).cause).toBe('');
    expect(buildInlineHostVisibilityIntent({ visible: true, cause: 'dock_show' }).cause).toBe('dock_show');
  });

  it('引数が空でも落ちない(計器/描画を止めない)', () => {
    expect(buildInlineHostVisibilityIntent(undefined).display).toBe('none');
  });
});

describe('isInlineHostVisibilityUnchanged — 計器を水増ししない', () => {
  const shown = buildInlineHostVisibilityIntent({ visible: true, cause: 'x' });

  it('★既に同じ状態なら true(＝書かない・数えない)', () => {
    expect(isInlineHostVisibilityUnchanged(
      { display: 'block', opacity: '1', pointerEvents: 'auto' }, shown
    )).toBe(true);
  });

  it('★1つでも違えば false(中途半端な状態を「変化なし」と誤判定しない)', () => {
    // v0.1.1254 実測の症状: display:none なのに opacity だけ残る等。
    expect(isInlineHostVisibilityUnchanged(
      { display: 'block', opacity: '0', pointerEvents: 'auto' }, shown
    )).toBe(false);
    expect(isInlineHostVisibilityUnchanged(
      { display: 'none', opacity: '1', pointerEvents: 'auto' }, shown
    )).toBe(false);
    expect(isInlineHostVisibilityUnchanged(
      { display: 'block', opacity: '1', pointerEvents: 'none' }, shown
    )).toBe(false);
  });

  it('材料が無ければ false(書く側に倒す＝安全側)', () => {
    expect(isInlineHostVisibilityUnchanged(null, shown)).toBe(false);
    expect(isInlineHostVisibilityUnchanged({}, null)).toBe(false);
  });
});
