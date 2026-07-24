import { describe, it, expect } from 'vitest';
import {
  createStoryUserLaneClickAffordanceParityState,
  observeStoryUserLaneClickAffordance,
  toStoryUserLaneClickAffordanceParityDiag
} from './storyUserLaneClickAffordanceParity.js';

/**
 * storyUserLaneClickAffordanceParity.js — ①POP応援レーンの「クリック不能な手カーソル」実害確定計器。
 * 掟: 数えるだけ・DOM/データを触らない(venueYukkuriNamedCensus.jsと同じ)。
 */

/** @param {string} tag @param {string} cursor */
function fakeEl(tag, cursor) {
  return {
    tagName: tag,
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({ cursor })
      }
    }
  };
}

describe('createStoryUserLaneClickAffordanceParityState', () => {
  it('初期値は全部ゼロ・lastSampleはnull', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    expect(state.checked).toBe(0);
    expect(state.mismatched).toBe(0);
    expect(state.lastSample).toBeNull();
  });
});

describe('observeStoryUserLaneClickAffordance（正常系）', () => {
  it('A実体(リンク)は対象外(cursor:pointerが付いていて正常)', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('A', 'pointer'), title: '太郎' });
    expect(state.checked).toBe(0);
  });

  it('SPAN実体でcursorがdefault(pointer以外)なら不一致にならない(検査対象にはなる)', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('SPAN', 'default'), title: '名無し' });
    expect(state.checked).toBe(1);
    expect(state.mismatched).toBe(0);
  });

  it('tileElが無い/tagName無しは対象外', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    observeStoryUserLaneClickAffordance(state, { tileEl: null, title: 'x' });
    observeStoryUserLaneClickAffordance(state, { tileEl: {}, title: 'x' });
    expect(state.checked).toBe(0);
  });

  it('getComputedStyleが無い(計測不能環境)は対象外・例外を投げない', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    expect(() =>
      observeStoryUserLaneClickAffordance(state, { tileEl: { tagName: 'SPAN' }, title: 'x' })
    ).not.toThrow();
    expect(state.checked).toBe(0);
  });
});

describe('observeStoryUserLaneClickAffordance（実害: SPANなのにcursor:pointer）', () => {
  it('SPAN実体でcursor:pointerなら mismatched が増える', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('SPAN', 'pointer'), title: '名無し' });
    expect(state.checked).toBe(1);
    expect(state.mismatched).toBe(1);
    expect(state.lastSample).toEqual({ tag: 'SPAN', cursor: 'pointer', title: '名無し' });
  });

  it('lastSampleは最後の1件で上書きされる', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('SPAN', 'pointer'), title: 'A' });
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('SPAN', 'pointer'), title: 'B' });
    expect(state.lastSample?.title).toBe('B');
    expect(state.mismatched).toBe(2);
  });

  it('titleが長すぎる場合は40文字で切り詰める', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    const longTitle = 'あ'.repeat(60);
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('SPAN', 'pointer'), title: longTitle });
    expect(state.lastSample?.title.length).toBe(40);
  });
});

describe('toStoryUserLaneClickAffordanceParityDiag', () => {
  it('checked=0は⚪未観測', () => {
    const diag = toStoryUserLaneClickAffordanceParityDiag(createStoryUserLaneClickAffordanceParityState());
    expect(diag.line).toBe('クリック不能カーソル ⚪ 未観測');
  });

  it('mismatched=0は✅', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('SPAN', 'default'), title: '名無し' });
    const diag = toStoryUserLaneClickAffordanceParityDiag(state);
    expect(diag.line).toContain('✅');
    expect(diag.line).toContain('検1');
  });

  it('mismatched>0は🔴+件数+直近サンプルを1行に含む', () => {
    const state = createStoryUserLaneClickAffordanceParityState();
    observeStoryUserLaneClickAffordance(state, { tileEl: fakeEl('SPAN', 'pointer'), title: '名無し' });
    const diag = toStoryUserLaneClickAffordanceParityDiag(state);
    expect(diag.line).toContain('🔴');
    expect(diag.line).toContain('1件');
    expect(diag.line).toContain('名無し');
    expect(diag.line).toContain('tag=SPAN');
    expect(diag.line).toContain('cursor=pointer');
    expect(diag.mismatched).toBe(1);
  });

  it('壊れたstateでも例外を投げずnullを返す', () => {
    expect(toStoryUserLaneClickAffordanceParityDiag(null)).toBeNull();
    expect(toStoryUserLaneClickAffordanceParityDiag(undefined)).toBeNull();
  });
});
