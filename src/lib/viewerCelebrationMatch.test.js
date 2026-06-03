import { describe, it, expect } from 'vitest';
import { senderLooksLikeViewer } from './viewerCelebrationMatch.js';

describe('senderLooksLikeViewer', () => {
  it('ニコニ広告の長い表示名と短いニックネームを同一視する', () => {
    expect(
      senderLooksLikeViewer(
        '君はりんく＠クリエイター応援',
        'りんく',
        '12345'
      )
    ).toBe(true);
  });

  it('無関係な送り主は false', () => {
    expect(senderLooksLikeViewer('別の人', 'りんく', '12345')).toBe(false);
  });
});
