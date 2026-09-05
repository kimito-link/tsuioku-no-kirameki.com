import { describe, expect, it } from 'vitest';
import {
  AD_MESSAGE_LINE_MAX_CHARS,
  buildAdMessageLines
} from './adMessageLines.js';

/**
 * ★この検査が守っているのは【原文をそのまま残すこと】。
 *   仕分けない・削らない・並べ替えない。
 */

describe('広告でひとこと(レポートに残す)', () => {
  it('★実データがそのまま載る(名前もメッセージも区別しない)', () => {
    const out = buildAdMessageLines([
      { name: 'ゲスト', contribution: 34374 },
      { name: 'コメリにも１６ｃｍ自慢行くの？', contribution: 22152 },
      { name: 'とねりん', contribution: 12004 },
      { name: 'いっくん応援団', contribution: 8099 }
    ]);
    expect(out).toContain('コメリにも１６ｃｍ自慢行くの？');
    expect(out).toContain('いっくん応援団');
    expect(out).toContain('ゲスト');
    expect(out).toContain('とねりん');
  });

  it('ポイントも一緒に残す(誰がいくら入れてくれたか)', () => {
    const out = buildAdMessageLines([{ name: 'ON', contribution: 28909 }]);
    expect(out).toContain('28,909pt');
  });

  it('★並べ替えない(公式の貢献pt順をそのまま使う)', () => {
    const out = buildAdMessageLines([
      { name: '一番目', contribution: 100 },
      { name: '二番目', contribution: 50 }
    ]);
    expect(out.indexOf('一番目')).toBeLessThan(out.indexOf('二番目'));
  });

  it('件数を見出しに出す', () => {
    const out = buildAdMessageLines([{ name: 'a', contribution: 1 }, { name: 'b', contribution: 1 }]);
    expect(out).toContain('広告でひとこと(2件)');
  });

  it('★絵文字だけでも載る(v0.1.1430 では埋もれていた)', () => {
    expect(buildAdMessageLines([{ name: '💖✨', contribution: 3200 }])).toContain('💖✨');
  });

  it('★絵文字を壊さずに切る(コードポイント単位)', () => {
    const long = '💖'.repeat(AD_MESSAGE_LINE_MAX_CHARS + 10);
    const out = buildAdMessageLines([{ name: long, contribution: 1 }]);
    expect(out).toContain('…');
    // 壊れた半端な文字(置換文字)が出ていない
    expect(out).not.toContain('�');
  });

  it('長い本文は切るが、切ったことが分かる', () => {
    const long = 'あ'.repeat(AD_MESSAGE_LINE_MAX_CHARS + 5);
    expect(buildAdMessageLines([{ name: long, contribution: 1 }])).toContain('…');
  });

  it('0件なら何も出さない(ノイズにしない)', () => {
    expect(buildAdMessageLines([])).toBe('');
    expect(buildAdMessageLines(null)).toBe('');
    expect(buildAdMessageLines(undefined)).toBe('');
  });

  it('文字が無い行は飛ばす(空行を作らない)', () => {
    const out = buildAdMessageLines([{ name: '  ', contribution: 5 }, { name: 'あり', contribution: 1 }]);
    expect(out).toContain('広告でひとこと(1件)');
    expect(out).toContain('あり');
  });

  it('ポイントが無くても名前は残す', () => {
    expect(buildAdMessageLines([{ name: 'ぽち' }])).toContain('ぽち');
  });

  it('件数の上限で打ち切る', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ name: `u${i}`, contribution: 1 }));
    const out = buildAdMessageLines(rows, { max: 5 });
    expect(out).toContain('広告でひとこと(5件)');
    expect(out).not.toContain('u9');
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => buildAdMessageLines([null, undefined, {}])).not.toThrow();
    expect(buildAdMessageLines([null, undefined, {}])).toBe('');
  });
});
