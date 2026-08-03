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
const TILE_SELECTOR = '.nl-story-userlane-cell';
// ★会場モードは wrapTileEl でタイルを席(.nlsb-seat)に包む=タイルは段の【直下にない】。
//   走査規則は会場側の正本 venueDomCensus.js と一字一句そろえること(下記 v0.1.1241 参照)。
const SEAT_SELECTOR = '.nlsb-seat';
const SEAT_EMPTY_CLASS = 'nlsb-is-empty';

/** @param {unknown} value */
function nonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 段の可視タイルを、会場側(venueDomCensus.countSection)と同一規則で列挙する。
 *
 * ★v0.1.1241 実配信 lv351085849 で `未説明1(link:幾何差(対象不明))` を出した真因の修正。
 *   旧実装は lane.children(直下のみ)を見ていた。①POP はタイルが段の直下に来るので通ったが、
 *   会場は席に包むため同じ DOM で visible=0・tileKey='' になり、venueGeometryVerdict が
 *   unknown_target(=対象不明)に落ちていた。会場側は querySelectorAll で子孫を走査していたので
 *   値が取れ、「①だけ空」という非対称が「幾何差なのに原因を名指しできない」を生んでいた。
 *   走査規則を会場に合わせることで、両側が【同じ人】を測る。
 *
 * @param {Element} lane
 * @returns {Element[]}
 */
function visibleTilesOf(lane) {
  const all = typeof lane.querySelectorAll === 'function'
    ? Array.from(lane.querySelectorAll(TILE_SELECTOR))
    : Array.from(lane.children || []).filter((c) => c?.classList?.contains(TILE_CLASS));
  const out = [];
  for (const tile of all) {
    if (tile.hidden === true) continue;
    // 空席の中身は会場側が可視から除外する(幽霊)。①も同じく除外しないと先頭が別人になる。
    const seat = typeof tile.closest === 'function' ? tile.closest(SEAT_SELECTOR) : null;
    const inSeat = !!(seat && lane.contains(seat));
    if (inSeat && seat.classList.contains(SEAT_EMPTY_CLASS)) continue;
    out.push(tile);
  }
  return out;
}

/** @param {Element|null|undefined} lane */
function measureLane(lane) {
  if (!lane || lane.hidden === true) return { visible: 0, tileW: 0, tileH: 0, tileKey: '' };
  const tiles = visibleTilesOf(lane);
  const firstTile = tiles[0] || null;
  return {
    visible: tiles.length,
    tileW: firstTile ? nonNegativeNumber(firstTile.offsetWidth) : 0,
    tileH: firstTile ? nonNegativeNumber(firstTile.offsetHeight) : 0,
    // v0.1.1212: 「誰を測ったか」。①と会場で先頭タイルの人が違えば、CSSが完全一致でも
    //   名前の長さが違うぶんタイル幅が変わる(metaはmax-width上限までの収縮ボックス)。
    //   これが無いと「幾何≠」がCSS不整合なのか測定対象ズレなのか永久に区別できない。
    tileKey: firstTile ? String(firstTile.dataset?.userKey || '').trim() : ''
  };
}

/**
 * ①POP が paint した5段の実DOM指紋を同期採取する。DOMは一切変更しない。
 * @param {{ laneLink?: Element|null, laneGift?: Element|null, laneAd?: Element|null,
 *   laneKonta?: Element|null, laneTanu?: Element|null }|null|undefined} els
 * @returns {{ measured: boolean,
 *   perTier: Record<string,{visible:number,tileW:number,tileH:number,tileKey:string}>,
 *   dpr: number }}
 */
export function measureLaneDomSelf(els) {
  const source = els && typeof els === 'object' ? els : {};
  /** @type {Record<string, {visible:number,tileW:number,tileH:number,tileKey:string}>} */
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
