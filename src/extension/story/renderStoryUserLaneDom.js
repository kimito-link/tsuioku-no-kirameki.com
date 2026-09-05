// @ts-nocheck — DOM 専用; 候補行は popup 由来のゆるい形をそのまま渡す
/**
 * 応援ユーザーレーン DOM の同期（popup-entry から切り出し・状態は引数で受け取る）。
 */

import {
  buildStoryUserLaneEmptyNoteGiftHtml,
  buildStoryUserLaneEmptyNoteKontaHtml,
  buildStoryUserLaneEmptyNoteLinkHtml,
  buildStoryUserLaneEmptyNoteTanuHtml,
  buildStoryUserLaneGuideAdHtml,
  buildStoryUserLaneGuideFootAndRecordedHtml,
  buildStoryUserLaneGuideGiftHtml,
  buildStoryUserLaneGuideKontaHtml,
  buildStoryUserLaneGuideTanuHtml,
  buildStoryUserLaneGuideTopHtml
} from '../../lib/storyUserLaneGuideHtml.js';
import { buildStoryUserLaneStackAriaLabel } from '../../lib/supportVisualStoryCopy.js';
import { buildPersonTileEl } from '../../lib/personTileDom.js';
import { judgeLaneWindow } from '../../lib/laneWindowVerdict.js';
// v0.1.1113 実DOM census(Tri-Parity): タイルへ照合キーを恒久刻印するための純関数(葉lib同士=循環なし)。
import { venueLaneParityKey } from '../../lib/venueLaneParity.js';
// 2026-07-20 診断先行(①POP「クリック不能な手カーソル」実害確定): タイル実体(span)なのに
//   computed cursor が pointer になっている個体を数えるだけの計器(観測のみ・修正はしない)。
import {
  createStoryUserLaneClickAffordanceParityState,
  observeStoryUserLaneClickAffordance
} from '../../lib/storyUserLaneClickAffordanceParity.js';
// 2026-07-20 診断先行(①POP「名前ありゆっくり顔」実害確定): 会場専用だった計器を①POPにも適用
//   (観測のみ・修正はしない)。
import {
  createVenueYukkuriNamedCensusState,
  observeVenueYukkuriNamedTile
} from '../../lib/venueYukkuriNamedCensus.js';
// ★2026-08-18 中身LOD(枠は残す・中身だけ空にする): DOM要素数が業界基準の9倍(実測13,682)
//   だったことへの対処。判定・枠ビルダー・IO管理は laneContentLod.js に集約する
//   (ここは「どこで呼ぶか」だけ=ちらつき対策の鍵 storyLaneTierBodyKey には一切触れない)。
import {
  buildHollowTileEl,
  countHollowTiles,
  forgetLaneContentLod,
  isAlreadyFilled,
  observeHollowTile,
  shouldRenderHollow
} from './laneContentLod.js';

/**
 * @typedef {{
 *   stack: HTMLElement,
 *   laneLink: HTMLElement,
 *   laneGift: HTMLElement,
 *   laneKonta: HTMLElement,
 *   laneTanu: HTMLElement,
 *   hintLink: HTMLElement | null,
 *   linkWrap: HTMLElement | null,
 *   giftWrap: HTMLElement | null,
 *   guideTop: HTMLElement | null,
 *   guideLinesTop: HTMLElement | null,
 *   guideMidGift: HTMLElement | null,
 *   guideLinesMidGift: HTMLElement | null,
 *   guideMidKonta: HTMLElement | null,
 *   guideLinesMidKonta: HTMLElement | null,
 *   guideMidTanu: HTMLElement | null,
 *   guideLinesMidTanu: HTMLElement | null,
 *   guideBottom: HTMLElement | null,
 *   guideLinesBottom: HTMLElement | null
 * }} StoryUserLaneDomElements
 */

/**
 * @typedef {{
 *   storyAvatarLoadGuard: { pickDisplaySrc: (s: string) => string, noteRemoteAttempt: (img: HTMLImageElement, requested: string) => void },
 *   isHttpOrHttpsUrl: (u: unknown) => boolean,
 *   storyTileUsesYukkuriTvStyle: (requested: string, display: string) => boolean,
 *   upgradeAnonymousAvatarImage?: (img: HTMLImageElement, userKey: string, sizePx?: number) => unknown
 * }} StoryUserLaneDomIo
 */

/**
 * ★v0.1.1039(応援レーン churn 根治): 段(lane el)ごとに「前回描いた items の body key」を覚え、同一なら DOM を
 *   一切触らずスキップする。北極星 paintTopSupportRankStyleIntoElement の WeakMap ブロック diff-skip を per-lane に踏襲。
 *   真因: syncStorySourceEntries が毎 poll で gift/ad picks を [] にリセット→2段paint で全 fillLaneTier が無条件 innerHTML=''
 *   →内容同一の段(りんく/こん太/たぬ姉)まで img 破棄→再ロードして「出たり消えたり」churn。key 一致で温存すれば img が生き churn 消滅。
 * @type {WeakMap<HTMLElement, string>}
 */
const _laneTierLastKey = new WeakMap();

/**
 * ★v0.1.1040(計器・観測のみ): 段(lane名)ごとに「実際に replaceChildren した回数(=DOM churn)」を数える。
 *   ちらつきの真因(どの段が・何回・どの経路で貼り替わるか)を状態速報から確定するため。件数のみ・PIIなし。
 *   lane 名は el.id 由来(sceneStoryUserLane{Link,Gift,Ad,Konta,Tanu})。read path は変えない=paint 直後に +1 するだけ。
 * @type {Record<string, number>}
 */
const _laneTierRepaintCount = { link: 0, gift: 0, ad: 0, konta: 0, tanu: 0, unknown: 0 };

/** el.id から段名を引く(sceneStoryUserLaneKonta → konta)。会場DOMは data-lane-name を使う。 */
function laneNameOfEl(el) {
  const id = String((el && el.id) || '');
  const m = /sceneStoryUserLane(Link|Gift|Ad|Konta|Tanu)/.exec(id);
  if (m) return m[1].toLowerCase();
  const dataLaneName = String((el && el.dataset && el.dataset.laneName) || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(_laneTierRepaintCount, dataLaneName)
    ? dataLaneName
    : 'unknown';
}

/** 計器の現在値(状態速報が読む・スナップショット)。 */
export function getStoryLaneRepaintCounts() {
  return { ...(_laneTierRepaintCount) };
}

/**
 * ★2026-08-18 計器(観測のみ): いま各段に「枠だけ(hollow)」のタイルが何枚あるか。
 *   中身LOD が実際に効いているかを状態速報の数字で判定するため。
 *   ★DOM を読むが、既存の計器バッチ(getStoryLaneRepaintCounts と同じ場所)に
 *     相乗りさせる=read を1本増やさない([[instrument-can-kill-the-page-it-measures]])。
 * ★引数は document(または任意の root)。els を持ち回らずに済むよう root 起点で数える。
 * @param {Document|HTMLElement|null} root
 * @returns {{ tanu: number, total: number } | null}
 */
export function getStoryLaneHollowCounts(root) {
  if (!root || typeof root.querySelector !== 'function') return null;
  try {
    const tanuEl = root.querySelector('#sceneStoryUserLaneTanu');
    return { tanu: countHollowTiles(tanuEl), total: countHollowTiles(root) };
  } catch {
    return null; // 計器失敗は描画も速報も止めない
  }
}

/**
 * ★2026-07-20(計器・観測のみ): ①POP応援レーンのタイル実体(span)なのにcomputed cursorがpointerに
 *   なっている個体を数える。venueYukkuriNamedCensus.js と同じ掟(数えるだけ・DOM/データ不変)。
 * @type {ReturnType<typeof createStoryUserLaneClickAffordanceParityState>}
 */
const _clickAffordanceParity = createStoryUserLaneClickAffordanceParityState();

/** 計器の現在値(状態速報が読む・スナップショット)。 */
export function getStoryUserLaneClickAffordanceParityState() {
  return _clickAffordanceParity;
}

/**
 * ★2026-07-20(計器・観測のみ): ①POP応援レーンの「名前ありゆっくり顔」実害を数える
 *   (venueYukkuriNamedCensus.js を会場専用から①POPにも拡張)。
 * @type {ReturnType<typeof createVenueYukkuriNamedCensusState>}
 */
const _yukkuriNamedCensus = createVenueYukkuriNamedCensusState();

/** 計器の現在値(状態速報が読む・スナップショット)。 */
export function getStoryUserLaneYukkuriNamedCensusState() {
  return _yukkuriNamedCensus;
}

/**
 * ★v0.1.1041: 「picked/entries が一瞬空になったとき、既存タイルを畳まず残すべきか」を判定する。
 *   同一配信(liveId が最後にタイルを描いた lid と一致)で、かつ現在レーンに実タイルがあるときだけ true。
 *   backfill の谷間で候補が一瞬0になっても前回タイルを残す=「タイルが出たり消えたり」の根治
 *   (v1026 の広告列「一度実データを描いたら一瞬の空では畳まない」と同戦略)。配信切替や一度も描いていない時は false=畳む。
 * @param {StoryUserLaneDomElements} els
 * @param {unknown} currentLiveId
 * @param {unknown} lastTiledLid 最後に実タイルを描いた liveId
 * @returns {boolean}
 */
export function shouldKeepStoryUserLaneTilesOnEmpty(els, currentLiveId, lastTiledLid) {
  const cur = String(currentLiveId || '').trim().toLowerCase();
  const last = String(lastTiledLid || '').trim().toLowerCase();
  // ★v0.1.1233(穴3): cur が空('')は「配信切替」ではなく「URL不明」。
  //   popup-entry.js の `if (!hasWatch) syncStorySourceEntries('', [])` で空になる窓が実在し、
  //   ここで畳むと同一配信なのにタイルが消える(lane-tiles-vanish-MAP.md §1.4)。
  if (!last) return false; // 一度も描いていない=守るものが無い
  if (cur && cur !== last) return false; // 本物の配信切替=畳んでよい
  const lanes = els ? [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu] : [];
  for (const lane of lanes) {
    if (lane && typeof lane.childElementCount === 'number' && lane.childElementCount > 0) return true;
  }
  return false; // 実タイルが1つも無い=畳んでよい(真の空)
}

/**
 * keep が続きすぎたときの非常口(出口4)。同一配信で keep がこの時間だけ連続したら、
 * 縮小でも描く(永久 stale を防ぐ)。
 * ★10分の根拠: 大配信の backfill は分単位で続く(実測: 取り込み20%・残640件)ため短すぎると
 *   症状が再発する。不変条件は「stale > 縮小」を選好するので長めに倒す。
 */
export const STORY_USER_LANE_SHRINK_KEEP_MAX_MS = 10 * 60 * 1000;

/**
 * keep 連続時間を測る時計の初期状態。
 * @returns {{ lid: string, firstKeptAtMs: number }}
 */
export function makeLaneShrinkKeepClock() {
  // keeping=false のとき firstKeptAtMs は無意味。0 を「未計測」の番兵にすると
  // nowMs=0 で時計が始まらないため、明示フラグで持つ(番兵値を使わない)。
  return { lid: '', firstKeptAtMs: 0, keeping: false };
}

/**
 * keep 判定のたびに呼ぶ。同一配信で keep が MAX_MS を超えて連続したら true(=非常口を開く)。
 *   - wouldKeep=false(描けた) → 時計リセット。
 *   - lid が変わった → 仕切り直し(前配信の経過を持ち込まない)。
 * @param {{ lid: string, firstKeptAtMs: number }} clock
 * @param {{ liveId?: unknown, wouldKeep: boolean, nowMs: number }} args
 * @returns {boolean} true=期限切れ(keep を解除して描く)
 */
export function laneShrinkKeepExpired(clock, args) {
  if (!clock || typeof clock !== 'object') return false;
  const lid = String(args?.liveId ?? '').trim().toLowerCase();
  const now = Number(args?.nowMs) || 0;
  if (args?.wouldKeep !== true) {
    // 描けた=守る必要が無くなった。次の keep から測り直す。
    clock.lid = lid;
    clock.firstKeptAtMs = 0;
    clock.keeping = false;
    return false;
  }
  if (lid !== clock.lid || clock.keeping !== true) {
    // keep の始まり(または配信切替で仕切り直し)。
    clock.lid = lid;
    clock.firstKeptAtMs = now;
    clock.keeping = true;
    return false;
  }
  return now - clock.firstKeptAtMs > STORY_USER_LANE_SHRINK_KEEP_MAX_MS;
}

/**
 * 描画単調性ガード(HANDOFF-heavyrace-backfill-IMPL.md A・heavyRace再発の即効対策)。
 *   大配信+backfill進行中は heavy read が race で未settleになり、応援レーンが「暫定(summary+tail 由来の
 *   短い候補)」で描かれ続ける。その暫定 paint が「一度出た完全な描画(200+タイル)」を74件等に上書きして
 *   退化する(=たぬ姉段固着に見える)。これを防ぐため:
 *   「同一配信 かつ supply が暫定(heavy未settle) かつ 今回描く総タイル数が前回 DOM 実タイル数を
 *    大幅に下回る」なら paint を見送り、前回の完全描画を守る。
 *
 * ★settled(provisional=false)な正当減少(配信中の contamination フィルタ等)は必ず描く=false を返す。
 * ★配信切替(lid 不一致)は必ず描く=false(OnEmpty と同一の正規化)。
 * ★前回タイル 0(初回)は守るものが無い=false。
 *
 * @param {StoryUserLaneDomElements} els
 * @param {unknown} currentLiveId
 * @param {unknown} lastTiledLid 最後に実タイルを描いた liveId
 * @param {number} nextTileCount 今回描こうとしている総タイル数(picked + gift + ad の 5段合計相当)
 * @param {boolean} entriesProvisional supply が暫定(heavy 未settle)か
 * @returns {boolean} true=見送って前回描画を守る / false=描いてよい
 */
export function shouldKeepStoryUserLaneTilesOnShrink(
  els,
  currentLiveId,
  lastTiledLid,
  nextTileCount,
  entriesProvisional
) {
  if (entriesProvisional !== true) return false; // settled な正当減少は必ず描く
  const cur = String(currentLiveId || '').trim().toLowerCase();
  const last = String(lastTiledLid || '').trim().toLowerCase();
  // ★v0.1.1233(穴3): cur が空('')は「配信切替」ではなく「URL不明」(OnEmpty と同じ理由)。
  if (!last) return false; // 一度も描いていない=守るものが無い
  if (cur && cur !== last) return false; // 本物の配信切替=描いてよい
  const lanes = els ? [els.laneLink, els.laneGift, els.laneAd, els.laneKonta, els.laneTanu] : [];
  let prev = 0;
  for (const lane of lanes) {
    if (lane && typeof lane.childElementCount === 'number') prev += lane.childElementCount;
  }
  if (prev <= 0) return false; // 前回タイル無し=守るものが無い
  const next = Math.max(0, Math.floor(Number(nextTileCount) || 0));
  // ★v0.1.1233 契約変更: 旧「前回の60%未満なら見送る」→「1枚でも減ったら見送る」。
  //   根拠: 名簿キーパー(v0.1.1232)でユーザー段 picked は同一配信内で単調増加になったため、
  //   暫定供給の縮小は「正当な減少」ではなく常に「供給が不完全」を意味する。
  //   同数・増加は描く(内容更新を止めない)。永久 stale は laneShrinkKeepExpired が防ぐ。
  return next < prev;
}

/**
 * 段の items から「見た目が同じなら再描画不要」を判定する安定 key。
 *   ★時刻や guard 非同期差替後の src は入れない(v1022 型の毎回変化回避)= item 由来の確定フィールドのみ。
 * @param {Array<{ displaySrc?: any, title?: any, meta?: { idLine?: any, nameLine?: any }, entry?: { userId?: any } }>} items
 * @returns {string}
 */
function storyLaneTierBodyKey(items) {
  return items
    .map((p) => {
      const it = p && typeof p === 'object' ? p : {};
      return [
        String(it.entry?.userId || ''),
        String(it.displaySrc || ''),
        String(it.meta?.idLine || ''),
        String(it.meta?.nameLine || ''),
        String(it.title || '')
      ].join('');
    })
    .join('');
}

/** @param {HTMLElement | null} root */
/**
 * ★v0.1.1475: たぬ姉段が多人数のとき【窓】にする(高さを絞ってスクロール)。
 *
 * ★1枚も消さない。class を付け外しするだけで、DOM の枚数は一切変えない。
 *   判定は laneWindowVerdict.js(純関数)が正本。ここは付け外しするだけ。
 *   ★件数だけで決める＝DOM read ゼロ([[instrument-can-kill-the-page-it-measures]])。
 *
 * @param {HTMLElement|null|undefined} laneEl
 * @param {number} tileCount buckets の件数(★DOM から数えない)
 * @param {unknown} wrapTileEl 会場モードのラッパ(あれば会場＝対象外)
 */
function applyStoryUserLaneWindow(laneEl, tileCount, wrapTileEl) {
  if (!laneEl || !laneEl.classList) return;
  const { windowed } = judgeLaneWindow({ tileCount, isVenue: !!wrapTileEl });
  laneEl.classList.toggle('nl-story-userlane--windowed', windowed);
}

function removeStoryUserLaneEmptyNotesUnder(root) {
  if (!root) return;
  root.querySelectorAll('.nl-story-userlane__empty-note').forEach((n) => {
    n.remove();
  });
}

/**
 * 段の直下に空状態ノートを付け外しする（display:none は使わない）。
 * @param {HTMLElement} laneEl
 * @param {boolean} show
 * @param {string} innerHtml trusted HTML from storyUserLaneGuideHtml
 */
function syncStoryUserLaneTierEmptyNote(laneEl, show, innerHtml) {
  const next = laneEl.nextElementSibling;
  if (next && next.classList.contains('nl-story-userlane__empty-note')) {
    next.remove();
  }
  if (!show || !innerHtml) return;
  const box = document.createElement('div');
  box.className = 'nl-story-userlane__empty-note';
  box.innerHTML = innerHtml;
  laneEl.insertAdjacentElement('afterend', box);
}

/** @param {StoryUserLaneDomElements} els */
export function resetStoryUserLaneDom(els) {
  const {
    stack,
    laneLink,
    laneGift,
    laneAd,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
    adWrap,
    guideTop,
    guideLinesTop,
    guideMidGift,
    guideLinesMidGift,
    guideMidAd,
    guideLinesMidAd,
    guideMidKonta,
    guideLinesMidKonta,
    guideMidTanu,
    guideLinesMidTanu,
    guideBottom,
    guideLinesBottom
  } = els;
  removeStoryUserLaneEmptyNotesUnder(stack);
  // ★diff-skip の整合: 直接 innerHTML を消す段は cache key も無効化する(消したのに次回 key 一致で skip され
  //   空のまま残る事故を防ぐ)。fillLaneTier 以外で DOM を消す経路がここ。
  for (const laneEl of [laneLink, laneGift, laneAd, laneKonta, laneTanu]) {
    // ★中身LOD: DOM を消す前に観測を解く(IO がターゲット参照を握る=リーク防止)。
    if (laneEl) forgetLaneContentLod(laneEl);
    if (laneEl) { laneEl.innerHTML = ''; _laneTierLastKey.delete(laneEl); }
  }
  laneLink.hidden = true;
  laneGift.hidden = true;
  if (laneAd) laneAd.hidden = true;
  laneKonta.hidden = true;
  laneTanu.hidden = true;
  if (hintLink) hintLink.hidden = true;
  if (linkWrap) linkWrap.hidden = true;
  if (giftWrap) giftWrap.hidden = true;
  if (adWrap) adWrap.hidden = true;
  if (guideMidGift) guideMidGift.hidden = true;
  if (guideLinesMidGift) guideLinesMidGift.innerHTML = '';
  if (guideMidAd) guideMidAd.hidden = true;
  if (guideLinesMidAd) guideLinesMidAd.innerHTML = '';
  if (guideMidKonta) guideMidKonta.hidden = true;
  if (guideLinesMidKonta) guideLinesMidKonta.innerHTML = '';
  if (guideMidTanu) guideMidTanu.hidden = true;
  if (guideLinesMidTanu) guideLinesMidTanu.innerHTML = '';
  stack.hidden = true;
  if (guideTop) guideTop.hidden = true;
  if (guideLinesTop) guideLinesTop.innerHTML = '';
  if (guideBottom) guideBottom.hidden = true;
  if (guideLinesBottom) guideLinesBottom.innerHTML = '';
}

/**
 * @param {HTMLElement} el
 * @param {Array<{ displaySrc: string, title: string, meta: { idLine: string, nameLine: string }, entry: { userId?: string } }>} items
 * @param {StoryUserLaneDomIo} io
 * @param {(tileEl: HTMLElement, item: unknown, index: number) => HTMLElement} [wrapTileEl]
 */
function fillLaneTier(el, items, io, wrapTileEl) {
  if (!items.length) {
    // 空段は毎回同じ結末(key='')。既に空(前回も空)なら DOM を触らない=無駄な再描画/巻き添えを避ける。
    if (_laneTierLastKey.get(el) === '' && !el.firstChild) { el.hidden = true; return; }
    el.innerHTML = '';
    el.hidden = true;
    _laneTierLastKey.set(el, '');
    return;
  }
  // ★diff-skip: 前回と同一 items(見た目の body key 一致)なら DOM を一切触らない=img 温存で churn 消滅。
  const key = storyLaneTierBodyKey(items);
  if (_laneTierLastKey.get(el) === key && el.firstChild) {
    el.hidden = false; // 温存(再描画しない)。hidden だけ念のため確実に外す(レイアウトは不変)。
    return;
  }
  // ★中身LOD: 段を貼り替える前に前回の観測を解く(IO がターゲット参照を握る=リーク防止)。
  //   filledKeys(一度詰めた人)は保持される=戻さない(一方通行)。
  forgetLaneContentLod(el);
  const laneNameForLod = laneNameOfEl(el);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < items.length; i += 1) {
    const p = items[i];
    // ★中身LOD(枠は残す・中身だけ空にする): 後列の匿名は「枠だけ」を作り、
    //   可視域に入ってから中身を詰める。★枠は必ず frag に入る=childElementCount は不変
    //   =幕(シェード)の解除条件 countStoryUserLaneDomTiles(els) > 0 は無傷(C2)。
    const lodUserKey = String((p && p.entry && p.entry.userId) || '');
    if (
      shouldRenderHollow({
        laneName: laneNameForLod,
        index: i,
        hasRealThumb: io.isHttpOrHttpsUrl(String((p && p.displaySrc) || '')),
        hasWrap: typeof wrapTileEl === 'function',
        alreadyFilled: isAlreadyFilled(el, lodUserKey)
      })
    ) {
      const hollowEl = buildHollowTileEl(p);
      // 既存 CSS(密度LOD)と実DOM census が読む属性は枠のうちから付ける
      //   (中身の有無で見た目・照合が揺れないように)。
      try {
        hollowEl.dataset.thumb = '0'; // hollow になるのは実サムネ無しのときだけ(判定は上の hasRealThumb)
        hollowEl.dataset.userKey = venueLaneParityKey(p);
      } catch { /* io 未注入等でも描画は止めない */ }
      observeHollowTile(el, hollowEl, lodUserKey, () => {
        // ★同一位置で置換する(順序を変えない)。親が変わっていたら何もしない
        //   (段が貼り替わった後の遅れたコールバック=捨てる)。
        if (!hollowEl.parentNode) return;
        const realEl = buildPersonTileEl(p, io);
        try {
          realEl.dataset.thumb = io.isHttpOrHttpsUrl(String((p && p.displaySrc) || '')) ? '1' : '0';
          realEl.dataset.userKey = venueLaneParityKey(p);
        } catch { /* 描画は止めない */ }
        hollowEl.replaceWith(realEl);
      });
      frag.appendChild(hollowEl);
      continue;
    }
    // タイル本体の生成は人物タイル正本(buildPersonTileEl)に集約。
    // ループ・hidden 制御(=レイアウト)はここに残す。全消しでなく変化時だけ replaceChildren で一括差替。
    const tileEl = buildPersonTileEl(p, io);
    // 2026-07-20 計器(観測のみ・新規生成タイルのみ対象=diff-skip温存分は対象外): span実体なのに
    //   computed cursor が pointer になっている個体を数える。失敗は握る(描画を止めない)。
    try {
      observeStoryUserLaneClickAffordance(_clickAffordanceParity, { tileEl, title: p && p.title });
    } catch {
      /* 計器失敗は描画を止めない */
    }
    // 2026-07-20 計器(観測のみ・新規生成タイルのみ対象=diff-skip温存分は対象外): 「名前ありゆっくり顔」
    //   実害を数える(会場専用だった計器を①POPにも適用)。失敗は握る(描画を止めない)。
    try {
      observeVenueYukkuriNamedTile(_yukkuriNamedCensus, {
        uid: p && p.entry && p.entry.userId,
        rawName: p && p.title,
        displaySrc: p && p.displaySrc
      });
    } catch {
      /* 計器失敗は描画を止めない */
    }
    // ★v0.1.1049: サムネ持ち=大 / 匿名=小(ぎゅうぎゅう詰め)の CSS 出し分け用フラグ。
    //   判定は displaySrc が http(s) か【のみ】(=実サムネ)。thumbScore は匿名でも 2 になり得る
    //   (identicon 顔なのに大タイル)ため使わない。displaySrc は storyLaneTierBodyKey に含まれるので、
    //   サイズが変わる瞬間=key が変わって再描画される瞬間が一致=diff-skip に余計な key 揺れを作らない。
    //   personTileDom.js(タイル正本・凍結)は不触=ここ(呼び出し側)で属性を付ける。
    try {
      tileEl.dataset.thumb = io.isHttpOrHttpsUrl(String(p && p.displaySrc || '')) ? '1' : '0';
      // v0.1.1113 実DOM census(Tri-Parity): 実DOMをキー単位で突合するための恒久刻印。
      //   タイル正本(personTileDom)は凍結のため呼び出し側で付ける。''=無鍵(census が unkeyed に数える)。
      //   ★storyLaneTierBodyKey には入れない(diff-skip の key 揺れを作らない)。
      tileEl.dataset.userKey = venueLaneParityKey(p);
    } catch { /* io 未注入等でも描画は止めない */ }
    frag.appendChild(typeof wrapTileEl === 'function' ? wrapTileEl(tileEl, p, i) : tileEl);
  }
  el.replaceChildren(frag);
  el.hidden = false;
  _laneTierLastKey.set(el, key);
  // 計器(観測のみ): 実際に貼り替えた段を数える=churn の実測。
  const laneName = laneNameOfEl(el);
  _laneTierRepaintCount[laneName] = (_laneTierRepaintCount[laneName] || 0) + 1;
}

/**
 * @param {StoryUserLaneDomElements} els
 * @param {{ faceLink: string, faceGift: string, faceKonta: string, faceTanu: string }} faces
 * @param {{ link: unknown[], gift: unknown[], konta: unknown[], tanu: unknown[] }} buckets
 * @param {number} pickedLength
 * @param {StoryUserLaneDomIo} io
 * @param {{ recordedCommentRowsTotal?: number, totalCandidates?: number, guides?: boolean, wrapTileEl?: (tileEl: HTMLElement, item: unknown, index: number) => HTMLElement, emptyTextOverrides?: { gift?: string } }} [opts] 診断の total と同じ記録件数
 *   emptyTextOverrides: 空段ノートの差し替え(★会場の fallback 専用。①③は渡さない)
 *   （省略時はレーン直下の第2文なし）。totalCandidates=素性が取れた候補総数（cap 前）で「ほか M人」併記用。
 *   guides=false(v0.1.1120 会場用): キャラ案内帯・空段説明ノート・りんくヒント・フッター
 *   (「ほかN人は会場モードで…」=会場内では自己言及)を描画パスから除外する。省略時 true=①③status 完全不変。
 */
export function paintStoryUserLaneDomFilled(
  els,
  faces,
  buckets,
  pickedLength,
  io,
  opts
) {
  const {
    stack,
    laneLink,
    laneGift,
    laneAd,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
    adWrap,
    guideTop,
    guideLinesTop,
    guideMidGift,
    guideLinesMidGift,
    guideMidAd,
    guideLinesMidAd,
    guideMidKonta,
    guideLinesMidKonta,
    guideMidTanu,
    guideLinesMidTanu,
    guideBottom,
    guideLinesBottom
  } = els;

  const wrapTileEl = opts && typeof opts.wrapTileEl === 'function' ? opts.wrapTileEl : undefined;
  // v0.1.1120: guides=false は案内帯/空段ノート/hint/フッターを【描画パスから除外】する(CSS隠しでない
  //   =構造依存driftなし)。省略時 true=①③status のDOMはバイト一致で不変(reference_venue_cleanup §C-1)。
  const showGuides = !(opts && opts.guides === false);
  fillLaneTier(laneLink, buckets.link, io, wrapTileEl);
  fillLaneTier(laneGift, buckets.gift, io, wrapTileEl);
  if (laneAd) fillLaneTier(laneAd, buckets.ad || [], io, wrapTileEl);
  fillLaneTier(laneKonta, buckets.konta, io, wrapTileEl);
  fillLaneTier(laneTanu, buckets.tanu, io, wrapTileEl);

  /*
   * ★v0.1.1475: たぬ姉段が多人数のとき【窓】にする(高さを絞ってスクロール)。
   *   ★1枚も消さない。DOM には全員が居たままで、スクロールすれば全員に到達できる。
   *   判定は buckets の【件数だけ】= DOM read ゼロ(計器がページを殺さないため)。
   *   ★会場(wrapTileEl あり)は対象外。会場は元々スクロールする器を持っている。
   */
  applyStoryUserLaneWindow(laneTanu, buckets.tanu.length, wrapTileEl);

  // 空段ノートは lane el 直付け(:188-198)のため、非表示は必ずこの関数の show=false 経由で
  //   【能動的に除去】する(guide 要素の null 化では消えない=設計正本の地雷#5)。
  syncStoryUserLaneTierEmptyNote(
    laneLink,
    showGuides && buckets.link.length === 0,
    buildStoryUserLaneEmptyNoteLinkHtml()
  );
  /*
   * ★v0.1.1280: 空ノートの差し替え口(会場の fallback 専用)。
   *   会場は鏡が無い/古すぎると fallback 経路に落ちるが、fallback は【構造上 gift/ad 段を
   *   作れない】(①の gift/ad は tier 判定を通さない後付けなので席から導出できない)。
   *   それなのに「いまの記録では該当者がいません」と断定するのは【嘘】だった
   *   (知らないことを、知っているかのように言っている)。
   *   ★①③の描画は1バイトも変えない: overrides を渡すのは venueBar だけ。
   */
  const emptyOverrides =
    opts && opts.emptyTextOverrides && typeof opts.emptyTextOverrides === 'object'
      ? opts.emptyTextOverrides
      : null;
  syncStoryUserLaneTierEmptyNote(
    laneGift,
    showGuides && buckets.gift.length === 0,
    emptyOverrides && typeof emptyOverrides.gift === 'string'
      ? emptyOverrides.gift
      : buildStoryUserLaneEmptyNoteGiftHtml()
  );
  syncStoryUserLaneTierEmptyNote(
    laneKonta,
    showGuides && buckets.konta.length === 0,
    buildStoryUserLaneEmptyNoteKontaHtml()
  );
  syncStoryUserLaneTierEmptyNote(
    laneTanu,
    showGuides && buckets.tanu.length === 0,
    buildStoryUserLaneEmptyNoteTanuHtml()
  );

  if (hintLink) {
    const showLinkHint =
      showGuides &&
      buckets.link.length === 0 &&
      (buckets.konta.length > 0 || buckets.tanu.length > 0);
    hintLink.hidden = !showLinkHint;
  }
  if (linkWrap) {
    const showLinkWrap = !laneLink.hidden || (hintLink && !hintLink.hidden);
    linkWrap.hidden = !showLinkWrap;
  }
  if (giftWrap) {
    const showGiftWrap =
      !laneGift.hidden ||
      (guideMidGift && !guideMidGift.hidden) ||
      Boolean(
        laneGift.nextElementSibling?.classList?.contains('nl-story-userlane__empty-note')
      );
    giftWrap.hidden = !showGiftWrap;
  }
  // 広告段: 広告投稿者がいるときだけ出す(いなければ wrap ごと隠す=空段で場所を取らない)。
  if (laneAd && adWrap) {
    const hasAd = (buckets.ad || []).length > 0;
    if (hasAd) laneAd.hidden = false;
    adWrap.hidden = !hasAd;
    if (guideMidAd) guideMidAd.hidden = !(showGuides && hasAd);
    if (guideLinesMidAd) {
      guideLinesMidAd.innerHTML =
        showGuides && hasAd ? buildStoryUserLaneGuideAdHtml(faces.faceAd) : '';
    }
  }

  stack.setAttribute('aria-label', buildStoryUserLaneStackAriaLabel(pickedLength));
  stack.hidden = false;

  // ガイド帯: 非表示側も hidden=true + innerHTML='' を【能動的に】書く(モード遷移で残骸ゼロ)。
  //   showGuides=true 側は従来と同文=①③の diff ゼロ。
  if (guideLinesTop) {
    guideLinesTop.innerHTML = showGuides ? buildStoryUserLaneGuideTopHtml(faces.faceLink) : '';
  }
  if (guideTop) guideTop.hidden = !showGuides;
  if (guideLinesMidGift) {
    guideLinesMidGift.innerHTML = showGuides ? buildStoryUserLaneGuideGiftHtml(faces.faceGift) : '';
  }
  if (guideMidGift) guideMidGift.hidden = !showGuides;
  if (guideLinesMidKonta) {
    guideLinesMidKonta.innerHTML = showGuides
      ? buildStoryUserLaneGuideKontaHtml(faces.faceKonta)
      : '';
  }
  if (guideMidKonta) guideMidKonta.hidden = !showGuides;
  if (guideLinesMidTanu) {
    guideLinesMidTanu.innerHTML = showGuides
      ? buildStoryUserLaneGuideTanuHtml(faces.faceTanu)
      : '';
  }
  if (guideMidTanu) guideMidTanu.hidden = !showGuides;
  if (guideLinesBottom) {
    guideLinesBottom.innerHTML = showGuides
      ? buildStoryUserLaneGuideFootAndRecordedHtml(
          pickedLength,
          opts && typeof opts.recordedCommentRowsTotal === 'number'
            ? opts.recordedCommentRowsTotal
            : undefined,
          opts && typeof opts.totalCandidates === 'number'
            ? opts.totalCandidates
            : undefined
        )
      : '';
  }
  if (guideBottom) guideBottom.hidden = !showGuides;
}

/**
 * 候補ゼロだがエントリはあるときのガイドのみ表示。
 * @param {StoryUserLaneDomElements} els
 * @param {{ faceLink: string, faceGift: string, faceKonta: string, faceTanu: string }} faces
 * @param {{ recordedCommentRowsTotal?: number }} [opts]
 */
export function paintStoryUserLaneDomEmptyGuides(els, faces, opts) {
  const {
    stack,
    laneLink,
    laneGift,
    laneAd,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
    adWrap,
    guideTop,
    guideLinesTop,
    guideMidGift,
    guideLinesMidGift,
    guideMidKonta,
    guideLinesMidKonta,
    guideMidTanu,
    guideLinesMidTanu,
    guideBottom,
    guideLinesBottom
  } = els;
  removeStoryUserLaneEmptyNotesUnder(stack);
  // ★diff-skip の整合: 直接 innerHTML を消す段は cache key も無効化する(消したのに次回 key 一致で skip され
  //   空のまま残る事故を防ぐ)。fillLaneTier 以外で DOM を消す経路がここ。
  for (const laneEl of [laneLink, laneGift, laneAd, laneKonta, laneTanu]) {
    // ★中身LOD: DOM を消す前に観測を解く(IO がターゲット参照を握る=リーク防止)。
    if (laneEl) forgetLaneContentLod(laneEl);
    if (laneEl) { laneEl.innerHTML = ''; _laneTierLastKey.delete(laneEl); }
  }
  laneLink.hidden = true;
  laneGift.hidden = true;
  if (laneAd) laneAd.hidden = true;
  laneKonta.hidden = true;
  laneTanu.hidden = true;
  if (hintLink) hintLink.hidden = true;
  if (linkWrap) linkWrap.hidden = true;
  if (giftWrap) giftWrap.hidden = false;
  // 広告段: picked が空のガイド状態では出さない(広告主がいないので段ごと畳む)。
  if (adWrap) adWrap.hidden = true;
  stack.hidden = false;
  if (guideLinesTop) {
    guideLinesTop.innerHTML = buildStoryUserLaneGuideTopHtml(faces.faceLink);
  }
  if (guideTop) guideTop.hidden = false;
  if (guideLinesMidGift) {
    guideLinesMidGift.innerHTML = buildStoryUserLaneGuideGiftHtml(faces.faceGift);
  }
  if (guideMidGift) guideMidGift.hidden = false;
  if (guideLinesMidKonta) {
    guideLinesMidKonta.innerHTML = buildStoryUserLaneGuideKontaHtml(
      faces.faceKonta
    );
  }
  if (guideMidKonta) guideMidKonta.hidden = false;
  if (guideLinesMidTanu) {
    guideLinesMidTanu.innerHTML = buildStoryUserLaneGuideTanuHtml(
      faces.faceTanu
    );
  }
  if (guideMidTanu) guideMidTanu.hidden = false;
  if (guideLinesBottom) {
    guideLinesBottom.innerHTML = buildStoryUserLaneGuideFootAndRecordedHtml(
      0,
      opts && typeof opts.recordedCommentRowsTotal === 'number'
        ? opts.recordedCommentRowsTotal
        : undefined
    );
  }
  if (guideBottom) guideBottom.hidden = false;
}
