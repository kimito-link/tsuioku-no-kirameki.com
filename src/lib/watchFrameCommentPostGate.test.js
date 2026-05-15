import { describe, it, expect } from 'vitest';
import { shouldAcceptCommentPostInWatchFrame } from './watchFrameCommentPostGate.js';

describe('shouldAcceptCommentPostInWatchFrame', () => {
  const base = {
    hasEditor: false,
    hasCommentPanel: false,
    isMainTopFrame: false,
    isWatchUrl: false,
    locationAllowsRecording: false
  };

  it('editor ありなら常に true', () => {
    expect(
      shouldAcceptCommentPostInWatchFrame({
        ...base,
        hasEditor: true,
        isMainTopFrame: true,
        isWatchUrl: true
      })
    ).toBe(true);
  });

  it('コメントパネル相当 DOM があれば true（editor 遅延の pollUntil を許可）', () => {
    expect(
      shouldAcceptCommentPostInWatchFrame({
        ...base,
        hasCommentPanel: true,
        isMainTopFrame: true,
        isWatchUrl: true
      })
    ).toBe(true);
  });

  it('メイン top + watch URL で editor もパネルも無い → false（別 frameId へ早く回す）', () => {
    expect(
      shouldAcceptCommentPostInWatchFrame({
        ...base,
        isMainTopFrame: true,
        isWatchUrl: true
      })
    ).toBe(false);
  });

  it('メイン top + watch URL で editor/パネル無しのときは locationAllows でも false（iframe へ回す）', () => {
    expect(
      shouldAcceptCommentPostInWatchFrame({
        ...base,
        isMainTopFrame: true,
        isWatchUrl: true,
        locationAllowsRecording: true
      })
    ).toBe(false);
  });

  it('iframe 内など: watch でなく editor もパネルも無いが locationAllows → true', () => {
    expect(
      shouldAcceptCommentPostInWatchFrame({
        ...base,
        locationAllowsRecording: true
      })
    ).toBe(true);
  });
});
