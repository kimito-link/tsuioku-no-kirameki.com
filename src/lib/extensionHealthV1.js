/**
 * 拡張の健全性を可視化する純関数（v0.1.197 で追加）。
 *
 * 2026-05-06 実データで観測された「viewerUid 空 / avatar 全滅 / autoOpen Vue 不全」の
 * 4 兆候を、AI 共有診断に「reason 付き source/value」の形で出すための先行実装。
 *
 * 出力は v0.1.184 の officialValuesV2 と同形式（{ value, source, ageMs, reason }）で、
 * v0.2 では plan_unified_situation_snapshot_v2.md の `observation.interceptHookHealth`
 * フィールドに統合される予定。
 *
 * 全フィールド純関数。副作用なし。
 */

/**
 * @typedef {{ value: unknown, source: string, ageMs: number, reason: string|null }} HealthValue
 */

/**
 * @typedef {{
 *   viewerUid?: string,
 *   broadcasterUid?: string,
 *   interceptAvatarSize?: number,
 *   interceptNicknameSize?: number,
 *   interceptedUsersTotal?: number,
 *   ndgrChats?: number,
 *   ndgrStats?: number,
 *   autoOpenStatus?: string
 * }} ExtensionHealthInput
 */

/**
 * @typedef {{
 *   viewerInfoHookActive: HealthValue,
 *   avatarHookActive: HealthValue,
 *   nicknameHookActive: HealthValue,
 *   ndgrIngestionActive: HealthValue,
 *   vueSidebarMounted: HealthValue
 * }} ExtensionHealthV1Output
 */

/**
 * 拡張の各取得経路（page-intercept / NDGR / DOM observer）が機能しているかを判定。
 *
 * @param {ExtensionHealthInput} input
 * @returns {ExtensionHealthV1Output}
 */
export function extensionHealthV1(input) {
  const i = input || {};
  const viewerUid = String(i.viewerUid || '').trim();
  const interceptAvatarSize = Number(i.interceptAvatarSize) || 0;
  const interceptNicknameSize = Number(i.interceptNicknameSize) || 0;
  const ndgrChats = Number(i.ndgrChats) || 0;
  const ndgrStats = Number(i.ndgrStats) || 0;
  const autoOpenStatus = String(i.autoOpenStatus || '').trim();

  const ageMs = 0;

  /** @type {HealthValue} */
  const viewerInfoHookActive = viewerUid
    ? { value: true, source: 'page_intercept', ageMs, reason: null }
    : { value: false, source: 'page_intercept', ageMs, reason: 'frontend_hook_broken' };

  /** @type {HealthValue} */
  const avatarHookActive = interceptAvatarSize > 0
    ? { value: true, source: 'page_intercept', ageMs, reason: null }
    : { value: false, source: 'page_intercept', ageMs, reason: 'frontend_hook_broken' };

  /** @type {HealthValue} */
  const nicknameHookActive = interceptNicknameSize > 0
    ? { value: true, source: 'page_intercept', ageMs, reason: null }
    : { value: false, source: 'page_intercept', ageMs, reason: 'frontend_hook_broken' };

  /** @type {HealthValue} */
  const ndgrIngestionActive = ndgrChats > 0 || ndgrStats > 0
    ? { value: true, source: 'ndgr', ageMs, reason: null }
    : { value: false, source: 'ndgr', ageMs, reason: 'no_field' };

  /** @type {HealthValue} */
  const vueSidebarMounted = autoOpenStatus === 'opened-with-banner'
    ? { value: true, source: 'dom_observer', ageMs, reason: null }
    : { value: false, source: 'dom_observer', ageMs, reason: 'vue_mount_incomplete' };

  return {
    viewerInfoHookActive,
    avatarHookActive,
    nicknameHookActive,
    ndgrIngestionActive,
    vueSidebarMounted
  };
}
