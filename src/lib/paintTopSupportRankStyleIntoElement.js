/**
 * 応援帯・公式値レーン（貢献度等）で共通の `nl-top-support-rank` ブロック描画。
 *
 * v0.1.881: popup-entry.js のローカル関数 `paintTopSupportRankStyleIntoElement` を
 *   【そのまま】共有 lib に抽出した正本。popup と live-view(応援ライブビュー)が同じ本物の
 *   描画を使うことで「完全コピー(1px も違わない)」を保証する。会議(council/live-view-verbatim-copy)
 *   の結論=自作の再現はアレンジになるので、本物の関数を両方が import する。
 *
 * 設計(seam): 本体の HTML/モデル生成は両者で完全同一。popup 固有の runtime 依存
 *   (avatarLoadGuard / identicon resolver / 北極星レーンの DOM 同期ヘルパ / 待機UI teardown 等)は
 *   **opts で注入**する。popup は自分の本物のローカル関数を渡し、live-view は自分の本物の等価物を
 *   渡す(=スタブを作らない=挙動ズレが原理的に起きない)。省略時は live-view 相当の安全な既定動作。
 *
 * @see src/extension/popup-entry.js の paintTopSupportRankStyleIntoElement（薄いラッパで本関数に委譲）
 */

import { topSupportRankLineModels } from './topSupportRankStripLines.js';
import { escapeHtml, escapeAttr } from '../shared/html/escape.js';
import { isHttpOrHttpsUrl, isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';

/**
 * v0.1.618(改修A+差分): 最後に流し込んだ本体 HTML を要素ごとに覚えておく diff-skip キャッシュ。
 * ポーリング(3s/30s)で同じデータを毎回 innerHTML 全置換すると、既存ノードが一瞬破棄され
 * 「白くなる/出たり消えたり」が起きる。前回と同一 HTML なら DOM を一切触らずスキップする。
 * @type {WeakMap<HTMLElement, string>}
 */
const _topSupportRankLastHtmlByEl = new WeakMap();

/** 既定の avatar load guard(no-op)。popup は本物の storyAvatarLoadGuard を opts で渡す。 */
const DEFAULT_AVATAR_LOAD_GUARD = {
  /** @param {string} src @returns {string} */
  pickDisplaySrc: (src) => src,
  /** @param {HTMLImageElement} _img @param {string} _src */
  noteRemoteAttempt: (_img, _src) => {}
};

/** OS の配色(prefers-color-scheme)。popup は従来これをインラインで使っていた。純粋。 */
function defaultColorScheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * `nl-top-support-rank` ブロックを el に描画する(popup の paintTopSupportRankStyleIntoElement 本体)。
 *
 * @param {HTMLElement} el
 * @param {{ userKey: string; nickname: string; count: number; avatarUrl?: string }[]} rooms
 * @param {{
 *   noteText: string;
 *   unitSuffix: string;
 *   ariaLabel: string;
 *   prependHtml?: string;
 *   beforeNoteHtml?: string;
 *   isNorthStarBody?: boolean;
 *   freshnessNote?: string;
 *   pointsSumAll?: number;
 *   pointsSumDisplayed?: number;
 *   officialProgramGiftPts?: number|null;
 *   colorScheme?: 'light'|'dark';
 *   defaultThumbSrc: string;
 *   anonymousFallbackThumbSrc: string;
 *   anonymousIdenticonResolver?: (uid: string) => string;
 *   avatarLoadGuard?: { pickDisplaySrc: (s: string) => string; noteRemoteAttempt: (img: HTMLImageElement, s: string) => void };
 *   teardownWaitingUi?: (el: HTMLElement) => void;
 *   setLaneHidden?: (laneId: string, hidden: boolean) => void;
 *   syncLaneGadget?: (el: HTMLElement) => void;
 *   clearVerticalRail?: (el: HTMLElement) => void;
 *   bindOnErrorHandlersWithin?: (root: HTMLElement) => void;
 *   upgradeAnonymousAvatarImageFromFallback?: (img: HTMLImageElement, userKey: string, thumbSrc: string, size: number) => void;
 *   paintGiftHistorySummaryGadget?: (el: HTMLElement, rooms: any[], unitSuffix: string, totals: { pointsSumAll: number; pointsSumDisplayed: number; officialProgramGiftPts: number|null }) => void;
 * }} opts
 */
export function renderTopSupportRankStripInto(el, rooms, opts) {
  const {
    noteText,
    unitSuffix,
    ariaLabel,
    prependHtml = '',
    beforeNoteHtml = '',
    isNorthStarBody = false,
    freshnessNote = '',
    officialProgramGiftPts = null,
    defaultThumbSrc,
    anonymousFallbackThumbSrc,
    anonymousIdenticonResolver,
    avatarLoadGuard = DEFAULT_AVATAR_LOAD_GUARD,
    teardownWaitingUi,
    setLaneHidden,
    syncLaneGadget,
    clearVerticalRail,
    bindOnErrorHandlersWithin: bindOnError,
    upgradeAnonymousAvatarImageFromFallback: upgradeAnon,
    paintGiftHistorySummaryGadget
  } = opts;
  if (!(el instanceof HTMLElement)) return;
  if (isNorthStarBody) {
    if (typeof teardownWaitingUi === 'function') teardownWaitingUi(el);
    el.setAttribute('data-lane-state', 'ok');
    // v0.1.619: データ(rows)が来たので、空のとき畳んでいた hidden を必ず外して表示する
    //   (NORTH_STAR_API_DIRECT_HIDE_WHEN_EMPTY_LANES の畳みからの復帰)。lane id は body id 由来。
    {
      const laneIdFromBody = String(el.id || '').replace(/^northStarLaneBody-/, '');
      if (laneIdFromBody && typeof setLaneHidden === 'function') setLaneHidden(laneIdFromBody, false);
    }
    // 応援／ギフト帯と同じ「横スクロールのカード列」見せ方（#topSupportRankStrip と同型クラス）
    // 北極星は .nl-north-star-lane__shell が grid（左ガジェット | 本体 | 右レール）。
    // span-cards は grid-column:1/-1 で本体だけ全幅化し、aside が次段へ落ちて
    // 縦レールが「本体直下のダンプ」に見えるため付けない（--below-cards だけで横カード列）。
    el.classList.add('nl-top-support-rank', 'nl-top-support-rank--below-cards');
    if (el.id === 'northStarLaneBody-giftHistory') {
      el.classList.add('nl-gift-rank-strip');
      el.dataset.nlGiftRankMetric = unitSuffix === '回' ? 'throws' : 'points';
    }
  }
  el.hidden = false;
  el.removeAttribute('aria-hidden');
  el.setAttribute('aria-label', ariaLabel);
  const rankScheme = opts.colorScheme || defaultColorScheme();
  const models = topSupportRankLineModels(rooms, {
    defaultThumbSrc,
    anonymousFallbackThumbSrc,
    colorScheme: rankScheme,
    anonymousIdenticonResolver:
      typeof anonymousIdenticonResolver === 'function' ? anonymousIdenticonResolver : undefined
  });
  const html = models
    .map((m) => {
      const placeHtml =
        m.placeNumber != null
          ? `<span class="nl-top-support-rank__place" aria-hidden="true">${m.placeNumber}</span>`
          : `<span class="nl-top-support-rank__place nl-top-support-rank__place--empty" aria-hidden="true"></span>`;
      const full = escapeAttr(m.fullLabelForTitle);
      const displayThumb = avatarLoadGuard.pickDisplaySrc(m.thumbSrc);
      const thumbRp = isHttpOrHttpsUrl(displayThumb)
        ? ' referrerpolicy="no-referrer"'
        : '';
      const idText = escapeHtml(m.idShort);
      const nameText = escapeHtml(m.nameLine);
      const idTitle = m.isUnknown ? '' : escapeAttr(m.idTitle);
      let lineClass = `nl-top-support-rank__line${m.isUnknown ? ' nl-top-support-rank__line--unknown' : ''}`;
      let lineStyle = '';
      if (m.hasAccent && m.accentColorCss) {
        lineClass += ' nl-top-support-rank__line--has-accent';
        lineStyle = ` style="--nl-rank-accent:${escapeAttr(m.accentColorCss)}"`;
      }
      const isLinkable = !m.isUnknown && !isAnonymousStyleNicoUserId(m.userKey);
      const linkHref = isLinkable
        ? `https://www.nicovideo.jp/user/${escapeAttr(m.userKey)}`
        : '';
      const idBlock =
        String(m.idShort || '').trim() === ''
          ? ''
          : `<span class="nl-top-support-rank__id" title="${idTitle}">${idText}</span>`;
      const inner = `${placeHtml}
        <span class="nl-top-support-rank__count">${m.count}${escapeHtml(unitSuffix)}</span>
        <span class="nl-top-support-rank__thumb-wrap">
          <img class="nl-top-support-rank__thumb" src="${escapeAttr(displayThumb)}" alt="${nameText}" decoding="async"${thumbRp} />
        </span>
        ${idBlock}
        <span class="nl-top-support-rank__name">${nameText}</span>`;
      return isLinkable
        ? `<a class="${lineClass} nl-top-support-rank__line--linkable"${lineStyle} role="listitem" title="${full}" href="${linkHref}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : `<div class="${lineClass}"${lineStyle} role="listitem" title="${full}">${inner}</div>`;
    })
    .join('');
  const freshnessHtml = freshnessNote
    ? `<p class="nl-top-support-rank__freshness" aria-live="polite">🕒 ${escapeHtml(freshnessNote)}</p>`
    : '';
  const nextHtml =
    prependHtml +
    (beforeNoteHtml || '') +
    `<p class="nl-top-support-rank__note">${escapeHtml(noteText)}。</p>` +
    freshnessHtml +
    `<div class="nl-top-support-rank__list" role="list">${html}</div>`;
  // v0.1.618(改修A+差分): 前回と同一 HTML なら本体 DOM を触らずスキップ(ちらつき源を断つ)。
  //   変化があるときだけ、<template> でメモリ上に組んでから replaceChildren で**アトミックに
  //   差し替え**る。innerHTML 全置換と違い「一瞬空(白)」の中間状態が画面に出ない
  //   (ディープリサーチ: MDN replaceChildren / web.dev)。XSS 安全性は従来同様、生成側の
  //   escapeHtml/escapeAttr に依存(template.innerHTML はパースのみで実行されない)。
  //   本体 DOM を貼り替えた時だけ画像 guard を再バインド(貼り替えていないなら不要)。
  const bodyChanged = !(_topSupportRankLastHtmlByEl.get(el) === nextHtml && el.firstChild);
  if (bodyChanged) {
    const tpl = document.createElement('template');
    tpl.innerHTML = nextHtml;
    el.replaceChildren(tpl.content);
    _topSupportRankLastHtmlByEl.set(el, nextHtml);
    if (typeof bindOnError === 'function') bindOnError(el);
    const thumbs = el.querySelectorAll('img.nl-top-support-rank__thumb');
    models.forEach((m, i) => {
      const img = thumbs[i];
      if (!(img instanceof HTMLImageElement)) return;
      if (isHttpOrHttpsUrl(m.thumbSrc)) {
        avatarLoadGuard.noteRemoteAttempt(img, m.thumbSrc);
      }
      if (typeof upgradeAnon === 'function') upgradeAnon(img, m.userKey, m.thumbSrc, 64);
    });
  }
  if (isNorthStarBody) {
    if (typeof syncLaneGadget === 'function') syncLaneGadget(el);
    // 横カードに順位が含まれるため、右列の縦レールで同データを二重表示しない
    if (typeof clearVerticalRail === 'function') clearVerticalRail(el);
    if (el.id === 'northStarLaneBody-giftHistory' && typeof paintGiftHistorySummaryGadget === 'function') {
      paintGiftHistorySummaryGadget(el, rooms, unitSuffix, {
        pointsSumAll: Number(opts.pointsSumAll),
        pointsSumDisplayed: Number(opts.pointsSumDisplayed),
        officialProgramGiftPts
      });
    }
  }
}
