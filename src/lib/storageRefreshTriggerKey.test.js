import { describe, expect, it } from 'vitest';
import {
  TRIGGER_KEY_MAX,
  buildStorageRefreshTriggerTag,
  normalizeStorageKeyForCensus
} from './storageRefreshTriggerKey.js';

describe('normalizeStorageKeyForCensus — 配信IDを畳んで集計できる形にする', () => {
  it('★lvNNN を * に畳む(生キーのままだと配信ごとに別物になり内訳が読めない)', () => {
    expect(normalizeStorageKeyForCensus('nls_comments_lv351155151')).toBe('nls_comments_*');
    expect(normalizeStorageKeyForCensus('nls_cdb_summary_lv123')).toBe('nls_cdb_summary_*');
  });

  it('大文字の LV も畳む', () => {
    expect(normalizeStorageKeyForCensus('nls_x_LV999')).toBe('nls_x_*');
  });

  it('末尾の長い数値も畳む', () => {
    expect(normalizeStorageKeyForCensus('nls_foo_1786462314000')).toBe('nls_foo_*');
  });

  it('畳む対象が無ければそのまま', () => {
    expect(normalizeStorageKeyForCensus('nls_voice_reading_enabled_v1')).toBe(
      'nls_voice_reading_enabled_v1'
    );
  });

  it('空・null は空文字', () => {
    expect(normalizeStorageKeyForCensus('')).toBe('');
    expect(normalizeStorageKeyForCensus(null)).toBe('');
    expect(normalizeStorageKeyForCensus(undefined)).toBe('');
  });
});

describe('buildStorageRefreshTriggerTag — 引き金を名指しするタグ', () => {
  it('キーが無ければ従来どおりの素のタグ(後方互換)', () => {
    expect(buildStorageRefreshTriggerTag([])).toBe('storage_changed');
    expect(buildStorageRefreshTriggerTag(null)).toBe('storage_changed');
  });

  it('★どのキーが引き金かを名指しする(これが無いと1,891回の内訳が永久に見えない)', () => {
    const tag = buildStorageRefreshTriggerTag(['nls_comments_lv123']);
    expect(tag).toBe('storage_changed:nls_comments_*');
  });

  it('複数キーは + で連結し、並びは決定的(ソート済み)', () => {
    const a = buildStorageRefreshTriggerTag(['nls_panel_summary_lv1', 'nls_comments_lv1']);
    const b = buildStorageRefreshTriggerTag(['nls_comments_lv1', 'nls_panel_summary_lv1']);
    expect(a).toBe(b); // 順序が違っても同じタグ=集計がぶれない
    expect(a).toBe('storage_changed:nls_comments_*+nls_panel_summary_*');
  });

  it('同じ正規化キーは重複しない', () => {
    const tag = buildStorageRefreshTriggerTag(['nls_comments_lv1', 'nls_comments_lv2']);
    expect(tag).toBe('storage_changed:nls_comments_*');
  });

  it('★上限を超えたら件数で示す(速報1行に収める)', () => {
    const keys = ['nls_a_lv1', 'nls_b_lv1', 'nls_c_lv1', 'nls_d_lv1', 'nls_e_lv1'];
    const tag = buildStorageRefreshTriggerTag(keys);
    expect(TRIGGER_KEY_MAX).toBe(3);
    expect(tag).toBe('storage_changed:nls_a_*+nls_b_*+nls_c_*+他2');
  });

  it('base を差し替えられる(他の引き金にも使える)', () => {
    expect(buildStorageRefreshTriggerTag(['nls_x_lv1'], { base: 'instant_push' })).toBe(
      'instant_push:nls_x_*'
    );
  });
});
