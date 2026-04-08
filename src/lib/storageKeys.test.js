import { describe, it, expect } from 'vitest';
import {
  KEY_AUTO_BACKUP_STATE,
  KEY_COMMENT_ENTER_SEND,
  KEY_STORY_GROWTH_COLLAPSED,
  KEY_SUPPORT_VISUAL_EXPANDED,
  KEY_USAGE_TERMS_ACK,
  KEY_NL_ENTITLEMENT_TIER,
  KEY_LAST_WATCH_URL,
  KEY_RECORDING,
  KEY_DEEP_HARVEST_QUIET_UI,
  KEY_SELF_POSTED_RECENTS,
  KEY_USER_COMMENT_PROFILE_CACHE,
  EXTENSION_SOFT_CACHE_STORAGE_KEYS,
  KEY_STORAGE_WRITE_ERROR,
  KEY_COMMENT_PANEL_STATUS,
  INLINE_PANEL_WIDTH_PLAYER_ROW,
  INLINE_PANEL_WIDTH_VIDEO,
  INLINE_PANEL_PLACEMENT_BELOW,
  INLINE_PANEL_PLACEMENT_BESIDE,
  INLINE_PANEL_PLACEMENT_FLOATING,
  commentsStorageKey,
  devMonitorTrendStorageKey,
  giftUsersStorageKey,
  isCommentEnterSendEnabled,
  isRecordingEnabled,
  isDeepHarvestQuietUiEnabled,
  isUsageTermsAcknowledged,
  normalizeInlinePanelWidthMode,
  normalizeInlinePanelPlacement,
  KEY_INLINE_PANEL_PLACEMENT,
  normalizeEntitlementTier,
  normalizeCalmPanelMotion,
  normalizeMarketingExportMaskLabels
} from './storageKeys.js';

describe('storage key constants', () => {
  it('devMonitorTrendStorageKey に liveId が含まれる', () => {
    expect(devMonitorTrendStorageKey('lv1')).toContain('lv1');
  });

  it('EXTENSION_SOFT_CACHE_STORAGE_KEYS にプロフィールキャッシュが含まれる', () => {
    expect(EXTENSION_SOFT_CACHE_STORAGE_KEYS).toContain(KEY_USER_COMMENT_PROFILE_CACHE);
  });

  it('プレフィックスで衝突しにくい文字列', () => {
    expect(KEY_RECORDING).toMatch(/^nls_/);
    expect(KEY_DEEP_HARVEST_QUIET_UI).toMatch(/^nls_/);
    expect(KEY_LAST_WATCH_URL).toMatch(/^nls_/);
    expect(KEY_STORAGE_WRITE_ERROR).toMatch(/^nls_/);
    expect(KEY_COMMENT_PANEL_STATUS).toMatch(/^nls_/);
    expect(KEY_AUTO_BACKUP_STATE).toMatch(/^nls_/);
    expect(KEY_SELF_POSTED_RECENTS).toMatch(/^nls_/);
    expect(KEY_USER_COMMENT_PROFILE_CACHE).toMatch(/^nls_/);
    expect(KEY_COMMENT_ENTER_SEND).toMatch(/^nls_/);
    expect(KEY_STORY_GROWTH_COLLAPSED).toMatch(/^nls_/);
    expect(KEY_SUPPORT_VISUAL_EXPANDED).toMatch(/^nls_/);
    expect(KEY_USAGE_TERMS_ACK).toMatch(/^nls_/);
    expect(KEY_NL_ENTITLEMENT_TIER).toMatch(/^nls_/);
    expect(KEY_INLINE_PANEL_PLACEMENT).toMatch(/^nls_/);
  });

  it('normalizeEntitlementTier は free / pro / premium のみ通す', () => {
    expect(normalizeEntitlementTier(undefined)).toBe('free');
    expect(normalizeEntitlementTier('PRO')).toBe('pro');
    expect(normalizeEntitlementTier('premium')).toBe('premium');
    expect(normalizeEntitlementTier('enterprise')).toBe('free');
  });

  it('isUsageTermsAcknowledged は true のみ有効', () => {
    expect(isUsageTermsAcknowledged(undefined)).toBe(false);
    expect(isUsageTermsAcknowledged(null)).toBe(false);
    expect(isUsageTermsAcknowledged(false)).toBe(false);
    expect(isUsageTermsAcknowledged('true')).toBe(false);
    expect(isUsageTermsAcknowledged(true)).toBe(true);
  });

  it('isDeepHarvestQuietUiEnabled は false のみオフ（未設定はオン）', () => {
    expect(isDeepHarvestQuietUiEnabled(undefined)).toBe(true);
    expect(isDeepHarvestQuietUiEnabled(null)).toBe(true);
    expect(isDeepHarvestQuietUiEnabled(true)).toBe(true);
    expect(isDeepHarvestQuietUiEnabled(false)).toBe(false);
  });

  it('commentsStorageKey は trim + 小文字', () => {
    expect(commentsStorageKey('LV123')).toBe('nls_comments_lv123');
    expect(commentsStorageKey('  LV99  ')).toBe('nls_comments_lv99');
    expect(commentsStorageKey('')).toBe('nls_comments_');
  });

  it('giftUsersStorageKey は trim + 小文字', () => {
    expect(giftUsersStorageKey('LV123')).toBe('nls_gift_users_lv123');
    expect(giftUsersStorageKey('  LV99  ')).toBe('nls_gift_users_lv99');
    expect(giftUsersStorageKey('')).toBe('nls_gift_users_');
  });

  it('normalizeCalmPanelMotion: 明示 true/false と inline 既定', () => {
    expect(normalizeCalmPanelMotion(true)).toBe(true);
    expect(normalizeCalmPanelMotion(false)).toBe(false);
    expect(normalizeCalmPanelMotion(undefined)).toBe(false);
    expect(
      normalizeCalmPanelMotion(undefined, { inlineDefault: true })
    ).toBe(true);
    expect(
      normalizeCalmPanelMotion(undefined, { inlineDefault: false })
    ).toBe(false);
  });

  it('normalizeMarketingExportMaskLabels は true のみオン', () => {
    expect(normalizeMarketingExportMaskLabels(true)).toBe(true);
    expect(normalizeMarketingExportMaskLabels(false)).toBe(false);
    expect(normalizeMarketingExportMaskLabels(undefined)).toBe(false);
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

  it('normalizeInlinePanelPlacement は below / beside / floating', () => {
    expect(normalizeInlinePanelPlacement(undefined)).toBe(
      INLINE_PANEL_PLACEMENT_BELOW
    );
    expect(normalizeInlinePanelPlacement('')).toBe(INLINE_PANEL_PLACEMENT_BELOW);
    expect(normalizeInlinePanelPlacement('beside')).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
    expect(normalizeInlinePanelPlacement('BESIDE')).toBe(
      INLINE_PANEL_PLACEMENT_BESIDE
    );
    expect(normalizeInlinePanelPlacement('floating')).toBe(
      INLINE_PANEL_PLACEMENT_FLOATING
    );
    expect(normalizeInlinePanelPlacement('FLOATING')).toBe(
      INLINE_PANEL_PLACEMENT_FLOATING
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
