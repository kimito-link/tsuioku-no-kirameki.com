// @ts-nocheck — DOM 専用; 候補行は popup 由来のゆるい形をそのまま渡す
/**
 * 応援ユーザーレーン DOM の同期（popup-entry から切り出し・状態は引数で受け取る）。
 */

import {
  buildStoryUserLaneEmptyNoteGiftHtml,
  buildStoryUserLaneEmptyNoteKontaHtml,
  buildStoryUserLaneEmptyNoteLinkHtml,
  buildStoryUserLaneEmptyNoteTanuHtml,
  buildStoryUserLaneGuideFootAndRecordedHtml,
  buildStoryUserLaneGuideGiftHtml,
  buildStoryUserLaneGuideKontaHtml,
  buildStoryUserLaneGuideTanuHtml,
  buildStoryUserLaneGuideTopHtml
} from '../../lib/storyUserLaneGuideHtml.js';
import { buildStoryUserLaneStackAriaLabel } from '../../lib/supportVisualStoryCopy.js';

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
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
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
  laneLink.innerHTML = '';
  laneGift.innerHTML = '';
  laneKonta.innerHTML = '';
  laneTanu.innerHTML = '';
  laneLink.hidden = true;
  laneGift.hidden = true;
  laneKonta.hidden = true;
  laneTanu.hidden = true;
  if (hintLink) hintLink.hidden = true;
  if (linkWrap) linkWrap.hidden = true;
  if (giftWrap) giftWrap.hidden = true;
  if (guideMidGift) guideMidGift.hidden = true;
  if (guideLinesMidGift) guideLinesMidGift.innerHTML = '';
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
    const fullUid = String(p.entry?.userId || '').trim();
    // 数値 ID（5〜14桁）ならニコニコのユーザーページにリンク
    const isLinkable = /^\d{5,14}$/.test(fullUid);
    const cell = isLinkable
      ? document.createElement('a')
      : document.createElement('span');
    cell.className = 'nl-story-userlane-cell';
    if (isLinkable) {
      /** @type {HTMLAnchorElement} */ (cell).href =
        `https://www.nicovideo.jp/user/${fullUid}`;
      /** @type {HTMLAnchorElement} */ (cell).target = '_blank';
      /** @type {HTMLAnchorElement} */ (cell).rel = 'noopener noreferrer';
      cell.classList.add('nl-story-userlane-cell--linkable');
    }

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
    if (
      fullUid &&
      requestedLane.startsWith('data:image/svg+xml') &&
      typeof io.upgradeAnonymousAvatarImage === 'function'
    ) {
      io.upgradeAnonymousAvatarImage(img, fullUid, 64);
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
 * @param {{ faceLink: string, faceGift: string, faceKonta: string, faceTanu: string }} faces
 * @param {{ link: unknown[], gift: unknown[], konta: unknown[], tanu: unknown[] }} buckets
 * @param {number} pickedLength
 * @param {StoryUserLaneDomIo} io
 * @param {{ recordedCommentRowsTotal?: number }} [opts] 診断の total と同じ記録件数（省略時はレーン直下の第2文なし）
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
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
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

  fillLaneTier(laneLink, buckets.link, io);
  fillLaneTier(laneGift, buckets.gift, io);
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
    laneKonta,
    laneTanu,
    hintLink,
    linkWrap,
    giftWrap,
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
  laneLink.innerHTML = '';
  laneGift.innerHTML = '';
  laneKonta.innerHTML = '';
  laneTanu.innerHTML = '';
  laneLink.hidden = true;
  laneGift.hidden = true;
  laneKonta.hidden = true;
  laneTanu.hidden = true;
  if (hintLink) hintLink.hidden = true;
  if (linkWrap) linkWrap.hidden = true;
  if (giftWrap) giftWrap.hidden = false;
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
