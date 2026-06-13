import { isGenericComeviewName } from '../lib/comeviewRows.js';
import {
  buildVenueSeating,
  buildVenueTiers,
  VENUE_FULLSCREEN_MAX_SEATS,
  venueRowsFromUserLaneCandidates
} from '../lib/venueSeats.js';
import { userLaneCandidatesFromStorage } from '../lib/userLaneCandidatesFromStorage.js';
import { readChunkedComments } from '../lib/commentChunkStore.js';
import { commentsStorageKey } from '../lib/storageKeys.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';

const ROOT_ID = 'nlsb-venue-root';
const STYLE_ID = 'nlsb-venue-style';
const OPEN_STORAGE_KEY = 'nls_venue_open';
const AGGREGATE_INTERVAL_MS = 30_000;
const AUDIENCE_DOT_MAX = 60;
const VENUE_LAYOUT_CLASSES = [
  'nlsb-mode-empty',
  'nlsb-mode-vip',
  'nlsb-mode-normal',
  'nlsb-mode-packed'
];

/** @typedef {ReturnType<typeof venueRowsFromUserLaneCandidates>[number]} VenueRow */

const VENUE_CSS = `
  .nlsb-root {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    color: #f7f7f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .nlsb-root.nlsb-is-open {
    pointer-events: auto;
  }
  .nlsb-toggle {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 3;
    min-height: 34px;
    padding: 7px 12px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    background: rgba(20, 24, 30, 0.82);
    color: #fff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.24);
    cursor: pointer;
    pointer-events: auto;
    font: inherit;
    font-size: 13px;
    line-height: 1;
    transition: background-color 180ms ease;
  }
  .nlsb-toggle:hover {
    background: rgba(36, 43, 53, 0.94);
  }
  .nlsb-toggle:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-stage {
    position: fixed;
    inset: 0;
    z-index: 1;
    display: grid;
    box-sizing: border-box;
    padding: clamp(52px, 7vh, 76px) clamp(14px, 3vw, 44px) 64px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 24%, rgba(58, 79, 112, 0.34), transparent 38%),
      linear-gradient(180deg, rgba(7, 10, 16, 0.97), rgba(11, 14, 20, 0.99));
    opacity: 0;
    transform: translateY(18px);
    visibility: hidden;
    pointer-events: none;
    overscroll-behavior: contain;
    transition:
      opacity 180ms ease,
      transform 180ms ease,
      visibility 0s linear 180ms;
  }
  .nlsb-root.nlsb-is-open .nlsb-stage {
    opacity: 1;
    transform: translateY(0);
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }
  .nlsb-close {
    position: absolute;
    top: 16px;
    right: 18px;
    z-index: 2;
    min-height: 36px;
    padding: 7px 13px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    background: rgba(18, 23, 31, 0.88);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
  }
  .nlsb-close:hover {
    background: rgba(40, 48, 60, 0.96);
  }
  .nlsb-close:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-stage-layout {
    display: grid;
    width: min(1500px, 100%);
    min-height: 0;
    margin: 0 auto;
    grid-template-rows: minmax(140px, 25vh) minmax(0, 1fr);
    gap: clamp(12px, 2vh, 22px);
  }
  .nlsb-center {
    display: grid;
    width: min(620px, 86vw);
    min-height: 0;
    box-sizing: border-box;
    place-self: center;
    align-content: center;
    gap: 10px;
    padding: clamp(24px, 5vh, 46px) clamp(22px, 5vw, 58px);
    overflow: hidden;
    border: 1px solid rgba(150, 193, 236, 0.34);
    border-radius: 20px;
    background:
      linear-gradient(135deg, rgba(47, 63, 84, 0.92), rgba(19, 26, 37, 0.96)),
      #151d29;
    box-shadow:
      0 24px 70px rgba(0, 0, 0, 0.42),
      inset 0 0 50px rgba(119, 174, 226, 0.08);
    text-align: center;
  }
  .nlsb-center-label {
    color: #9fd1ff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }
  .nlsb-center-title {
    overflow: hidden;
    font-size: clamp(18px, 2.4vw, 28px);
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-center-meta {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    letter-spacing: 0.08em;
  }
  .nlsb-seating {
    display: grid;
    min-height: 0;
    box-sizing: border-box;
    grid-template-areas:
      "header"
      "audience"
      "seats";
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 16px;
    background: rgba(9, 13, 19, 0.78);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.24);
    overscroll-behavior: contain;
  }
  .nlsb-header {
    grid-area: header;
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    box-sizing: border-box;
    padding: 9px 14px;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(14, 19, 27, 0.96);
  }
  .nlsb-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-note {
    color: rgba(255, 255, 255, 0.62);
    font-size: 10px;
    white-space: nowrap;
  }
  .nlsb-seats {
    grid-area: seats;
    position: relative;
    display: flex;
    flex-direction: column-reverse;
    align-items: stretch;
    /* ひな壇を席エリアの縦中央に寄せる(上の黒い空きを埋め、ステージに近づける)。 */
    justify-content: center;
    gap: clamp(10px, 2.4vh, 30px);
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(18px, 4vh, 46px) 18px;
    overflow: auto;
    background:
      radial-gradient(ellipse at 50% 100%, rgba(102, 144, 190, 0.18), transparent 62%),
      repeating-linear-gradient(
        0deg,
        rgba(255, 255, 255, 0.035) 0,
        rgba(255, 255, 255, 0.035) 1px,
        transparent 1px,
        transparent 78px
      );
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    perspective: clamp(680px, 75vw, 1200px);
    perspective-origin: 50% 12%;
    transform-style: preserve-3d;
    contain: layout paint;
  }
  /*
   * 前列を下、後列を上に積むひな壇。段数と人数は buildVenueTiers が決め、
   * transform は奥行きの補助だけにするため reduced-motion でも段組みは崩れない。
   */
  .nlsb-tier {
    display: flex;
    width: max-content;
    min-width: 100%;
    flex: 0 0 auto;
    align-items: flex-end;
    justify-content: center;
    box-sizing: border-box;
    transform-origin: 50% 100%;
    transform-style: preserve-3d;
    transform:
      translateY(var(--nlsb-tier-y, 0))
      translateZ(var(--nlsb-tier-z, 0))
      scale(var(--nlsb-tier-scale, 1));
  }
  .nlsb-tier[hidden] {
    display: none;
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-tier {
    gap: clamp(18px, 3vw, 52px);
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-tier {
    gap: clamp(12px, 2vw, 30px);
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-tier {
    gap: 8px;
  }
  .nlsb-seats.nlsb-mode-empty {
    display: grid;
    place-items: center;
  }
  .nlsb-seat {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    overflow: hidden;
  }
  .nlsb-seat.nlsb-is-empty {
    display: none;
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-seat {
    width: 68px;
    flex: 0 0 68px;
    gap: 4px;
  }
  /* VIP(≤8人): 特大アバターでゆったり=主役感。 */
  .nlsb-seats.nlsb-mode-vip .nlsb-seat {
    width: clamp(120px, 14vw, 168px);
  }
  /* 通常(≤30人): 大きめアバターを画面いっぱいに敷き詰める。 */
  .nlsb-seats.nlsb-mode-normal .nlsb-seat {
    width: clamp(84px, 9vw, 120px);
  }
  .nlsb-icon {
    position: relative;
    display: grid;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 50%;
    color: #fff;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  .nlsb-avatar,
  .nlsb-icon-fallback {
    width: 100%;
    height: 100%;
    border-radius: inherit;
  }
  .nlsb-avatar {
    display: block;
    object-fit: cover;
  }
  .nlsb-avatar[hidden],
  .nlsb-icon-fallback[hidden] {
    display: none;
  }
  .nlsb-icon-fallback {
    display: grid;
    place-items: center;
  }
  .nlsb-name {
    min-width: 0;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.9);
    font-size: 10px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-icon {
    width: clamp(96px, 11vw, 132px);
    height: clamp(96px, 11vw, 132px);
    flex-basis: auto;
    font-size: clamp(32px, 4vw, 44px);
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-name {
    max-width: 100%;
    font-size: 15px;
    font-weight: 700;
    text-align: center;
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-icon {
    width: clamp(64px, 7vw, 92px);
    height: clamp(64px, 7vw, 92px);
    flex-basis: auto;
    font-size: clamp(22px, 3vw, 32px);
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-name {
    max-width: 100%;
    font-size: 12px;
    text-align: center;
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-icon {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
    font-size: 14px;
  }
  .nlsb-seats.nlsb-mode-packed .nlsb-name {
    max-width: 68px;
    text-align: center;
  }
  .nlsb-empty-message {
    display: none;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .nlsb-seats.nlsb-mode-empty .nlsb-empty-message {
    display: block;
  }
  .nlsb-audience {
    grid-area: audience;
    display: flex;
    min-height: 36px;
    box-sizing: border-box;
    align-items: center;
    gap: 10px;
    margin: 10px 14px 0;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 10px;
    background:
      linear-gradient(180deg, rgba(104, 129, 160, 0.1), rgba(255, 255, 255, 0.025)),
      rgba(255, 255, 255, 0.025);
  }
  .nlsb-audience-label,
  .nlsb-audience-more {
    color: rgba(255, 255, 255, 0.58);
    font-size: 10px;
    white-space: nowrap;
  }
  .nlsb-audience-dots {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 4px;
  }
  .nlsb-audience-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: rgba(196, 204, 216, 0.52);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  .nlsb-audience-dot:nth-child(3n) {
    background: rgba(159, 170, 186, 0.42);
  }
  .nlsb-audience[hidden],
  .nlsb-audience-dot[hidden],
  .nlsb-audience-more[hidden] {
    display: none;
  }
  @media (max-width: 900px) {
    .nlsb-toggle {
      right: 10px;
    }
    .nlsb-stage {
      padding-right: 10px;
      padding-left: 10px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(120px, 22vh) minmax(0, 1fr);
    }
    .nlsb-center {
      width: min(620px, 92vw);
      border-radius: 14px;
    }
    .nlsb-seats {
      padding-right: 10px;
      padding-left: 10px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-tier {
      gap: 4px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-seat {
      width: 54px;
      flex-basis: 54px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-icon {
      width: 32px;
      height: 32px;
      flex-basis: 32px;
      font-size: 11px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-name,
    .nlsb-seats.nlsb-mode-normal .nlsb-name {
      display: none;
    }
    .nlsb-seats.nlsb-mode-normal .nlsb-seat {
      min-width: 44px;
    }
  }
  @media (max-height: 560px) {
    .nlsb-stage {
      padding-top: 48px;
      padding-bottom: 54px;
    }
    .nlsb-stage-layout {
      grid-template-rows: minmax(100px, 22vh) minmax(0, 1fr);
      gap: 10px;
    }
    .nlsb-center {
      gap: 5px;
      padding-top: 14px;
      padding-bottom: 14px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-toggle,
    .nlsb-stage,
    .nlsb-seat {
      transition: none;
    }
    .nlsb-tier {
      transform: none;
    }
  }
`;

/**
 * 名前や userId から軽量アイコン用の色を安定生成する。
 * @param {string} key
 * @returns {string}
 */
function colorFromKey(key) {
  const value = String(key || 'venue');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${(hash >>> 0) % 360}, 68%, 46%)`;
}

/**
 * @returns {string}
 */
function liveIdFromPathname() {
  const match = String(location.pathname || '').match(/^\/watch\/(lv\d{1,15})(?:\/|$)/i);
  return match ? match[1].toLowerCase() : '';
}

function ensureVenueStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = VENUE_CSS;
  (document.head || document.documentElement).appendChild(style);
}

/**
 * @param {number} seatIndex
 */
function createSeatNode(seatIndex) {
  const seat = document.createElement('div');
  seat.className = 'nlsb-seat nlsb-is-empty';
  seat.dataset.seatIndex = String(seatIndex);
  seat.setAttribute('aria-hidden', 'true');

  const icon = document.createElement('span');
  icon.className = 'nlsb-icon';
  const avatar = document.createElement('img');
  avatar.className = 'nlsb-avatar';
  avatar.alt = '';
  avatar.loading = 'lazy';
  avatar.hidden = true;
  const fallback = document.createElement('span');
  fallback.className = 'nlsb-icon-fallback';
  icon.append(avatar, fallback);
  const name = document.createElement('span');
  name.className = 'nlsb-name';
  seat.append(icon, name);
  avatar.addEventListener('load', () => {
    if (avatar.dataset.avatar !== avatar.getAttribute('src')) return;
    avatar.hidden = false;
    fallback.hidden = true;
  });
  avatar.addEventListener('error', () => {
    if (avatar.dataset.avatar !== avatar.getAttribute('src')) return;
    avatar.hidden = true;
    fallback.hidden = false;
  });
  return { seat, icon, avatar, fallback, name };
}

/**
 * ニコ生 watch ページに独立 fixed レイヤーの会場モード UI を1個だけ追加する。
 */
export function mountVenueBarButton() {
  if (!liveIdFromPathname()) return;
  if (document.getElementById(ROOT_ID)) return;
  if (!document.documentElement) return;

  ensureVenueStyle();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.className = 'nlsb-root nlsb-full';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nlsb-toggle';
  toggle.textContent = '🏟 会場モード';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'nlsb-venue-stage');

  const stage = document.createElement('section');
  stage.id = 'nlsb-venue-stage';
  stage.className = 'nlsb-stage';
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-modal', 'true');
  stage.setAttribute('aria-label', '全画面会場モード');
  stage.setAttribute('aria-hidden', 'true');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nlsb-close';
  close.textContent = '✕ 閉じる';

  const stageLayout = document.createElement('div');
  stageLayout.className = 'nlsb-stage-layout';

  const center = document.createElement('div');
  center.className = 'nlsb-center';
  const centerLabel = document.createElement('div');
  centerLabel.className = 'nlsb-center-label';
  centerLabel.textContent = '配信者ステージ';
  const centerTitle = document.createElement('div');
  centerTitle.className = 'nlsb-center-title';
  centerTitle.textContent = String(document.title || '').trim() || '配信中の番組';
  const centerMeta = document.createElement('div');
  centerMeta.className = 'nlsb-center-meta';
  centerMeta.textContent = liveIdFromPathname();
  center.append(centerLabel, centerTitle, centerMeta);

  const seating = document.createElement('div');
  seating.className = 'nlsb-seating';

  const header = document.createElement('div');
  header.className = 'nlsb-header';
  const title = document.createElement('div');
  title.className = 'nlsb-title';
  title.textContent = '会場参加者 0人';
  const note = document.createElement('div');
  note.className = 'nlsb-note';
  note.textContent = '全コメント集計・最大150席';
  header.append(title, note);

  const seatsHost = document.createElement('div');
  seatsHost.className = 'nlsb-seats nlsb-mode-empty';
  /** @type {HTMLDivElement[]} */
  const tierNodes = [];
  for (let i = 0; i < 5; i += 1) {
    const tier = document.createElement('div');
    tier.className = 'nlsb-tier';
    tier.dataset.tierIndex = String(i);
    tier.hidden = true;
    tierNodes.push(tier);
    seatsHost.appendChild(tier);
  }
  /** @type {ReturnType<typeof createSeatNode>[]} */
  const seatNodes = [];
  for (let i = 0; i < VENUE_FULLSCREEN_MAX_SEATS; i += 1) {
    const node = createSeatNode(i);
    seatNodes.push(node);
    tierNodes[0].appendChild(node.seat);
  }

  const emptyMessage = document.createElement('div');
  emptyMessage.className = 'nlsb-empty-message';
  emptyMessage.textContent = 'まだ名前付きの参加者がいません';
  seatsHost.appendChild(emptyMessage);

  const audience = document.createElement('div');
  audience.className = 'nlsb-audience';
  audience.hidden = true;
  const audienceLabel = document.createElement('span');
  audienceLabel.className = 'nlsb-audience-label';
  audienceLabel.textContent = '観客席';
  const audienceDots = document.createElement('div');
  audienceDots.className = 'nlsb-audience-dots';
  /** @type {HTMLSpanElement[]} */
  const audienceDotNodes = [];
  for (let i = 0; i < AUDIENCE_DOT_MAX; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'nlsb-audience-dot';
    dot.hidden = true;
    dot.setAttribute('aria-hidden', 'true');
    audienceDotNodes.push(dot);
    audienceDots.appendChild(dot);
  }
  const audienceMore = document.createElement('span');
  audienceMore.className = 'nlsb-audience-more';
  audienceMore.hidden = true;
  audience.append(audienceLabel, audienceDots, audienceMore);

  seating.append(header, seatsHost, audience);
  stageLayout.append(center, seating);
  stage.append(close, stageLayout);
  root.append(toggle, stage);
  document.documentElement.appendChild(root);

  let open = false;
  let userChangedOpen = false;
  let aggregateTimer = 0;
  let aggregateInFlight = false;
  let activeLiveId = '';
  let escapeListening = false;
  /** @type {VenueRow[]} */
  let baseRows = [];
  /** @type {Map<string, number>} */
  let seatByKey = new Map();

  /**
   * @param {VenueRow[]} rows
   */
  const renderSeats = (rows) => {
    const seating = buildVenueSeating(rows, {
      maxSeats: VENUE_FULLSCREEN_MAX_SEATS,
      prevSeatByKey: seatByKey,
      isGenericName: isGenericComeviewName
    });
    seatByKey = seating.seatByKey;
    seatsHost.classList.remove(...VENUE_LAYOUT_CLASSES);
    seatsHost.classList.add(`nlsb-mode-${seating.layoutMode}`);
    // アリーナ席は名前のある参加者だけ(ユーザー方針: 匿名はアリーナに座らせない)。
    // 匿名は後方の観客席へ小さなドットとして表示し、人数感だけ残す。
    const anon = seating.anonymousCount || 0;
    title.textContent =
      anon > 0
        ? `会場参加者 ${seating.participantCount}人 ・ ほか観客 ${anon}人`
        : `会場参加者 ${seating.participantCount}人`;
    audience.hidden = anon === 0;
    audience.setAttribute('aria-label', `観客席 ${anon}人`);
    const visibleAudienceDots = Math.min(anon, AUDIENCE_DOT_MAX);
    for (let i = 0; i < audienceDotNodes.length; i += 1) {
      audienceDotNodes[i].hidden = i >= visibleAudienceDots;
    }
    const remainingAudience = Math.max(0, anon - AUDIENCE_DOT_MAX);
    audienceMore.hidden = remainingAudience === 0;
    audienceMore.textContent = remainingAudience > 0 ? `ほか観客 ${remainingAudience}人` : '';

    for (const node of seatNodes) {
      node.seat.classList.add('nlsb-is-empty');
      node.seat.setAttribute('aria-hidden', 'true');
      node.seat.removeAttribute('title');
      delete node.seat.dataset.tierIndex;
    }

    const tiers = buildVenueTiers(seating.seats.length);
    for (let i = 0; i < tierNodes.length; i += 1) {
      const tierNode = tierNodes[i];
      const tier = tiers[i];
      tierNode.hidden = !tier;
      if (!tier) {
        tierNode.style.removeProperty('--nlsb-tier-y');
        tierNode.style.removeProperty('--nlsb-tier-z');
        tierNode.style.removeProperty('--nlsb-tier-scale');
        continue;
      }
      const translateY = -Math.round(tier.depth * 18);
      const translateZ = -Math.round(tier.depth * 72);
      tierNode.style.setProperty('--nlsb-tier-y', `${translateY}px`);
      tierNode.style.setProperty('--nlsb-tier-z', `${translateZ}px`);
      tierNode.style.setProperty('--nlsb-tier-scale', String(tier.scale));
    }

    let seatCursor = 0;
    for (const tier of tiers) {
      const tierNode = tierNodes[tier.rowIndex];
      for (let tierSeatIndex = 0; tierSeatIndex < tier.count; tierSeatIndex += 1) {
        const entry = seating.seats[seatCursor];
        seatCursor += 1;
        if (!entry) continue;
        const node = seatNodes[entry.seatIndex];
        const participant = entry.participant;
        tierNode.appendChild(node.seat);
        node.seat.dataset.tierIndex = String(tier.rowIndex);
        const i = entry.seatIndex;
        const displayName = String(participant.name || '').trim() || `会場${i + 1}`;
        // 色は userId 優先で生成(同名の別人や匿名でも人ごとに色が変わる)。
        const colorKey = participant.userId || participant.name || participant.key;
        node.icon.style.backgroundColor = colorFromKey(colorKey);
        node.fallback.textContent = Array.from(displayName)[0] || '会';
        const avatarUrl = String(participant.avatar || '').trim();
        const avatarSrc =
          avatarUrl || anonymousIdenticonDataUrl(String(participant.userId || '').trim(), 64);
        if (avatarSrc) {
          if (node.avatar.dataset.avatar !== avatarSrc) {
            node.avatar.dataset.avatar = avatarSrc;
            node.avatar.src = avatarSrc;
            // data URL(ゆっくり顔・Identicon)は必ず描画できるので load を待たず即表示する。
            // 外部 http サムネのみ load/error イベントで表示/フォールバックを切り替える。
            if (avatarSrc.startsWith('data:')) {
              node.avatar.hidden = false;
              node.fallback.hidden = true;
            } else {
              node.avatar.hidden = true;
              node.fallback.hidden = false;
            }
          }
        } else {
          node.avatar.hidden = true;
          node.fallback.hidden = false;
          node.avatar.dataset.avatar = '';
          node.avatar.removeAttribute('src');
        }
        node.name.textContent = displayName;
        node.seat.title = displayName;
        node.seat.classList.remove('nlsb-is-empty');
        node.seat.setAttribute('aria-hidden', 'false');
      }
    }
  };

  const aggregateParticipants = async () => {
    if (!open || aggregateInFlight) return;
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    aggregateInFlight = true;
    try {
      if (activeLiveId !== liveId) {
        activeLiveId = liveId;
        baseRows = [];
        seatByKey = new Map();
        renderSeats(baseRows);
      }
      const result = await readChunkedComments(
        liveId,
        commentsStorageKey(liveId),
        (keys) => chrome.storage.local.get(keys)
      );
      if (!open || liveIdFromPathname() !== liveId) return;
      const candidates = userLaneCandidatesFromStorage(result.rows, liveId, {
        requireText: false
      });
      baseRows = venueRowsFromUserLaneCandidates(candidates);
      renderSeats(baseRows);
    } catch {
      // 拡張更新中など一時的に全チャンクを読めない場合は次回集計へ任せる。
    } finally {
      aggregateInFlight = false;
    }
  };

  const stopAggregation = () => {
    if (!aggregateTimer) return;
    clearInterval(aggregateTimer);
    aggregateTimer = 0;
  };

  const startAggregation = () => {
    if (aggregateTimer) return;
    void aggregateParticipants();
    aggregateTimer = window.setInterval(() => {
      void aggregateParticipants();
    }, AGGREGATE_INTERVAL_MS);
  };

  /** @param {KeyboardEvent} event */
  const onEscapeKey = (event) => {
    if (event.key !== 'Escape' || !open) return;
    userChangedOpen = true;
    setOpen(false, true);
  };

  const addEscapeListener = () => {
    if (escapeListening) return;
    window.addEventListener('keydown', onEscapeKey);
    escapeListening = true;
  };

  const removeEscapeListener = () => {
    if (!escapeListening) return;
    window.removeEventListener('keydown', onEscapeKey);
    escapeListening = false;
  };

  /**
   * @param {boolean} nextOpen
   * @param {boolean} persist
   */
  const setOpen = (nextOpen, persist) => {
    open = nextOpen === true;
    root.classList.toggle('nlsb-is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    stage.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      addEscapeListener();
      startAggregation();
    } else {
      removeEscapeListener();
      stopAggregation();
    }
    if (persist) {
      void chrome.storage.local.set({ [OPEN_STORAGE_KEY]: open }).catch(() => {});
    }
  };

  toggle.addEventListener('click', () => {
    userChangedOpen = true;
    setOpen(!open, true);
  });
  close.addEventListener('click', () => {
    userChangedOpen = true;
    setOpen(false, true);
  });
  window.addEventListener(
    'pagehide',
    () => {
      stopAggregation();
      removeEscapeListener();
    },
    { once: true }
  );

  void chrome.storage.local
    .get(OPEN_STORAGE_KEY)
    .then((bag) => {
      if (!userChangedOpen) setOpen(bag?.[OPEN_STORAGE_KEY] === true, false);
    })
    .catch(() => {});
}
