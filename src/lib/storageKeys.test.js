import { describe, it, expect } from 'vitest';
import {
  KEY_AUTO_BACKUP_STATE,
  KEY_COMMENT_ENTER_SEND,
  KEY_STORY_GROWTH_COLLAPSED,
  KEY_LAST_WATCH_URL,
  KEY_RECORDING,
  KEY_SELF_POSTED_RECENTS,
  KEY_STORAGE_WRITE_ERROR,
  INLINE_PANEL_WIDTH_PLAYER_ROW,
  INLINE_PANEL_WIDTH_VIDEO,
  commentsStorageKey,
  isCommentEnterSendEnabled,
  isRecordingEnabled,
  normalizeInlinePanelWidthMode
} from './storageKeys.js';

describe('storage key constants', () => {
  it('プレフィックスで衝突しにくい文字列', () => {
    expect(KEY_RECORDING).toMatch(/^nls_/);
    expect(KEY_LAST_WATCH_URL).toMatch(/^nls_/);
    expect(KEY_STORAGE_WRITE_ERROR).toMatch(/^nls_/);
    expect(KEY_AUTO_BACKUP_STATE).toMatch(/^nls_/);
    expect(KEY_SELF_POSTED_RECENTS).toMatch(/^nls_/);
    expect(KEY_COMMENT_ENTER_SEND).toMatch(/^nls_/);
    expect(KEY_STORY_GROWTH_COLLAPSED).toMatch(/^nls_/);
  });

  it('commentsStorageKey は trim + 小文字', () => {
    expect(commentsStorageKey('LV123')).toBe('nls_comments_lv123');
    expect(commentsStorageKey('  LV99  ')).toBe('nls_comments_lv99');
    expect(commentsStorageKey('')).toBe('nls_comments_');
  });

  it('normalizeInlinePanelWidthMode は video 以外は player_row', () => {
    expect(normalizeInlinePanelWidthMode(undefined)).toBe(
      INLINE_PANEL_WIDTH_PLAYER_ROW
    );
    expect(normalizeInlinePanelWidthMode('')).toBe(INLINE_PANEL_WIDTH_PLAYER_ROW);
    expect(normalizeInlinePanelWidthMode('video')).toBe(INLINE_PANEL_WIDTH_VIDEO);
    expect(normalizeInlinePanelWidthMode(INLINE_PANEL_WIDTH_VIDEO)).toBe(
      INLINE_PANEL_WIDTH_VIDEO
    );
  });

  it('isCommentEnterSendEnabled は false のみ無効（未設定時は既定ON）', () => {
    expect(isCommentEnterSendEnabled(undefined)).toBe(true);
    expect(isCommentEnterSendEnabled(null)).toBe(true);
    expect(isCommentEnterSendEnabled(true)).toBe(true);
    expect(isCommentEnterSendEnabled(false)).toBe(false);
  });

  it('isRecordingEnabled は false のみ無効（未設定時は既定ON）', () => {
    expect(isRecordingEnabled(undefined)).toBe(true);
    expect(isRecordingEnabled(null)).toBe(true);
    expect(isRecordingEnabled(true)).toBe(true);
    expect(isRecordingEnabled(false)).toBe(false);
  });
});
