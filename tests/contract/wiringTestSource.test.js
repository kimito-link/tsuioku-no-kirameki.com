import { describe, expect, it } from 'vitest';
import { extractFnBody, locateEntryFn, resolveEntryFnSource } from '../helpers/wiringTestSource.js';

/**
 * ★Phase 2 の前提工事: 関数を移動しても wiring テストが壊れない仕組み。
 *
 * 現状の wiring テストはファイルを直接読んで関数名で切り出すため、
 * popup-entry.js から src/extension/popup/ へ移した瞬間に軒並み赤くなる
 * (2026-08-10 に実際に3件経験した)。
 * 「移動のたびに直す」方式は抽出コストを上げ、抽出をためらわせる＝巨大化の再生産。
 * → 先に置き場所非依存の解決器へ寄せてから動かす。
 */
describe('extractFnBody(括弧対応で本体を切り出す)', () => {
  it('ネストした括弧があっても対応する } まで取る', () => {
    const src = [
      'function target() {',
      '  if (a) { b(); }',
      '  const o = { k: 1 };',
      '  return o;',
      '}',
      'function next() { return 2; }'
    ].join('\n');
    const body = extractFnBody(src, 'function target(');
    expect(body).toContain('const o = { k: 1 };');
    expect(body).toContain('return o;');
    // ★次の関数を巻き込まない(巻き込むと別関数の中身で断言が通ってしまう)。
    expect(body).not.toContain('return 2;');
  });

  it('★短く切れない(ネストで途中の } に釣られない)', () => {
    const src = 'function t() {\n  x({ a: { b: 1 } });\n  const last = 9;\n}';
    expect(extractFnBody(src, 'function t(')).toContain('const last = 9;');
  });

  it('見つからなければ空文字(呼び手が throw する責務)', () => {
    expect(extractFnBody('function a() {}', 'function zzz(')).toBe('');
  });
});

describe('resolveEntryFnSource(置き場所に依らず解決する)', () => {
  it('★popup-entry.js の実在関数を解決できる', () => {
    const body = resolveEntryFnSource('publishLaneMirror');
    expect(body).toContain('publishLaneMirror');
    expect(body.length).toBeGreaterThan(200);
  });

  it('★async 宣言の関数も解決できる', () => {
    const body = resolveEntryFnSource('initPopup');
    expect(body.length).toBeGreaterThan(1000);
  });

  it('★どこにも無い関数名は throw する(空文字で緑にしない)', () => {
    /*
     * ★fail-closed の核心。空文字を返すと、その本文に対する全ての断言が
     *   素通りして【最悪の恒真テスト】になる。移設で関数名を間違えたときに
     *   静かに緑になるのを防ぐ。
     */
    expect(() => resolveEntryFnSource('__thisFunctionDoesNotExist__')).toThrow(/見つかりません/);
  });

  it('関数名が空でも throw する', () => {
    expect(() => resolveEntryFnSource('')).toThrow();
  });
});

describe('locateEntryFn(移設の進捗が読める)', () => {
  it('★いまは popup-entry.js に居ることを示す', () => {
    // Phase 2 で移設したら、この値が src/extension/popup/... に変わる。
    expect(locateEntryFn('initPopup')).toBe('src/extension/popup-entry.js');
  });

  it('無い関数は空文字(throw しない=診断用途)', () => {
    expect(locateEntryFn('__nope__')).toBe('');
  });
});
