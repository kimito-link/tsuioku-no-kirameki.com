/** @typedef {'rinku'|'konta'|'mixed'} CelebrationCharacterSet */

export const CHARA_IMG_BASE = 'images/yukkuri-charactore-english';

export const RINKU_IMGS = Object.freeze({
  default: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
  small: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-closed.png`,
  medium: `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.png`,
  big: `${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-open.png`
});

export const KONTA_IMGS = Object.freeze({
  default: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
  small: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-closed.png`,
  medium: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.png`,
  big: `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-open.png`
});

export const TANUNEE_IMGS = Object.freeze({
  default: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
  small: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.png`,
  medium: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.png`,
  big: `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-open.png`
});

/** 豪雨演出用 — 三キャラ × thumb128 */
export const DELUGE_CHAR_POOLS = Object.freeze([
  [
    `${CHARA_IMG_BASE}/link/link-yukkuri-smile-mouth-open.thumb128.png`,
    `${CHARA_IMG_BASE}/link/link-yukkuri-normal-mouth-closed.thumb128.png`,
    `${CHARA_IMG_BASE}/link/link-yukkuri-blink-mouth-closed.thumb128.png`,
    `${CHARA_IMG_BASE}/link/link-yukkuri-half-eyes-mouth-closed.thumb128.png`
  ],
  [
    `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-smile-mouth-open.thumb128.png`,
    `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-normal.thumb128.png`,
    `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-blink-mouth-closed.thumb128.png`,
    `${CHARA_IMG_BASE}/konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png`
  ],
  [
    `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-smile-mouth-open.thumb128.png`,
    `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png`,
    `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-blink-mouth-closed.thumb128.png`,
    `${CHARA_IMG_BASE}/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png`
  ]
]);

/**
 * @param {CelebrationCharacterSet} characterSet
 * @returns {string[]}
 */
export function supportCelebrationImagePool(characterSet) {
  if (characterSet === 'konta') {
    return [KONTA_IMGS.default, KONTA_IMGS.medium, KONTA_IMGS.big];
  }
  if (characterSet === 'mixed') {
    return [
      RINKU_IMGS.default,
      KONTA_IMGS.default,
      TANUNEE_IMGS.default,
      RINKU_IMGS.medium,
      KONTA_IMGS.medium,
      TANUNEE_IMGS.medium,
      RINKU_IMGS.big,
      KONTA_IMGS.big,
      TANUNEE_IMGS.big
    ];
  }
  return [RINKU_IMGS.default, RINKU_IMGS.medium, RINKU_IMGS.big, RINKU_IMGS.small];
}

/**
 * @param {number} index
 * @returns {string}
 */
export function delugeDropImageSrc(index) {
  const charIdx = index % 3;
  const pool = DELUGE_CHAR_POOLS[charIdx];
  return pool[Math.floor(index / 3) % pool.length];
}

/**
 * @param {number} index
 * @param {CelebrationCharacterSet} characterSet
 * @returns {string}
 */
export function celebrationDropImageSrc(index, characterSet) {
  if (characterSet === 'mixed') return delugeDropImageSrc(index);
  const pool = supportCelebrationImagePool(characterSet);
  return pool[index % pool.length];
}

/**
 * @param {import('./giftBahamutCelebration.js').GiftBahamutTier} tier
 * @returns {[string, string, string]}
 */
export function giftBahamutSquadImageSrcs(tier) {
  const lead = tier === 'mega' || tier === 'large' ? KONTA_IMGS.big : KONTA_IMGS.medium;
  const body =
    tier === 'mega'
      ? RINKU_IMGS.big
      : tier === 'large'
        ? RINKU_IMGS.medium
        : RINKU_IMGS.default;
  const tail = tier === 'mega' || tier === 'large' ? TANUNEE_IMGS.big : TANUNEE_IMGS.default;
  return [lead, body, tail];
}
