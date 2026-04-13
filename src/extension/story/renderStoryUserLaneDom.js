// @ts-nocheck — DOM 専用; 候補行は popup 由来のゆるい形をそのまま渡す
/**
 * 応援ユーザーレーン DOM の同期（popup-entry から切り出し・状態は引数で受け取る）。
 */

import {
  buildStoryUserLaneGuideFootHtml,
  buildStoryUserLaneGuideKontaHtml,
  buildStoryUserLaneGuideTanuHtml,
  buildStoryUserLaneGuideTopHtml
} from '../../lib/storyUserLaneGuideHtml.js';

/**
 * @typedef {{
 *   stack: HTMLElement,
 *   laneLink: HTMLElement,
 *   laneKonta: HTMLElement,
 *   laneTanu: HTMLElement,
 *   hintLink: HTMLElement | null,
 *   linkWrap: HTMLElement | null,
 *   guideTop: HTMLElement | null,
 *   guideLinesTop: HTMLElement | null,
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
 *   storyTileUsesYukkuriTvStyle: (requested: string, display: string) => boolean
 * }} StoryUserLaneDomIo
 */

/** @param {StoryUserLaneDomElements} els */
export function resetStoryUserLaneDom(els) {
  const {
    stack,
    laneLink,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    guideTop,
    guideLinesTop,
    guideMidKonta,
    guideLinesMidKonta,
    guideMidTanu,
    guideLinesMidTanu,
    guideBottom,
    guideLinesBottom
  } = els;
  laneLink.innerHTML = '';
  laneKonta.innerHTML = '';
  laneTanu.innerHTML = '';
  laneLink.hidden = true;
  laneKonta.hidden = true;
  laneTanu.hidden = true;
  if (hintLink) hintLink.hidden = true;
  if (linkWrap) linkWrap.hidden = true;
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
  el.innerHTML = '';
  if (!items.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const frag = document.createDocumentFragment();
  for (const p of items) {
    const cell = document.createElement('span');
    cell.className = 'nl-story-userlane-cell';

    const img = document.createElement('img');
    img.className = 'nl-story-userlane-avatar';
    const requestedLane = p.displaySrc;
    const displayLane = io.storyAvatarLoadGuard.pickDisplaySrc(requestedLane);
    img.src = displayLane;
    io.storyAvatarLoadGuard.noteRemoteAttempt(img, requestedLane);
    img.classList.toggle(
      'nl-avatar--tv-fallback',
      io.storyTileUsesYukkuriTvStyle(requestedLane, displayLane)
    );
    img.alt = '';
    const fullUid = String(p.entry?.userId || '').trim();
    const tip =
      fullUid && fullUid !== p.meta.idLine
        ? `${p.title} | ${fullUid}`
        : p.title;
    img.title = tip;
    cell.title = tip;
    img.decoding = 'async';
    if (io.isHttpOrHttpsUrl(img.src)) {
      img.referrerPolicy = 'no-referrer';
    }

    const metaEl = document.createElement('span');
    metaEl.className = 'nl-story-userlane-meta';
    const idRow = document.createElement('span');
    idRow.className = 'nl-story-userlane-meta__id';
    idRow.textContent = p.meta.idLine;
    const nameRow = document.createElement('span');
    nameRow.className = 'nl-story-userlane-meta__name';
    nameRow.textContent = p.meta.nameLine;
    metaEl.appendChild(idRow);
    metaEl.appendChild(nameRow);

    cell.appendChild(img);
    cell.appendChild(metaEl);
    frag.appendChild(cell);
  }
  el.appendChild(frag);
}

/**
 * @param {StoryUserLaneDomElements} els
 * @param {{ faceLink: string, faceKonta: string, faceTanu: string }} faces
 * @param {{ link: unknown[], konta: unknown[], tanu: unknown[] }} buckets
 * @param {number} pickedLength
 * @param {StoryUserLaneDomIo} io
 */
export function paintStoryUserLaneDomFilled(
  els,
  faces,
  buckets,
  pickedLength,
  io
) {
  const {
    stack,
    laneLink,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    guideTop,
    guideLinesTop,
    guideMidKonta,
    guideLinesMidKonta,
    guideMidTanu,
    guideLinesMidTanu,
    guideBottom,
    guideLinesBottom
  } = els;

  fillLaneTier(laneLink, buckets.link, io);
  fillLaneTier(laneKonta, buckets.konta, io);
  fillLaneTier(laneTanu, buckets.tanu, io);

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

  stack.setAttribute(
    'aria-label',
    `最近の応援ユーザーサムネイル（りんく・こん太・たぬ姉の三段）合計${pickedLength}件`
  );
  stack.hidden = false;

  if (guideLinesTop) {
    guideLinesTop.innerHTML = buildStoryUserLaneGuideTopHtml(faces.faceLink);
  }
  if (guideTop) guideTop.hidden = false;
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
    guideLinesBottom.innerHTML = buildStoryUserLaneGuideFootHtml(pickedLength);
  }
  if (guideBottom) guideBottom.hidden = false;
}

/**
 * 候補ゼロだがエントリはあるときのガイドのみ表示。
 * @param {StoryUserLaneDomElements} els
 * @param {{ faceLink: string, faceKonta: string, faceTanu: string }} faces
 */
export function paintStoryUserLaneDomEmptyGuides(els, faces) {
  const {
    stack,
    laneLink,
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    guideTop,
    guideLinesTop,
    guideMidKonta,
    guideLinesMidKonta,
    guideMidTanu,
    guideLinesMidTanu,
    guideBottom,
    guideLinesBottom
  } = els;
  laneLink.innerHTML = '';
  laneKonta.innerHTML = '';
  laneTanu.innerHTML = '';
  laneLink.hidden = true;
  laneKonta.hidden = true;
  laneTanu.hidden = true;
  if (hintLink) hintLink.hidden = true;
  if (linkWrap) linkWrap.hidden = true;
  stack.hidden = false;
  if (guideLinesTop) {
    guideLinesTop.innerHTML = buildStoryUserLaneGuideTopHtml(faces.faceLink);
  }
  if (guideTop) guideTop.hidden = false;
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
    guideLinesBottom.innerHTML = buildStoryUserLaneGuideFootHtml(0);
  }
  if (guideBottom) guideBottom.hidden = false;
}
