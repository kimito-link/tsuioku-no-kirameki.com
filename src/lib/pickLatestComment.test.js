import { describe, expect, it } from 'vitest';
import { pickLatestCommentEntry } from './pickLatestComment.js';

describe('pickLatestCommentEntry', () => {
  it('prefers higher commentNo when both numeric', () => {
    const list = [
      { commentNo: '10', capturedAt: 300, text: 'old' },
      { commentNo: '2055', capturedAt: 100, text: 'new' }
    ];
    expect(pickLatestCommentEntry(list)?.text).toBe('new');
  });

  it('uses capturedAt when commentNo ties or missing', () => {
    const list = [
      { commentNo: '5', capturedAt: 1000, text: 'a' },
      { commentNo: '5', capturedAt: 2000, text: 'b' }
    ];
    expect(pickLatestCommentEntry(list)?.text).toBe('b');
  });

  it('treats non-numeric commentNo as missing for ordering', () => {
    const list = [
      { commentNo: 'INFO', capturedAt: 5000, text: 'info' },
      { capturedAt: 1000, text: 'plain' }
    ];
    expect(pickLatestCommentEntry(list)?.text).toBe('info');
  });
});
