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

/** el.id から段名を引く(sceneStoryUserLaneKonta → konta)。 */
function laneNameOfEl(el) {
  const id = String((el && el.id) || '');
  const m = /sceneStoryUserLane(Link|Gift|Ad|Konta|Tanu)/.exec(id);
  return m ? m[1].toLowerCase() : 'unknown';
}

/** 計器の現在値(状態速報が読む・スナップショット)。 */
export function getStoryLaneRepaintCounts() {
  return { ...(_laneTierRepaintCount) };
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
 */
function fillLaneTier(el, items, io) {
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
  const frag = document.createDocumentFragment();
  for (const p of items) {
    // タイル本体の生成は人物タイル正本(buildPersonTileEl)に集約。
    // ループ・hidden 制御(=レイアウト)はここに残す。全消しでなく変化時だけ replaceChildren で一括差替。
    frag.appendChild(buildPersonTileEl(p, io));
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
 * @param {{ recordedCommentRowsTotal?: number, totalCandidates?: number }} [opts] 診断の total と同じ記録件数
 *   （省略時はレーン直下の第2文なし）。totalCandidates=素性が取れた候補総数（cap 前）で「ほか M人」併記用。
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

  fillLaneTier(laneLink, buckets.link, io);
  fillLaneTier(laneGift, buckets.gift, io);
  if (laneAd) fillLaneTier(laneAd, buckets.ad || [], io);
  fillLaneTier(laneKonta, buckets.konta, io);
  fillLaneTier(laneTanu, buckets.tanu, io);

  syncStoryUserLaneTierEmptyNote(
    laneLink,
    buckets.link.length === 0,
    buildStoryUserLaneEmptyNoteLinkHtml()
  );
  syncStoryUserLaneTierEmptyNote(
    laneGift,
    buckets.gift.length === 0,
    buildStoryUserLaneEmptyNoteGiftHtml()
  );
  syncStoryUserLaneTierEmptyNote(
    laneKonta,
    buckets.konta.length === 0,
    buildStoryUserLaneEmptyNoteKontaHtml()
  );
  syncStoryUserLaneTierEmptyNote(
    laneTanu,
    buckets.tanu.length === 0,
    buildStoryUserLaneEmptyNoteTanuHtml()
  );

  if (hintLink) {
    const showLinkHint =
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
    if (guideMidAd) guideMidAd.hidden = !hasAd;
    if (hasAd && guideLinesMidAd) {
      guideLinesMidAd.innerHTML = buildStoryUserLaneGuideAdHtml(faces.faceAd);
    }
  }

  stack.setAttribute('aria-label', buildStoryUserLaneStackAriaLabel(pickedLength));
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
      pickedLength,
      opts && typeof opts.recordedCommentRowsTotal === 'number'
        ? opts.recordedCommentRowsTotal
        : undefined,
      opts && typeof opts.totalCandidates === 'number'
        ? opts.totalCandidates
        : undefined
    );
  }
  if (guideBottom) guideBottom.hidden = false;
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
