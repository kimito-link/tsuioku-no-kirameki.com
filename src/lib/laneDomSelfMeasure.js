// @ts-nocheck -- DOM elements are supplied by the caller; this module only reads geometry.

const TIERS = /** @type {const} */ (['link', 'gift', 'ad', 'konta', 'tanu']);
const LANE_KEYS = {
  link: 'laneLink',
  gift: 'laneGift',
  ad: 'laneAd',
  konta: 'laneKonta',
  tanu: 'laneTanu'
};
const TILE_CLASS = 'nl-story-userlane-cell';

/** @param {unknown} value */
function nonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** @param {Element|null|undefined} lane */
function measureLane(lane) {
  if (!lane || lane.hidden === true) return { visible: 0, tileW: 0, tileH: 0 };
  const children = Array.from(lane.children || []);
  const tiles = children.filter(
    (child) => child?.classList?.contains(TILE_CLASS) && child.hidden !== true
  );
  const firstTile = lane.firstElementChild?.classList?.contains(TILE_CLASS)
    ? lane.firstElementChild
    : tiles[0] || null;
  return {
    visible: tiles.length,
    tileW: firstTile ? nonNegativeNumber(firstTile.offsetWidth) : 0,
    tileH: firstTile ? nonNegativeNumber(firstTile.offsetHeight) : 0
  };
}

/**
 * ①POP が paint した5段の実DOM指紋を同期採取する。DOMは一切変更しない。
 * @param {{ laneLink?: Element|null, laneGift?: Element|null, laneAd?: Element|null,
 *   laneKonta?: Element|null, laneTanu?: Element|null }|null|undefined} els
 * @returns {{ measured: boolean, perTier: Record<string,{visible:number,tileW:number,tileH:number}>, dpr: number }}
 */
export function measureLaneDomSelf(els) {
  const source = els && typeof els === 'object' ? els : {};
  /** @type {Record<string, {visible:number,tileW:number,tileH:number}>} */
  const perTier = {};
  let measured = false;
  for (const tier of TIERS) {
    const lane = source[LANE_KEYS[tier]] || null;
    if (lane) measured = true;
    perTier[tier] = measureLane(lane);
  }
  const rawDpr = typeof window !== 'undefined' ? Number(window.devicePixelRatio) : 1;
  return {
    measured,
    perTier,
    dpr: Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1
  };
}
