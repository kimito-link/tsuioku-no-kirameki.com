// deepHarvestReason.js — 深掘り収穫(deep harvest)の発動理由(起動/記録ON/配信切替/タブ可視)の定義と判定。
export const DEEP_HARVEST_REASONS = /** @type {const} */ ({
  startup: 'startup',
  recordingOn: 'recording-on',
  liveIdChange: 'live-id-change',
  tabVisible: 'tab-visible'
});

/**
 * @param {unknown} reason
 * @returns {reason is (typeof DEEP_HARVEST_REASONS)[keyof typeof DEEP_HARVEST_REASONS]}
 */
export function isKnownDeepHarvestReason(reason) {
  const s = String(reason || '').trim();
  return Object.values(DEEP_HARVEST_REASONS).includes(
    /** @type {(typeof DEEP_HARVEST_REASONS)[keyof typeof DEEP_HARVEST_REASONS]} */ (s)
  );
}
