// @ts-nocheck — DOM 要素を引数で受けて数えるだけの計器(chrome 非依存・happy-dom でテスト可能)
/**
 * venueDomCensus.js — 会場5段+ロビーの【実DOM国勢調査(census)】。
 *
 * 背景(memory/reference_diag_truth_SYNTHESIS.md・2026-07-10): 「会場一致✅なのに実画面のたぬ姉が
 *   明らかに多い」実事例の確定原因=従来計器はデータ同士の突合で実DOMを一度も数えていなかった。
 *   本モジュールは renderSeats の同期末尾(席装飾ループの後=この paint の最終形)で「いま画面に
 *   見えているもの」を数え、✅の根拠をデータからDOMへ移す(Tri-Parity の第3面)。
 *
 * ★掟(storyUserLaneRenderProbe.js:16 と同じ): 【数えるだけ・1ノードも触らない】。
 *   可視判定は class の有無のみ(`.nlsb-seat.nlsb-is-empty` が display:none の正本=venueBar.css)。
 *   getComputedStyle は1回も呼ばない(500席×3秒でも hot path を汚さない)。
 *
 * 【測るもの】
 *   - 5段(link/gift/ad/konta/tanu)+ロビーの実タイル(.nl-story-userlane-cell)数(セクション別)
 *   - 幽霊(ghost): .nlsb-seat.nlsb-is-empty なのに中身がある席(display:none の消し残り予備軍)
 *   - 裸(bare): .nlsb-seat 管理外でセクション直下に居るタイル(リセットループの対象外=消し残り容疑)
 *   - 空可視(visibleEmpty): 席は可視なのにタイルが無い(白円空白の再演検出=venue-thumb 同型)
 *   - 無鍵(unkeyed): dataset.userKey が無い/空の可視タイル(重複判定の対象外・期待値0)
 *   - keys: 可視タイルの userKey 列(重複/迷子判定の材料。storage へは出さない=PII/容量)
 *   - 迷子(strays): stack 配下だが5段のどれにも属さないタイル
 *   - 額縁(charFrameTiles)・群衆Canvas(crowdOn/crowdCount): 「顔が多く見える」容疑者の参考値
 * 【測らないもの】(スコープ固定テストで担保)
 *   - topBar(応援者トップ)・roster・吹き出し・常駐3キャラ(residents)=段/ロビーの外
 *   - 透明オーバーレイ越しに透ける背景ページ(拡張のDOM外)・Canvas のピクセル内容
 *
 * @module venueDomCensus
 */

/** census が数えるセクション(5段+ロビー)。 */
export const VENUE_CENSUS_SECTIONS = Object.freeze(['link', 'gift', 'ad', 'konta', 'tanu', 'lobby']);

const TILE_SELECTOR = '.nl-story-userlane-cell';
const SEAT_SELECTOR = '.nlsb-seat';
const SEAT_EMPTY_CLASS = 'nlsb-is-empty';
const LANE_SELECTOR = '.nl-story-userlane';

/** 空のセクション計数。 */
function emptySectionCount() {
  return { visible: 0, ghost: 0, bare: 0, visibleEmpty: 0, unkeyed: 0, keys: [] };
}

/**
 * 1セクション(段el または lobbyList)の実DOMを数える(触らない)。
 * @param {Element|null|undefined} rootEl
 * @returns {{ visible:number, ghost:number, bare:number, visibleEmpty:number, unkeyed:number, keys:string[] }}
 */
function countSection(rootEl) {
  const out = emptySectionCount();
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return out;
  // タイル走査: 席(.nlsb-seat)内か裸(管理外)かで分類。可視= 席が is-empty でない or 裸。
  for (const tile of rootEl.querySelectorAll(TILE_SELECTOR)) {
    const seat = typeof tile.closest === 'function' ? tile.closest(SEAT_SELECTOR) : null;
    const inSeat = !!(seat && rootEl.contains(seat));
    if (inSeat && seat.classList.contains(SEAT_EMPTY_CLASS)) continue; // 幽霊の中身(下で席単位に数える)
    if (!inSeat) out.bare += 1; // .nlsb-seat 管理外の素通し=リセットループが消せない
    out.visible += 1;
    const key = String((tile.dataset && tile.dataset.userKey) || '').trim();
    if (key) out.keys.push(key);
    else out.unkeyed += 1;
  }
  // 席単位の異常: 幽霊(不可視なのに中身あり)・空可視(可視なのにタイル無し)。
  for (const seat of rootEl.querySelectorAll(SEAT_SELECTOR)) {
    if (seat.classList.contains(SEAT_EMPTY_CLASS)) {
      if (seat.childElementCount > 0) out.ghost += 1;
    } else if (!seat.querySelector(TILE_SELECTOR)) {
      out.visibleEmpty += 1;
    }
  }
  return out;
}

/**
 * 会場5段+ロビーの実DOM census を収集する(数えるだけ・1ノードも触らない)。
 * @param {{
 *   laneEls?: Partial<Record<'link'|'gift'|'ad'|'konta'|'tanu', Element|null>>,
 *   lobbyList?: Element|null,
 *   stackEl?: Element|null,
 *   extras?: { charFrameLayer?: Element|null, crowdOn?: boolean, crowdCount?: number }
 * }} input
 * @returns {{
 *   perSection: Record<'link'|'gift'|'ad'|'konta'|'tanu'|'lobby', { visible:number, ghost:number, bare:number, visibleEmpty:number, unkeyed:number, keys:string[] }>,
 *   strays: number,
 *   charFrameTiles: number,
 *   crowdOn: boolean,
 *   crowdCount: number
 * }}
 */
export function collectVenueLaneDomCensus(input) {
  const inp = input && typeof input === 'object' ? input : {};
  const laneEls = inp.laneEls && typeof inp.laneEls === 'object' ? inp.laneEls : {};
  /** @type {Record<string, ReturnType<typeof emptySectionCount>>} */
  const perSection = {};
  for (const sec of VENUE_CENSUS_SECTIONS) {
    perSection[sec] = countSection(sec === 'lobby' ? inp.lobbyList : laneEls[sec]);
  }
  // 迷子: stack 配下だが5段(.nl-story-userlane)のどれにも属さないタイル(居場所の無い消し残り)。
  let strays = 0;
  const stackEl = inp.stackEl;
  if (stackEl && typeof stackEl.querySelectorAll === 'function') {
    for (const tile of stackEl.querySelectorAll(TILE_SELECTOR)) {
      if (typeof tile.closest !== 'function' || !tile.closest(LANE_SELECTOR)) strays += 1;
    }
  }
  const extras = inp.extras && typeof inp.extras === 'object' ? inp.extras : {};
  const charFrameLayer = extras.charFrameLayer;
  const charFrameTiles =
    charFrameLayer && Number.isFinite(Number(charFrameLayer.childElementCount))
      ? Math.max(0, Number(charFrameLayer.childElementCount))
      : 0;
  return {
    perSection: /** @type {any} */ (perSection),
    strays,
    charFrameTiles,
    crowdOn: extras.crowdOn === true,
    crowdCount: Math.max(0, Math.floor(Number(extras.crowdCount) || 0))
  };
}

/**
 * census の keys 列からキー重複を集計する(純関数)。
 *   - dupIntra: 同一セクション内で同じ key が2回以上(席index churn の二重占有)。超過数の総和。
 *   - dupCross: 段×段の横断重複(同じ人が2段に居る)。余分な段在籍数の総和。
 *   - dupLaneLobby: 段×ロビーの二重在籍(実DOM版。v2 の lobbyInMirror はデータ版=両方残す)。
 * @param {Record<string, { keys?: string[] }>} perSection collectVenueLaneDomCensus().perSection
 * @returns {{ dupIntra:number, dupCross:number, dupLaneLobby:number }}
 */
export function countVenueKeyDuplicates(perSection) {
  const ps = perSection && typeof perSection === 'object' ? perSection : {};
  let dupIntra = 0;
  /** @type {Map<string, Set<string>>} key → 出現セクション集合 */
  const sectionsByKey = new Map();
  for (const sec of VENUE_CENSUS_SECTIONS) {
    const keys = Array.isArray(ps[sec]?.keys) ? ps[sec].keys : [];
    const seen = new Set();
    for (const k of keys) {
      if (seen.has(k)) dupIntra += 1;
      seen.add(k);
      const set = sectionsByKey.get(k) || new Set();
      set.add(sec);
      sectionsByKey.set(k, set);
    }
  }
  let dupCross = 0;
  let dupLaneLobby = 0;
  for (const secs of sectionsByKey.values()) {
    const laneCount = [...secs].filter((s) => s !== 'lobby').length;
    if (laneCount > 1) dupCross += laneCount - 1;
    if (laneCount > 0 && secs.has('lobby')) dupLaneLobby += 1;
  }
  return { dupIntra, dupCross, dupLaneLobby };
}

/**
 * census → buildVenueLaneParity の dom 入力(要約)。keys 列を落とし(PII/容量)、重複を集計して畳む。
 *   measured=true を明示する=判定側は「この要約が無い/ measured でない」を DOM未計測(⚪)として扱う
 *   (fail-closed: DOMを測れなかったとき✅を名乗れない)。
 * @param {ReturnType<typeof collectVenueLaneDomCensus>|null|undefined} census
 * @returns {null | {
 *   measured: true,
 *   perSection: Record<string, { visible:number, ghost:number, bare:number, visibleEmpty:number, unkeyed:number }>,
 *   ghost:number, bare:number, visibleEmpty:number, unkeyed:number,
 *   dupIntra:number, dupCross:number, dupLaneLobby:number,
 *   strays:number, charFrame:number, crowdOn:boolean, crowdCount:number
 * }}
 */
export function venueDomCensusToParityDom(census) {
  if (!census || typeof census !== 'object' || !census.perSection) return null;
  const dup = countVenueKeyDuplicates(census.perSection);
  /** @type {Record<string, any>} */
  const perSection = {};
  let ghost = 0;
  let bare = 0;
  let visibleEmpty = 0;
  let unkeyed = 0;
  for (const sec of VENUE_CENSUS_SECTIONS) {
    const c = census.perSection[sec] || emptySectionCount();
    perSection[sec] = {
      visible: Math.max(0, Math.floor(Number(c.visible) || 0)),
      ghost: Math.max(0, Math.floor(Number(c.ghost) || 0)),
      bare: Math.max(0, Math.floor(Number(c.bare) || 0)),
      visibleEmpty: Math.max(0, Math.floor(Number(c.visibleEmpty) || 0)),
      unkeyed: Math.max(0, Math.floor(Number(c.unkeyed) || 0))
    };
    ghost += perSection[sec].ghost;
    bare += perSection[sec].bare;
    visibleEmpty += perSection[sec].visibleEmpty;
    unkeyed += perSection[sec].unkeyed;
  }
  return {
    measured: true,
    perSection,
    ghost,
    bare,
    visibleEmpty,
    unkeyed,
    dupIntra: dup.dupIntra,
    dupCross: dup.dupCross,
    dupLaneLobby: dup.dupLaneLobby,
    strays: Math.max(0, Math.floor(Number(census.strays) || 0)),
    charFrame: Math.max(0, Math.floor(Number(census.charFrameTiles) || 0)),
    crowdOn: census.crowdOn === true,
    crowdCount: Math.max(0, Math.floor(Number(census.crowdCount) || 0))
  };
}
