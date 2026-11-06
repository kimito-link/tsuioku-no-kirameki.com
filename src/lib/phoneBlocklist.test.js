import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPhoneBlocklist, parseBlocklist, recentPeopleForBlock, dropBlockedRows, isBlockedCommentNo, rememberCommentAuthors } from './phoneBlocklist.js';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');

describe('スマホ: 見たくない人を隠す(審査 1.2)', () => {
  const blob = {
    commentTimelineMirror: { liveId: 'lv1', rows: [{ userId: 'a', text: 'x' }, { userId: 'b', text: 'y' }] },
    laneMirror: { liveId: 'lv1', tanu: [{ userId: 'a' }, { userId: 'c' }], link: [{ userId: 'b' }] }
  };
  it('★隠す人のコメントと応援レーンの顔だけを抜く。隠す人がいなければ同じものを返す', () => {
    const out = applyPhoneBlocklist(blob, ['a']);
    expect(out.commentTimelineMirror.rows.map((r) => r.userId)).toEqual(['b']);
    expect(out.laneMirror.tanu.map((r) => r.userId)).toEqual(['c']);
    expect(out.laneMirror.link).toHaveLength(1);
    expect(applyPhoneBlocklist(blob, [])).toBe(blob);
    expect(blob.commentTimelineMirror.rows).toHaveLength(2); // 元は変えない
  });
  it('壊れた保存値は空として読む。重複は1つ', () => {
    expect(parseBlocklist('not json')).toEqual([]);
    expect(parseBlocklist('["a","a",1]')).toEqual(['a', '1']);
    expect(parseBlocklist(null)).toEqual([]);
  });
  it('候補は最近書いた人を新しい順に1回ずつ', () => {
    expect(recentPeopleForBlock([{ userId: 'a', name: 'A', text: '1' }, { userId: 'b', name: 'B', text: '2' }, { userId: 'a', name: 'A', text: '3' }]).map((x) => x.text)).toEqual(['3', '2']);
  });
  it('配線: 取ったまとめ・新着の両方に当て、アプリの中でだけ 🚩 を付ける', () => {
    // v0.1.1905: 隠す前に番号→書いた人を覚えてから当てる(rememberAuthorsAndBlock)
    expect(liveView).toContain('return applyPhoneBlocklist(jsonBlob, readBlocklist());');
    expect(liveView).toContain('return rememberAuthorsAndBlock(data);');
    expect(liveView).toContain('if (_demo) return rememberAuthorsAndBlock(await _demo.snapshot());');
    expect(liveView).toContain("if (blocked.size) rows = rows.filter(");
    expect(liveView).toMatch(/if \(_native\.isNative\(\)\) \{\s*mountPhoneBlockUi\(/);
  });
});

describe('v0.1.1905: 隠した人を読み上げ・拡張なしの形でも出さない', () => {
  it('dropBlockedRows: 隠す人の行だけ抜く・誰もいなければ同じ配列', () => {
    const rows = [{ userId: '1', no: '1' }, { userId: '2', no: '2' }, { no: '3' }];
    expect(dropBlockedRows(rows, ['2']).map((r) => r.no)).toEqual(['1', '3']);
    expect(dropBlockedRows(rows, [])).toBe(rows);
    expect(dropBlockedRows(/** @type {any} */ (null), ['2'])).toEqual([]);
  });

  it('rememberCommentAuthors / isBlockedCommentNo: 番号から書いた人を引いて、隠した人の声か判定する', () => {
    const map = new Map();
    rememberCommentAuthors(map, [
      { no: '10', userId: 'u1' },
      { no: '11', userId: 'a:anon' },
      { no: 'x', userId: 'u3' },
      { no: '12', userId: '' },
      { kind: 'gift', userId: 'u4' }
    ]);
    expect([...map.keys()]).toEqual(['10', '11']);
    expect(isBlockedCommentNo(map, '11', ['a:anon'])).toBe(true);
    expect(isBlockedCommentNo(map, '10', ['a:anon'])).toBe(false);
    // 書いた人が分からない番号は読む(黙って全部止めない)
    expect(isBlockedCommentNo(map, '99', ['a:anon'])).toBe(false);
    expect(isBlockedCommentNo(map, '11', [])).toBe(false);
  });

  it('rememberCommentAuthors: 覚える件数には上限があり、古い方から忘れる', () => {
    const map = new Map();
    rememberCommentAuthors(map, Array.from({ length: 10 }, (_, i) => ({ no: String(i + 1), userId: 'u' })), 4);
    expect([...map.keys()]).toEqual(['7', '8', '9', '10']);
  });
});
