import { isGenericComeviewName } from '../lib/comeviewRows.js';
import {
  buildVenueSeating,
  buildVenueTiers,
  collectAudienceFaceUserIds,
  VENUE_AUDIENCE_FACE_MAX,
  VENUE_FULLSCREEN_MAX_SEATS,
  venueRowsFromUserLaneCandidates
} from '../lib/venueSeats.js';
import { userLaneCandidatesFromStorage } from '../lib/userLaneCandidatesFromStorage.js';
import { readChunkedComments } from '../lib/commentChunkStore.js';
import {
  commentDbSummaryKey,
  commentsStorageKey,
  KEY_USER_COMMENT_PROFILE_CACHE
} from '../lib/storageKeys.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { pickNewVenueSpeech, mergeSpeakersIntoVenueRows } from '../lib/venueSpeech.js';
import { enrichVenueRowsWithProfileAvatars } from '../lib/venueAvatar.js';
import { nicoUserPageUrl, anonymousDisplayLabel } from '../lib/nicoUserPage.js';
import {
  seatsPerRow,
  resolveVisibleArenaCount,
  resolveVisibleAudienceCount,
  selectStableVisibleMembers
} from '../lib/venueViewport.js';
import {
  bubbleAnchorForSeatRect,
  resolveBubbleY,
  BUBBLE_ANCHOR_GAP
} from '../lib/venueBubbleLayout.js';

const ROOT_ID = 'nlsb-venue-root';
const STYLE_ID = 'nlsb-venue-style';
const OPEN_STORAGE_KEY = 'nls_venue_open';
const AGGREGATE_INTERVAL_MS = 30_000;
const SPEECH_INTERVAL_MS = 1_500;
const BUBBLE_LIFETIME_MS = 4_000;
const BUBBLE_FADE_MS = 600;
const BUBBLE_MAX = 6;
const BUBBLE_TEXT_MAX = 36;
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
    /*
     * ユーザー方針(2026-06-13 強)「配信の画面と実際の画面にスモークをかけないで・ちゃんと
     * 見たい」: 全面を覆う暗幕(linear-gradient)を撤去。背景は透明にして、後ろのニコ生映像と
     * 本家UIをそのまま見せる。会場の雰囲気は上端・下端の淡いステージ照明だけで出し、中央の
     * 映像にはかけない(上下のグラデは画面端で transparent に消えるので映像本体は素通し)。
     */
    background:
      radial-gradient(ellipse 70% 24% at 50% 0%, rgba(120, 165, 224, 0.16), transparent 70%),
      radial-gradient(ellipse 90% 26% at 50% 100%, rgba(150, 120, 200, 0.14), transparent 72%);
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
  /*
   * 会議確定B(2026-06-13): 中央に「映像セーフエリア」を確保して配信映像を見せる。
   *   上端=観客帯(コンパクト1行)、中央=何も置かない空き(映像が透ける)、下端=ひな壇。
   *   観客帯とひな壇を画面の上下に逃がし、中央 1fr を空けることで映像が常に見える。
   */
  .nlsb-stage-layout {
    display: grid;
    width: min(1500px, 100%);
    height: 100%;
    min-height: 0;
    margin: 0 auto;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "audience"
      "safe"
      "seating";
    gap: clamp(8px, 1.5vh, 16px);
    /*
     * 親は pointer-events:auto のまま(none にすると実マウスのヒットテストが親で止まり、
     * 子の <a> リンクが「クリックできない」になる=ユーザー不満の原因だった)。
     * 中央の映像を触りたいときは下の .nlsb-safe-area だけ none で透過させる。
     */
    pointer-events: auto;
  }
  /* 中央の映像セーフエリア: UI を一切置かず、クリックを透過して映像/本家UIを直接触れる。 */
  .nlsb-safe-area {
    grid-area: safe;
    min-height: 0;
    pointer-events: none;
  }
  /* 配信者ステージカードは映像を覆うので撤去(中央は映像そのものを見せる)。 */
  .nlsb-center {
    display: none;
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
  /*
   * 会場席は画面下端のひな壇だけにする(中央の映像セーフエリアは空ける)。高さは
   * 下端 max 35vh に制限し、配信映像を覆わない(会議確定B「ひな壇は下端 30〜35vh」)。
   */
  .nlsb-seating {
    grid-area: seating;
    align-self: end;
    display: grid;
    width: 100%;
    max-height: 35vh;
    min-height: 0;
    box-sizing: border-box;
    grid-template-areas:
      "header"
      "seats";
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    /* スモークを薄く: 名前が読める最低限の暗さだけ残し、下の映像を極力透けさせる。 */
    background: rgba(9, 13, 19, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    overscroll-behavior: contain;
    pointer-events: auto;
  }
  .nlsb-header {
    grid-area: header;
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 38px;
    box-sizing: border-box;
    padding: 7px 14px;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(14, 19, 27, 0.55);
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
  .nlsb-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
  }
  /* コメビュ起動ボタン(会場ヘッダー右)。読み上げ付きコメントビューアを別窓で開く。 */
  .nlsb-comeview-btn {
    flex: 0 0 auto;
    min-height: 28px;
    padding: 4px 11px;
    border: 1px solid rgba(141, 200, 255, 0.4);
    border-radius: 999px;
    background: rgba(30, 41, 56, 0.7);
    color: #cfe6ff;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: auto;
  }
  .nlsb-comeview-btn:hover {
    background: rgba(48, 64, 86, 0.92);
    border-color: rgba(141, 200, 255, 0.6);
  }
  .nlsb-comeview-btn:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-seats {
    grid-area: seats;
    position: relative;
    display: flex;
    flex-direction: column-reverse;
    align-items: stretch;
    justify-content: flex-end;
    gap: clamp(6px, 1.4vh, 16px);
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(10px, 2vh, 22px) 14px;
    /*
     * 横スクロールバー根絶(ユーザー不満「位置がずれてスクロールバーが出て変な動きで
     * 見えなくなる」): 同時表示人数は selectStableVisibleMembers で行に収まる数に制限済み
     * なので横溢れは起きないが、保険として overflow-x:hidden で横スクロールを構造的に殺す。
     * 縦も clip(段数が増えても下端 35vh に収め、映像へはみ出さない)。
     */
    overflow-x: hidden;
    overflow-y: hidden;
    background:
      radial-gradient(ellipse at 50% 100%, rgba(102, 144, 190, 0.16), transparent 62%);
    overscroll-behavior: contain;
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
    width: 100%;
    max-width: 100%;
    flex: 0 0 auto;
    /* 1段に収まらない時は折り返す(横にはみ出して横スクロールを出さない=ユーザー不満の根治)。 */
    flex-wrap: wrap;
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
    position: relative;
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    overflow: visible;
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
    display: block;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.9);
    font-size: 10px;
    line-height: 1.2;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* 数値 ID 持ち=クリックでユーザーページへ飛べるリンク。会場は開時のみ操作可能。 */
  .nlsb-name-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .nlsb-name-link:hover {
    color: #bfe1ff;
    text-decoration: underline;
  }
  .nlsb-name-link:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
    border-radius: 3px;
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
  /*
   * 会議確定A: 吹き出し専用の最上位レイヤー。席コンテナ(.nlsb-seats overflow:hidden)の
   * 外・stage 直下に置き、セリフがクリップされない/アバターに潜らない。
   */
  .nlsb-bubble-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    overflow: visible;
    pointer-events: none;
  }
  /*
   * 吹き出し本体。レイヤー基準で left/top を JS が席頭上にセットする。
   * translate(-50%, -100%) で「指定点が吹き出しの下辺中央」になる。
   * 会議確定B: font 18px(12px から大幅拡大)・最大2行・読みやすさ最優先(星野ロミ流)。
   */
  .nlsb-bubble {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 5;
    box-sizing: border-box;
    width: max-content;
    max-width: min(30ch, 40vw);
    padding: 9px 13px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    border: 1px solid rgba(20, 29, 42, 0.16);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.97);
    color: #141d28;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
    font-size: clamp(16px, 1.4vw, 20px);
    font-weight: 700;
    line-height: 1.4;
    opacity: 1;
    overflow-wrap: anywhere;
    pointer-events: none;
    text-shadow: none;
    transform: translate(-50%, -100%);
    white-space: normal;
    animation: nlsb-bubble-pop 160ms ease-out;
    transition: opacity ${BUBBLE_FADE_MS}ms ease;
  }
  .nlsb-bubble::after {
    position: absolute;
    top: 100%;
    left: 50%;
    width: 0;
    height: 0;
    border: 7px solid transparent;
    border-top-color: rgba(255, 255, 255, 0.97);
    content: "";
    transform: translateX(-50%);
  }
  .nlsb-bubble.nlsb-is-leaving {
    opacity: 0;
  }
  @keyframes nlsb-bubble-pop {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-100% + 6px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%);
    }
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
  /*
   * 観客席は画面最上部のコンパクトな1行帯にする(会議確定B「映像を覆わない・1〜2行」)。
   * flex-wrap を切って 1 行に固定し、はみ出しは overflow:hidden でクリップ。高さが伸びて
   * 映像を覆うことが構造的に起きない。残りは「ほか観客 N 人」テキストで示す。
   */
  .nlsb-audience {
    grid-area: audience;
    align-self: start;
    display: flex;
    height: 44px;
    box-sizing: border-box;
    align-items: center;
    gap: 10px;
    margin: 0;
    padding: 5px 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 10px;
    /* 観客帯も薄く=上の映像を透けさせる。 */
    background:
      linear-gradient(180deg, rgba(104, 129, 160, 0.1), rgba(255, 255, 255, 0.02)),
      rgba(9, 13, 19, 0.26);
    pointer-events: auto;
  }
  .nlsb-audience-label,
  .nlsb-audience-more {
    flex: 0 0 auto;
    color: rgba(255, 255, 255, 0.62);
    font-size: 10px;
    white-space: nowrap;
  }
  .nlsb-audience-dots {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
    overflow: hidden;
  }
  .nlsb-audience-dot {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border-radius: 50%;
    background: rgba(196, 204, 216, 0.2);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .nlsb-audience-face {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    .nlsb-seat,
    .nlsb-bubble {
      transition: none;
    }
    .nlsb-tier {
      transform: none;
    }
    .nlsb-bubble {
      animation: none;
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
  // 原則「サムネ・ハンドルネーム・ID アンカー必須」: 名前はリンク化できる <a> で持つ。
  //   数値 ID があるときだけ href を入れてユーザーページへ。匿名は href なし(ただの文字)。
  const name = document.createElement('a');
  name.className = 'nlsb-name';
  name.target = '_blank';
  name.rel = 'noopener noreferrer';
  seat.append(icon, name);
  avatar.addEventListener('load', () => {
    if (avatar.dataset.avatar !== avatar.getAttribute('src')) return;
    avatar.hidden = false;
    fallback.hidden = true;
  });
  avatar.addEventListener('error', () => {
    if (avatar.dataset.avatar !== avatar.getAttribute('src')) return;
    // http サムネが読めない(dead リンク/403)とき、色アイコンでなくゆっくり顔へ差し替える。
    //   会場が色アイコンだらけにならず華やかに。差し替え後の data URL は必ず描画できる。
    const face = avatar.dataset.fallbackFace || '';
    if (face && avatar.getAttribute('src') !== face) {
      avatar.dataset.avatar = face;
      avatar.src = face;
      avatar.hidden = false;
      fallback.hidden = true;
      return;
    }
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
  // ヘッダー右側: コメビュ起動ボタン + 集計メモ。
  const headerRight = document.createElement('div');
  headerRight.className = 'nlsb-header-right';
  const comeviewBtn = document.createElement('button');
  comeviewBtn.type = 'button';
  comeviewBtn.className = 'nlsb-comeview-btn';
  comeviewBtn.textContent = '💬 コメビュ';
  comeviewBtn.title = '読み上げ付きコメントビューア(別ウィンドウ)を開く';
  comeviewBtn.addEventListener('click', () => {
    // content script は chrome.windows を直接呼べないので SW へ依頼(status.html と同経路)。
    try {
      chrome.runtime.sendMessage({ type: 'NLS_OPEN_COMEVIEW', liveId: liveIdFromPathname() });
    } catch {
      // 拡張コンテキスト切れ等は黙って無視(次回クリックで再試行)。
    }
  });
  const note = document.createElement('div');
  note.className = 'nlsb-note';
  note.textContent = '全コメント集計・最大150席';
  headerRight.append(comeviewBtn, note);
  header.append(title, headerRight);

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
  /** @type {HTMLImageElement[]} */
  const audienceFaceNodes = [];
  for (let i = 0; i < VENUE_AUDIENCE_FACE_MAX; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'nlsb-audience-dot';
    dot.hidden = true;
    dot.setAttribute('aria-hidden', 'true');
    const face = document.createElement('img');
    face.className = 'nlsb-audience-face';
    face.alt = '';
    face.loading = 'lazy';
    face.setAttribute('aria-hidden', 'true');
    dot.appendChild(face);
    audienceDotNodes.push(dot);
    audienceFaceNodes.push(face);
    audienceDots.appendChild(dot);
  }
  const audienceMore = document.createElement('span');
  audienceMore.className = 'nlsb-audience-more';
  audienceMore.hidden = true;
  audience.append(audienceLabel, audienceDots, audienceMore);

  // 中央の映像セーフエリア(UI を置かず、配信映像を常に見せる)。
  const safeArea = document.createElement('div');
  safeArea.className = 'nlsb-safe-area';
  safeArea.setAttribute('aria-hidden', 'true');

  // seating は下端のひな壇だけ(header + seats)。観客帯は最上部・映像は中央。
  seating.append(header, seatsHost);
  // center は CSS で display:none(撤去)だが、互換のため DOM には残す。
  stageLayout.append(audience, safeArea, seating, center);
  // 吹き出し専用の最上位レイヤー(会議確定A): 席コンテナの overflow:hidden の外に置くことで
  //   セリフがクリップされず・アバターに潜らない。席の座標を測ってこの上に頭上配置する。
  const bubbleLayer = document.createElement('div');
  bubbleLayer.className = 'nlsb-bubble-layer';
  bubbleLayer.setAttribute('aria-live', 'polite');
  stage.append(close, stageLayout, bubbleLayer);
  root.append(toggle, stage);
  document.documentElement.appendChild(root);

  let open = false;
  let userChangedOpen = false;
  let aggregateTimer = 0;
  let aggregateInFlight = false;
  let speechTimer = 0;
  let speechInFlight = false;
  let speechGeneration = 0;
  let speechLiveId = '';
  /** @type {{ seenKeys: Set<string>|null, primed: boolean }} */
  let speechState = { seenKeys: null, primed: false };
  let activeLiveId = '';
  let escapeListening = false;
  /** @type {VenueRow[]} */
  let baseRows = [];
  // ユーザー方針「しゃべった匿名もアリーナに出して吹かせる」: 発言した userId を蓄積し、
  //   buildVenueSeating の promoteUserIds に渡して匿名でも席に座らせ吹き出させる。
  /** @type {Set<string>} */
  const spokenUserIds = new Set();
  /** @type {Map<string, number>} */
  let seatByKey = new Map();
  /** @type {Map<number, { seatIndex: number, element: HTMLDivElement, fadeTimer: number, removeTimer: number, removed: boolean, _x?: number, _y?: number, _h?: number }>} */
  const bubbleBySeat = new Map();
  /** @type {Array<{ seatIndex: number, element: HTMLDivElement, fadeTimer: number, removeTimer: number, removed: boolean, _x?: number, _y?: number, _h?: number }>} */
  const activeBubbles = [];

  /**
   * @param {{ seatIndex: number, element: HTMLDivElement, fadeTimer: number, removeTimer: number, removed: boolean, _x?: number, _y?: number, _h?: number }} bubble
   */
  const removeBubble = (bubble) => {
    if (!bubble || bubble.removed) return;
    bubble.removed = true;
    if (bubble.fadeTimer) clearTimeout(bubble.fadeTimer);
    if (bubble.removeTimer) clearTimeout(bubble.removeTimer);
    if (bubbleBySeat.get(bubble.seatIndex) === bubble) {
      bubbleBySeat.delete(bubble.seatIndex);
    }
    const index = activeBubbles.indexOf(bubble);
    if (index >= 0) activeBubbles.splice(index, 1);
    bubble.element.remove();
  };

  const clearBubbles = () => {
    for (const bubble of [...activeBubbles]) removeBubble(bubble);
  };

  /**
   * @param {string} text
   * @returns {string}
   */
  const truncateBubbleText = (text) => {
    const chars = Array.from(String(text || '').trim());
    if (chars.length <= BUBBLE_TEXT_MAX) return chars.join('');
    return `${chars.slice(0, BUBBLE_TEXT_MAX).join('')}…`;
  };

  /**
   * @param {{ speakerKey: string, text: string }} speech
   */
  const showSpeechBubble = (speech) => {
    const seatIndex = seatByKey.get(speech.speakerKey);
    if (typeof seatIndex !== 'number' || !Number.isInteger(seatIndex)) return;
    const node = seatNodes[seatIndex];
    if (!node || node.seat.classList.contains('nlsb-is-empty')) return;

    const previous = bubbleBySeat.get(seatIndex);
    if (previous) removeBubble(previous);
    while (activeBubbles.length >= BUBBLE_MAX) {
      removeBubble(activeBubbles[0]);
    }

    const text = truncateBubbleText(speech.text);
    if (!text) return;
    const element = document.createElement('div');
    element.className = 'nlsb-bubble';
    element.textContent = text;
    element.setAttribute('aria-hidden', 'true');
    // 会議確定A: 席ノードでなく最上位レイヤーへ描く(overflow:hidden に切られない)。
    bubbleLayer.appendChild(element);

    const bubble = {
      seatIndex,
      element,
      fadeTimer: 0,
      removeTimer: 0,
      removed: false
    };
    bubbleBySeat.set(seatIndex, bubble);
    activeBubbles.push(bubble);

    // 席の座標を測ってレイヤー基準の頭上へ配置。既存吹き出しと重なれば上へ逃がす(衝突回避)。
    positionBubble(bubble);

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) {
      bubble.fadeTimer = window.setTimeout(() => {
        bubble.fadeTimer = 0;
        if (!bubble.removed) element.classList.add('nlsb-is-leaving');
      }, BUBBLE_LIFETIME_MS - BUBBLE_FADE_MS);
    }
    bubble.removeTimer = window.setTimeout(() => {
      bubble.removeTimer = 0;
      removeBubble(bubble);
    }, BUBBLE_LIFETIME_MS);
  };

  /**
   * 1つの吹き出しを、対応する席の頭上(レイヤー基準)へ絶対配置する。
   * 既に表示中の吹き出しと縦に重なる場合は上方向へオフセットして読めるようにする。
   * @param {{ seatIndex:number, element:HTMLDivElement, removed:boolean, _x?:number, _y?:number, _h?:number }} bubble
   */
  const positionBubble = (bubble) => {
    if (!bubble || bubble.removed) return;
    const node = seatNodes[bubble.seatIndex];
    if (!node) return;
    const layerRect = bubbleLayer.getBoundingClientRect();
    const seatRect = node.icon.getBoundingClientRect();
    // レイヤー左上を原点とした席矩形へ変換。
    const rel = {
      left: seatRect.left - layerRect.left,
      top: seatRect.top - layerRect.top,
      width: seatRect.width,
      height: seatRect.height
    };
    const anchor = bubbleAnchorForSeatRect(rel, BUBBLE_ANCHOR_GAP);
    const h = bubble.element.offsetHeight || 40;
    // 既存の表示中吹き出し(自分以外)の占有帯を集めて衝突回避。
    const placed = [];
    for (const b of activeBubbles) {
      if (b === bubble || b.removed || !b._x) continue;
      placed.push({ x: b._x, y: b._y, h: b._h || 40 });
    }
    const y = resolveBubbleY({ x: anchor.x, y: anchor.y, h }, placed, {
      xThreshold: 130,
      vGap: 8,
      minY: 8
    });
    bubble._x = anchor.x;
    bubble._y = y;
    bubble._h = h;
    bubble.element.style.left = `${anchor.x}px`;
    bubble.element.style.top = `${y}px`;
  };

  /** 表示中の全吹き出しを席座標へ再追従(スクロール/リサイズ/段再描画後)。 */
  const repositionAllBubbles = () => {
    for (const b of [...activeBubbles]) positionBubble(b);
  };

  /**
   * 配信切替・再オープン時に過去ログを再生しないよう、純関数へ渡す基準を未シードへ戻す。
   * @param {string} [nextLiveId]
   */
  const resetSpeechTracking = (nextLiveId = '') => {
    speechGeneration += 1;
    speechLiveId = nextLiveId;
    speechState = { seenKeys: null, primed: false };
    clearBubbles();
  };

  /**
   * @param {VenueRow[]} rows
   */
  const renderSeats = (rows) => {
    const seating = buildVenueSeating(rows, {
      maxSeats: VENUE_FULLSCREEN_MAX_SEATS,
      prevSeatByKey: seatByKey,
      isGenericName: isGenericComeviewName,
      promoteUserIds: spokenUserIds
    });
    seatByKey = seating.seatByKey;
    seatsHost.classList.remove(...VENUE_LAYOUT_CLASSES);
    seatsHost.classList.add(`nlsb-mode-${seating.layoutMode}`);
    // 会議確定B(横スクロール根絶+映像セーフエリア): 論理席は維持しつつ、同時表示は
    //   行に収まる数に絞る。縮小でなく表示人数を減らす(名前/ID/サムネを潰さない)。
    //   直近発言者は selectStableVisibleMembers で必ず表示に含め、席順は安定(ちらつかない)。
    const seatAreaWidth = seatsHost.clientWidth || window.innerWidth || 1280;
    const seatMinWidth =
      seating.layoutMode === 'vip' ? 150 : seating.layoutMode === 'normal' ? 104 : 76;
    const perRow = seatsPerRow(seatAreaWidth - 28, seatMinWidth);
    const visibleSeatCount = resolveVisibleArenaCount({
      totalCount: seating.seats.length,
      perRow,
      rows: 3,
      hardCap: 40
    });
    const visibleSeats = selectStableVisibleMembers(
      seating.seats,
      visibleSeatCount,
      spokenUserIds,
      (entry) => String(entry?.participant?.userId || entry?.participant?.key || '').trim()
    );
    // アリーナ席は名前付き + しゃべった匿名(promote)。それ以外の匿名は後方の観客席へ
    // ゆっくり顔で表示し、上限超過分だけ人数で補う。
    const { faceUserIds, totalAnonymous } = collectAudienceFaceUserIds(rows, {
      isGenericName: isGenericComeviewName,
      promoteUserIds: spokenUserIds
    });
    title.textContent =
      totalAnonymous > 0
        ? `会場参加者 ${seating.participantCount}人 ・ ほか観客 ${totalAnonymous}人`
        : `会場参加者 ${seating.participantCount}人`;
    audience.hidden = totalAnonymous === 0;
    audience.setAttribute('aria-label', `観客席 ${totalAnonymous}人`);
    // 観客帯は最上部の 1 行に収める(映像を覆わない)。1 行に入る数だけ顔を出し、残りは人数表示。
    const audienceAreaWidth = audienceDots.clientWidth || (window.innerWidth || 1280) * 0.7;
    const audiencePerRow = seatsPerRow(audienceAreaWidth, 34);
    const audienceCap = resolveVisibleAudienceCount({
      totalFaces: faceUserIds.length,
      perRow: audiencePerRow,
      rows: 1,
      hardCap: audienceDotNodes.length
    });
    const visibleAudienceFaces = Math.min(faceUserIds.length, audienceCap, audienceDotNodes.length);
    for (let i = 0; i < audienceDotNodes.length; i += 1) {
      const uid = i < visibleAudienceFaces ? faceUserIds[i] : '';
      const dot = audienceDotNodes[i];
      const face = audienceFaceNodes[i];
      dot.hidden = !uid;
      if (uid && face.dataset.userId !== uid) {
        face.dataset.userId = uid;
        face.src = anonymousIdenticonDataUrl(uid, 32);
      } else if (!uid && face.dataset.userId) {
        delete face.dataset.userId;
        face.removeAttribute('src');
      }
    }
    const remainingAudience = Math.max(0, totalAnonymous - visibleAudienceFaces);
    audienceMore.hidden = remainingAudience === 0;
    audienceMore.textContent = remainingAudience > 0 ? `ほか観客 ${remainingAudience}人` : '';

    for (const node of seatNodes) {
      node.seat.classList.add('nlsb-is-empty');
      node.seat.setAttribute('aria-hidden', 'true');
      node.seat.removeAttribute('title');
      delete node.seat.dataset.tierIndex;
    }

    const tiers = buildVenueTiers(visibleSeats.length);
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
        const entry = visibleSeats[seatCursor];
        seatCursor += 1;
        if (!entry) continue;
        const node = seatNodes[entry.seatIndex];
        const participant = entry.participant;
        tierNode.appendChild(node.seat);
        node.seat.dataset.tierIndex = String(tier.rowIndex);
        const i = entry.seatIndex;
        const uid = String(participant.userId || '').trim();
        const pageUrl = nicoUserPageUrl(uid);
        // 名前: 本名があれば本名・無ければ匿名は「匿名NNN」で安定表示(顔だけにしない=原則)。
        const rawName = String(participant.name || '').trim();
        const displayName =
          rawName ||
          (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(participant.key || `会場${i + 1}`));
        // 色は userId 優先で生成(同名の別人や匿名でも人ごとに色が変わる)。
        const colorKey = participant.userId || participant.name || participant.key;
        node.icon.style.backgroundColor = colorFromKey(colorKey);
        node.fallback.textContent = Array.from(displayName)[0] || '会';
        const avatarUrl = String(participant.avatar || '').trim();
        const uidForFace = String(participant.userId || '').trim();
        const yukkuriFace = uidForFace ? anonymousIdenticonDataUrl(uidForFace, 64) : '';
        // http サムネが読めなかったときの差し替え先(ゆっくり顔)を席に持たせる。
        node.avatar.dataset.fallbackFace = yukkuriFace;
        const avatarSrc = avatarUrl || yukkuriFace;
        if (avatarSrc) {
          if (node.avatar.dataset.avatar !== avatarSrc) {
            node.avatar.dataset.avatar = avatarSrc;
            node.avatar.src = avatarSrc;
            // data URL(ゆっくり顔)も http サムネも、まず即表示する。これで load イベントを
            //   取り逃して(キャッシュ済み画像で load が来ない等)アバターが永久に隠れたまま
            //   色フォールバックになる不具合を防ぐ。読み込みに失敗した http だけ error ハンドラが
            //   フォールバックへ戻す。既にデコード済み(complete && naturalWidth>0)も確実に表示。
            node.avatar.hidden = false;
            node.fallback.hidden = true;
          }
        } else {
          node.avatar.hidden = true;
          node.fallback.hidden = false;
          node.avatar.dataset.avatar = '';
          node.avatar.removeAttribute('src');
        }
        node.name.textContent = displayName;
        // 原則のリンク部分: 数値 ID があるときだけユーザーページへ飛べるアンカーにする。
        //   匿名(ID なし)は href を外し、ただの文字として見せる(リンク偽装しない)。
        if (pageUrl) {
          node.name.setAttribute('href', pageUrl);
          node.name.classList.add('nlsb-name-link');
          node.name.title = `${displayName} のユーザーページを開く`;
          node.seat.title = displayName;
        } else {
          node.name.removeAttribute('href');
          node.name.classList.remove('nlsb-name-link');
          node.name.title = '';
          node.seat.title = displayName;
        }
        node.seat.classList.remove('nlsb-is-empty');
        node.seat.setAttribute('aria-hidden', 'false');
      }
    }
    // 席が動いた(段の再描画/表示人数変化)後、表示中の吹き出しを席頭上へ追従させる。
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => repositionAllBubbles());
    } else {
      repositionAllBubbles();
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
        spokenUserIds.clear(); // 別配信の昇格匿名を持ち越さない
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
      // パネルと同じ低頻度キャッシュで実サムネを補強し、会場だけ顔が欠ける差をなくす。
      const profileBag = await chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE);
      if (!open || liveIdFromPathname() !== liveId) return;
      const profileMap =
        /** @type {Record<string, { avatarUrl?: unknown }>|null} */ (
          profileBag?.[KEY_USER_COMMENT_PROFILE_CACHE] || null
        );
      baseRows = enrichVenueRowsWithProfileAvatars(baseRows, profileMap);
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

  const pollSpeech = async () => {
    if (!open || speechInFlight) return;
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    if (speechLiveId !== liveId) resetSpeechTracking(liveId);
    const generation = speechGeneration;
    const tailKey = tailStorageKey(liveId);
    const summaryKey = commentDbSummaryKey(liveId);
    speechInFlight = true;
    try {
      const bag = await chrome.storage.local.get([tailKey, summaryKey]);
      if (
        !open ||
        generation !== speechGeneration ||
        speechLiveId !== liveId ||
        liveIdFromPathname() !== liveId
      ) {
        return;
      }
      const tailRows = Array.isArray(bag?.[tailKey]) ? bag[tailKey] : [];
      const summary = /** @type {{ recent?: unknown }|undefined} */ (bag?.[summaryKey]);
      const recentRows = Array.isArray(summary?.recent) ? summary.recent : [];
      const rows = tailRows.length > 0 ? tailRows : recentRows;
      // primeEmit: 会場を開いた瞬間に直近3件を吹き出す(過疎番組でも会場が喋って見える)。
      //   2回目以降は primed 済みなので新着だけ。過去ログ一斉飛びは起きない。
      const result = pickNewVenueSpeech(rows, speechState, { maxEmit: 8, primeEmit: 3 });
      speechState = {
        seenKeys: result.seenKeys,
        primed: result.primed
      };
      // ユーザー方針「しゃべった人を席に出して吹かせる」: 新着発言者を会場行にマージして
      //   先に席を作り直す(buildVenueSeating が capturedAt=now で上位席へ出す)。その後で
      //   吹き出しを出すと、しゃべった人の席が必ず存在するので吹き出しが宙に浮かない。
      if (result.speeches.length > 0) {
        // しゃべった人(匿名含む)の userId を昇格集合へ。次の renderSeats でアリーナ席に座り
        //   吹き出しが席の頭上に出る(ニコ生実況は匿名主体なのでこれが無いと吹き出さない)。
        for (const speech of result.speeches) {
          const uid = String(speech.userId || '').trim();
          if (uid) spokenUserIds.add(uid);
        }
        baseRows = mergeSpeakersIntoVenueRows(baseRows, result.speeches, Date.now());
        renderSeats(baseRows);
      }
      for (const speech of result.speeches) showSpeechBubble(speech);
    } catch {
      // 一時的に storage を読めない場合は、基準を進めず次回の軽量ポーリングへ任せる。
    } finally {
      speechInFlight = false;
    }
  };

  const stopSpeechPolling = () => {
    if (!speechTimer) return;
    clearInterval(speechTimer);
    speechTimer = 0;
  };

  const startSpeechPolling = () => {
    if (speechTimer) return;
    void pollSpeech();
    speechTimer = window.setInterval(() => {
      void pollSpeech();
    }, SPEECH_INTERVAL_MS);
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

  // リサイズ/スクロールで席の座標が変わったら吹き出しを席頭上へ追従(rAF で間引き)。
  let reflowRaf = 0;
  let reflowListening = false;
  const onBubbleReflow = () => {
    if (reflowRaf) return;
    reflowRaf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => {
            reflowRaf = 0;
            repositionAllBubbles();
          })
        : 0;
    if (!reflowRaf) repositionAllBubbles();
  };
  const addBubbleReflowListener = () => {
    if (reflowListening) return;
    window.addEventListener('resize', onBubbleReflow);
    window.addEventListener('scroll', onBubbleReflow, true);
    reflowListening = true;
  };
  const removeBubbleReflowListener = () => {
    if (!reflowListening) return;
    window.removeEventListener('resize', onBubbleReflow);
    window.removeEventListener('scroll', onBubbleReflow, true);
    if (reflowRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(reflowRaf);
    reflowRaf = 0;
    reflowListening = false;
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
      addBubbleReflowListener();
      startAggregation();
      startSpeechPolling();
    } else {
      removeEscapeListener();
      removeBubbleReflowListener();
      stopAggregation();
      stopSpeechPolling();
      resetSpeechTracking();
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
      stopSpeechPolling();
      resetSpeechTracking();
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
