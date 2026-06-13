import { normalizeComeviewRow, isGenericComeviewName } from '../lib/comeviewRows.js';
import { buildVenueSeating, VENUE_MAX_SEATS } from '../lib/venueSeats.js';
import { commentDbSummaryKey } from '../lib/storageKeys.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';

const ROOT_ID = 'nlsb-venue-root';
const STYLE_ID = 'nlsb-venue-style';
const OPEN_STORAGE_KEY = 'nls_venue_open';
const POLL_INTERVAL_MS = 1500;
const AUDIENCE_DOT_MAX = 60;
const VENUE_LAYOUT_CLASSES = [
  'nlsb-mode-empty',
  'nlsb-mode-vip',
  'nlsb-mode-normal',
  'nlsb-mode-packed'
];

/** @typedef {NonNullable<ReturnType<typeof normalizeComeviewRow>>} VenueRow */

const VENUE_CSS = `
  .nlsb-root {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    color: #f7f7f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .nlsb-toggle {
    position: absolute;
    right: 16px;
    bottom: 16px;
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
    transition: bottom 180ms ease, background-color 180ms ease;
  }
  .nlsb-toggle:hover {
    background: rgba(36, 43, 53, 0.94);
  }
  .nlsb-toggle:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-root.nlsb-is-open .nlsb-toggle {
    bottom: 222px;
  }
  .nlsb-bar {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 210px;
    box-sizing: border-box;
    padding: 9px 14px 10px;
    background: rgba(12, 16, 22, 0.9);
    border-top: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.28);
    transform: translateY(100%);
    visibility: hidden;
    pointer-events: none;
    transition: transform 180ms ease, visibility 0s linear 180ms;
  }
  .nlsb-root.nlsb-is-open .nlsb-bar {
    transform: translateY(0);
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }
  .nlsb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    margin-bottom: 6px;
    gap: 12px;
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
    position: relative;
    height: 116px;
    box-sizing: border-box;
  }
  .nlsb-seats.nlsb-mode-packed {
    display: grid;
    grid-template-columns: repeat(25, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 4px 5px;
  }
  .nlsb-seats.nlsb-mode-vip,
  .nlsb-seats.nlsb-mode-normal {
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    align-items: center;
    justify-content: center;
  }
  .nlsb-seats.nlsb-mode-vip {
    gap: 10px 28px;
  }
  .nlsb-seats.nlsb-mode-normal {
    gap: 6px 12px;
  }
  .nlsb-seats.nlsb-mode-empty {
    display: grid;
    place-items: center;
  }
  .nlsb-seat {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 3px;
    overflow: hidden;
  }
  .nlsb-seat.nlsb-is-empty {
    visibility: hidden;
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-seat,
  .nlsb-seats.nlsb-mode-normal .nlsb-seat {
    flex-direction: column;
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-seat {
    width: 112px;
    gap: 6px;
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-seat {
    flex: 0 1 72px;
    gap: 3px;
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-seat.nlsb-is-empty,
  .nlsb-seats.nlsb-mode-normal .nlsb-seat.nlsb-is-empty,
  .nlsb-seats.nlsb-mode-empty .nlsb-seat {
    display: none;
  }
  .nlsb-icon {
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
    width: 64px;
    height: 64px;
    flex-basis: 64px;
    font-size: 24px;
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-name {
    max-width: 112px;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-icon {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    font-size: 16px;
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-name {
    max-width: 72px;
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
    display: flex;
    min-height: 36px;
    box-sizing: border-box;
    align-items: center;
    gap: 10px;
    margin-top: 5px;
    padding: 5px 9px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.035);
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
    .nlsb-bar {
      padding-right: 8px;
      padding-left: 8px;
    }
    .nlsb-seats {
      column-gap: 2px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-icon {
      width: 24px;
      height: 24px;
      flex-basis: 24px;
      font-size: 10px;
    }
    .nlsb-seats.nlsb-mode-packed .nlsb-name,
    .nlsb-seats.nlsb-mode-normal .nlsb-name {
      display: none;
    }
    .nlsb-seats.nlsb-mode-normal .nlsb-seat {
      flex-basis: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-toggle,
    .nlsb-bar {
      transition: none;
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
  const name = document.createElement('span');
  name.className = 'nlsb-name';
  seat.append(icon, name);
  return { seat, icon, name };
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
  root.className = 'nlsb-root';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nlsb-toggle';
  toggle.textContent = '🏟 会場モード';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'nlsb-venue-bar');

  const bar = document.createElement('section');
  bar.id = 'nlsb-venue-bar';
  bar.className = 'nlsb-bar';
  bar.setAttribute('aria-label', '会場参加者');

  const header = document.createElement('div');
  header.className = 'nlsb-header';
  const title = document.createElement('div');
  title.className = 'nlsb-title';
  title.textContent = '会場参加者 0人';
  const note = document.createElement('div');
  note.className = 'nlsb-note';
  note.textContent = '発言した参加者を最大50席で表示';
  header.append(title, note);

  const seatsHost = document.createElement('div');
  seatsHost.className = 'nlsb-seats nlsb-mode-empty';
  /** @type {ReturnType<typeof createSeatNode>[]} */
  const seatNodes = [];
  for (let i = 0; i < VENUE_MAX_SEATS; i += 1) {
    const node = createSeatNode(i);
    seatNodes.push(node);
    seatsHost.appendChild(node.seat);
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

  bar.append(header, seatsHost, audience);
  root.append(toggle, bar);
  document.documentElement.appendChild(root);

  let open = false;
  let userChangedOpen = false;
  let pollTimer = 0;
  let pollInFlight = false;
  let activeLiveId = '';
  /** @type {Map<string, number>} */
  let seatByKey = new Map();

  /**
   * @param {VenueRow[]} rows
   */
  const renderSeats = (rows) => {
    const seating = buildVenueSeating(rows, {
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

    const byIndex = new Map(seating.seats.map((entry) => [entry.seatIndex, entry.participant]));
    for (let i = 0; i < seatNodes.length; i += 1) {
      const node = seatNodes[i];
      const participant = byIndex.get(i);
      if (!participant) {
        node.seat.classList.add('nlsb-is-empty');
        node.seat.setAttribute('aria-hidden', 'true');
        node.seat.removeAttribute('title');
        continue;
      }
      const displayName = String(participant.name || '').trim() || `会場${i + 1}`;
      // 色は userId 優先で生成(同名の別人や匿名でも人ごとに色が変わる)。
      const colorKey = participant.userId || participant.name || participant.key;
      node.icon.style.backgroundColor = colorFromKey(colorKey);
      node.icon.textContent = Array.from(displayName)[0] || '会';
      node.name.textContent = displayName;
      node.seat.title = displayName;
      node.seat.classList.remove('nlsb-is-empty');
      node.seat.setAttribute('aria-hidden', 'false');
    }
  };

  const refreshSeats = async () => {
    if (!open || pollInFlight) return;
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    pollInFlight = true;
    try {
      if (activeLiveId !== liveId) {
        activeLiveId = liveId;
        seatByKey = new Map();
      }
      // 入力源は2系統: ①テール nls_ctail_<lv>(ライブ新着・安く追記される・会場向き)
      //   ②サマリ recent(環境により未生成のことがある)。テールが空ならサマリへフォールバック。
      const summaryKey = commentDbSummaryKey(liveId);
      const tailKey = tailStorageKey(liveId);
      const bag = await chrome.storage.local.get([summaryKey, tailKey]);
      if (!open) return;
      const tail = Array.isArray(bag?.[tailKey]) ? bag[tailKey] : [];
      const summary = /** @type {{ recent?: unknown[] }|undefined} */ (bag?.[summaryKey]);
      const recent = Array.isArray(summary?.recent) ? summary.recent : [];
      const source = tail.length > 0 ? tail : recent;
      /** @type {VenueRow[]} */
      const rows = [];
      for (const raw of source) {
        if (!raw || typeof raw !== 'object') continue;
        const row = normalizeComeviewRow(/** @type {Record<string, unknown>} */ (raw));
        if (row) rows.push(row);
      }
      renderSeats(rows);
    } catch {
      // 拡張更新中など一時的に storage を読めない場合は次回ポーリングへ任せる。
    } finally {
      pollInFlight = false;
    }
  };

  const stopPolling = () => {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = 0;
  };

  const startPolling = () => {
    if (pollTimer) return;
    void refreshSeats();
    pollTimer = window.setInterval(() => {
      void refreshSeats();
    }, POLL_INTERVAL_MS);
  };

  /**
   * @param {boolean} nextOpen
   * @param {boolean} persist
   */
  const setOpen = (nextOpen, persist) => {
    open = nextOpen === true;
    root.classList.toggle('nlsb-is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) startPolling();
    else stopPolling();
    if (persist) {
      void chrome.storage.local.set({ [OPEN_STORAGE_KEY]: open }).catch(() => {});
    }
  };

  toggle.addEventListener('click', () => {
    userChangedOpen = true;
    setOpen(!open, true);
  });
  window.addEventListener('pagehide', stopPolling, { once: true });

  void chrome.storage.local
    .get(OPEN_STORAGE_KEY)
    .then((bag) => {
      if (!userChangedOpen) setOpen(bag?.[OPEN_STORAGE_KEY] === true, false);
    })
    .catch(() => {});
}
