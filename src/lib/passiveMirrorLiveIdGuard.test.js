import { describe, it, expect } from 'vitest';
import { shouldSkipMirrorForLiveId } from './passiveMirrorLiveIdGuard.js';

describe('shouldSkipMirrorForLiveId', () => {
  it('別配信の鏡は貼らない（この判定が本体・ここが緑のままなら意味が無い）', () => {
    expect(shouldSkipMirrorForLiveId('lv111111111', 'lv222222222')).toBe(true);
  });

  it('同じ配信の鏡は貼る', () => {
    expect(shouldSkipMirrorForLiveId('lv111111111', 'lv111111111')).toBe(false);
  });

  // ★:7509 の既存ガードが `.trim().toLowerCase()` で比べているのに合わせる。
  it('前後空白と大文字小文字の違いは同一とみなす', () => {
    expect(shouldSkipMirrorForLiveId(' LV111111111 ', 'lv111111111')).toBe(false);
    expect(shouldSkipMirrorForLiveId('lv111111111', '  Lv111111111')).toBe(false);
  });

  // ★fail-open。止める側に倒すと「何も映らない」というズレより悪い症状になる。
  it('現在の liveId が取れないときは止めない', () => {
    expect(shouldSkipMirrorForLiveId('lv111111111', '')).toBe(false);
    expect(shouldSkipMirrorForLiveId('lv111111111', null)).toBe(false);
    expect(shouldSkipMirrorForLiveId('lv111111111', undefined)).toBe(false);
    expect(shouldSkipMirrorForLiveId('lv111111111', '   ')).toBe(false);
  });

  it('鏡が liveId を名乗らないときも止めない', () => {
    expect(shouldSkipMirrorForLiveId('', 'lv111111111')).toBe(false);
    expect(shouldSkipMirrorForLiveId(null, 'lv111111111')).toBe(false);
  });

  // ★extractLiveIdFromUrl は ch\d+ も返す。形で弾くとチャンネル配信が常に空になる。
  it('チャンネル枠(ch)でも一致すれば貼る・違えば止める', () => {
    expect(shouldSkipMirrorForLiveId('ch12345', 'ch12345')).toBe(false);
    expect(shouldSkipMirrorForLiveId('ch12345', 'ch99999')).toBe(true);
    expect(shouldSkipMirrorForLiveId('ch12345', 'lv12345')).toBe(true);
  });

  it('数値やオブジェクトが来ても例外を投げない', () => {
    expect(() => shouldSkipMirrorForLiveId(123, 'lv1')).not.toThrow();
    expect(() => shouldSkipMirrorForLiveId({}, 'lv1')).not.toThrow();
  });
});
