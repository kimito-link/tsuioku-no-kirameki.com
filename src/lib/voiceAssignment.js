const DEFAULT_VOICE = Object.freeze({
  styleId: 3,
  pitchOffset: 0,
  speedOffset: 0
});

const PITCH_OFFSETS = Object.freeze([-0.06, -0.03, 0, 0.03, 0.06]);
const SPEED_OFFSETS = Object.freeze([0, 0.05, 0.1]);

/**
 * UTF-8 bytes over FNV-1a 32-bit.
 * @param {unknown} value
 * @returns {number}
 */
function fnv1a32(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * @param {unknown} styleIds
 * @returns {number[]}
 */
function normalizeStyleIds(styleIds) {
  if (!Array.isArray(styleIds)) return [];
  return styleIds
    .map((styleId) => Number(styleId))
    .filter((styleId) => Number.isInteger(styleId) && styleId >= 0);
}

/**
 * userKey から端末を跨いで安定する声パラメータを導出する。
 * @param {unknown} userKey
 * @param {unknown} styleIds
 * @returns {{ styleId: number, pitchOffset: number, speedOffset: number }}
 */
export function assignVoiceForUser(userKey, styleIds) {
  const styles = normalizeStyleIds(styleIds);
  if (!styles.length) return { ...DEFAULT_VOICE };

  const hash = fnv1a32(userKey);
  const styleBits = hash & 0xffff;
  const pitchBits = (hash >>> 16) & 0xff;
  const speedBits = (hash >>> 24) & 0xff;

  return {
    styleId: styles[styleBits % styles.length],
    pitchOffset: PITCH_OFFSETS[pitchBits % PITCH_OFFSETS.length],
    speedOffset: SPEED_OFFSETS[speedBits % SPEED_OFFSETS.length]
  };
}

/**
 * 保存済みの手動上書きを優先し、無ければ決定論割り当てを返す。
 * @param {unknown} userKey
 * @param {unknown} overrides
 * @param {unknown} styleIds
 * @returns {{ styleId: number, pitchOffset: number, speedOffset: number }}
 */
export function resolveVoiceForUser(userKey, overrides, styleIds) {
  const key = String(userKey ?? '');
  if (
    overrides &&
    typeof overrides === 'object' &&
    Object.prototype.hasOwnProperty.call(overrides, key)
  ) {
    const raw = /** @type {Record<string, any>} */ (overrides)[key];
    if (raw && typeof raw === 'object') {
      const fallback = assignVoiceForUser(key, styleIds);
      const styleId = Number(raw.styleId);
      const pitchOffset = Number(raw.pitchOffset);
      const speedOffset = Number(raw.speedOffset);
      return {
        styleId: Number.isFinite(styleId) ? styleId : fallback.styleId,
        pitchOffset: Number.isFinite(pitchOffset) ? pitchOffset : 0,
        speedOffset: Number.isFinite(speedOffset) ? speedOffset : 0
      };
    }
  }
  return assignVoiceForUser(key, styleIds);
}
