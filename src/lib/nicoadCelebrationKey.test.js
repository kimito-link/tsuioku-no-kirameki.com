import { describe, it, expect } from 'vitest';
import { nicoadCommentCelebrationKey } from './nicoadCelebrationKey.js';

// popup-entry.js の元実装の挙動をそのまま固定する characterization test。
// （抽出でこの出力が1文字でも変わったら退行。）
describe('nicoadCommentCelebrationKey', () => {
  it('commentNo があれば no: キーになる', () => {
    expect(nicoadCommentCelebrationKey({ commentNo: 42, text: 'x' }, 'lv123')).toBe('lv123|no:42');
  });

  it('liveId は trim + lowercase される', () => {
    expect(nicoadCommentCelebrationKey({ commentNo: 7 }, '  LV999  ')).toBe('lv999|no:7');
  });

  it('commentNo が無ければ id にフォールバックする', () => {
    expect(nicoadCommentCelebrationKey({ id: 'abc', text: 'x' }, 'lv1')).toBe('lv1|no:abc');
  });

  it('commentNo を id より優先する', () => {
    expect(nicoadCommentCelebrationKey({ commentNo: 5, id: 'abc' }, 'lv1')).toBe('lv1|no:5');
  });

  it('commentNo の前後空白は trim される', () => {
    expect(nicoadCommentCelebrationKey({ commentNo: '  9  ' }, 'lv1')).toBe('lv1|no:9');
  });

  it('no が無ければ capturedAt と本文先頭80字で組む', () => {
    expect(nicoadCommentCelebrationKey({ text: 'hello', capturedAt: 1000 }, 'lv1')).toBe(
      'lv1|t:1000|hello'
    );
  });

  it('capturedAt が無ければ 0 を使う', () => {
    expect(nicoadCommentCelebrationKey({ text: 'hi' }, 'lv1')).toBe('lv1|t:0|hi');
  });

  it('capturedAt が数値化できなければ 0 を使う', () => {
    expect(nicoadCommentCelebrationKey({ text: 'hi', capturedAt: 'nope' }, 'lv1')).toBe('lv1|t:0|hi');
  });

  it('本文は先頭80字に切り詰められる', () => {
    const long = 'a'.repeat(200);
    const key = nicoadCommentCelebrationKey({ text: long, capturedAt: 5 }, 'lv1');
    expect(key).toBe(`lv1|t:5|${'a'.repeat(80)}`);
  });

  it('本文の前後空白は trim される（slice は trim 後）', () => {
    expect(nicoadCommentCelebrationKey({ text: '  pad  ', capturedAt: 2 }, 'lv1')).toBe('lv1|t:2|pad');
  });

  it('"0" のような commentNo は falsy な空文字ではないので no: になる', () => {
    // String(0) は "0" で trim 後も "0"（truthy 文字列）→ no: 経路
    expect(nicoadCommentCelebrationKey({ commentNo: 0 }, 'lv1')).toBe('lv1|no:0');
  });

  it('commentNo が空文字なら no: 経路に行かず t: 経路になる', () => {
    expect(nicoadCommentCelebrationKey({ commentNo: '', text: 'z', capturedAt: 3 }, 'lv1')).toBe(
      'lv1|t:3|z'
    );
  });

  it('liveId / entry が無くても落ちない', () => {
    expect(nicoadCommentCelebrationKey(null, '')).toBe('|t:0|');
    expect(nicoadCommentCelebrationKey(undefined, undefined)).toBe('|t:0|');
  });
});
