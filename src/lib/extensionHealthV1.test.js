/**
 * 拡張の健全性を可視化する純関数のテスト。
 *
 * 2026-05-06 実データで観測された「viewerUid 空 / avatar 全滅 / autoOpen Vue 不全」の
 * 4 兆候を、AI 共有診断 JSON に「reason 付き source/value」で出すための先行実装。
 *
 * v0.1.184 の officialValuesV2 と同形式（{ value, source, ageMs, reason }）。
 * v0.2 で plan_unified_situation_snapshot_v2.md の observation.interceptHookHealth に統合される予定。
 */
import { describe, it, expect } from 'vitest';
import { extensionHealthV1 } from './extensionHealthV1.js';

describe('extensionHealthV1', () => {
  /** 全 hook 正常な状態 */
  const HEALTHY_INPUT = {
    viewerUid: '12345',
    broadcasterUid: '67890',
    interceptAvatarSize: 5,
    interceptNicknameSize: 30,
    interceptedUsersTotal: 30,
    ndgrChats: 50,
    ndgrStats: 10,
    autoOpenStatus: 'opened-with-banner'
  };

  it('全 hook 正常時：すべての value が true、reason: null', () => {
    const r = extensionHealthV1(HEALTHY_INPUT);
    expect(r.viewerInfoHookActive.value).toBe(true);
    expect(r.viewerInfoHookActive.reason).toBeNull();
    expect(r.avatarHookActive.value).toBe(true);
    expect(r.avatarHookActive.reason).toBeNull();
    expect(r.nicknameHookActive.value).toBe(true);
    expect(r.nicknameHookActive.reason).toBeNull();
    expect(r.ndgrIngestionActive.value).toBe(true);
    expect(r.ndgrIngestionActive.reason).toBeNull();
    expect(r.vueSidebarMounted.value).toBe(true);
    expect(r.vueSidebarMounted.reason).toBeNull();
  });

  it('viewerUid 空：viewerInfoHookActive.value=false、reason=frontend_hook_broken', () => {
    const r = extensionHealthV1({ ...HEALTHY_INPUT, viewerUid: '' });
    expect(r.viewerInfoHookActive.value).toBe(false);
    expect(r.viewerInfoHookActive.reason).toBe('frontend_hook_broken');
  });

  it('interceptAvatarSize=0：avatarHookActive.value=false、reason=frontend_hook_broken', () => {
    const r = extensionHealthV1({ ...HEALTHY_INPUT, interceptAvatarSize: 0 });
    expect(r.avatarHookActive.value).toBe(false);
    expect(r.avatarHookActive.reason).toBe('frontend_hook_broken');
  });

  it('interceptNicknameSize=0：nicknameHookActive.value=false、reason=frontend_hook_broken', () => {
    const r = extensionHealthV1({ ...HEALTHY_INPUT, interceptNicknameSize: 0 });
    expect(r.nicknameHookActive.value).toBe(false);
    expect(r.nicknameHookActive.reason).toBe('frontend_hook_broken');
  });

  it('NDGR 全 0：ndgrIngestionActive.value=false、reason=no_field', () => {
    const r = extensionHealthV1({ ...HEALTHY_INPUT, ndgrChats: 0, ndgrStats: 0 });
    expect(r.ndgrIngestionActive.value).toBe(false);
    expect(r.ndgrIngestionActive.reason).toBe('no_field');
  });

  it('autoOpenStatus が opened-but-no-banner：vueSidebarMounted.value=false、reason=vue_mount_incomplete', () => {
    const r = extensionHealthV1({
      ...HEALTHY_INPUT,
      autoOpenStatus: 'opened-but-no-banner'
    });
    expect(r.vueSidebarMounted.value).toBe(false);
    expect(r.vueSidebarMounted.reason).toBe('vue_mount_incomplete');
  });

  it('source field は固定値（page_intercept / ndgr / dom_observer）', () => {
    const r = extensionHealthV1(HEALTHY_INPUT);
    expect(r.viewerInfoHookActive.source).toBe('page_intercept');
    expect(r.avatarHookActive.source).toBe('page_intercept');
    expect(r.nicknameHookActive.source).toBe('page_intercept');
    expect(r.ndgrIngestionActive.source).toBe('ndgr');
    expect(r.vueSidebarMounted.source).toBe('dom_observer');
  });

  it('実データ再現：lv350445498 のような全滅状態', () => {
    // 2026-05-06 実データに対応
    const r = extensionHealthV1({
      viewerUid: '',
      broadcasterUid: '2162499',
      interceptAvatarSize: 3,
      interceptNicknameSize: 56,
      interceptedUsersTotal: 84,
      ndgrChats: 84,
      ndgrStats: 59,
      autoOpenStatus: 'opened-but-no-banner'
    });
    // viewerUid 空 → frontend_hook_broken
    expect(r.viewerInfoHookActive.reason).toBe('frontend_hook_broken');
    // avatar 3 件あるので true（threshold は >0）
    expect(r.avatarHookActive.value).toBe(true);
    // NDGR は生きてる
    expect(r.ndgrIngestionActive.value).toBe(true);
    // Vue mount 不全
    expect(r.vueSidebarMounted.reason).toBe('vue_mount_incomplete');
  });

  it('入力が部分的に欠けても落ちない（防御）', () => {
    // @ts-expect-error 部分的 input
    const r = extensionHealthV1({});
    // すべて falsy 系の reason に倒れる
    expect(r.viewerInfoHookActive.value).toBe(false);
    expect(r.avatarHookActive.value).toBe(false);
    expect(r.nicknameHookActive.value).toBe(false);
    expect(r.ndgrIngestionActive.value).toBe(false);
    expect(r.vueSidebarMounted.value).toBe(false);
  });

  it('ageMs は数値（実装仕様：現状 0 固定）', () => {
    const r = extensionHealthV1(HEALTHY_INPUT);
    expect(typeof r.viewerInfoHookActive.ageMs).toBe('number');
    expect(typeof r.avatarHookActive.ageMs).toBe('number');
  });
});
