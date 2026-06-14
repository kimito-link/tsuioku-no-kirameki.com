import { isGenericComeviewName } from '../lib/comeviewRows.js';
import {
  buildVenueSeating,
  buildVenueTiers,
  collectAudienceFaceUserIds,
  hasRealThumbnail,
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
  resolveVenueMaxHeightVh,
  selectStableVisibleMembers
} from '../lib/venueViewport.js';
import {
  initVenueDragState,
  beginVenueDrag,
  updateVenueDrag,
  endVenueDrag
} from '../lib/venueDragScroll.js';
import {
  bubbleAnchorForSeatRect,
  resolveBubbleY,
  BUBBLE_ANCHOR_GAP
} from '../lib/venueBubbleLayout.js';
import { drawCrowdOnCanvas } from '../lib/crowdRasterizer.js';
import { VoicePlayer } from '../lib/voicePlayer.js';
import { resolveVoiceForUser } from '../lib/voiceAssignment.js';
import {
  isVoicevoxAlive,
  listVoicevoxStyleIds,
  synthesizeVoice
} from '../lib/voicevoxClient.js';

const ROOT_ID = 'nlsb-venue-root';
const STYLE_ID = 'nlsb-venue-style';
// 別窓化で開閉状態の永続化を一旦停止(1541 はコメントアウト中)。復活に備えキーは残す。
// eslint-disable-next-line no-unused-vars
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
    /* FX(ビネット等)の mix-blend を中央映像へ漏らさないため独立スタッキング(会議確定)。 */
    isolation: isolate;
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
  /*
   * 後方ビネット(ライブ演出会議 確定①・プロの「空席を闇に沈める」術のWeb再現)。
   * ⚠️ユーザー方針「中央の配信映像にスモークをかけない」を厳守: 中央は大きく transparent で
   * くり抜き、暗くするのは【四隅】と【下端の席エリア後方】だけ。これで空席/隙間が闇に溶けて
   * 「奥まで満員」に見えつつ、配信映像(中央セーフエリア)は素通しのまま。
   * pointer-events:none でクリック透過・吹き出しレイヤー(z5)より下(z0)。
   */
  .nlsb-stage::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse 78% 64% at 50% 46%, transparent 52%, rgba(2, 4, 10, 0.55) 100%),
      linear-gradient(to bottom, transparent 64%, rgba(2, 4, 12, 0.5) 100%);
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
   *   上端=なし(背景の光の海)、中央=何も置かない空き(映像が透ける)、下端=ひな壇。
   *   ひな壇を画面の下に逃がし、中央 1fr を空けることで映像が常に見える。
   */
  .nlsb-stage-layout {
    position: relative;
    z-index: 1;
    display: grid;
    width: min(1500px, 100%);
    height: 100%;
    min-height: 0;
    margin: 0 auto;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
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
    /* 2026-06-14 会議(表示領域拡大): 高さを人数連動で可変。少人数は低く映像を広く見せ、
       満員は高くして客席を奥まで見せる。JS が --nlsb-venue-max-h を人数で注入(既定55vh)。 */
    max-height: var(--nlsb-venue-max-h, 55vh);
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
    gap: clamp(0px, 0.2vh, 4px);
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(10px, 2vh, 22px) 14px;
    /*
     * 横スクロールバー根絶(ユーザー不満「位置がずれてスクロールバーが出て変な動きで
     * 見えなくなる」): 同時表示人数は selectStableVisibleMembers で行に収まる数に制限済み
     * なので横溢れは起きないが、保険として overflow-x:hidden で横スクロールを構造的に殺す。
     * 縦も clip(段数が増えても下端 35vh に収め、映像へはみ出さない)。 -> 見切れる不満解消のため auto に変更
     */
    overflow-x: hidden;
    overflow-y: auto;
    /* 2026-06-14 会議(摩擦ゼロUI): 会場は左ドラッグでパンできる=grab カーソルで掴めると示す。
       席リンク(.nlsb-seat-link)上はリンクカーソルを優先(下のセレクタで上書き)。 */
    cursor: grab;
    touch-action: pan-y;
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
    flex: 0 1 auto;
    /* 縦溢れ防止(見切れ根絶): wrapさせず縮小させて1段に収め、SHOWROOM的な密集感を出す */
    flex-wrap: nowrap;
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
  .nlsb-seats.nlsb-mode-normal .nlsb-tier {
    gap: clamp(0px, 0.5vw, 8px);
  }
  .nlsb-seats.nlsb-mode-vip .nlsb-tier {
    gap: clamp(18px, 3vw, 52px);
  }
  .nlsb-seats.nlsb-mode-normal .nlsb-seat {
    width: clamp(48px, 8vw, 100px);
    flex: 0 1 auto;
    /* justify-content: center で左右余白ができるので、詰める場合はマイナスマージンで重ねるのも手 */
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
  .nlsb-seats.nlsb-is-grabbing {
    cursor: grabbing;
    user-select: none;
  }
  .nlsb-seat.nlsb-is-empty {
    /* display: none; */
    opacity: 0.12;
    pointer-events: none;
    filter: blur(0.5px);
  }
  .nlsb-seat.nlsb-is-empty .nlsb-icon {
    background-color: rgba(255, 255, 255, 0.05);
    border-color: transparent;
    box-shadow: none;
    background-image: 
      radial-gradient(circle at 50% 35%, #fff 25%, transparent 26%),
      radial-gradient(circle at 50% 120%, #fff 55%, transparent 56%);
  }
  .nlsb-seat.nlsb-is-empty .nlsb-name {
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
  /* 通常(≤30人): 大きめアバターを画面いっぱいに敷き詰める。はみ出し時は縮小させる */
  .nlsb-seats.nlsb-mode-normal .nlsb-seat {
    width: clamp(48px, 9vw, 120px);
  }
  /* 2026-06-14 会議(サムネ優遇強化): 実サムネ持ちを少し大きく明るく・上品な金縁で引き立てる。
     やりすぎない範囲(1.12倍・明るさ+8%)。匿名/ゆっくり顔は通常のまま。 */
  .nlsb-seat.nlsb-seat-vip .nlsb-icon {
    transform: scale(1.12);
    filter: brightness(1.08);
    border-color: rgba(255, 214, 120, 0.9);
    box-shadow: 0 0 6px rgba(255, 200, 90, 0.55), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    z-index: 2;
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
  a.nlsb-seat-link,
  .nlsb-seat.nlsb-seat-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .nlsb-seat-link:hover .nlsb-name {
    color: #bfe1ff;
    text-decoration: underline;
  }
  .nlsb-seat-link:hover .nlsb-icon {
    border-color: rgba(191, 225, 255, 0.6);
  }
  .nlsb-seat-link:focus-visible {
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
    width: clamp(32px, 7vw, 92px);
    height: clamp(32px, 7vw, 92px);
    flex-basis: auto;
    font-size: clamp(14px, 3vw, 32px);
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
    word-break: break-all;
    pointer-events: none;
    text-shadow: none;
    transform: translateY(-100%);
    white-space: normal;
    animation: nlsb-bubble-pop 160ms ease-out;
    transition: opacity ${BUBBLE_FADE_MS}ms ease;
  }
  .nlsb-bubble::after {
    position: absolute;
    top: 100%;
    left: var(--nlsb-bubble-tail-x, 50%);
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
      transform: translateY(calc(-100% + 6px)) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(-100%);
    }
  }
  .nlsb-bubble-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
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
  .nlsb-crowd-canvas {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: clamp(200px, 40vh, 350px);
    z-index: 0; /* ひな壇(.nlsb-seating z:1)の裏 */
    pointer-events: none;
    opacity: 0;
    transition: opacity 1200ms ease-in-out;
    mix-blend-mode: screen; /* サイリウムを美しく光らせる */
  }
  .nlsb-crowd-canvas.nlsb-is-visible {
    opacity: 1;
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

/** @type {string|null} */
let _forcedLiveId = null;

/**
 * @returns {string}
 */
function liveIdFromPathname() {
  if (_forcedLiveId) return _forcedLiveId;
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
  const seat = document.createElement('a');
  seat.className = 'nlsb-seat nlsb-is-empty';
  seat.dataset.seatIndex = String(seatIndex);
  seat.setAttribute('aria-hidden', 'true');
  seat.target = '_blank';
  seat.rel = 'noopener noreferrer';
  seat.style.textDecoration = 'none';
  seat.style.color = 'inherit';

  const icon = document.createElement('div');
  icon.className = 'nlsb-icon';
  const avatar = document.createElement('img');
  avatar.className = 'nlsb-avatar';
  avatar.alt = '';
  avatar.decoding = 'async';
  avatar.referrerPolicy = 'no-referrer';
  avatar.hidden = true;
  const fallback = document.createElement('div');
  fallback.className = 'nlsb-icon-fallback';
  icon.append(avatar, fallback);
  // 原則「サムネ・ハンドルネーム・ID アンカー必須」: 名前は span で持つ。
  // 親の seat が <a> なので全体がリンクになる。
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
    // http サムネが読めない(設定なし/404)ときは、ニコニコ公式の「設定なし」アイコンを出す。
    // ユーザー方針「サムネ設定なしはそのままだしたほうがいい」に基づく。
    const face = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg';
    if (avatar.getAttribute('src') !== face) {
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
 * @param {{ standalone?: boolean }} options
 */
export function mountVenueBarButton(options = {}) {
  const isStandalone = !!options.standalone;
  if (!liveIdFromPathname()) return;
  if (document.getElementById(ROOT_ID)) return;
  const parent = isStandalone ? document.body : document.documentElement;
  if (!parent) return;

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

  if (isStandalone) {
    toggle.style.display = 'none';
    close.style.display = 'none';
    // スタンドアロン時は背景を黒系に塗り、映像セーフエリアを確保
    root.style.background = '#0a0b0c';
  }

  const crowdCanvas = document.createElement('canvas');
  crowdCanvas.className = 'nlsb-crowd-canvas';
  // 高画質すぎると重いので適度な解像度に固定（CSSで画面幅に引き伸ばす）
  crowdCanvas.width = 1200;
  crowdCanvas.height = 350;

  const stageLayout = document.createElement('div');
  stageLayout.className = 'nlsb-stage-layout';
  stageLayout.appendChild(crowdCanvas); // 背景として配置

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

  const voiceBtn = document.createElement('button');
  voiceBtn.type = 'button';
  voiceBtn.className = 'nlsb-comeview-btn nlsb-voice-btn';
  voiceBtn.style.marginLeft = '8px';
  voiceBtn.textContent = '🔈 読み上げ: OFF';
  
  const voiceStatus = document.createElement('span');
  voiceStatus.className = 'nlsb-voice-status';
  voiceStatus.style.marginLeft = '8px';
  voiceStatus.style.fontSize = '12px';
  voiceStatus.style.color = '#7a828e';

  let venueWindowBtn = null;
  if (!isStandalone) {
    venueWindowBtn = document.createElement('button');
    venueWindowBtn.type = 'button';
    venueWindowBtn.className = 'nlsb-comeview-btn'; // スタイル流用
    venueWindowBtn.textContent = '↗ 別窓化';
    venueWindowBtn.title = '会場モードを別ウィンドウ(OBS等用)で開く';
    venueWindowBtn.style.marginLeft = '8px';
    venueWindowBtn.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'NLS_OPEN_VENUE', liveId: liveIdFromPathname() });
        // 別窓化したらインライン版は一旦閉じる
        userChangedOpen = true;
        setOpen(false, true);
      } catch {
        /* no-op */
      }
    });
  }

  const note = document.createElement('div');
  note.className = 'nlsb-note';
  note.textContent = '全コメント集計・最大150席';
  if (venueWindowBtn) {
    headerRight.append(comeviewBtn, voiceBtn, voiceStatus, venueWindowBtn, note);
  } else {
    headerRight.append(comeviewBtn, voiceBtn, voiceStatus, note);
  }
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

  // 2026-06-14 会議(星野ロミ・摩擦ゼロUI): 会場を左ドラッグでパン(縦スクロール)できるように。
  //   純ロジックは venueDragScroll(テスト済)。ここは pointer イベントの薄い配線だけ。
  //   ドラッグ判定(moved)が立ったら席リンクの click を1回だけ抑止し、誤遷移を防ぐ。
  let venueDrag = initVenueDragState();
  const venueDragMaxScroll = () => Math.max(0, seatsHost.scrollHeight - seatsHost.clientHeight);
  seatsHost.addEventListener('pointerdown', (e) => {
    // 左ボタンのみ。スクロールバー上のドラッグは OS に任せる(配信操作を邪魔しない)。
    if (e.button !== 0) return;
    venueDrag = beginVenueDrag(e.clientY, seatsHost.scrollTop);
    seatsHost.classList.add('nlsb-is-grabbing');
  });
  seatsHost.addEventListener('pointermove', (e) => {
    if (!venueDrag.active) return;
    const r = updateVenueDrag(venueDrag, e.clientY, venueDragMaxScroll());
    venueDrag = r.state;
    if (venueDrag.moved) {
      seatsHost.scrollTop = r.scrollTop;
      // ドラッグ中はテキスト選択を避ける。
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
  });
  const endVenueDragHandler = () => {
    const { state, wasDrag } = endVenueDrag(venueDrag);
    venueDrag = state;
    seatsHost.classList.remove('nlsb-is-grabbing');
    if (wasDrag) {
      // 直後の click(席リンク)を1回だけ飲み込む(ドラッグで指を離した位置のリンクへ飛ばない)。
      /** @param {Event} ev */
      const swallow = (ev) => {
        ev.stopPropagation();
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        seatsHost.removeEventListener('click', swallow, true);
      };
      seatsHost.addEventListener('click', swallow, true);
    }
  };
  seatsHost.addEventListener('pointerup', endVenueDragHandler);
  seatsHost.addEventListener('pointerleave', endVenueDragHandler);
  seatsHost.addEventListener('pointercancel', endVenueDragHandler);

  // 中央の映像セーフエリア(UI を置かず、配信映像を常に見せる)。
  const safeArea = document.createElement('div');
  safeArea.className = 'nlsb-safe-area';
  safeArea.setAttribute('aria-hidden', 'true');

  if (isStandalone && liveIdFromPathname()) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://live.nicovideo.jp/embed/${liveIdFromPathname()}`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.pointerEvents = 'auto'; // 操作可能にする
    safeArea.appendChild(iframe);
    safeArea.style.pointerEvents = 'auto';
  }

  // seating は下端のひな壇だけ(header + seats)。
  seating.append(header, seatsHost);
  // center は CSS で display:none(撤去)だが、互換のため DOM には残す。
  stageLayout.append(crowdCanvas, safeArea, seating, center);
  // 吹き出し専用の最上位レイヤー(会議確定A): 席コンテナの overflow:hidden の外に置くことで
  //   セリフがクリップされず・アバターに潜らない。席の座標を測ってこの上に頭上配置する。
  const bubbleLayer = document.createElement('div');
  bubbleLayer.className = 'nlsb-bubble-layer';
  bubbleLayer.setAttribute('aria-live', 'polite');
  stage.append(close, stageLayout, bubbleLayer);
  root.append(toggle, stage);
  parent.appendChild(root);

  let open = false;
  // 別窓化リファクタで参照側が外れ書込専用に(復活に備え代入は残す)。
  // eslint-disable-next-line no-unused-vars
  let userChangedOpen = false;

  const voicePlayer = new VoicePlayer({
    storage: typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null,
    onToggle: (/** @type {boolean} */ enabled, /** @type {boolean} */ readNameEnabled, /** @type {boolean} */ toggleBusy) => {
      voiceBtn.disabled = toggleBusy;
      voiceBtn.classList.toggle('is-on', enabled);
      voiceBtn.textContent = enabled ? '🔊 読み上げ: ON' : '🔈 読み上げ: OFF';
    },
    onStatus: (/** @type {string} */ msg) => {
      voiceStatus.textContent = msg;
    },
    onSkip: () => {},
    isObsMode: () => {
      return (window.name || '').includes('OBS') || window.location.search.includes('obs=');
    },
    audioConstructor: typeof window !== 'undefined' ? window.Audio : null,
    createObjectURL: typeof URL !== 'undefined' ? URL.createObjectURL.bind(URL) : null,
    revokeObjectURL: typeof URL !== 'undefined' ? URL.revokeObjectURL.bind(URL) : null,
    fetchVoicevoxAlive: isVoicevoxAlive,
    fetchVoiceStyleIds: listVoicevoxStyleIds,
    fetchSynthesizeVoice: synthesizeVoice,
    resolveVoice: resolveVoiceForUser
  });
  
  voiceBtn.addEventListener('click', () => {
    if (voicePlayer.enabled) {
      voicePlayer.disable();
    } else {
      voicePlayer.enable();
    }
  });
  
  // 会場モードは開いたら「いきなり読み上げ上がる」のがユーザー期待(comeview の ?voice=1 相当)。
  //   保存状態に関わらず自動 ON。OBS 透過モードは VoicePlayer 内で isObsMode により enable を
  //   スキップするので forceOn を渡しても安全(無音オーバーレイのまま)。
  void voicePlayer.initialize({ forceOn: true });
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
    
    const textSpan = document.createElement('span');
    textSpan.className = 'nlsb-bubble-text';
    textSpan.textContent = text;
    element.appendChild(textSpan);
    
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
    const bw = bubble.element.offsetWidth || 160;
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
    
    // 画面端で見切れないようにX座標をクランプする
    let targetLeft = anchor.x - bw / 2;
    const maxLeft = window.innerWidth - bw - 8;
    if (targetLeft < 8) targetLeft = 8;
    if (targetLeft > maxLeft) targetLeft = maxLeft;
    const tailOffset = anchor.x - targetLeft;

    bubble._x = anchor.x;
    bubble._y = y;
    bubble._h = h;
    bubble.element.style.setProperty('--nlsb-bubble-tail-x', `${tailOffset}px`);
    bubble.element.style.left = `${targetLeft}px`;
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
    // 2026-06-14 会議(表示領域拡大): 会場の最大高さを人数連動で注入。少人数は低く映像を広く、
    //   満員は高く客席を奥まで。.nlsb-seating(=seatsHost の親)の var(--nlsb-venue-max-h) を更新。
    const seatingHostEl = seatsHost.parentElement;
    if (seatingHostEl) {
      seatingHostEl.style.setProperty(
        '--nlsb-venue-max-h',
        `${resolveVenueMaxHeightVh(seating.participantCount)}vh`
      );
    }
    // 会議確定B(横スクロール根絶+映像セーフエリア): 論理席は維持しつつ、同時表示は
    //   行に収まる数に絞る。縮小でなく表示人数を減らす(名前/ID/サムネを潰さない)。
    //   直近発言者は selectStableVisibleMembers で必ず表示に含め、席順は安定(ちらつかない)。
    const seatAreaWidth = seatsHost.clientWidth || window.innerWidth || 1280;
    const seatMinWidth =
      seating.layoutMode === 'vip' ? 150 : seating.layoutMode === 'normal' ? 84 : 68;
    const perRow = seatsPerRow(seatAreaWidth - 28, seatMinWidth);
    // 2026-06-14 会議(満席感): hardCap を外し人数連動(resolveDynamicArenaCap)で上限を伸ばす。
    //   段数も 6→8 に増やして大人数の客席を奥へ広げる。perRow*8 と動的cap の小さい方で頭打ち。
    const visibleSeatCount = resolveVisibleArenaCount({
      totalCount: seating.seats.length,
      perRow,
      rows: 8
    });
    const visibleSeats = selectStableVisibleMembers(
      seating.seats,
      visibleSeatCount,
      spokenUserIds,
      (entry) => String(entry?.participant?.userId || entry?.participant?.key || '').trim()
    );
    const visibleSeatKeys = new Set(visibleSeats.map(entry => entry.participant.key));

    // アリーナ席は名前付き + しゃべった匿名(promote)。それ以外の匿名は後方の観客席へ
    // ゆっくり顔で表示し、上限超過分だけ人数で補う。
    const { totalAnonymous } = collectAudienceFaceUserIds(rows, {
      isGenericName: isGenericComeviewName,
      promoteUserIds: spokenUserIds,
      excludeKeys: visibleSeatKeys
    });
    title.textContent =
      totalAnonymous > 0
        ? `会場参加者 ${seating.participantCount}人 ・ ほか観客 ${totalAnonymous}人`
        : `会場参加者 ${seating.participantCount}人`;
    // PR-C1: 人数ラスタライザ Canvas (Antigravity Enhanced)
    if (totalAnonymous > 0) {
      crowdCanvas.classList.add('nlsb-is-visible');
      // liveId をシードとして安定描画
      const seed = Array.from(activeLiveId).reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0);
      drawCrowdOnCanvas(crowdCanvas, totalAnonymous, seed);
    } else {
      crowdCanvas.classList.remove('nlsb-is-visible');
    }

    for (const node of seatNodes) {
      node.seat.classList.add('nlsb-is-empty');
      node.seat.setAttribute('aria-hidden', 'true');
      node.seat.removeAttribute('title');
      delete node.seat.dataset.tierIndex;
      if (node.seat.parentElement) {
        node.seat.parentElement.removeChild(node.seat);
      }
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
        const isNumericUid = /^\d{2,15}$/.test(uidForFace);
        const derivedAvatar = isNumericUid ? `https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/${Math.floor(Number(uidForFace) / 10000)}/${uidForFace}.jpg` : '';
        const yukkuriFace = uidForFace ? anonymousIdenticonDataUrl(uidForFace, 64) : '';
        // http サムネが読めなかったときの差し替え先(ゆっくり顔)を席に持たせる。
        node.avatar.dataset.fallbackFace = yukkuriFace;
        const avatarSrc = avatarUrl || derivedAvatar || yukkuriFace;
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
          node.seat.setAttribute('href', pageUrl);
          node.seat.classList.add('nlsb-seat-link');
          node.seat.title = `${displayName} のユーザーページを開く`;
        } else {
          node.seat.removeAttribute('href');
          node.seat.classList.remove('nlsb-seat-link');
          node.seat.title = displayName;
        }
        node.seat.classList.remove('nlsb-is-empty');
        node.seat.setAttribute('aria-hidden', 'false');
        // 2026-06-14 会議(サムネ優遇強化): 実サムネ(http顔写真)持ちは少し大きく明るく見せて
        //   常連さんを引き立てる。ゆっくり顔/匿名は通常表示。CSS .nlsb-seat-vip が適用。
        node.seat.classList.toggle('nlsb-seat-vip', hasRealThumbnail(avatarUrl));
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
      for (const speech of result.speeches) {
        if (voicePlayer.enabled) {
          voicePlayer.enqueue([{
            kind: 'comment',
            userId: speech.userId,
            nickname: speech.name,
            key: speech.key,
            text: speech.text,
            onPlayStart: () => showSpeechBubble(speech)
          }]);
        } else {
          showSpeechBubble(speech);
        }
      }
    } catch {
      // 一時的に storage を読めない場合は、基準を進めず次回の軽量ポーリングへ任せる。
    } finally {
      speechInFlight = false;
    }
  };

  const handleStorageChange = (/** @type {any} */ changes, /** @type {string} */ areaName) => {
    if (areaName !== 'local' || !open) return;
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    const tailKey = tailStorageKey(liveId);
    const summaryKey = commentDbSummaryKey(liveId);
    if (changes[tailKey] || changes[summaryKey]) void pollSpeech();
    if (changes[summaryKey]) void aggregateParticipants();
  };

  const stopSpeechPolling = () => {
    if (!speechTimer) return;
    clearInterval(speechTimer);
    speechTimer = 0;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  };

  const startSpeechPolling = () => {
    if (speechTimer) return;
    void pollSpeech();
    speechTimer = window.setInterval(() => {
      void pollSpeech();
    }, SPEECH_INTERVAL_MS);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }
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
      // ユーザー要望により状態を復元しなくなったため、保存も無効化する
      // void chrome.storage.local.set({ [OPEN_STORAGE_KEY]: open }).catch(() => {});
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

  if (isStandalone) {
    setOpen(true, false);
  } else {
    // ユーザー要望: 「開いた瞬間会場モードになるのやめたほういいかも。過去のなにかをひきずるような」
    // ページロード時は常に閉じた状態からスタートし、意図して開く形にする。
    setOpen(false, false);
  }
}

export function mountVenueStandalone(/** @type {string} */ liveId) {
  _forcedLiveId = liveId;
  mountVenueBarButton({ standalone: true });
}
