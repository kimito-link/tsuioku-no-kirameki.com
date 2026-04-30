/** @vitest-environment happy-dom */
/**
 * cheerPalette のテスト。
 *
 * 0.1.12 (C): 「8888」「wwwww」「(*^▽^*)」等の盛り上げワードをワンクリック挿入する
 *   小さなパレット機能。コメント textarea のカーソル位置に挿入し、最近使った 5 件は
 *   先頭に並び替える。UIUX を阻害しないよう既存の compose 領域は変えず、
 *   小さい toggle ボタン + 折り畳みポップオーバーで提供する。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDefaultCheerPresets,
  findCheerPresetByKey,
  insertCommentTextAtCursor,
  rankCheerPresetsByRecent,
  pushRecentCheerKey,
  normalizeRecentCheerKeys
} from './cheerPalette.js';

describe('getDefaultCheerPresets', () => {
  it('frozen array を返す（誤改変防止）', () => {
    const list = getDefaultCheerPresets();
    expect(Array.isArray(list)).toBe(true);
    expect(Object.isFrozen(list)).toBe(true);
  });

  it('各エントリは {key, label, text, category} を持つ', () => {
    const list = getDefaultCheerPresets();
    for (const p of list) {
      expect(typeof p.key).toBe('string');
      expect(p.key.length).toBeGreaterThan(0);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(typeof p.text).toBe('string');
      expect(p.text.length).toBeGreaterThan(0);
      expect(typeof p.category).toBe('string');
    }
  });

  it('key は重複しない', () => {
    const list = getDefaultCheerPresets();
    const keys = list.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('text は 80 字以内（250 字 textarea に余裕で収まる）', () => {
    const list = getDefaultCheerPresets();
    for (const p of list) {
      expect(p.text.length).toBeLessThanOrEqual(80);
    }
  });

  it('実用的な数（8〜20 個）を含む', () => {
    const list = getDefaultCheerPresets();
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(20);
  });

  it('代表的な盛り上げワードを含む', () => {
    const list = getDefaultCheerPresets();
    const texts = list.map((p) => p.text);
    expect(texts).toContain('8888');
    expect(texts.some((t) => t.includes('w'))).toBe(true);
  });
});

describe('findCheerPresetByKey', () => {
  it('存在する key で preset を返す', () => {
    const list = getDefaultCheerPresets();
    const first = list[0];
    expect(findCheerPresetByKey(first.key)).toBe(first);
  });

  it('存在しない key で null を返す', () => {
    expect(findCheerPresetByKey('__not_exist__')).toBe(null);
  });

  it('null/undefined/空文字で null を返す', () => {
    expect(findCheerPresetByKey(null)).toBe(null);
    expect(findCheerPresetByKey(undefined)).toBe(null);
    expect(findCheerPresetByKey('')).toBe(null);
  });
});

describe('insertCommentTextAtCursor', () => {
  /** @type {HTMLTextAreaElement} */
  let ta;
  /** @type {(ev: Event) => void} */
  let inputSpy;

  beforeEach(() => {
    ta = document.createElement('textarea');
    ta.maxLength = 250;
    document.body.appendChild(ta);
    inputSpy = vi.fn();
    ta.addEventListener('input', inputSpy);
  });

  it('空の textarea にテキストを挿入', () => {
    ta.value = '';
    ta.setSelectionRange(0, 0);
    const r = insertCommentTextAtCursor(ta, '8888', { maxLength: 250 });
    expect(r.ok).toBe(true);
    expect(ta.value).toBe('8888');
    expect(ta.selectionStart).toBe(4);
    expect(ta.selectionEnd).toBe(4);
  });

  it('カーソル位置に挿入（前後保持）', () => {
    ta.value = 'hello world';
    ta.setSelectionRange(5, 5);
    const r = insertCommentTextAtCursor(ta, ' WAVE', { maxLength: 250 });
    expect(r.ok).toBe(true);
    expect(ta.value).toBe('hello WAVE world');
    expect(ta.selectionStart).toBe(10);
  });

  it('選択範囲がある場合は置換', () => {
    ta.value = 'hello WORLD!';
    ta.setSelectionRange(6, 11);
    const r = insertCommentTextAtCursor(ta, '8888', { maxLength: 250 });
    expect(r.ok).toBe(true);
    expect(ta.value).toBe('hello 8888!');
    expect(ta.selectionStart).toBe(10);
  });

  it('maxLength を超える挿入は no-op で ok:false', () => {
    ta.value = 'a'.repeat(248);
    ta.setSelectionRange(248, 248);
    const r = insertCommentTextAtCursor(ta, '8888', { maxLength: 250 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('exceeds_max_length');
    expect(ta.value).toBe('a'.repeat(248));
  });

  it('maxLength ぎりぎり一致は ok', () => {
    ta.value = 'a'.repeat(246);
    ta.setSelectionRange(246, 246);
    const r = insertCommentTextAtCursor(ta, '8888', { maxLength: 250 });
    expect(r.ok).toBe(true);
    expect(ta.value).toBe('a'.repeat(246) + '8888');
  });

  it('input イベントを発火（コメント送信ボタンの enable 連動などのため）', () => {
    ta.value = '';
    ta.setSelectionRange(0, 0);
    insertCommentTextAtCursor(ta, '8888', { maxLength: 250 });
    expect(inputSpy).toHaveBeenCalledTimes(1);
  });

  it('null textarea で ok:false', () => {
    const r = insertCommentTextAtCursor(null, '8888', { maxLength: 250 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_textarea');
  });

  it('空テキスト挿入は no-op で ok:false', () => {
    ta.value = 'hi';
    ta.setSelectionRange(2, 2);
    inputSpy.mockClear();
    const r = insertCommentTextAtCursor(ta, '', { maxLength: 250 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty_text');
    expect(ta.value).toBe('hi');
    expect(inputSpy).not.toHaveBeenCalled();
  });

  it('selectionStart/End が null（focus 当たってない）時は末尾に追加', () => {
    ta.value = 'pre';
    // jsdom はデフォルトで selection を 0 にするが、明示的に末尾にしたケース
    ta.setSelectionRange(3, 3);
    const r = insertCommentTextAtCursor(ta, '!', { maxLength: 250 });
    expect(r.ok).toBe(true);
    expect(ta.value).toBe('pre!');
  });
});

describe('rankCheerPresetsByRecent', () => {
  it('recent 空 → そのまま', () => {
    const presets = [
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' },
      { key: 'c', text: 'C' }
    ];
    const r = rankCheerPresetsByRecent(presets, []);
    expect(r.map((p) => p.key)).toEqual(['a', 'b', 'c']);
  });

  it('recent[c, a] → c, a が先頭、残りは元順', () => {
    const presets = [
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' },
      { key: 'c', text: 'C' },
      { key: 'd', text: 'D' }
    ];
    const r = rankCheerPresetsByRecent(presets, ['c', 'a']);
    expect(r.map((p) => p.key)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('recent に存在しない key は無視', () => {
    const presets = [
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' }
    ];
    const r = rankCheerPresetsByRecent(presets, ['c', 'a']);
    expect(r.map((p) => p.key)).toEqual(['a', 'b']);
  });

  it('元配列を mutate しない（不変）', () => {
    const presets = [
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' }
    ];
    const before = [...presets];
    rankCheerPresetsByRecent(presets, ['b']);
    expect(presets).toEqual(before);
  });
});

describe('pushRecentCheerKey', () => {
  it('空配列 → [key]', () => {
    expect(pushRecentCheerKey([], 'a', { max: 5 })).toEqual(['a']);
  });

  it('新しい key を先頭に', () => {
    expect(pushRecentCheerKey(['b', 'c'], 'a', { max: 5 })).toEqual(['a', 'b', 'c']);
  });

  it('既存の key は先頭に移動（重複排除）', () => {
    expect(pushRecentCheerKey(['a', 'b', 'c'], 'b', { max: 5 })).toEqual([
      'b',
      'a',
      'c'
    ]);
  });

  it('max を超えた古いものは捨てる', () => {
    expect(pushRecentCheerKey(['a', 'b', 'c', 'd', 'e'], 'f', { max: 5 })).toEqual([
      'f',
      'a',
      'b',
      'c',
      'd'
    ]);
  });

  it('空文字 / 非文字 key は no-op で元配列を返す（参照保持はしない）', () => {
    const arr = ['a', 'b'];
    expect(pushRecentCheerKey(arr, '', { max: 5 })).toEqual(['a', 'b']);
    // @ts-expect-error: invalid input intentional
    expect(pushRecentCheerKey(arr, null, { max: 5 })).toEqual(['a', 'b']);
  });
});

describe('normalizeRecentCheerKeys', () => {
  it('配列以外は空配列', () => {
    expect(normalizeRecentCheerKeys(null)).toEqual([]);
    expect(normalizeRecentCheerKeys(undefined)).toEqual([]);
    expect(normalizeRecentCheerKeys('a,b,c')).toEqual([]);
    expect(normalizeRecentCheerKeys({ 0: 'a' })).toEqual([]);
  });

  it('文字列以外の要素は除外', () => {
    expect(normalizeRecentCheerKeys(['a', 1, null, 'b', undefined])).toEqual([
      'a',
      'b'
    ]);
  });

  it('空文字は除外', () => {
    expect(normalizeRecentCheerKeys(['a', '', 'b'])).toEqual(['a', 'b']);
  });

  it('重複は先頭優先で除外', () => {
    expect(normalizeRecentCheerKeys(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('過剰に長い場合は切り詰める', () => {
    const big = Array.from({ length: 50 }, (_, i) => `k${i}`);
    const r = normalizeRecentCheerKeys(big);
    expect(r.length).toBeLessThanOrEqual(20);
  });
});
