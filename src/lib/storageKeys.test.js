import { describe, it, expect } from 'vitest';
import {
  KEY_LAST_WATCH_URL,
  KEY_RECORDING,
  KEY_STORAGE_WRITE_ERROR,
  commentsStorageKey
} from './storageKeys.js';

describe('storage key constants', () => {
  it('プレフィックスで衝突しにくい文字列', () => {
    expect(KEY_RECORDING).toMatch(/^nls_/);
    expect(KEY_LAST_WATCH_URL).toMatch(/^nls_/);
    expect(KEY_STORAGE_WRITE_ERROR).toMatch(/^nls_/);
  });

  it('commentsStorageKey は trim + 小文字', () => {
    expect(commentsStorageKey('LV123')).toBe('nls_comments_lv123');
    expect(commentsStorageKey('  LV99  ')).toBe('nls_comments_lv99');
    expect(commentsStorageKey('')).toBe('nls_comments_');
  });
});
