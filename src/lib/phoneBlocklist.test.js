import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPhoneBlocklist, parseBlocklist, recentPeopleForBlock } from './phoneBlocklist.js';

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
    expect(liveView).toContain('return applyPhoneBlocklist(data, readBlocklist());');
    expect(liveView).toContain('if (_demo) return applyPhoneBlocklist(await _demo.snapshot(), readBlocklist());');
    expect(liveView).toContain("if (blocked.size) rows = rows.filter(");
    expect(liveView).toMatch(/if \(_native\.isNative\(\)\) \{\s*mountPhoneBlockUi\(/);
  });
});
