// storyUserLaneMeta.test.js
// characterization test: storyUserLaneMetaLines は popup-entry.js のローカル関数を
//   1バイトも変えずに lib へ抽出したもの。文言・分岐を固定して退化を防ぐ。

import { describe, it, expect } from 'vitest';
import { storyUserLaneMetaLines } from './storyUserLaneMeta.js';

describe('storyUserLaneMetaLines', () => {
  it('userId 無し + dedupeKey t: → サムネURLで区別の文言', () => {
    expect(storyUserLaneMetaLines({ userId: '' }, '', 't:abc')).toEqual({
      idLine: '—',
      nameLine: 'ユーザーID未取得（サムネURLで区別）'
    });
  });

  it('userId 無し + dedupeKey s: → 行IDで区別の文言', () => {
    expect(storyUserLaneMetaLines({ userId: '' }, '', 's:xyz')).toEqual({
      idLine: '—',
      nameLine: 'ユーザーID未取得（行IDで区別）'
    });
  });

  it('userId 無し + dedupeKey 無し → ID未取得', () => {
    expect(storyUserLaneMetaLines({ userId: '' }, '', '')).toEqual({
      idLine: '—',
      nameLine: 'ID未取得'
    });
  });

  it('匿名スタイルの userId → compact ID + 匿名ニックネームフォールバック', () => {
    const r = storyUserLaneMetaLines({ userId: 'a:anon123', nickname: '' }, '', '');
    // idLine/nameLine は空でも '—' で埋まる
    expect(typeof r.idLine).toBe('string');
    expect(typeof r.nameLine).toBe('string');
    expect(r.idLine).not.toBe('');
    expect(r.nameLine).not.toBe('');
  });

  it('数値ID + http サムネ + ニックネーム → ニックネームをそのまま名前行に', () => {
    const r = storyUserLaneMetaLines(
      { userId: '123456', nickname: 'りんくファン' },
      'https://example.test/icon.png',
      ''
    );
    expect(r.nameLine).toBe('りんくファン');
    expect(r.idLine).not.toBe('—');
  });

  it('数値ID + ニックネーム無し → u/<uid> 形のフォールバック', () => {
    const r = storyUserLaneMetaLines({ userId: '123456', nickname: '' }, '', '');
    expect(r.nameLine).not.toBe('');
    expect(r.idLine).not.toBe('—');
  });

  it('数値ID で http 無しだが nick あり → nick を名前行に', () => {
    const r = storyUserLaneMetaLines({ userId: '123456', nickname: 'こんた推し' }, '', '');
    expect(r.nameLine).toBe('こんた推し');
  });

  it('entry が null でも落ちない(ID未取得)', () => {
    expect(storyUserLaneMetaLines(null, '', '')).toEqual({
      idLine: '—',
      nameLine: 'ID未取得'
    });
  });
});
