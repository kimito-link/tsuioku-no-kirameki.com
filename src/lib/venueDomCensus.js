// @ts-nocheck — DOM 要素を引数で受けて数えるだけの計器(chrome 非依存・happy-dom でテスト可能)
/**
 * venueDomCensus.js — 会場5段の【実DOM国勢調査(census)】。
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
 *   - 5段(link/gift/ad/konta/tanu)の実タイル(.nl-story-userlane-cell)数(セクション別)
 *   - 幽霊(ghost): .nlsb-seat.nlsb-is-empty なのに中身がある席(display:none の消し残り予備軍)
 *   - 裸(bare): .nlsb-seat 管理外でセクション直下に居るタイル(リセットループの対象外=消し残り容疑)
 *   - 空可視(visibleEmpty): 席は可視なのにタイルが無い(白円空白の再演検出=venue-thumb 同型)
 *   - 無鍵(unkeyed): dataset.userKey が無い/空の可視タイル(重複判定の対象外・期待値0)
 *   - keys: 可視タイルの userKey 列(重複/迷子判定の材料。storage へは出さない=PII/容量)
 *   - 白円(blank): 可視タイルの avatar img が blank.jpg(usericon/defaults)を表示中(v0.1.1116)。
 *     blankAnon = そのうち数値ID(u:数字)でない鍵のタイル=匿名/合成鍵は identicon になるべき
 *     なのに白円=導出バグの証拠(数値IDの白円は①も同じ404 tv-fallback=パリティ上「正」)。
 *   - 迷子(strays): stack 配下だが5段のどれにも属さないタイル
 *   - 額縁(charFrameTiles)・群衆Canvas(crowdOn/crowdCount): 「顔が多く見える」容疑者の参考値
 *   - avatarProbe: 会場の顔プローブ実績(supportGrowthAvatarLoad.getDiagnostics)を extras で受けて
 *     写すだけ(usericonSucceeded/usericonFailed/failedTimeout/failedError/retriedTotal/
 *     lastFailAgoMs)。census は計測しない=露出のみ。venue-avatar-stale-mirror-DESIGN.md §D:
 *     白丸(blank)が「一度の一時失敗が永久固着している」現象かどうかを、種別(timeout/error)と
 *     最終失敗からの経過時間で切り分けるための追加フィールド。
 * 【測らないもの】(スコープ固定テストで担保)
 *   - topBar(応援者トップ)・roster・吹き出し・常駐3キャラ(residents)=段の外
 *   - 透明オーバーレイ越しに透ける背景ページ(拡張のDOM外)・Canvas のピクセル内容
 *
 * @module venueDomCensus
 */

/** census が数えるセクション(5段)。 */
export const VENUE_CENSUS_SECTIONS = Object.freeze(['link', 'gift', 'ad', 'konta', 'tanu']);

const TILE_SELECTOR = '.nl-story-userlane-cell';
const SEAT_SELECTOR = '.nlsb-seat';
const SEAT_EMPTY_CLASS = 'nlsb-is-empty';
const LANE_SELECTOR = '.nl-story-userlane';
const AVATAR_IMG_SELECTOR = 'img.nl-story-userlane-avatar';
/** 白円=ニコニコ公式の空アイコン(blank.jpg)。supportGrowthTileSrc.js:19 の defaults パスが正本。 */
const BLANK_AVATAR_RE = /\/usericon\/defaults\//i;
/** 数値ID鍵(u:数字)。これ以外の鍵で白円=identicon になるべき人が白い=導出バグ(blankAnon)。 */
const NUMERIC_UID_KEY_RE = /^u:\d+$/;

/** @param {unknown} value */
function nonNegativeDimension(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 空のセクション計数。 */
function emptySectionCount() {
  return {
    visible: 0,
    tileW: 0,
    tileH: 0,
    ghost: 0,
    bare: 0,
    visibleEmpty: 0,
    unkeyed: 0,
    blank: 0,
    blankAnon: 0,
    keys: []
  };
}

/**
 * 1セクション(段el)の実DOMを数える(触らない)。
 * @param {Element|null|undefined} rootEl
 * @returns {{ visible:number, tileW:number, tileH:number, ghost:number, bare:number, visibleEmpty:number, unkeyed:number, keys:string[] }}
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
    if (out.visible === 0) {
      out.tileW = nonNegativeDimension(tile.offsetWidth);
      out.tileH = nonNegativeDimension(tile.offsetHeight);
    }
    out.visible += 1;
    const key = String((tile.dataset && tile.dataset.userKey) || '').trim();
    if (key) out.keys.push(key);
    else out.unkeyed += 1;
    // 白円(v0.1.1116): avatar img が blank.jpg を表示中。src を読むだけ(getComputedStyle不使用)。
    const img = typeof tile.querySelector === 'function' ? tile.querySelector(AVATAR_IMG_SELECTOR) : null;
    if (img && BLANK_AVATAR_RE.test(String(img.src || img.getAttribute?.('src') || ''))) {
      out.blank += 1;
      if (!NUMERIC_UID_KEY_RE.test(key)) out.blankAnon += 1;
    }
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
 * 会場5段の実DOM census を収集する(数えるだけ・1ノードも触らない)。
 * @param {{
 *   laneEls?: Partial<Record<'link'|'gift'|'ad'|'konta'|'tanu', Element|null>>,
 *   stackEl?: Element|null,
 *   extras?: { charFrameLayer?: Element|null, crowdOn?: boolean, crowdCount?: number,
 *              avatarProbe?: { usericonSucceeded?: number, usericonFailed?: number }|null }
 * }} input
 * @returns {{
 *   perSection: Record<'link'|'gift'|'ad'|'konta'|'tanu', { visible:number, tileW:number, tileH:number, ghost:number, bare:number, visibleEmpty:number, unkeyed:number, blank:number, blankAnon:number, keys:string[] }>,
 *   dpr: number,
 *   strays: number,
 *   charFrameTiles: number,
 *   crowdOn: boolean,
 *   crowdCount: number,
 *   avatarProbe: { usericonSucceeded: number, usericonFailed: number, failedTimeout: number, failedError: number, retriedTotal: number, lastFailAgoMs: number|null }|null
 * }}
 */
export function collectVenueLaneDomCensus(input) {
  const inp = input && typeof input === 'object' ? input : {};
  const laneEls = inp.laneEls && typeof inp.laneEls === 'object' ? inp.laneEls : {};
  /** @type {Record<string, ReturnType<typeof emptySectionCount>>} */
  const perSection = {};
  for (const sec of VENUE_CENSUS_SECTIONS) {
    perSection[sec] = countSection(laneEls[sec]);
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
  const probeIn = extras.avatarProbe && typeof extras.avatarProbe === 'object' ? extras.avatarProbe : null;
  const rawDpr = typeof window !== 'undefined' ? Number(window.devicePixelRatio) : 1;
  return {
    perSection: /** @type {any} */ (perSection),
    dpr: Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1,
    strays,
    charFrameTiles,
    crowdOn: extras.crowdOn === true,
    crowdCount: Math.max(0, Math.floor(Number(extras.crowdCount) || 0)),
    avatarProbe: probeIn
      ? {
          usericonSucceeded: Math.max(0, Math.floor(Number(probeIn.usericonSucceeded) || 0)),
          usericonFailed: Math.max(0, Math.floor(Number(probeIn.usericonFailed) || 0)),
          failedTimeout: Math.max(0, Math.floor(Number(probeIn.failedTimeout) || 0)),
          failedError: Math.max(0, Math.floor(Number(probeIn.failedError) || 0)),
          retriedTotal: Math.max(0, Math.floor(Number(probeIn.retriedTotal) || 0)),
          lastFailAgoMs:
            Number.isFinite(Number(probeIn.lastFailAgoMs)) && Number(probeIn.lastFailAgoMs) >= 0
              ? Math.floor(Number(probeIn.lastFailAgoMs))
              : null
        }
      : null
  };
}

/**
 * census の keys 列からキー重複を集計する(純関数)。
 *   - dupIntra: 同一セクション内で同じ key が2回以上(席index churn の二重占有)。超過数の総和。
 *   - dupCross: 段×段の横断重複(同じ人が2段に居る)。余分な段在籍数の総和。
 * @param {Record<string, { keys?: string[] }>} perSection collectVenueLaneDomCensus().perSection
 * @returns {{ dupIntra:number, dupCross:number }}
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
  for (const secs of sectionsByKey.values()) {
    const laneCount = secs.size;
    if (laneCount > 1) dupCross += laneCount - 1;
  }
  return { dupIntra, dupCross };
}

/**
 * census → buildVenueLaneParity の dom 入力(要約)。keys 列を落とし(PII/容量)、重複を集計して畳む。
 *   measured=true を明示する=判定側は「この要約が無い/ measured でない」を DOM未計測(⚪)として扱う
 *   (fail-closed: DOMを測れなかったとき✅を名乗れない)。
 * @param {ReturnType<typeof collectVenueLaneDomCensus>|null|undefined} census
 * @returns {null | {
 *   measured: true,
 *   perSection: Record<string, { visible:number, tileW:number, tileH:number, ghost:number, bare:number, visibleEmpty:number, unkeyed:number, blank:number, blankAnon:number }>,
 *   dpr:number,
 *   ghost:number, bare:number, visibleEmpty:number, unkeyed:number,
 *   blank:number, blankAnon:number,
 *   dupIntra:number, dupCross:number,
 *   strays:number, charFrame:number, crowdOn:boolean, crowdCount:number,
 *   probeOk:number, probeFail:number,
 *   probeFailTimeout:number, probeFailError:number, probeRetried:number, probeLastFailAgoSec:number|null
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
  let blank = 0;
  let blankAnon = 0;
  for (const sec of VENUE_CENSUS_SECTIONS) {
    const c = census.perSection[sec] || emptySectionCount();
    perSection[sec] = {
      visible: Math.max(0, Math.floor(Number(c.visible) || 0)),
      tileW: nonNegativeDimension(c.tileW),
      tileH: nonNegativeDimension(c.tileH),
      ghost: Math.max(0, Math.floor(Number(c.ghost) || 0)),
      bare: Math.max(0, Math.floor(Number(c.bare) || 0)),
      visibleEmpty: Math.max(0, Math.floor(Number(c.visibleEmpty) || 0)),
      unkeyed: Math.max(0, Math.floor(Number(c.unkeyed) || 0)),
      blank: Math.max(0, Math.floor(Number(c.blank) || 0)),
      blankAnon: Math.max(0, Math.floor(Number(c.blankAnon) || 0))
    };
    ghost += perSection[sec].ghost;
    bare += perSection[sec].bare;
    visibleEmpty += perSection[sec].visibleEmpty;
    unkeyed += perSection[sec].unkeyed;
    blank += perSection[sec].blank;
    blankAnon += perSection[sec].blankAnon;
  }
  return {
    measured: true,
    perSection,
    dpr: Number.isFinite(Number(census.dpr)) && Number(census.dpr) > 0 ? Number(census.dpr) : 1,
    ghost,
    bare,
    visibleEmpty,
    unkeyed,
    blank,
    blankAnon,
    dupIntra: dup.dupIntra,
    dupCross: dup.dupCross,
    strays: Math.max(0, Math.floor(Number(census.strays) || 0)),
    charFrame: Math.max(0, Math.floor(Number(census.charFrameTiles) || 0)),
    crowdOn: census.crowdOn === true,
    crowdCount: Math.max(0, Math.floor(Number(census.crowdCount) || 0)),
    probeOk: Math.max(0, Math.floor(Number(census.avatarProbe?.usericonSucceeded) || 0)),
    probeFail: Math.max(0, Math.floor(Number(census.avatarProbe?.usericonFailed) || 0)),
    probeFailTimeout: Math.max(0, Math.floor(Number(census.avatarProbe?.failedTimeout) || 0)),
    probeFailError: Math.max(0, Math.floor(Number(census.avatarProbe?.failedError) || 0)),
    probeRetried: Math.max(0, Math.floor(Number(census.avatarProbe?.retriedTotal) || 0)),
    probeLastFailAgoSec:
      Number.isFinite(Number(census.avatarProbe?.lastFailAgoMs)) &&
      Number(census.avatarProbe?.lastFailAgoMs) >= 0
        ? Math.floor(Number(census.avatarProbe.lastFailAgoMs) / 1000)
        : null
  };
}
