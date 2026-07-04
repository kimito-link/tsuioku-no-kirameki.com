// venueBar.js — 会場モード UI 本体。観客の席割り・群衆・吹き出し・ギフト演出・読み上げ連動を描く。
import { isGenericComeviewName } from '../lib/comeviewRows.js';
import {
  buildVenueSeating,
  collectAudienceFaceUserIds,
  hasRealThumbnail,
  deriveNicoUserIconUrl,
  VENUE_FULLSCREEN_MAX_SEATS,
  venueRowsFromUserLaneCandidates
} from '../lib/venueSeats.js';
import { userLaneCandidatesFromStorage } from '../lib/userLaneCandidatesFromStorage.js';
import {
  KEY_LIVE_BROADCASTER_CTX,
  normalizeBroadcasterCtx,
  isBroadcasterCtxUsableForGuard
} from '../lib/broadcastContext.js';
import { readChunkedComments, chunkIndexKey, chunkStorageKey, isChunkIndex } from '../lib/commentChunkStore.js';
import { selectNewChunkSeqs, mergeUserLaneAggregates } from '../lib/venueIncrementalAggregate.js';
import {
  touchRoster,
  pruneRoster,
  rosterToVenueRows,
  hydrateRosterFromCandidates,
  VENUE_ROSTER_WINDOW_MS,
  VENUE_ROSTER_VIP_WINDOW_MS,
  VENUE_ROSTER_MAX_SEATS
} from '../lib/venueLiveRoster.js';

/**
 * 会場の参加者ソース切替。
 *
 * v0.1.789 「レーンを鏡のように映す」へ統一(ユーザー指摘=本体のサムネを鏡映するのと同じく、会場は
 *   レーンをそのまま映せばよい): false にすると content inline 会場も standalone と同じ
 *   「レーン集約(userLaneCandidatesFromStorage→venueRowsFromUserLaneCandidates)を鏡映する」経路に
 *   統一される。
 *
 * 経緯: v0.1.754 で「3時間でも O(席数) 一定」の性能対策として content inline 会場だけを
 *   ストリーム駆動 roster(独自の在席 Map)に切り替えた。だが roster は ①userId 必須(ニコ生は匿名
 *   主体なので数値ID の人しか座らない) ②4分窓(VIP 15分・応援しても黙ると退席) のため、レーン
 *   (全セッション累積・サムネ持ちが並ぶ)と人が一致せず「レーンにいる応援者が会場にいない」乖離を
 *   生んだ。性能の心配は既に解決済み=レーン集約経路は v0.1.754 で【差分(新規 seq)だけ集約してマージ】
 *   = O(追加分)になっており、storage 変化時トリガ(near-realtime)+30秒 backstop で軽い。よって
 *   roster は不要な二重実装。レーン正本を鏡映する1経路に統一する(=会場は常にレーンと同じ人)。
 *
 * true に戻すと v0.1.754 のストリーム駆動 roster へロールバック可(キルスイッチ温存)。
 * standalone(venue.html)は onLiveComments が来ないため元から false 扱い(rosterDriven=!isStandalone と合成)。
 *
 * 正本(2026-06-17): 会場の参加者データ源は popup 応援アイコン列(renderStoryUserLane)と同一の
 *   純関数 userLaneCandidatesFromStorage。popup と会場の顔ぶれは一致するのが正(=この「鏡映」設計)。
 *   席資格(誰が座れるか)の正本は venueSeats.js#venueParticipantKey(userId あれば匿名も着席)。
 *   popup と会場で「誰を出すか」がズレたら、それは描画/表示間引き(visibleSeats)層のバグ=ここではない。
 */
const VENUE_ROSTER_ENABLED = false;
import { resolveDisplayRows } from '../lib/venueDisplayRows.js';
import { runStorageOpWithTimeout, STORAGE_OP_TIMED_OUT } from '../lib/storageOpTimeout.js';
import { buildVenueResidents } from '../lib/venueResidents.js';
import {
  commentDbSummaryKey,
  commentsStorageKey,
  KEY_USER_COMMENT_PROFILE_CACHE,
  KEY_EFFECT_SOUND_ENABLED,
  KEY_VENUE_EFFECT_SOUND_PRESENCE,
  isEffectSoundEnabled
} from '../lib/storageKeys.js';
import { EFFECT_SOUND_KINDS, playEffectSound } from '../lib/effectSoundPlayer.js';
import { KEY_GIFT_EFFECT_DIAG } from '../lib/giftEffectDiagKey.js';
import { makeInitialGiftEffectDiag, buildGiftEffectDiagSnapshot } from '../lib/giftEffectDiag.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { pickNewVenueSpeech, mergeSpeakersIntoVenueRows, liveFeedSpeechRows } from '../lib/venueSpeech.js';
import { isContextInvalidatedError } from '../lib/reportSilentError.js';
import {
  updateSpeechStreak,
  pruneSpeechStreaks,
  streakGlowStage,
  streakBubbleLifetimeMs,
  resolveBubbleFlowLifetimeMs
} from '../lib/venueSpeechStreak.js';
import { enrichVenueRowsWithProfileAvatars } from '../lib/venueAvatar.js';
import { nicoUserPageUrl, anonymousDisplayLabel } from '../lib/nicoUserPage.js';
import { isNumericNicoUserId } from '../domain/user/identity.js';
// person-tile-unify 第3コミット(2026-06-22): 会場の席タイルを popup の本物ビルダーで描く。
//   独自DOM生成をやめ、popup「アイコン列・グリッド・診断」と同じ顔ぶれ・見た目にする。
//   依存(io)も popup と同じ本物を会場が生成・import する(スタブ化しない)。
import { buildPersonTileEl } from '../lib/personTileDom.js';
import { createSupportAvatarLoadGuard } from '../lib/supportGrowthAvatarLoad.js';
import {
  applyStoryAvatarTvFallbackClass,
  removeStoryAvatarTvFallbackClass
} from '../lib/storyAvatarTvFallbackClass.js';
import { storyTileUsesYukkuriTvStyle } from '../lib/storyTileTvStyle.js';
import { upgradeAnonymousAvatarImage } from '../lib/avatarPartsComposer.js';
import {
  isHttpOrHttpsUrl,
  NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS
} from '../lib/supportGrowthTileSrc.js';
import { storyUserLaneMetaLines } from '../lib/storyUserLaneMeta.js';
import { bucketVenueLaneSeats, flattenVenueLaneBuckets } from '../lib/venueLaneBuckets.js';
import {
  paintStoryUserLaneDomFilled,
  resetStoryUserLaneDom
} from './story/renderStoryUserLaneDom.js';
// v0.1.902: 会場座席の健全度を健全度パネルに載せる(配信者混入・固着を AI/人間が一目で発見)。
import { KEY_VENUE_SEATS_DIAG } from '../lib/venueSeatsDiagKey.js';
import { buildVenueSeatsDiagSnapshot } from '../lib/venueSeatsDiag.js';
import {
  computeVenueParticipantAvatarCounts,
  venueDiagSig,
  buildVenueDiagHtml
} from '../lib/venueAvatarDiagLine.js';
import {
  seatsPerRow,
  resolveVisibleArenaCount,
  resolveVenueMaxHeightVh,
  selectStableVisibleMembers,
  partitionThumbnailFirst
} from '../lib/venueViewport.js';
import {
  initVenueDragState,
  beginVenueDrag,
  updateVenueDrag,
  endVenueDrag
} from '../lib/venueDragScroll.js';
import { buildVenueRoster, formatVenueRosterSummary } from '../lib/venueRoster.js';
import {
  bubbleAnchorForSeatRect,
  resolveBubbleY,
  BUBBLE_ANCHOR_GAP
} from '../lib/venueBubbleLayout.js';
import { drawCrowdOnCanvas } from '../lib/crowdRasterizer.js';
import {
  resolveVenueHeatLevel,
  heatLevelToWarmColor,
  heatLevelToGlowOpacity,
  heatLevelToLabel
} from '../lib/venueHeat.js';
import { VoicePlayer } from '../lib/voicePlayer.js';
import {
  shouldRenderLoading,
  resolveVoiceLoadingView,
  VOICE_LOADING_FLICKER_GUARD_MS
} from '../lib/voiceLoadingState.js';
import {
  nextBubbleVoiceState,
  selectBubblesToEvict,
  resolvePendingLifetimeMs,
  BUBBLE_VOICE_AFTERGLOW_MS,
  BUBBLE_VOICE_SPEAKING_CAP_MS
} from '../lib/venueBubbleLifecycle.js';
import { resolveVoiceForUser } from '../lib/voiceAssignment.js';
import { buildVenueCharacterFrame } from '../lib/venueCharacterFrame.js';
import { parseGiftCommentText, parseNicoadCommentText } from '../lib/parseGiftComment.js';
import {
  resolveGiftProjectile,
  resolveGiftThrowPath,
  canLaunchGiftThrow
} from '../lib/giftThrowProjectile.js';
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
// 北極星「コメントがリアルタイムでちゃんと出る」: poll を 1.5→0.8秒に上げて取りこぼし/遅延を減らす
//   (storage.onChanged のイベント駆動と並走するハートビート)。会議(無料LLM)一致。
const SPEECH_INTERVAL_MS = 800;
const BUBBLE_LIFETIME_MS = 4_000;
const BUBBLE_FADE_MS = 600;
// v0.1.755 リアルタイム完璧化: 同時表示数を 6→12 に拡大。洪水時に「出してすぐ最古を消す」で
//   一瞬しか見えない問題を緩和(寿命は流速可変で短くするので画面は埋まり続けない)。
const BUBBLE_MAX = 12;
// 吹き出し流速(件/秒)を測る短い窓。寿命可変(速いほど短命)の入力。
const BUBBLE_FLOW_WINDOW_MS = 3_000;
const BUBBLE_TEXT_MAX = 36;
const VENUE_LAYOUT_CLASSES = [
  'nlsb-mode-empty',
  'nlsb-mode-vip',
  'nlsb-mode-normal',
  'nlsb-mode-packed'
];

/**
 * 会場の席タイル(buildPersonTileEl)に渡す avatar load guard と I/O。
 *   popup-entry.js の storyAvatarLoadGuard(L3793)と【同設定】で会場が自前に持つ。
 *   コールバック(TV-fallback クラス付け外し)も popup と同じ本物を import(スタブ化しない)。
 *   会場は content script の別レイヤー/別バンドルなので、popup のインスタンスは届かない=
 *   同じ lib の本物から会場が同設定で生成する(live-view が io を自前で組むのと同型)。
 */
const venueAvatarLoadGuard = createSupportAvatarLoadGuard({
  fallbackSrc: NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS,
  onFallbackApplied: applyStoryAvatarTvFallbackClass,
  onRemoteSuccess: removeStoryAvatarTvFallbackClass
});

/** buildPersonTileEl(p, io) の io 引数。popup の laneDomIo(popup-entry.js:5232)と同形。 */
const venuePersonTileIo = {
  storyAvatarLoadGuard: venueAvatarLoadGuard,
  isHttpOrHttpsUrl,
  storyTileUsesYukkuriTvStyle,
  upgradeAnonymousAvatarImage
};

const STORY_GUIDE_FACE_LINK =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_KONTA =
  'images/yukkuri-charactore-english/konta/kitsune-yukkuri-half-eyes-mouth-closed.png';
const STORY_GUIDE_FACE_GIFT = STORY_GUIDE_FACE_KONTA;
const STORY_GUIDE_FACE_TANU =
  'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png';

/**
 * @param {string} rel
 * @returns {string}
 */
function resolveVenueAssetUrl(rel) {
  try {
    return typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL(rel)
      : rel;
  } catch {
    return rel;
  }
}

/**
 * 会場の participant から人物タイル要素(buildPersonTileEl)を作る共通ヘルパ。
 *
 * 席ループと「応援者トップNバー」で【同じ描画】を使うために切り出した(2026-07-01 会議
 * venue-role-separation フェーズ2)。avatar 解決順(http→数値ID由来→ゆっくり顔)・meta 表記・
 * 匿名の顔(identicon)は popup と同じ正本を通す=バー側で opts を渡し忘れて匿名の顔が崩れる
 * (handoff 地雷#3)を構造的に防ぐ。タイル本体は buildPersonTileEl(personTileDom.js)一本。
 *
 * @param {{ userId?: string, name?: string, avatar?: string, key?: string }} participant
 * @param {string} [fallbackLabel] userId も key も無いときの表示名(席番号など)
 * @returns {HTMLElement}
 */
function buildVenuePersonTile(participant, fallbackLabel = '会場') {
  const p = participant && typeof participant === 'object' ? participant : {};
  const uid = String(p.userId || '').trim();
  const rawName = String(p.name || '').trim();
  const displayName =
    rawName || (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(String(p.key || fallbackLabel)));
  const avatarUrl = String(p.avatar || '').trim();
  const derivedAvatar = deriveNicoUserIconUrl(uid);
  const yukkuriFace = uid ? anonymousIdenticonDataUrl(uid, 64) : '';
  const avatarSrc = avatarUrl || derivedAvatar || yukkuriFace;
  const meta = storyUserLaneMetaLines({ userId: uid, nickname: rawName }, avatarUrl, '');
  return buildPersonTileEl(
    { displaySrc: avatarSrc, title: displayName, meta, entry: { userId: uid } },
    venuePersonTileIo
  );
}

/**
 * 診断パネル等で表示名を innerHTML に差し込む前に HTML エスケープする。
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    /*
     * 2026-06-14 星野アイデア会議2「熱量の色温度」: 下端(客席)の照明色をコメント速度連動で
     * 注入する。--nlsb-heat-color(涼=青紫→暖=オレンジ)/ --nlsb-heat-opacity(過疎=ほぼ透明→
     * 怒涛=濃い)を JS が更新。映像中央は素通しのまま(下端だけ色温度が変わる)。
     * 既定は涼色・薄めにして未設定時も従来の雰囲気を壊さない。
     */
    --nlsb-heat-color: rgb(120, 130, 200);
    --nlsb-heat-opacity: 0.12;
    background:
      radial-gradient(ellipse 70% 24% at 50% 0%, rgba(120, 165, 224, 0.16), transparent 70%),
      radial-gradient(
        ellipse 96% 30% at 50% 100%,
        color-mix(in srgb, var(--nlsb-heat-color) calc(var(--nlsb-heat-opacity) * 100%), transparent),
        transparent 74%
      );
    opacity: 0;
    transform: translateY(18px);
    visibility: hidden;
    pointer-events: none;
    overscroll-behavior: contain;
    transition:
      opacity 180ms ease,
      transform 180ms ease,
      visibility 0s linear 180ms,
      background 800ms ease;
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
  /* v0.1.772: 閉じるは右上隅(absolute)でなくヘッダー右端の他ボタンと並べる(nlsb-comeview-btn 流用)。
     閉じる専用に薄赤の見た目を上書きして「閉じる」と分かりやすくする。 */
  .nlsb-close-btn {
    border-color: rgba(255, 150, 150, 0.45);
    background: rgba(60, 30, 34, 0.7);
    color: #ffd2cf;
  }
  .nlsb-close-btn:hover {
    background: rgba(90, 40, 46, 0.92);
    border-color: rgba(255, 170, 170, 0.7);
  }
  .nlsb-close-btn:focus-visible {
    outline: 2px solid #ffb4a2;
    outline-offset: 2px;
  }
  /* v0.1.770 VOICEVOX 起動待ちの「楽しいローディング」(会議 2026-06-16):
     会場は『開演前の期待感』。控えめにふわっと脈動する(派手すぎ厳禁=過去にリバーブ等は却下)。
     遅延ガード(180ms)は JS 側で制御し、一瞬成功ではこの class が付かない=チラつかない。 */
  .nlsb-voice-status.is-loading {
    color: #ffd98a;
    animation: nlsb-voice-loading 1.25s ease-in-out infinite;
  }
  .nlsb-voice-status.is-error {
    color: #ffb4a2;
    animation: none;
  }
  @keyframes nlsb-voice-loading {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-voice-status.is-loading {
      animation: none;
      opacity: 0.92;
    }
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
    /*
     * 2026-06-22 会場スペース拡大(ユーザー要望「席を画面いっぱいに広げる」):
     *   旧 width:min(1500px,100%);margin:0 auto は広い画面で左右に余白を残し、seatsHost の
     *   clientWidth が 1500px で頭打ち→perRow(seatsPerRow)が伸びず席が画面端まで並ばなかった
     *   (実機「会場スペースが狭い」不満の核)。全幅にすると seatsHost.clientWidth=実画面幅となり
     *   perRow が自然に増え、resolveVisibleArenaCount(perRow×8段)で同時表示席が画面端まで埋まる。
     *   「全員載せる」ロジック(buildVenueSeating の論理席/resolveDynamicArenaCap の人数連動上限)は
     *   一切変えない=全幅化で『ほか N人』に回る人が減り、より多くが席に出る方向にだけ働く。
     *   映像セーフエリア(上段 safe)は縦分割で守られるので全幅でも映像は覆わない。
     */
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
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
      "topbar"
      "seats";
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    position: relative; /* 3キャラ常駐レイヤー(.nlsb-residents)の絶対配置の基準 */
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    /* スモークを薄く: 名前が読める最低限の暗さだけ残し、下の映像を極力透けさせる。 */
    background: rgba(9, 13, 19, 0.28);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    overscroll-behavior: contain;
    pointer-events: auto;
  }
  /* 3キャラ常駐(りんく・こん太・たぬ姉): 配信画面の「まわり(左右の縁)」に出す。会場の席とは
     重ねない=満員でも邪魔にしない(ユーザー実機指摘の根治)。3人が画面を囲んで一緒に観てる感。
     stageLayout 全面を覆う透明レイヤー・pointer-events:none で映像/クリック/席リンクを邪魔しない。 */
  .nlsb-residents {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
  }
  .nlsb-resident {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: clamp(40px, 4.4vw, 64px);
  }
  /* 配置: りんく=左上・たぬ姉=左下(縦に2人)・こん太=右中央。映像の左右の縁に寄せ中央は空ける。 */
  .nlsb-resident-rinku   { left: 6px;  top: 8%; }
  .nlsb-resident-tanunee { left: 6px;  top: 34%; }
  .nlsb-resident-konta   { right: 6px; top: 18%; }
  .nlsb-resident-img {
    width: 100%;
    height: auto;
    object-fit: contain;
    /* 実視聴者と区別する金色の光。reduced-motion でも静的グローは残す。 */
    filter: drop-shadow(0 0 6px rgba(255, 206, 96, 0.9)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
    animation: nlsb-resident-glow 2.8s ease-in-out infinite;
  }
  .nlsb-resident-name {
    margin-top: 1px;
    font-size: 10px;
    font-weight: 700;
    color: #ffe7b0;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    white-space: nowrap;
  }
  @keyframes nlsb-resident-glow {
    0%, 100% { filter: drop-shadow(0 0 5px rgba(255, 206, 96, 0.7)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
    50% { filter: drop-shadow(0 0 9px rgba(255, 220, 120, 1)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-resident-img { animation: none; }
  }
  /* v0.1.777 額縁フレーム: 3キャラ全表情サムネを四辺に沿って並べ会場を囲む。中央(映像)と
     コメント欄は触らない。各タイルは JS が edge(top/right/bottom/left)と pos(0..1)を data 属性で渡し、
     ここで辺に貼り付ける。軽量 .thumb128 を使い負荷を抑える。 */
  .nlsb-charframe {
    position: absolute;
    inset: 0;
    z-index: 4; /* 客席(seats)より背面・映像セーフエリアより前。吹き出し(z5)/常駐(z6)より背面 */
    pointer-events: none;
    overflow: hidden;
  }
  .nlsb-charframe-tile {
    position: absolute;
    width: clamp(26px, 2.6vw, 40px);
    height: auto;
    opacity: 0.85;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
  }
  .nlsb-charframe-tile[data-edge="top"]    { top: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="bottom"] { bottom: 2px; transform: translateX(-50%); }
  .nlsb-charframe-tile[data-edge="left"]   { left: 2px; transform: translateY(-50%); }
  .nlsb-charframe-tile[data-edge="right"]  { right: 2px; transform: translateY(-50%); }
  /* v0.1.778 ギフト/広告の投げ演出: 投げ主のサムネ座標から中央映像へ放物線で飛ぶ。
     bubbleLayer(最前面・overflow外)に乗せ、JS は起点 left/top と --dx/--dy/--mid* を CSS 変数で
     渡すだけ=GPU アニメで毎フレーム JS 計算しない。プール再利用+同時上限で会場を重くしない。 */
  .nlsb-gift-proj {
    position: absolute;
    z-index: 7; /* 吹き出し(z5)・常駐(z6)より前=投げ物は最前面で映像へ飛ぶ */
    display: none;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(20, 24, 32, 0.82);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    will-change: transform, opacity;
    /* v0.1.783: テキスト投げ物のみ screen 合成(中央映像を隠しすぎない)。
       実画像(is-image)は写真調なので screen を外し、はっきり見せる。 */
    mix-blend-mode: screen;
    transform: translate(-50%, -50%);
  }
  /* v0.1.783: 実画像の投げ物。pill 背景を消して画像そのものを大きく飛ばす。 */
  .nlsb-gift-proj.is-image {
    padding: 0;
    background: transparent;
    border-radius: 0;
    mix-blend-mode: normal;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
  }
  .nlsb-gift-proj-img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    display: block;
  }
  .nlsb-gift-proj.is-flying {
    display: inline-flex;
    animation: nlsb-gift-fly var(--nlsb-gift-dur, 1500ms) cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  }
  .nlsb-gift-proj-emoji { font-size: 18px; }
  /* v0.1.783「一瞬で見えない」改善: 着弾(70%)で一度大きく見せて(バースト)から、
     余韻を残してフェード。以前は終端で scale(0.45)+opacity0 に縮んで消え、見る間もなかった。 */
  @keyframes nlsb-gift-fly {
    0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
    10%  { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
    55%  { transform: translate(calc(-50% + var(--nlsb-gift-mx)), calc(-50% + var(--nlsb-gift-my))) scale(1.14) rotate(7deg); opacity: 1; }
    72%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.35) rotate(-3deg); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1.05) rotate(-2deg); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-gift-proj.is-flying {
      animation: nlsb-gift-fade var(--nlsb-gift-dur, 1500ms) ease-out forwards;
    }
    /* reduced-motion: 飛ばさず、着弾点でふわっと出して消える(余韻は残す)。 */
    @keyframes nlsb-gift-fade {
      0%   { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
      20%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      80%  { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0.95; }
      100% { transform: translate(calc(-50% + var(--nlsb-gift-dx)), calc(-50% + var(--nlsb-gift-dy))) scale(1); opacity: 0; }
    }
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
  /* 2026-07-01 会議(venue-role-separation フェーズ2): ひな壇上部「応援者トップNバー」。
     密集会場でも上位が必ず大きく見える。高さ固定=下の席を揺らさない(v0.1.1026 高さ振動対策)。 */
  .nlsb-topbar {
    grid-area: topbar;
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    height: 72px;
    padding: 4px 14px;
    overflow-x: auto;
    overflow-y: hidden;
    background: linear-gradient(180deg, rgba(255, 210, 110, 0.10), rgba(14, 19, 27, 0.0));
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    scrollbar-width: thin;
  }
  .nlsb-topbar[hidden] { display: none; }
  .nlsb-topbar-label {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 700;
    color: #ffd88a;
    letter-spacing: 0.04em;
    writing-mode: vertical-rl;
    text-orientation: upright;
    line-height: 1;
    opacity: 0.9;
  }
  .nlsb-topbar-list {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .nlsb-topbar-cell {
    position: relative;
    flex: 0 0 auto;
    width: 56px;
  }
  /* トップバーのアバターは席より大きく主役感を出す(顔=買った本物タイル buildPersonTileEl 流用)。 */
  .nlsb-topbar-cell .nl-story-userlane-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
  }
  .nlsb-topbar-cell .nl-story-userlane-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.25);
  }
  .nlsb-topbar-cell .nl-story-userlane-meta {
    max-width: 56px;
    overflow: hidden;
    font-size: 9px;
    line-height: 1.15;
    text-align: center;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* 上位3位は金・銀・銅の縁 + 順位バッジ(席と同じ🥇🥈🥉)。静的=ピカピカしない。 */
  .nlsb-topbar-cell[data-venue-rank] .nl-story-userlane-avatar { border-width: 3px; }
  .nlsb-topbar-cell[data-venue-rank='1'] .nl-story-userlane-avatar { border-color: #ffcf5a; }
  .nlsb-topbar-cell[data-venue-rank='2'] .nl-story-userlane-avatar { border-color: #d8dde6; }
  .nlsb-topbar-cell[data-venue-rank='3'] .nl-story-userlane-avatar { border-color: #e0a878; }
  .nlsb-topbar-cell[data-venue-rank]::after {
    position: absolute;
    top: -4px;
    right: 2px;
    z-index: 2;
    font-size: 15px;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .nlsb-topbar-cell[data-venue-rank='1']::after { content: '🥇'; }
  .nlsb-topbar-cell[data-venue-rank='2']::after { content: '🥈'; }
  .nlsb-topbar-cell[data-venue-rank='3']::after { content: '🥉'; }
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
    display: block;
    gap: clamp(0px, 0.2vh, 4px);
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(10px, 2vh, 22px) 14px;
    --nl-surface: rgba(255, 255, 255, 0.96);
    --nl-border: rgba(78, 109, 148, 0.26);
    --nl-text: #243244;
    --nl-text-sub: #56687d;
    --nl-muted: #6f7c8b;
    --nl-user-accent: #5aa7ff;
    /*
     * 横スクロールバー根絶(ユーザー不満「位置がずれてスクロールバーが出て変な動きで
     * 見えなくなる」): 同時表示人数は selectStableVisibleMembers で行に収まる数に制限済み
     * なので横溢れは起きないが、保険として overflow-x:hidden で横スクロールを構造的に殺す。
     * 縦も clip(段数が増えても下端 35vh に収め、映像へはみ出さない)。 -> 見切れる不満解消のため auto に変更
     */
    overflow-x: hidden;
    overflow-y: auto;
    /* 2026-06-14 会議(摩擦ゼロUI): 会場は左ドラッグでパンできる=grab カーソルで掴めると示す。
       席リンク(.nlsb-seat-link)上はリンクカーソルを優先(下のセレクタで上書き)。
       v0.1.738: パンできる(縦に溢れている)時だけ grab を出す=掴めるのに動かない誤解を防ぐ。
       全席が画面に収まる時は通常カーソル。.nlsb-can-pan を renderSeats が溢れ時に付与。 */
    cursor: default;
    touch-action: pan-y;
    background:
      radial-gradient(ellipse at 50% 100%, rgba(102, 144, 190, 0.16), transparent 62%);
    overscroll-behavior: contain;
    contain: layout paint;
  }
  .nlsb-seats.nlsb-mode-empty {
    display: grid;
    place-items: center;
  }
  /* LANE_CSS_SYNC_BEGIN popup.html:829-1067 */
  .nlsb-venue-lane-stack.nl-story-userlane-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: visible;
    margin: 0 0 4px;
    min-height: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-wrap--gift {
    padding: 6px 6px 4px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 82%, #e8b84a 18%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 70%, #d4a017 30%);
  }
  .nlsb-venue-lane-stack .nl-story-userlane-tier-hint {
    margin: 0;
    padding: 4px 6px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.4;
    color: var(--nl-text-sub);
    border-radius: 8px;
    background: color-mix(in srgb, var(--nl-surface) 88%, #b8a06a 12%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 75%, #c9a227 25%);
  }
  .nlsb-venue-lane-stack .nl-story-userlane {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    align-content: flex-start;
    gap: 6px 8px;
    margin: 0;
    min-height: 0;
    max-height: none;
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    flex-shrink: 0;
    max-width: 100%;
    min-width: 0;
    border-radius: 999px;
    padding-right: 6px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell--accent {
    padding: 3px 5px 3px 3px;
    background: color-mix(in srgb, var(--nl-user-accent) 20%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-user-accent) 48%, transparent);
  }
  .nlsb-venue-lane-stack a.nl-story-userlane-cell--linkable {
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    transition: background-color 0.12s;
  }
  .nlsb-venue-lane-stack a.nl-story-userlane-cell--linkable:hover {
    background-color: color-mix(in srgb, var(--nl-border) 40%, transparent);
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-width: 0;
    max-width: min(118px, 30vw);
    font-size: 10px;
    line-height: 1.22;
    text-align: left;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__id,
  .nlsb-venue-lane-stack .nl-story-userlane-meta__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__id {
    color: var(--nl-text-sub);
    font-weight: 600;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-meta__name {
    color: var(--nl-text);
    font-weight: 500;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-avatar {
    width: 38px;
    height: 38px;
    border-radius: 999px;
    object-fit: cover;
    object-position: center;
    border: 1.5px solid color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    box-shadow: 0 1px 3px rgb(2 17 31 / 22%);
    background: var(--nl-surface);
    flex-shrink: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-avatar.nl-avatar--tv-fallback {
    object-fit: contain;
    padding: 3px;
    background: linear-gradient(180deg, #efebe9, #d7ccc8);
    border-color: color-mix(in srgb, #8d6e63 55%, var(--nl-border) 45%);
  }
  /* ★v0.1.1049: サムネ持ち=大(現状38px維持) / 匿名(実サムネ無し)=小・ぎゅうぎゅう詰め。
     popup.html と同じ規約([data-thumb="0"] 側のみ・displaySrc が http か)を会場にも。
     VIP金縁/streak/順位バッジは border/box-shadow を触るだけ=サイズ非依存で競合しない。 */
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-avatar {
    width: 22px;
    height: 22px;
    border-width: 1px;
    box-shadow: none;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] {
    gap: 4px;
    padding-right: 4px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-cell[data-thumb="0"] .nl-story-userlane-meta {
    font-size: 9px;
    max-width: 72px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    margin: 0 0 6px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__lines {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__line {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 5px 8px;
    border-radius: 10px;
    background: linear-gradient(180deg, #fffaf0, #fff4db);
    border: 1px solid #f5d28d;
    color: #6b4f18;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.38;
    box-shadow: 0 1px 5px rgb(148 101 14 / 9%);
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__face {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    object-fit: cover;
    object-position: center;
    border: 1px solid color-mix(in srgb, var(--nl-border) 82%, #fff 18%);
    background: var(--nl-surface);
    flex: 0 0 auto;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__foot {
    margin: 2px 0 0;
    padding: 0 2px;
    font-size: 10px;
    font-weight: 800;
    color: var(--nl-muted);
    line-height: 1.35;
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note {
    margin: 4px 0 2px;
    padding: 8px 10px;
    font-size: clamp(10px, 2.4vw, 11px);
    line-height: 1.45;
    font-weight: 600;
    color: var(--nl-text-sub);
    border-radius: 10px;
    background: color-mix(in srgb, var(--nl-surface) 92%, var(--nl-border) 8%);
    border: 1px solid color-mix(in srgb, var(--nl-border) 70%, transparent);
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note-p {
    margin: 0 0 6px;
  }
  .nlsb-venue-lane-stack .nl-story-userlane__empty-note-p:last-child {
    margin-bottom: 0;
  }
  .nlsb-venue-lane-stack .nl-story-userlane-guide__count {
    color: #9a6f12;
    font-weight: 800;
  }
  /* LANE_CSS_SYNC_END */
  .nlsb-seat {
    position: relative;
    display: inline-flex;
    min-width: 0;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: visible;
  }
  .nlsb-seats.nlsb-can-pan {
    cursor: grab;
  }
  .nlsb-seats.nlsb-is-grabbing {
    cursor: grabbing;
    user-select: none;
  }
  /* 診断: メンバー一覧パネル(モーダル風)。会場の上に重ねて出す。 */
  .nlsb-roster-panel {
    position: absolute;
    top: 8%;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, 92vw);
    max-height: 72vh;
    z-index: 6;
    display: flex;
    flex-direction: column;
    background: rgba(18, 22, 30, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    color: #eef1f6;
    font-size: 13px;
    overflow: hidden;
  }
  .nlsb-roster-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }
  .nlsb-roster-close {
    /* v0.1.738: 当たり判定を広げ(36x36)確実に押せるように。背景を薄く付けて存在を明示。 */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    color: #eef1f6;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 8px;
  }
  .nlsb-roster-close:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .nlsb-roster-close:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
  }
  .nlsb-roster-summary {
    padding: 8px 14px;
    font-size: 12px;
    color: #b9c2d0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .nlsb-roster-list {
    overflow-y: auto;
    padding: 6px 0;
  }
  .nlsb-roster-row {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
  }
  .nlsb-roster-row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.03);
  }
  .nlsb-roster-seat {
    color: #8b94a3;
    font-variant-numeric: tabular-nums;
  }
  .nlsb-roster-who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nlsb-roster-badge {
    display: inline-block;
    margin-left: 4px;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 11px;
  }
  .nlsb-roster-badge.thumb { background: rgba(255, 200, 90, 0.25); color: #ffd66f; }
  .nlsb-roster-badge.gift { background: rgba(120, 200, 255, 0.22); color: #9fd4ff; }
  .nlsb-roster-badge.on { background: rgba(120, 220, 140, 0.22); color: #9fe6af; }
  .nlsb-roster-badge.off { background: rgba(255, 255, 255, 0.08); color: #99a2b0; }
  .nlsb-roster-empty {
    padding: 24px 14px;
    text-align: center;
    color: #99a2b0;
  }
  /* 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネルの中身。roster と同じ overlay 枠を流用し、
     内側の文章だけをここで整える。件数のみ・PII なし(純関数 venueAvatarDiagLine.js が組む)。 */
  .nl-venue-diag {
    padding: 12px 14px 14px;
    line-height: 1.7;
    font-size: 13px;
    color: #d7dce6;
  }
  .nl-venue-diag p { margin: 0 0 8px; }
  .nl-venue-diag p:last-child { margin-bottom: 0; }
  .nl-venue-diag strong { color: #fff; }
  .nl-venue-diag__warn { color: #ffcf7a; }
  .nl-venue-diag__ok { color: #9fe6af; }
  .nl-venue-diag__foot {
    font-size: 11px;
    color: #99a2b0;
  }
  .nlsb-seat.nlsb-is-empty {
    display: none;
    opacity: 0.12;
    pointer-events: none;
    filter: blur(0.5px);
  }
  /* 2026-06-15 星野ロミ会議(サムネ優遇を"一目で特別"に): 1.12倍では脳が比較を要求し
     ノイズとして処理される(ユーザー実機「特別になってない」)→倍率の"断絶"を作る。
     会議7体一致=scale 1.45(28→約40px)で「大きい=重要」を本能で認識させる。金縁を太く
     はっきり+明るさ+12%。脈動は付けない(止まった大きさ=存在そのもの・上品さを保つ)。 */
  .nlsb-seat.nlsb-seat-vip .nl-story-userlane-avatar {
    filter: brightness(1.12);
    border-color: rgba(255, 220, 130, 1);
    box-shadow: 0 0 0 2px rgba(255, 206, 96, 0.55), 0 0 10px 1px rgba(255, 190, 70, 0.42), 0 1px 3px rgb(2 17 31 / 22%);
    z-index: 5;
  }
  /* 2026-07-01 会議(venue-grid-diag): 応援者ランキング上位3位の席に順位バッジを重ねる。
     旧「金色オーラで脈動」はユーザー要望で廃止(ピカピカ演出なし)。バッジは席の右上に
     絵文字(🥇🥈🥉)を絶対配置で重ねるだけ=高さ・レイアウトを一切変えない(v0.1.1026 の
     高さ振動を原理的に踏まない)。脈動・アニメーションは付けない(上品さ・静けさを保つ)。 */
  .nlsb-seat[data-venue-rank] {
    position: relative;
  }
  .nlsb-seat[data-venue-rank]::after {
    position: absolute;
    top: -2px;
    right: -2px;
    z-index: 6;
    font-size: 0.9em;
    line-height: 1;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  }
  .nlsb-seat[data-venue-rank='1']::after { content: '🥇'; }
  .nlsb-seat[data-venue-rank='2']::after { content: '🥈'; }
  .nlsb-seat[data-venue-rank='3']::after { content: '🥉'; }
  /* v0.1.742 一緒に過ごしている感(co-presence): 誰かがコメントした瞬間、その人の席が
     ふわっと一度だけ反応する。吹き出しだけでなく「会場が一人ひとりの発言に反応する」ことで
     一緒にいる感を強める(星野式・摩擦ゼロ=自動・設定不要)。0.6秒で1回だけ・上品に。 */
  .nlsb-seat.nlsb-seat-speaking .nl-story-userlane-avatar {
    animation: nlsb-seat-speak 0.6s ease-out;
  }
  @keyframes nlsb-seat-speak {
    0% {
      transform: scale(1);
    }
    35% {
      transform: scale(1.18);
      filter: brightness(1.15);
    }
    100% {
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat.nlsb-seat-speaking .nl-story-userlane-avatar {
      animation: none;
    }
  }
  /* v0.1.743 「会話の連鎖」(会議の最大多数決の本命・弱点A/C): 同じ人が短い間隔で続けて喋ると、
     その席が段階的に暖色(コーラル)で輝き、連続するほど強く速く脈動する=「溜まっていく感」。
     金色オーラ(.nlsb-seat-regular=支えてる人)とは別軸の「いま盛り上げてる人」を引き立てる。
     data-streak=1..4 を JS が席に付け、段階ごとに色の強さ/脈動速度が上がる。発言が途切れると
     prune で data-streak が外れて自然に消える。*/
  .nlsb-seat[data-streak] .nl-story-userlane-avatar {
    box-shadow: 0 0 9px 2px rgba(255, 138, 92, 0.6), inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    animation: nlsb-seat-streak 1.4s ease-in-out infinite;
    z-index: 4;
  }
  .nlsb-seat[data-streak="2"] .nl-story-userlane-avatar { box-shadow: 0 0 11px 3px rgba(255, 132, 86, 0.72), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.2s; }
  .nlsb-seat[data-streak="3"] .nl-story-userlane-avatar { box-shadow: 0 0 13px 4px rgba(255, 120, 80, 0.82), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 1.0s; }
  .nlsb-seat[data-streak="4"] .nl-story-userlane-avatar { box-shadow: 0 0 16px 5px rgba(255, 108, 74, 0.92), inset 0 0 0 1px rgba(0, 0, 0, 0.12); animation-duration: 0.85s; }
  @keyframes nlsb-seat-streak {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.18); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-seat[data-streak] .nl-story-userlane-avatar {
      animation: none;
    }
  }
  /* 数値 ID 持ち=クリックでユーザーページへ飛べるリンク。会場は開時のみ操作可能。
     リンク本体は本物タイルの a.nl-story-userlane-cell--linkable が持つので、ラッパー(.nlsb-seat-link)は
     カーソルとヒットテスト透過だけを担う。 */
  a.nlsb-seat-link,
  .nlsb-seat.nlsb-seat-link {
    cursor: pointer;
    pointer-events: auto;
  }
  .nlsb-seat .nl-story-userlane-cell {
    pointer-events: auto;
  }
  .nlsb-seat-link:hover .nl-story-userlane-meta__name {
    color: #bfe1ff;
    text-decoration: underline;
  }
  .nlsb-seat-link:hover .nl-story-userlane-avatar {
    border-color: rgba(191, 225, 255, 0.6);
  }
  .nlsb-seat-link:focus-visible {
    outline: 2px solid #8dc8ff;
    outline-offset: 2px;
    border-radius: 3px;
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
  /* v0.1.800「吹き出しと読み上げを同時に立ち上げる」(会議 案C・2段階表示):
     読み上げONのとき、声が鳴り始める前は「仮(淡い・少し小さい)」で出し、onAudioStart で
     仮 class を外す瞬間に「本(鮮明・等倍)」へ瞬時昇格=声と同時に立ち上がった体感を作る。
     声非依存(v0.1.757)は不変: 仮でも必ず即出る・声が来なければ仮のまま流速寿命で消える。
     transition は短く(120ms)=「遅延」と感じない範囲で昇格のメリハリだけ付ける。 */
  .nlsb-bubble.nlsb-bubble-previoice {
    opacity: 0.78;
    transform: translateY(-100%) scale(0.965);
    transform-origin: bottom center;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-previoice {
      transform: translateY(-100%);
      transition: none;
    }
  }
  /* v0.1.773 軽い同期: 読み上げが鳴り始めた瞬間に一度だけ淡く光らせ「声＝この吹き出し」を結ぶ。
     上品に1回だけ(派手すぎ厳禁)。即時表示は変えない=即時性は維持。 */
  .nlsb-bubble.nlsb-bubble-voiced {
    animation: nlsb-bubble-voiced 620ms ease-out;
  }
  @keyframes nlsb-bubble-voiced {
    0% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0.55); }
    40% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 5px rgba(141, 200, 255, 0.32); }
    100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34), 0 0 0 0 rgba(141, 200, 255, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .nlsb-bubble.nlsb-bubble-voiced { animation: none; }
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
    .nlsb-bubble {
      animation: none;
    }
  }
`;

// colorFromKey(名前/IDから色生成)は person-tile-unify 第3コミットで不要になり削除。
//   席タイルは本物 buildPersonTileEl が描き、アバター枠の背景は CSS(.nl-story-userlane-avatar)が担う。

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
 * 席ノードを作る。person-tile-unify 第3コミット(2026-06-22): 席タイル本体は描かず、
 *   演出(VIP/常連/発話/streak)を被せる【ラッパー】だけを用意する。タイル本体は renderSeats で
 *   popup の本物 buildPersonTileEl を差し込む(顔ぶれ・見た目を popup「アイコン列」と一致)。
 *
 *   ラッパーは <div>(<a> ではない): リンク(クリックでユーザーページ)は本物タイルが自前で
 *   <a href> を持つ(buildPersonTileEl が linkable 判定で生成)。ラッパーを <a> にすると <a>in<a>
 *   入れ子になるため div にして、リンク判定は popup と同一基準(本物タイル)へ完全に委ねる。
 *
 * @param {number} seatIndex
 */
function createSeatNode(seatIndex) {
  const seat = document.createElement('div');
  seat.className = 'nlsb-seat nlsb-is-empty';
  seat.dataset.seatIndex = String(seatIndex);
  seat.setAttribute('aria-hidden', 'true');
  // tile: renderSeats が buildPersonTileEl で作る本物タイル要素(.nl-story-userlane-cell)。
  //   座標測定(吹き出し/ギフト)は tile 内の .nl-story-userlane-avatar を基準にする。
  return { seat, tile: /** @type {HTMLElement|null} */ (null) };
}

/**
 * 会場用の応援レーンDOM骨格を組む。
 * popup/status/live-view と同じ共有 renderer に渡すための要素セットだけを作る。
 * @returns {any}
 */
function createVenueStoryLaneDom() {
  const stack = document.createElement('div');
  stack.className = 'nl-story-userlane-stack nlsb-venue-lane-stack';
  stack.hidden = true;

  const makeGuide = () => {
    const guide = document.createElement('div');
    guide.className = 'nl-story-userlane-guide';
    const lines = document.createElement('div');
    lines.className = 'nl-story-userlane-guide__lines';
    guide.appendChild(lines);
    return { guide, lines };
  };
  /** @param {string} laneName */
  const makeLane = (laneName) => {
    const lane = document.createElement('div');
    lane.className = 'nl-story-userlane';
    lane.dataset.laneName = laneName;
    lane.hidden = true;
    return lane;
  };
  const makeWrap = (className = '') => {
    const wrap = document.createElement('div');
    wrap.className = `nl-story-userlane-tier-wrap${className ? ` ${className}` : ''}`;
    return wrap;
  };

  const top = makeGuide();
  const giftGuide = makeGuide();
  const adGuide = makeGuide();
  const kontaGuide = makeGuide();
  const tanuGuide = makeGuide();
  const bottom = makeGuide();

  const linkWrap = makeWrap();
  const giftWrap = makeWrap('nl-story-userlane-tier-wrap--gift');
  const adWrap = makeWrap('nl-story-userlane-tier-wrap--gift');
  const kontaWrap = makeWrap();
  const tanuWrap = makeWrap();

  const laneLink = makeLane('link');
  const laneGift = makeLane('gift');
  const laneAd = makeLane('ad');
  const laneKonta = makeLane('konta');
  const laneTanu = makeLane('tanu');

  const hintLink = document.createElement('div');
  hintLink.className = 'nl-story-userlane-tier-hint';
  hintLink.textContent = 'りんく候補はまだ少なめです。下の段も会場の応援者です。';
  hintLink.hidden = true;

  linkWrap.append(laneLink, hintLink);
  giftWrap.append(giftGuide.guide, laneGift);
  adWrap.append(adGuide.guide, laneAd);
  kontaWrap.append(kontaGuide.guide, laneKonta);
  tanuWrap.append(tanuGuide.guide, laneTanu);
  stack.append(top.guide, linkWrap, giftWrap, adWrap, kontaWrap, tanuWrap, bottom.guide);

  return {
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
    guideTop: top.guide,
    guideLinesTop: top.lines,
    guideMidGift: giftGuide.guide,
    guideLinesMidGift: giftGuide.lines,
    guideMidAd: adGuide.guide,
    guideLinesMidAd: adGuide.lines,
    guideMidKonta: kontaGuide.guide,
    guideLinesMidKonta: kontaGuide.lines,
    guideMidTanu: tanuGuide.guide,
    guideLinesMidTanu: tanuGuide.lines,
    guideBottom: bottom.guide,
    guideLinesBottom: bottom.lines
  };
}

/**
 * 席の「アイコン位置」基準要素を返す。person-tile-unify 第3コミット: 旧 node.icon の代替。
 *   本物タイル内のアバター img(.nl-story-userlane-avatar)があればそれ、無ければタイル全体、
 *   それも無ければラッパー(seat)。吹き出し・ギフトの座標起点に使う。
 * @param {{ seat: HTMLElement, tile: HTMLElement|null }} node
 * @returns {HTMLElement|null}
 */
function seatAnchorEl(node) {
  if (!node) return null;
  const tile = node.tile;
  if (tile) {
    const avatar = tile.querySelector('.nl-story-userlane-avatar');
    if (avatar instanceof HTMLElement) return avatar;
    return tile;
  }
  return node.seat || null;
}

/**
 * v0.1.753: 拡張コンテキストが有効か(content-entry.js の hasExtensionContext と同義)。
 * 拡張を更新/リロードすると、開きっぱなしの古いタブの content script は
 * 「Extension context invalidated」状態になり chrome.* が全失敗する。chrome.runtime.id が
 * undefined 化するのを唯一の検知点として、storage 呼び出しが throw する前に先回りで判定する。
 * @returns {boolean}
 */
function hasVenueExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id && chrome?.storage?.local);
  } catch {
    return false;
  }
}

/**
 * ニコ生 watch ページに独立 fixed レイヤーの会場モード UI を1個だけ追加する。
 * @param {{ standalone?: boolean }} options
 */
export function mountVenueBarButton(options = {}) {
  const isStandalone = !!options.standalone;
  // v0.1.752: 未マウント時も呼び出し側が null チェック不要なよう no-op API を返す。
  const NOOP_API = { onLiveComments: () => {} };
  if (!liveIdFromPathname()) return NOOP_API;
  if (document.getElementById(ROOT_ID)) return NOOP_API;
  const parent = isStandalone ? document.body : document.documentElement;
  if (!parent) return NOOP_API;

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
  // v0.1.772 ユーザー指摘「閉じるは会場モードの近く(=ヘッダー)に無いとわかりにくい」:
  //   右上隅の absolute 配置(nlsb-close)をやめ、ヘッダー右端に他のボタンと並べる(nlsb-comeview-btn
  //   スタイル流用)。nlsb-close-btn は閉じる専用の見た目(薄赤)を当てるための追加クラス。
  close.className = 'nlsb-comeview-btn nlsb-close-btn';
  close.textContent = '✕ 閉じる';
  close.title = '会場モードを閉じます';

  // v0.1.770 ユーザー要望「会場モードの閉じるボタンも会場のタブにつけて」:
  //   別窓化した会場タブ(standalone=venue.html)にも閉じるボタンを出す。インライン版は会場を畳むだけ
  //   だが、standalone は専用タブなので【タブごと閉じる】(window.close())。OBS キャプチャ用途では
  //   ツールバーを出したくないので OBS モードのときだけ従来どおり隠す。
  const isObsCapture = (window.name || '').includes('OBS') || window.location.search.includes('obs=');
  if (isStandalone) {
    toggle.style.display = 'none';
    if (isObsCapture) {
      close.style.display = 'none';
    } else {
      close.textContent = '✕ タブを閉じる';
      close.title = '会場タブを閉じます';
    }
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
  // 診断: 今会場にいるメンバー一覧ボタン(AIも人間も検証用・誰が顔付き席/点描か)。
  const rosterBtn = document.createElement('button');
  rosterBtn.type = 'button';
  rosterBtn.className = 'nlsb-comeview-btn';
  rosterBtn.textContent = '👥 一覧';
  rosterBtn.title = '今この会場にいるメンバーの一覧(診断)を開く';
  rosterBtn.addEventListener('click', () => toggleRosterPanel());
  // 2026-07-01 会議(venue-diag): 会場の状態(参加者/席/アバター解決率/配信者混入)を平易に出す
  //   折りたたみ診断。既定は畳む(没入 UI を邪魔しない)。overlay なので席の高さを侵さない。
  const diagBtn = document.createElement('button');
  diagBtn.type = 'button';
  diagBtn.className = 'nlsb-comeview-btn';
  diagBtn.textContent = '🩺 状態';
  diagBtn.title = '会場の状態(参加者数・アバター解決率など)を開く';
  diagBtn.addEventListener('click', () => toggleDiagPanel());
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
  // 2026-06-22 会場「全員500人」: 席上限の表示も実定数に追従させる(150 固定の取り残しを是正)。
  note.textContent = `全コメント集計・最大${VENUE_FULLSCREEN_MAX_SEATS}席`;
  // v0.1.772: 閉じるボタンをヘッダー右端に並べる(会場の操作ボタンを一箇所に集約)。
  //   OBS キャプチャ時は close.style.display='none' 済みなので append しても表示されない。
  if (venueWindowBtn) {
    headerRight.append(rosterBtn, diagBtn, comeviewBtn, voiceBtn, voiceStatus, venueWindowBtn, note, close);
  } else {
    headerRight.append(rosterBtn, diagBtn, comeviewBtn, voiceBtn, voiceStatus, note, close);
  }
  header.append(title, headerRight);

  // 2026-07-01 会議(venue-role-separation フェーズ2 = 可視性回復): ひな壇の【上】に固定高の
  //   「応援者トップN」バー。868人の密集会場でも上位が必ず大きく見える(席の🥇🥈🥉が小さすぎる
  //   問題への回答)。データは席と同じ rankVenueContributors(順位バッジとスコア源を共有=drift なし)、
  //   描画は席と同じ buildVenuePersonTile(匿名も含む=会場の「全員主役」を壊さない)。
  //   高さは CSS 固定 + 「一度描いたら空では畳まない」で下の席を揺らさない(v0.1.1026 高さ振動対策)。
  const topBar = document.createElement('div');
  topBar.className = 'nlsb-topbar';
  topBar.hidden = true; // 上位が居ない(全員無言)間は出さない。一度出たら空で畳まない(下記 sig ガード)。
  const topBarLabel = document.createElement('div');
  topBarLabel.className = 'nlsb-topbar-label';
  topBarLabel.textContent = '応援者トップ';
  const topBarList = document.createElement('div');
  topBarList.className = 'nlsb-topbar-list';
  topBar.append(topBarLabel, topBarList);

  const seatsHost = document.createElement('div');
  seatsHost.className = 'nlsb-seats nlsb-mode-empty';
  const venueLaneEls = createVenueStoryLaneDom();
  const venueStoryFaces = {
    faceLink: resolveVenueAssetUrl(STORY_GUIDE_FACE_LINK),
    faceGift: resolveVenueAssetUrl(STORY_GUIDE_FACE_GIFT),
    faceAd: resolveVenueAssetUrl(STORY_GUIDE_FACE_GIFT),
    faceKonta: resolveVenueAssetUrl(STORY_GUIDE_FACE_KONTA),
    faceTanu: resolveVenueAssetUrl(STORY_GUIDE_FACE_TANU)
  };
  seatsHost.appendChild(venueLaneEls.stack);
  /** @type {ReturnType<typeof createSeatNode>[]} */
  const seatNodes = [];
  for (let i = 0; i < VENUE_FULLSCREEN_MAX_SEATS; i += 1) {
    const node = createSeatNode(i);
    seatNodes.push(node);
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

  // 3キャラ常駐レイヤー(ユーザーアイデア): 会場を開いた瞬間から りんく・こん太・たぬ姉 が
  //   最前列中央に居て、集計が一瞬0件でも「無人/ローディング」に見えない最後の砦。
  //   seating 配下の専用固定レイヤー=seating パイプライン(参加者カウント)とは独立。
  const residentsLayer = document.createElement('div');
  residentsLayer.className = 'nlsb-residents';
  residentsLayer.setAttribute('aria-hidden', 'false');

  // v0.1.777 額縁フレーム: 3キャラ全表情サムネで四辺を囲む専用レイヤー(中央の映像/コメント欄は触らない)。
  const charFrameLayer = document.createElement('div');
  charFrameLayer.className = 'nlsb-charframe';
  charFrameLayer.setAttribute('aria-hidden', 'true');

  // seating は下端のひな壇だけ(header + seats)。
  seating.append(header, topBar, seatsHost);
  // center は CSS で display:none(撤去)だが、互換のため DOM には残す。
  // 3キャラ常駐は配信画面の「まわり(左右の縁)」に出す(会場の席とは重ねない=邪魔にしない)。
  //   stageLayout 基準=映像セーフエリアの高さに合わせて左右に配置できる。
  stageLayout.append(crowdCanvas, safeArea, charFrameLayer, seating, center, residentsLayer);
  // 吹き出し専用の最上位レイヤー(会議確定A): 席コンテナの overflow:hidden の外に置くことで
  //   セリフがクリップされず・アバターに潜らない。席の座標を測ってこの上に頭上配置する。
  const bubbleLayer = document.createElement('div');
  bubbleLayer.className = 'nlsb-bubble-layer';
  bubbleLayer.setAttribute('aria-live', 'polite');
  // 診断: メンバー一覧パネル(モーダル風)。DOM はここで作り、描画関数は下(lastRosterInput 宣言後)で定義。
  const rosterPanel = document.createElement('div');
  rosterPanel.className = 'nlsb-roster-panel';
  rosterPanel.hidden = true;
  // 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネル。roster と同じ overlay 流儀=席の高さを侵さない。
  const diagPanel = document.createElement('div');
  diagPanel.className = 'nlsb-roster-panel nlsb-venue-diag-panel';
  diagPanel.hidden = true;
  stage.append(stageLayout, bubbleLayer, rosterPanel, diagPanel);
  root.append(toggle, stage);
  parent.appendChild(root);

  let open = false;
  // 別窓化リファクタで参照側が外れ書込専用に(復活に備え代入は残す)。
  // eslint-disable-next-line no-unused-vars
  let userChangedOpen = false;

  // v0.1.770 起動待ちの「楽しいローディング」(会議 2026-06-16・遅延ガードで一瞬成功はチラつかせない)。
  //   状態を受け、checking は 180ms 経ってもまだ ready で無ければ初めて演出を描く。connecting(再試行中)は
  //   即描く。ready/idle で空にし、notfound で起動案内に切替。voiceStatus の内容/見た目はこの driver が所有。
  let voiceLoadingTimer = 0;
  const renderVoiceLoading = (/** @type {string} */ state) => {
    const view = resolveVoiceLoadingView(state, 'venue');
    voiceStatus.classList.toggle('is-loading', view.kind === 'loading');
    voiceStatus.classList.toggle('is-error', view.kind === 'error');
    voiceStatus.textContent = view.text;
  };
  const driveVoiceLoading = (/** @type {string} */ state) => {
    if (voiceLoadingTimer) {
      window.clearTimeout(voiceLoadingTimer);
      voiceLoadingTimer = 0;
    }
    if (state === 'checking') {
      // 遅延ガード: すぐには描かない。180ms 後にまだ checking のままなら初めて演出を出す。
      voiceStatus.classList.remove('is-loading', 'is-error');
      voiceStatus.textContent = '';
      voiceLoadingTimer = window.setTimeout(() => {
        voiceLoadingTimer = 0;
        if (shouldRenderLoading('checking', VOICE_LOADING_FLICKER_GUARD_MS)) renderVoiceLoading('checking');
      }, VOICE_LOADING_FLICKER_GUARD_MS);
      return;
    }
    renderVoiceLoading(state);
  };

  const voicePlayer = new VoicePlayer({
    storage: typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null,
    onToggle: (/** @type {boolean} */ enabled, /** @type {boolean} */ readNameEnabled, /** @type {boolean} */ toggleBusy) => {
      voiceBtn.disabled = toggleBusy;
      voiceBtn.classList.toggle('is-on', enabled);
      voiceBtn.textContent = enabled ? '🔊 読み上げ: ON' : '🔈 読み上げ: OFF';
    },
    // onStatus は読み上げブロック警告(audio NotAllowedError)等の臨時メッセージ用に温存。
    //   起動待ちの状態表示は onLoadingState(driveVoiceLoading)が所有する。
    onStatus: (/** @type {string} */ msg) => {
      if (!msg) return; // 空クリアは onLoadingState('ready') 側でやる(driver の class も外す)
      voiceStatus.classList.remove('is-loading');
      voiceStatus.classList.toggle('is-error', /見つかりません|ブロック/.test(msg));
      voiceStatus.textContent = msg;
    },
    onLoadingState: (/** @type {string} */ state) => driveVoiceLoading(state),
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
  // 「会話の連鎖」(v0.1.743+): 発言者キー→{連続数,最終発言時刻}。連続発言で席が継続的に輝く。
  /** @type {Map<string, { count: number, lastAt: number }>} */
  const speechStreaks = new Map();
  let activeLiveId = '';
  let escapeListening = false;
  // 退避強化(1000人超): 群衆 canvas は seed+人数が同じなら描画結果が同じ純粋関数なので、
  //   観客数が変わらない限り 1.5s 毎の再描画をスキップ(重い描画を無駄打ちしない)。
  let lastCrowdCount = -1;
  let lastCrowdSeed = NaN;
  // 「生きている会場」(2026-06-15 会議+査読研究): 観客が静かな時は呼吸でそよぎ、盛り上がると
  //   同期して揺れる。renderSeats が現在の観客数/seed を、applyVenueHeat が heatLevel を更新し、
  //   アニメループ(rAF・約18fps)が drawCrowdOnCanvas を {timeMs,heatLevel} 付きで再描画する。
  let crowdAnimCount = 0;
  let crowdAnimSeed = 0;
  let crowdHeatLevel = 0;
  /** @type {number} */
  let crowdRaf = 0;
  let crowdLastDrawMs = 0;
  const crowdReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** @type {VenueRow[]} */
  let baseRows = [];
  // v0.1.754 3時間安定化: 参加者集計のインクリメンタル状態。チャンクは append-only なので一度
  //   集約した seq の結果は不変=未処理 seq だけ読んで既存集約へマージすれば全件再読みと同じ総数に。
  /** @type {number[]} 既に集約済みのチャンク seq(この配信で) */
  let aggregatedChunkSeqs = [];
  /** @type {import('../lib/userLaneCandidatesFromStorage.js').UserLaneCandidateFromStorage[]} 累積集約候補(userId 単位) */
  let aggregatedCandidates = [];
  // v0.1.754 ストリーム駆動在席: onLiveComments で通過毎に touch する in-memory 在席 Map。
  //   storage 全集計(30秒毎 O(N))の代わり=3時間でも O(席数) 一定。standalone は onLiveComments が
  //   来ないので rosterDriven=false で従来の storage 経路へ degrade。VENUE_ROSTER_ENABLED でロールバック可。
  /** @type {Map<string, import('../lib/venueLiveRoster.js').RosterEntry>} */
  const liveRoster = new Map();
  // ストリーム駆動で在席を回すか。standalone(venue.html=onLiveComments 来ない)は必ず false で
  //   従来の storage 経路へ degrade。VENUE_ROSTER_ENABLED=false で全面ロールバック(静的判定=const)。
  const rosterDriven = VENUE_ROSTER_ENABLED && !isStandalone;
  /** @type {number} rAF id(描画集約) */
  let rosterCommitRaf = 0;
  /** @type {number} 沈黙中も退席を反映する軽量 prune タイマー */
  let rosterPruneTimer = 0;
  // 「空っぽ・途中で消える」根治(v0.1.745+): 直近の非空表示行を保持し、集計/poll が一瞬0件や
  //   storage 失敗で来ても会場を空で再描画しない(resolveDisplayRows・前状態保持)。配信切替で破棄。
  /** @type {VenueRow[]} */
  let lastGoodRows = [];
  // 一度でも非空を描いたか(renderSeats の保険ガード用)。配信切替の意図的クリアと区別する。
  let hasRenderedNonEmpty = false;
  // 応援者トップNバーの状態(renderTopBar / clearDisplay が触る・宣言はここ=TDZ 回避)。
  let _lastTopBarSig = '';
  let _topBarShownOnce = false;
  // 診断シート(メンバー一覧ボタン)用: renderSeats が最新の席割りをここに保存する。
  /** @type {{ allSeats: any[], visibleSeats: any[], audienceCount: number }} */
  let lastRosterInput = { allSeats: [], visibleSeats: [], audienceCount: 0 };

  // v0.1.902: 健全度パネル「会場座席」セル用。集約関数が掴んだ配信者 uid を renderSeats から
  //   参照して「配信者本人が席に混入していないか(v0.1.901 除外の回帰検出)」を観測する。
  /** @type {string} 直近の配信者 uid(''=未取得=混入判定不能)。 */
  let _lastBroadcasterUid = '';
  let _venueSeatsDiagLastWriteAt = 0;

  // v0.1.1053: ギフト/広告の効果音 ON/OFF(既定 true)。popup と同じ設定キーを共有する。
  let _effectSoundEnabledCache = true;
  void chrome.storage.local.get(KEY_EFFECT_SOUND_ENABLED).then((bag) => {
    _effectSoundEnabledCache = isEffectSoundEnabled(bag?.[KEY_EFFECT_SOUND_ENABLED]);
  }).catch(() => {});
  chrome.storage.onChanged?.addListener?.((changes, area) => {
    if (area !== 'local' || !changes[KEY_EFFECT_SOUND_ENABLED]) return;
    _effectSoundEnabledCache = isEffectSoundEnabled(changes[KEY_EFFECT_SOUND_ENABLED].newValue);
  });

  // v0.1.1053: 会場windowが生存している間、3秒間隔でプレゼンスを書く(popup側の二重再生防止用)。
  //   既存の3秒 min-gap タイマーと相乗りせず独立させる(この機能のためだけに他の計測を巻き込まない)。
  let _venueEffectSoundPresenceLastWriteAt = 0;
  const writeVenueEffectSoundPresence = () => {
    const now = Date.now();
    if (now - _venueEffectSoundPresenceLastWriteAt < 3000) return;
    _venueEffectSoundPresenceLastWriteAt = now;
    void chrome.storage.local.set({ [KEY_VENUE_EFFECT_SOUND_PRESENCE]: now }).catch(() => {});
  };

  // v0.1.1054: 「ギフトがちゃんと飛ぶか・タイミングよく音が出るか」を状態速報1枚で確認できる
  //   ようにする計器(検知→演出→音の3段階カウンタ・観測のみ・描画/演出は変えない)。
  const _giftEffectDiagCounters = makeInitialGiftEffectDiag();
  let _giftEffectDiagLastWriteAt = 0;
  const publishGiftEffectDiag = () => {
    const now = Date.now();
    if (now - _giftEffectDiagLastWriteAt < 3000) return; // 3秒 min-gap(他の診断と同型)。
    _giftEffectDiagLastWriteAt = now;
    _giftEffectDiagCounters.soundEnabled = _effectSoundEnabledCache;
    const snap = buildGiftEffectDiagSnapshot(_giftEffectDiagCounters, now);
    void chrome.storage.local.set({ [KEY_GIFT_EFFECT_DIAG]: snap }).catch(() => {});
  };

  // 診断パネルの描画/開閉。buildVenueRoster(純関数・テスト済)で誰が顔付き席/点描かを表にする。
  const renderRosterPanel = () => {
    const roster = buildVenueRoster(lastRosterInput);
    const summaryLine = formatVenueRosterSummary(roster.summary);
    const head =
      `<div class="nlsb-roster-head">` +
      `<strong>会場メンバー一覧（診断）</strong>` +
      `<button type="button" class="nlsb-roster-close" aria-label="閉じる">×</button>` +
      `</div>` +
      `<div class="nlsb-roster-summary">${escapeHtml(summaryLine)}</div>`;
    const rowsHtml = roster.rows
      .map((r) => {
        const who = r.name || (r.userId ? `id:${r.userId}` : '匿名');
        const badges =
          (r.hasThumb ? '<span class="nlsb-roster-badge thumb">サムネ</span>' : '') +
          (r.isGift ? '<span class="nlsb-roster-badge gift">ギフト</span>' : '') +
          (r.visible
            ? '<span class="nlsb-roster-badge on">表示中</span>'
            : '<span class="nlsb-roster-badge off">隠れ</span>');
        return (
          `<div class="nlsb-roster-row">` +
          `<span class="nlsb-roster-seat">#${r.seatIndex + 1}</span>` +
          `<span class="nlsb-roster-who">${escapeHtml(who)}</span>` +
          `<span class="nlsb-roster-badges">${badges}</span>` +
          `</div>`
        );
      })
      .join('');
    rosterPanel.innerHTML =
      head +
      `<div class="nlsb-roster-list">${rowsHtml || '<div class="nlsb-roster-empty">まだ誰もいません</div>'}</div>`;
    const closeBtn = rosterPanel.querySelector('.nlsb-roster-close');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleRosterPanel(false));
  };
  // v0.1.738: 診断パネルの外側(会場ステージ)をクリックしたら閉じる(× が反応しない時の保険)。
  //   パネル内部のクリックは閉じない。リスナーは開いている間だけ張る(開くクリック自身で
  //   即閉じしないよう、次のtickで張る)。
  /** @param {MouseEvent} event */
  const onRosterOutsideClick = (event) => {
    if (rosterPanel.hidden) return;
    const target = /** @type {Node|null} */ (event.target);
    if (target && rosterPanel.contains(target)) return; // パネル内は維持
    toggleRosterPanel(false);
  };
  /** @param {boolean} [force] */
  const toggleRosterPanel = (force) => {
    const next = typeof force === 'boolean' ? force : rosterPanel.hidden;
    if (next) renderRosterPanel();
    rosterPanel.hidden = !next;
    if (next) {
      // 開いたクリックが即座に外側判定されないよう、次tickでリスナーを張る。
      setTimeout(() => {
        if (!rosterPanel.hidden) stage.addEventListener('click', onRosterOutsideClick);
      }, 0);
    } else {
      stage.removeEventListener('click', onRosterOutsideClick);
    }
  };

  // 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネルの描画/開閉。
  //   純ロジック(件数計算/HTML)は src/lib/venueAvatarDiagLine.js(テスト済)。ここは薄い配線だけ。
  //   renderSeats が毎回書き込む _lastVenueSeatsDiagObs(席数/参加者/ほかN/配信者混入)と、
  //   その場で participants から数えたアバター解決率を合わせて出す。sig 無変化なら DOM を触らない。
  /** @type {Partial<import('../lib/venueSeatsDiag.js').VenueSeatsDiagState>} */
  let _lastVenueSeatsDiagObs = {};
  let _lastVenueDiagSig = '';
  const renderDiagPanel = () => {
    const participants = (lastRosterInput.allSeats || []).map((s) => s && s.participant).filter(Boolean);
    const counts = computeVenueParticipantAvatarCounts(participants);
    const seatsDiag = _lastVenueSeatsDiagObs || {};
    const sig = venueDiagSig(counts, seatsDiag);
    // 無変化(件数が同じ)なら本文は触らない=明滅しない。閉じてる間の再計算も避ける。
    if (sig === _lastVenueDiagSig && diagPanel.querySelector('.nl-venue-diag')) return;
    _lastVenueDiagSig = sig;
    const updatedAgoMs =
      Number.isFinite(Number(seatsDiag.lastUpdateAt)) && Number(seatsDiag.lastUpdateAt) > 0
        ? Math.max(0, nowMs() - Number(seatsDiag.lastUpdateAt))
        : -1;
    const body = buildVenueDiagHtml({ counts, seatsDiag, updatedAgoMs });
    diagPanel.innerHTML =
      `<div class="nlsb-roster-head">` +
      `<strong>🩺 会場の状態</strong>` +
      `<button type="button" class="nlsb-roster-close" aria-label="閉じる">×</button>` +
      `</div>` +
      body;
    const closeBtn = diagPanel.querySelector('.nlsb-roster-close');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleDiagPanel(false));
  };
  /** @param {MouseEvent} event */
  const onDiagOutsideClick = (event) => {
    if (diagPanel.hidden) return;
    const target = /** @type {Node|null} */ (event.target);
    if (target && diagPanel.contains(target)) return;
    toggleDiagPanel(false);
  };
  /** @param {boolean} [force] */
  const toggleDiagPanel = (force) => {
    const next = typeof force === 'boolean' ? force : diagPanel.hidden;
    if (next) {
      _lastVenueDiagSig = ''; // 開くたびに最新を1回描く(前回 sig を無視)。
      renderDiagPanel();
    }
    diagPanel.hidden = !next;
    if (next) {
      setTimeout(() => {
        if (!diagPanel.hidden) stage.addEventListener('click', onDiagOutsideClick);
      }, 0);
    } else {
      stage.removeEventListener('click', onDiagOutsideClick);
    }
  };
  // ユーザー方針「しゃべった匿名もアリーナに出して吹かせる」: 発言した userId を蓄積し、
  //   buildVenueSeating の promoteUserIds に渡して匿名でも席に座らせ吹き出させる。
  /** @type {Set<string>} */
  const spokenUserIds = new Set();
  /** @type {Map<string, number>} */
  let seatByKey = new Map();
  /**
   * @typedef {{ bubbleKey?: number|string, seatIndex: number, fallbackAnchor?: {x:number,y:number}|null,
   *   element: HTMLDivElement, fadeTimer: number, removeTimer: number, removed: boolean,
   *   voiceState?: string, createdAt?: number, flowLifetimeMs?: number, reducedMotion?: boolean,
   *   speakingCapTimer?: number, _x?: number, _y?: number, _h?: number }} VenueBubble
   */
  /** @type {Map<number|string, VenueBubble>} */
  const bubbleBySeat = new Map();
  /** @type {VenueBubble[]} */
  const activeBubbles = [];

  // v0.1.755 リアルタイム完璧化: 吹き出しの「流速(件/秒)」を直近窓で測り、寿命を可変にする
  //   (速いほど短命=画面が古い吹き出しで埋まり「今」が見えなくなるのを防ぐ)。
  /** @type {number[]} 直近の吹き出し時刻(ms)。窓外は捨てる。 */
  let bubbleFlowTimestamps = [];
  /** @param {number} nowMs */
  const recordBubbleFlow = (nowMs) => {
    bubbleFlowTimestamps.push(nowMs);
    const cutoff = nowMs - BUBBLE_FLOW_WINDOW_MS;
    if (bubbleFlowTimestamps.length > 256 || bubbleFlowTimestamps[0] < cutoff) {
      bubbleFlowTimestamps = bubbleFlowTimestamps.filter((t) => t >= cutoff);
    }
  };
  /** @param {number} nowMs @returns {number} 直近窓のコメント/秒 */
  const currentBubbleFlowPerSec = (nowMs) => {
    const cutoff = nowMs - BUBBLE_FLOW_WINDOW_MS;
    const n = bubbleFlowTimestamps.filter((t) => t >= cutoff).length;
    return (n / BUBBLE_FLOW_WINDOW_MS) * 1000;
  };

  /**
   * @param {VenueBubble} bubble
   */
  const removeBubble = (bubble) => {
    if (!bubble || bubble.removed) return;
    bubble.removed = true;
    if (bubble.fadeTimer) clearTimeout(bubble.fadeTimer);
    if (bubble.removeTimer) clearTimeout(bubble.removeTimer);
    if (bubble.speakingCapTimer) clearTimeout(bubble.speakingCapTimer);
    const key = bubble.bubbleKey != null ? bubble.bubbleKey : bubble.seatIndex;
    if (bubbleBySeat.get(key) === bubble) {
      bubbleBySeat.delete(key);
    }
    const index = activeBubbles.indexOf(bubble);
    if (index >= 0) activeBubbles.splice(index, 1);
    bubble.element.remove();
  };

  /**
   * v0.1.757: 席が無い発言者(150席溢れの観客・名前のみ匿名)の吹き出しを置く決定座標。
   * speakerKey のハッシュで毎回同じ位置(同じ人は同じ場所)・会場の下端(客席)領域に散らす。
   * 席が後で出来れば次回の発言は席の頭上に戻る。bubbleLayer 基準のローカル座標(px)。
   * @param {string} speakerKey
   * @returns {{ x: number, y: number }}
   */
  const crowdBubbleAnchor = (speakerKey) => {
    let h = 2166136261;
    const s = String(speakerKey || '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const frac = ((h >>> 0) % 1000) / 1000; // 0..1 決定的
    let w = 800;
    let bottom = 560;
    try {
      const r = bubbleLayer.getBoundingClientRect();
      if (r && r.width > 0) w = r.width;
      if (r && r.height > 0) bottom = r.height - 80; // 下端の客席帯
    } catch { /* no-op */ }
    const x = Math.round(40 + frac * Math.max(80, w - 200));
    return { x, y: Math.max(40, bottom) };
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
    const hasSeat = typeof seatIndex === 'number' && Number.isInteger(seatIndex);
    const node = hasSeat ? seatNodes[seatIndex] : null;
    // v0.1.757「音声だけ出て吹き出し出ない/読み飛ばし」根治(会議): 席が無い発言者(150席溢れの観客・
    //   名前のみ匿名等)でも、黙って return せず【観客領域の決定座標(speakerKey ハッシュ)】に吹き出す。
    //   声は席非依存で必ず鳴るので、吹き出しも席非依存で必ず出して対称にする(v0.1.745の精神)。
    const seatUsable = hasSeat && node && !node.seat.classList.contains('nlsb-is-empty');

    const streak = updateSpeechStreak(speechStreaks, speech.speakerKey, Date.now());
    if (seatUsable) {
      // v0.1.742 co-presence: 発言した席を一度だけふわっと反応させる(会場が発言に気づく演出)。
      node.seat.classList.remove('nlsb-seat-speaking');
      void node.seat.offsetWidth; // reflow を強制してアニメーションを再起動
      node.seat.classList.add('nlsb-seat-speaking');
      window.setTimeout(() => node.seat.classList.remove('nlsb-seat-speaking'), 650);

      // v0.1.743 「会話の連鎖」: 同じ人が短い間隔で続けて喋ったら席が継続的に輝く。
      const streakStage = streakGlowStage(streak.count);
      if (streakStage > 0) node.seat.dataset.streak = String(streakStage);
      else delete node.seat.dataset.streak;
    }

    const text = truncateBubbleText(speech.text);
    if (!text) return;
    // 吹き出しのキー: 席があれば seatIndex(number)、無ければ speakerKey 由来(席番号と衝突しない string)。
    const bubbleKey = seatUsable ? seatIndex : `nf:${speech.speakerKey}`;
    const previous = bubbleBySeat.get(bubbleKey);
    if (previous) removeBubble(previous);
    // v0.1.771: 上限超過時は「読み上げ中(speaking)は最後まで残す」優先順位で消す。
    //   会議: unvoiced/pending(古い順)→ done → speaking(古い発言順)。盲目的な最古削除をやめる。
    if (activeBubbles.length >= BUBBLE_MAX) {
      const toEvict = selectBubblesToEvict(activeBubbles, BUBBLE_MAX - 1, Date.now());
      for (const victim of toEvict) removeBubble(victim);
    }

    const element = document.createElement('div');
    element.className = 'nlsb-bubble';

    const textSpan = document.createElement('span');
    textSpan.className = 'nlsb-bubble-text';
    textSpan.textContent = text;
    element.appendChild(textSpan);

    element.setAttribute('aria-hidden', 'true');
    // 会議確定A: 席ノードでなく最上位レイヤーへ描く(overflow:hidden に切られない)。
    bubbleLayer.appendChild(element);

    // v0.1.755 リアルタイム完璧化: 流速可変の基準寿命(速い配信は短命=次々入れ替え、過疎は長く)。
    //   その上で連続発言の人は少し長く残す(会話の連鎖)。max で「連続発言は流速可変より短くしない」。
    const now = Date.now();
    recordBubbleFlow(now);
    const flowBase = resolveBubbleFlowLifetimeMs(currentBubbleFlowPerSec(now), BUBBLE_LIFETIME_MS);
    const lifetimeMs = Math.max(flowBase, streakBubbleLifetimeMs(streak.count, flowBase));
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const bubble = {
      bubbleKey,
      seatIndex: seatUsable ? seatIndex : -1,
      // 席が無い発言者は観客領域の決定座標(speakerKey ハッシュで毎回同じ位置)へ。
      fallbackAnchor: seatUsable ? null : crowdBubbleAnchor(speech.speakerKey),
      element,
      fadeTimer: 0,
      removeTimer: 0,
      removed: false,
      // v0.1.771 読み上げ連動: pending=合成待ち(流速寿命で消える)/speaking=再生中(消さない)/
      //   done=再生終了(余韻)/unvoiced=鳴らない(流速寿命のまま)。createdAt/flowLifetimeMs/reducedMotion は
      //   状態が変わったとき寿命を再計算するために保持。
      voiceState: 'pending',
      createdAt: now,
      flowLifetimeMs: lifetimeMs,
      reducedMotion,
      speakingCapTimer: 0
    };
    bubbleBySeat.set(bubbleKey, bubble);
    activeBubbles.push(bubble);

    // 席の座標を測ってレイヤー基準の頭上へ配置。既存吹き出しと重なれば上へ逃がす(衝突回避)。
    positionBubble(bubble);

    // 初期(pending)の寿命。読み上げONなら合成遅れに備えて床(BUBBLE_PENDING_VOICE_FLOOR_MS)を効かせ、
    //   「声が鳴り始める前に流速寿命で消える」隙間を塞ぐ。speaking になればこのタイマーは解除される。
    scheduleBubbleFade(bubble, resolvePendingLifetimeMs(lifetimeMs, voicePlayer.enabled));
    // v0.1.800 案C: 読み上げONのときだけ「仮(previoice)」見た目で出す(声が鳴り始めたら本表示へ昇格)。
    //   読み上げOFF/VOICEVOX無しのときは付けない=従来どおり最初から鮮明(声非依存・v0.1.757 不変)。
    if (voicePlayer.enabled) element.classList.add('nlsb-bubble-previoice');
    return bubble;
  };

  /**
   * 吹き出しの fade/remove タイマーを(再)設定する。寿命変更(状態遷移)時に呼ぶ。
   * @param {VenueBubble} bubble
   * @param {number} lifetimeMs 表示開始(createdAt)からの総寿命でなく「今から」消えるまでの ms
   */
  const scheduleBubbleFade = (bubble, lifetimeMs) => {
    if (!bubble || bubble.removed) return;
    if (bubble.fadeTimer) { clearTimeout(bubble.fadeTimer); bubble.fadeTimer = 0; }
    if (bubble.removeTimer) { clearTimeout(bubble.removeTimer); bubble.removeTimer = 0; }
    const ms = Math.max(0, lifetimeMs);
    if (!bubble.reducedMotion) {
      bubble.fadeTimer = window.setTimeout(() => {
        bubble.fadeTimer = 0;
        if (!bubble.removed) bubble.element.classList.add('nlsb-is-leaving');
      }, Math.max(0, ms - BUBBLE_FADE_MS));
    }
    bubble.removeTimer = window.setTimeout(() => {
      bubble.removeTimer = 0;
      removeBubble(bubble);
    }, ms);
  };

  /**
   * 読み上げが【実際に始まった】= speaking。再生終了(markBubbleDone)まで吹き出しを消さない。
   *   滞留対策として安全上限(SPEAKING_CAP)だけは保険のタイマーを張る。
   * @param {VenueBubble} bubble
   */
  const markBubbleSpeaking = (bubble) => {
    if (!bubble || bubble.removed) return;
    const next = nextBubbleVoiceState(bubble.voiceState, 'audioStart');
    if (next !== 'speaking' || bubble.voiceState === 'speaking') { bubble.voiceState = next; return; }
    bubble.voiceState = 'speaking';
    // 消えるタイマーを解除して「鳴っている間は残す」。fade も戻す(既に薄くなっていたら濃く戻る)。
    if (bubble.fadeTimer) { clearTimeout(bubble.fadeTimer); bubble.fadeTimer = 0; }
    if (bubble.removeTimer) { clearTimeout(bubble.removeTimer); bubble.removeTimer = 0; }
    bubble.element.classList.remove('nlsb-is-leaving');
    // v0.1.800 案C: 声が鳴り始めた瞬間に「仮(previoice)」を外して「本(鮮明・等倍)」へ瞬時昇格
    //   =声と同時に立ち上がった体感。あわせて一度だけ淡く光らせる(v0.1.773 voiced)。
    bubble.element.classList.remove('nlsb-bubble-previoice');
    // v0.1.773 軽い同期: 声が鳴り始めた瞬間に吹き出しを一度だけ強調(視聴覚を結びつけ「同時」と
    //   感じさせる)。吹き出しは即時のまま=即時性は犠牲にしない(会議の(A)全面同期は不採用)。
    bubble.element.classList.add('nlsb-bubble-voiced');
    if (bubble.speakingCapTimer) clearTimeout(bubble.speakingCapTimer);
    bubble.speakingCapTimer = window.setTimeout(() => {
      bubble.speakingCapTimer = 0;
      // 上限超過(極端に長い読み上げ)= done 同様に余韻で畳む(枠を空ける)。
      markBubbleDone(bubble);
    }, BUBBLE_VOICE_SPEAKING_CAP_MS);
  };

  /**
   * 読み上げが【終わった】= done。余韻(AFTERGLOW)を置いてから消す。
   * @param {VenueBubble} bubble
   */
  const markBubbleDone = (bubble) => {
    if (!bubble || bubble.removed) return;
    const next = nextBubbleVoiceState(bubble.voiceState, 'audioEnd');
    bubble.voiceState = next;
    // v0.1.800 案C: 念のため仮(previoice)を外す(pending のまま audioEnd 取りこぼし経路でも鮮明に)。
    bubble.element.classList.remove('nlsb-bubble-previoice');
    if (bubble.speakingCapTimer) { clearTimeout(bubble.speakingCapTimer); bubble.speakingCapTimer = 0; }
    if (next === 'done') scheduleBubbleFade(bubble, BUBBLE_VOICE_AFTERGLOW_MS);
  };

  /**
   * v0.1.799: 読み上げが【鳴らずに捨てられた】(stale/件数drop/合成失敗/merge)= resolved。
   *   pending のままだと床(=鮮度ゲート8秒)いっぱい残ってしまうので unvoiced に落とし、
   *   通常の流速寿命で普通に消す。onDropped は再生では発火しないので speaking 中に来ない
   *   (nextBubbleVoiceState の終端ガードでも speaking/done は維持=取りこぼし無し)。
   * @param {VenueBubble} bubble
   */
  const markBubbleResolved = (bubble) => {
    if (!bubble || bubble.removed) return;
    const next = nextBubbleVoiceState(bubble.voiceState, 'resolved');
    if (next === bubble.voiceState) return; // speaking/done/unvoiced は変化なし
    bubble.voiceState = next; // pending → unvoiced
    // v0.1.800 案C: 鳴らないと確定したら「仮(previoice)」を外して鮮明に戻す(淡いまま消えると
    //   「読まれなかったから薄いまま」に見えて不自然。鳴らないコメントも普通の吹き出しとして見せる)。
    bubble.element.classList.remove('nlsb-bubble-previoice');
    // 流速寿命(=showSpeechBubble 当初の lifetimeMs)で消す。床(pending floor)は使わない。
    const flow = typeof bubble.flowLifetimeMs === 'number' && bubble.flowLifetimeMs > 0
      ? bubble.flowLifetimeMs
      : 0;
    const age = Date.now() - (bubble.createdAt || Date.now());
    scheduleBubbleFade(bubble, Math.max(0, flow - age));
  };

  // v0.1.778 ギフト/広告の投げ演出: 投げ主のサムネ座標→中央映像へ放物線で飛ばす。
  //   DOMプール(固定数を使い回し)+同時上限(canLaunchGiftThrow)で会場を重くしない。
  /** @type {HTMLDivElement[]} 使い回す投げ物要素のプール。 */
  const giftProjPool = [];
  let giftProjActive = 0;
  const GIFT_PROJ_POOL_SIZE = 10;
  /** bubbleLayer ローカル座標での席アイコン中心(無ければ crowdBubbleAnchor)。 @param {string} speakerKey */
  const giftThrowOriginForSpeaker = (speakerKey) => {
    const seatIndex = seatByKey.get(speakerKey);
    const node = typeof seatIndex === 'number' ? seatNodes[seatIndex] : null;
    // person-tile-unify 第3コミット: 旧 node.icon は廃止。本物タイルのアバター要素を起点に。
    const anchorEl = node ? seatAnchorEl(node) : null;
    if (anchorEl && anchorEl.isConnected) {
      try {
        const layerRect = bubbleLayer.getBoundingClientRect();
        const r = anchorEl.getBoundingClientRect();
        if (r.width > 0) {
          return { x: r.left - layerRect.left + r.width / 2, y: r.top - layerRect.top + r.height / 2 };
        }
      } catch { /* fallthrough */ }
    }
    return crowdBubbleAnchor(speakerKey); // 席無し/匿名/座標不能はフォールバック
  };
  /** 中央映像(safeArea)の中心を bubbleLayer ローカル座標で。 */
  const giftThrowTarget = () => {
    try {
      const layerRect = bubbleLayer.getBoundingClientRect();
      const r = safeArea.getBoundingClientRect();
      if (r.width > 0) {
        return { x: r.left - layerRect.left + r.width / 2, y: r.top - layerRect.top + r.height / 2 };
      }
    } catch { /* fallthrough */ }
    // 保険: レイヤー中央上寄り。
    const lr = bubbleLayer.getBoundingClientRect();
    return { x: lr.width / 2, y: lr.height * 0.4 };
  };
  /**
   * @param {string} speakerKey
   * @param {{ kind:string, emoji:string, label:string, durationMs:number, imageUrl?:string }} proj
   */
  const launchGiftThrow = (speakerKey, proj) => {
    if (!proj || !open) return;
    if (!canLaunchGiftThrow(giftProjActive)) return; // 上限超過は捨てる(性能最優先)
    const el = giftProjPool.pop() || (() => {
      const d = document.createElement('div');
      d.className = 'nlsb-gift-proj';
      bubbleLayer.appendChild(d);
      return d;
    })();
    const origin = giftThrowOriginForSpeaker(speakerKey);
    const target = giftThrowTarget();
    const path = resolveGiftThrowPath(origin, target);
    el.innerHTML = '';
    // v0.1.783: item_id があれば実画像を投げ物に。読み込み失敗時は絵文字へフォールバック。
    //   画像は写真調なので mix-blend:screen を外す(is-image クラスで CSS 切替)。
    const imageUrl = String(proj.imageUrl || '');
    el.classList.toggle('is-image', Boolean(imageUrl));
    if (imageUrl) {
      const img = document.createElement('img');
      img.className = 'nlsb-gift-proj-img';
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'eager';
      // 失敗したら画像をやめて絵文字+ラベルに差し替え(欠け画像を出さない)。
      img.addEventListener('error', () => {
        el.classList.remove('is-image');
        img.remove();
        const emoji = document.createElement('span');
        emoji.className = 'nlsb-gift-proj-emoji';
        emoji.textContent = proj.emoji;
        const label = document.createElement('span');
        label.textContent = proj.label;
        el.prepend(label);
        el.prepend(emoji);
      }, { once: true });
      img.src = imageUrl;
      el.append(img);
    } else {
      const emoji = document.createElement('span');
      emoji.className = 'nlsb-gift-proj-emoji';
      emoji.textContent = proj.emoji;
      const label = document.createElement('span');
      label.textContent = proj.label;
      el.append(emoji, label);
    }
    el.style.left = `${path.startX}px`;
    el.style.top = `${path.startY}px`;
    el.style.setProperty('--nlsb-gift-dx', `${path.dx}px`);
    el.style.setProperty('--nlsb-gift-dy', `${path.dy}px`);
    el.style.setProperty('--nlsb-gift-mx', `${path.midX}px`);
    el.style.setProperty('--nlsb-gift-my', `${path.midY}px`);
    el.style.setProperty('--nlsb-gift-dur', `${proj.durationMs}ms`);
    giftProjActive += 1;
    const recycle = () => {
      el.removeEventListener('animationend', recycle);
      // v0.1.783: is-flying と is-image を両方落とす(プール再利用時に画像用スタイルが残らないよう)。
      el.classList.remove('is-flying', 'is-image');
      el.style.cssText = '';
      el.textContent = '';
      giftProjActive = Math.max(0, giftProjActive - 1);
      if (giftProjPool.length < GIFT_PROJ_POOL_SIZE) giftProjPool.push(el);
      else el.remove();
    };
    el.addEventListener('animationend', recycle, { once: true });
    // 念のための保険タイマー(animationend 取りこぼし時も必ず回収)。
    window.setTimeout(recycle, proj.durationMs + 400);
    // reflow を挟んでから is-flying(アニメ再起動の確実化)。
    void el.offsetWidth;
    el.classList.add('is-flying');
  };
  /** speech.text からギフト/広告を検出して投げる。 @param {{ text?: unknown, speakerKey?: string }} speech */
  const maybeThrowGiftFromSpeech = (speech) => {
    const text = String(speech?.text || '');
    if (!text) return;
    const gift = parseGiftCommentText(text);
    if (gift) {
      _giftEffectDiagCounters.giftDetected += 1;
      _giftEffectDiagCounters.lastEventAt = Date.now();
      const p = resolveGiftProjectile(gift, 'gift');
      if (p) {
        launchGiftThrow(speech.speakerKey, p);
        _giftEffectDiagCounters.giftThrown += 1;
        if (_effectSoundEnabledCache) {
          playEffectSound(EFFECT_SOUND_KINDS.GIFT);
          _giftEffectDiagCounters.giftSoundPlayed += 1;
        }
      }
      publishGiftEffectDiag();
      return;
    }
    const ad = parseNicoadCommentText(text);
    if (ad) {
      _giftEffectDiagCounters.adDetected += 1;
      _giftEffectDiagCounters.lastEventAt = Date.now();
      const p = resolveGiftProjectile(ad, 'ad');
      if (p) {
        launchGiftThrow(speech.speakerKey, p);
        _giftEffectDiagCounters.adThrown += 1;
        if (_effectSoundEnabledCache) {
          playEffectSound(EFFECT_SOUND_KINDS.AD);
          _giftEffectDiagCounters.adSoundPlayed += 1;
        }
      }
      publishGiftEffectDiag();
    }
  };

  // v0.1.778: NDGR構造化ギフトevent(StoredGiftEvent: {userId,itemName,point,capturedAt})からの投げ。
  //   ギフトコメント本文(maybeThrowGiftFromSpeech)が来ない配信でも、これが確実な一次トリガ。
  //   onChanged は配列全体が来るので、既に投げた event を seen で除外して新着だけ投げる。
  /** @type {Set<string>} */
  const thrownGiftEventKeys = new Set();
  /** @param {Array<Record<string, any>>} events */
  const handleNewGiftEvents = (events) => {
    if (!open || !Array.isArray(events)) return;
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      const uid = String(ev.userId || '').trim();
      const item = String(ev.itemName || '').trim();
      const point = Number(ev.point) || 0;
      // v0.1.783: NDGR event 経路は item_id を持つ → 実画像で投げられる。
      const itemId = String(ev.itemId || '').trim();
      const key = `${uid}|${ev.capturedAt || ''}|${item}|${point}`;
      if (thrownGiftEventKeys.has(key)) continue;
      thrownGiftEventKeys.add(key);
      // seen 集合の暴走防止(直近のみ保持)。
      if (thrownGiftEventKeys.size > 400) {
        const arr = [...thrownGiftEventKeys];
        thrownGiftEventKeys.clear();
        for (const k of arr.slice(-200)) thrownGiftEventKeys.add(k);
      }
      _giftEffectDiagCounters.giftDetected += 1;
      _giftEffectDiagCounters.lastEventAt = Date.now();
      const proj = resolveGiftProjectile({ item, point, itemId }, 'gift');
      // 起点: 席キーは venueSpeakerKey/venueParticipantKey と同じ `u:${uid}` 形にする
      //   (raw uid だと seatByKey に当たらず常に crowdBubbleAnchor へ落ちる)。
      if (proj) {
        launchGiftThrow(uid ? `u:${uid}` : '', proj);
        _giftEffectDiagCounters.giftThrown += 1;
        if (_effectSoundEnabledCache) {
          playEffectSound(EFFECT_SOUND_KINDS.GIFT);
          _giftEffectDiagCounters.giftSoundPlayed += 1;
        }
      }
      publishGiftEffectDiag();
    }
  };

  /**
   * 1つの吹き出しを、対応する席の頭上(レイヤー基準)へ絶対配置する。
   * 既に表示中の吹き出しと縦に重なる場合は上方向へオフセットして読めるようにする。
   * v0.1.757: 席が無い発言者(fallbackAnchor あり)は席矩形でなくその決定座標へ置く。
   * @param {{ seatIndex:number, fallbackAnchor?:{x:number,y:number}|null, element:HTMLDivElement, removed:boolean, _x?:number, _y?:number, _h?:number }} bubble
   */
  const positionBubble = (bubble) => {
    if (!bubble || bubble.removed) return;
    /** @type {{x:number,y:number}} レイヤー基準の吹き出しアンカー(席下端中央 or 観客フォールバック)。 */
    let anchor;
    const node = bubble.seatIndex >= 0 ? seatNodes[bubble.seatIndex] : null;
    if (node) {
      // 保険(PR3): 段の再描画中など席ノードが一瞬 DOM から外れていると getBoundingClientRect が
      //   0 を返し、吹き出しが画面外へ飛んで消えて見える。未接続なら座標計算せず一時的に隠す。
      // person-tile-unify 第3コミット: 旧 node.icon は廃止。座標の基準は本物タイルのアバター要素
      //   (.nl-story-userlane-avatar)・無ければタイル全体にフォールバック(seatAnchorEl)。
      const anchorEl = seatAnchorEl(node);
      if (!node.seat.isConnected || !anchorEl || !anchorEl.isConnected) {
        bubble.element.style.visibility = 'hidden';
        return;
      }
      bubble.element.style.visibility = '';
      const layerRect = bubbleLayer.getBoundingClientRect();
      const seatRect = anchorEl.getBoundingClientRect();
      const rel = {
        left: seatRect.left - layerRect.left,
        top: seatRect.top - layerRect.top,
        width: seatRect.width,
        height: seatRect.height
      };
      anchor = bubbleAnchorForSeatRect(rel, BUBBLE_ANCHOR_GAP);
    } else if (bubble.fallbackAnchor) {
      // 席無し: 観客領域の決定座標へ(席矩形が無いので衝突回避だけ後段で効かせる)。
      bubble.element.style.visibility = '';
      anchor = bubble.fallbackAnchor;
    } else {
      return; // 席も座標も無い=描けない(従来どおり)
    }
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
    speechStreaks.clear();
    // 前状態保持(lastGood)も破棄: 配信切替/閉じる時は前配信の参加者を持ち越さない(INV-3)。
    lastGoodRows = [];
    hasRenderedNonEmpty = false;
    liveRoster.clear(); // v0.1.754: 在席も持ち越さない(再オープンで storage から再 hydrate)
    clearBubbles();
  };

  /**
   * 2026-06-14 星野アイデア会議2「熱量の色温度」: 直近コメントの速さから会場照明の色温度を更新。
   *   過疎=涼しい青紫、怒涛=熱いオレンジ。映像中央は素通しのまま下端(客席)だけ色が変わる。
   *   stage に CSS 変数を注入するだけ(色/不透明度の補間と速度→熱量の正規化は純関数 venueHeat)。
   * @param {Array<{ capturedAt?: number|null }>} commentRows 直近コメント行(capturedAt 付き)
   */
  const applyVenueHeat = (commentRows) => {
    const level = resolveVenueHeatLevel(commentRows, { now: Date.now() });
    stage.style.setProperty('--nlsb-heat-color', heatLevelToWarmColor(level));
    stage.style.setProperty('--nlsb-heat-opacity', String(heatLevelToGlowOpacity(level)));
    // 任意: 盛り上がり具合を支援技術/ツールチップ向けに持たせる(視覚に依存しない情報)。
    stage.setAttribute('data-nls-heat', heatLevelToLabel(level));
    // 「生きている会場」: この盛り上がりで観客の揺れの速さ/大きさが決まる。
    crowdHeatLevel = level;
  };

  /** 単調増加の時刻(ms)。performance.now があれば使う。 */
  const nowMs = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  /**
   * 「生きている会場」アニメループ。観客 canvas を約18fpsで再描画し、観客を呼吸・同期させる。
   * reduced-motion / 観客0 / 閉じてる時は走らない(無駄な描画ゼロ)。
   */
  const crowdMotionTick = () => {
    crowdRaf = 0;
    if (!open || crowdReducedMotion || crowdAnimCount <= 0) return;
    const t = nowMs();
    // ~18fps(55ms)に間引き。重い canvas を毎フレーム描かない(大規模配信でも安全)。
    if (t - crowdLastDrawMs >= 55) {
      crowdLastDrawMs = t;
      drawCrowdOnCanvas(crowdCanvas, crowdAnimCount, crowdAnimSeed, {
        timeMs: t,
        heatLevel: crowdHeatLevel
      });
    }
    if (typeof requestAnimationFrame === 'function') {
      crowdRaf = requestAnimationFrame(crowdMotionTick);
    }
  };

  const startCrowdMotion = () => {
    if (crowdReducedMotion || crowdRaf || !open || crowdAnimCount <= 0) return;
    if (typeof requestAnimationFrame !== 'function') return;
    crowdLastDrawMs = 0;
    crowdRaf = requestAnimationFrame(crowdMotionTick);
  };

  const stopCrowdMotion = () => {
    if (crowdRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(crowdRaf);
    crowdRaf = 0;
  };

  /**
   * 表示行を「新鮮優先・空なら前回保持」で確定してから席を描く(空っぽ・消える根治の入口)。
   * 集計/poll はここを通すことで、一瞬0件や storage 失敗でも会場が空で再描画されない。
   * @param {VenueRow[]} incoming 今回の集計/マージ結果(空になりうる)
   */
  const commitDisplay = (incoming) => {
    const resolved = resolveDisplayRows(incoming, lastGoodRows);
    lastGoodRows = resolved.nextLastGood;
    renderSeats(resolved.rows);
  };

  /**
   * 表示行をクリアして会場を空に戻す(配信切替など意図的な空表示専用)。
   * 通常の集計/poll は commitDisplay を使うこと(空再描画しない)。
   */
  const clearDisplay = () => {
    lastGoodRows = [];
    hasRenderedNonEmpty = false;
    // 配信切替は意図的クリア=トップNバーも畳んで前配信の応援者を持ち越さない。
    _topBarShownOnce = false;
    _lastTopBarSig = '';
    topBar.hidden = true;
    topBarList.replaceChildren();
    renderSeats([]);
  };

  let residentsRendered = false;
  /**
   * 3キャラ常駐(りんく・こん太・たぬ姉)を最前列中央に描く。会場を開いた瞬間に集計を待たず
   * 1回呼ぶ=開いた直後から必ず誰かが居る。画像は拡張URLに解決。読み込み失敗は名札のみへ。
   */
  const renderResidents = () => {
    if (residentsRendered) return;
    const resolveUrl =
      typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function'
        ? /** @param {string} rel */ (rel) => chrome.runtime.getURL(rel)
        : /** @param {string} rel */ (rel) => rel;
    const residents = buildVenueResidents(resolveUrl);
    residentsLayer.textContent = '';
    for (const r of residents) {
      const cell = document.createElement('div');
      cell.className = `nlsb-resident nlsb-resident-${r.id}`;
      const img = document.createElement('img');
      img.className = 'nlsb-resident-img';
      img.src = r.imgSrc;
      img.alt = `${r.name}(会場の案内役)`;
      img.addEventListener('error', () => { img.style.display = 'none'; });
      const label = document.createElement('div');
      label.className = 'nlsb-resident-name';
      label.textContent = r.name;
      cell.append(img, label);
      residentsLayer.appendChild(cell);
    }
    residentsRendered = true;
  };

  // v0.1.777 額縁フレーム: 3キャラ全表情サムネを四辺に並べ会場を囲む(1回だけ描画・軽量 thumb128)。
  let charFrameRendered = false;
  const renderCharFrame = () => {
    if (charFrameRendered) return;
    const resolveUrl =
      typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function'
        ? /** @param {string} rel */ (rel) => chrome.runtime.getURL(rel)
        : /** @param {string} rel */ (rel) => rel;
    const tiles = buildVenueCharacterFrame(resolveUrl);
    charFrameLayer.textContent = '';
    for (const t of tiles) {
      const img = document.createElement('img');
      img.className = 'nlsb-charframe-tile';
      img.src = t.src;
      img.alt = '';
      img.dataset.edge = t.edge;
      // 辺に沿った位置(pos 0..1)を %。top/bottom は left%、left/right は top%。
      if (t.edge === 'top' || t.edge === 'bottom') img.style.left = `${(t.pos * 100).toFixed(2)}%`;
      else img.style.top = `${(t.pos * 100).toFixed(2)}%`;
      img.addEventListener('error', () => { img.style.display = 'none'; });
      charFrameLayer.appendChild(img);
    }
    charFrameRendered = true;
  };

  // 2026-07-01 会議(venue-role-separation フェーズ2): 応援者トップNバーの描画。
  //   sig(上位の userId+順位)が無変化なら DOM を触らない=毎フレーム作り直さない(hot path 保護)。
  //   一度でも非空を描いたら、一瞬の空(データ遅延)では畳まない=高さ振動を作らない(v0.1.1026)。
  //   状態フラグは clearDisplay(先に定義)からも触るため、宣言は関数より前(下の hasRenderedNonEmpty 付近)。
  /** @param {Array<{ rank:number, participant:{ key?:string, userId?:string } }>} topSupporters */
  const renderTopBar = (topSupporters) => {
    const list = Array.isArray(topSupporters) ? topSupporters : [];
    // 空入力でも、一度出したバーは畳まない(前回の顔を残す=明滅/高さ振動を防ぐ)。
    if (list.length === 0) {
      if (!_topBarShownOnce) topBar.hidden = true;
      return;
    }
    // sig=上位の key と順位の並び(capturedAt など時刻は入れない=v0.1.1022 明滅の教訓)。
    const sig = list.map((x) => `${x.rank}:${x.participant?.key || ''}`).join('|');
    if (sig === _lastTopBarSig && _topBarShownOnce) return;
    _lastTopBarSig = sig;
    const frag = document.createDocumentFragment();
    for (const item of list) {
      const cell = document.createElement('div');
      cell.className = 'nlsb-topbar-cell';
      if (item.rank >= 1 && item.rank <= 3) cell.dataset.venueRank = String(item.rank);
      cell.appendChild(buildVenuePersonTile(item.participant, '応援者'));
      frag.appendChild(cell);
    }
    topBarList.replaceChildren(frag);
    topBar.hidden = false;
    _topBarShownOnce = true;
  };

  /**
   * @param {VenueRow[]} rows
   */
  const renderSeats = (rows) => {
    // 保険ガード: 一度でも非空を描いた後に空入力が来たら無視する(空っぽ・消えるの二重防御)。
    //   意図的クリア(配信切替)は clearDisplay 経由で hasRenderedNonEmpty=false にしてから通す。
    const incomingRows = Array.isArray(rows) ? rows : [];
    if (incomingRows.length === 0 && hasRenderedNonEmpty) {
      return;
    }
    const seating = buildVenueSeating(incomingRows, {
      maxSeats: VENUE_FULLSCREEN_MAX_SEATS,
      prevSeatByKey: seatByKey,
      isGenericName: isGenericComeviewName,
      promoteUserIds: spokenUserIds,
      // 光らせ演出(金色オーラ)はユーザー要望で無効。上位貢献者は順位バッジ(venueRank)で示す。
      vipRegular: false
    });
    if (seating.participantCount > 0) hasRenderedNonEmpty = true;
    seatByKey = seating.seatByKey;
    // 応援者トップNバー(ひな壇上部)。席と同じ seating 結果から描く=二重集計しない(drift なし)。
    renderTopBar(seating.topSupporters);
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
    // v0.1.737 実機修正: 実効幅は席幅+gap。68/84 だと gap ぶん足りず1席多く詰めて横溢れ
    //   (893>882で見切れ)。gap+余白を見込んだ実効幅にして 1 行に確実に収める。
    const seatMinWidth =
      seating.layoutMode === 'vip' ? 158 : seating.layoutMode === 'normal' ? 92 : 76;
    const perRow = seatsPerRow(seatAreaWidth - 28, seatMinWidth);
    // 2026-06-22 会場「全員500人」(council/venue-all-faces-500): 旧実装は rows:8 + 動的cap(max150)で
    //   同時表示を ~150 に頭打ちさせ、超過は点描逃げ=「482人なのに96人しか顔が出ない」の核だった。
    //   全員を顔付きにするため、必要な段数(全員÷perRow)を maxRows として確保し、hardCap を席プール上限
    //   (VENUE_FULLSCREEN_MAX_SEATS=500)まで開ける。8段超ぶんは seatsHost の overflow-y で縦スクロール。
    //   ★resolveDynamicArenaCap は潰さず、ここで hardCap を明示する(他の呼び出し元/テストは不変)。
    const neededRows = Math.max(1, Math.ceil(seating.seats.length / Math.max(1, perRow)));
    const venueMaxRows = Math.min(
      neededRows,
      Math.ceil(VENUE_FULLSCREEN_MAX_SEATS / Math.max(1, perRow))
    );
    const visibleSeatCount = resolveVisibleArenaCount({
      totalCount: seating.seats.length,
      perRow,
      rows: venueMaxRows,
      hardCap: VENUE_FULLSCREEN_MAX_SEATS
    });
    const visibleSeatsRaw = selectStableVisibleMembers(
      seating.seats,
      visibleSeatCount,
      spokenUserIds,
      (entry) => String(entry?.participant?.userId || entry?.participant?.key || '').trim()
    );
    // v0.1.745 ユーザー実機「サムネ持ちが最前列に来てない・大きくなってない」根治:
    //   visibleSeats は seatIndex 順で、後段の tier 充填もこの順。前列予約(frontRow)だけでは
    //   サムネ持ちが少数+席churn のとき手前段に集まりきらず、奥段に散らばっていた(実機計測で
    //   VIPが tier0/3/4 に散在)。ここで「実サムネ持ちを先頭へ」安定パーティションし、tier 充填が
    //   必ず手前段(tier0=大きい段)からサムネ持ちで埋まるようにする。group 内は元順維持=ちらつかない。
    /** @param {any} entry 席エントリ(visibleSeatsRaw の要素)。any で T 推論を妨げない。 */
    const seatHasRealThumb = (entry) => {
      const p = entry?.participant || {};
      const avatarUrl = String(p.avatar || '').trim();
      const derived = deriveNicoUserIconUrl(String(p.userId || '').trim());
      return hasRealThumbnail(avatarUrl) || hasRealThumbnail(derived);
    };
    const visibleSeats = partitionThumbnailFirst(visibleSeatsRaw, seatHasRealThumb);
    const visibleSeatKeys = new Set(visibleSeats.map(entry => entry.participant.key));

    // 【2026-06-17 確定】アリーナ席=アクティブユーザー(コメント/ギフト/広告した人・匿名/非匿名問わず)。
    //   userId があれば匿名でも venueParticipantKey が席キーを返す(席資格の正本は venueSeats.js)。
    //   ここで数える「ほか N人」= 1画面に表示した席(visibleSeatKeys)に入りきらなかったアクティブ分。
    //   来場者数(PV)とは別物(来場者は背景群衆 Canvas)。promoteUserIds は表示優先のヒントで席資格ではない。
    const { totalAnonymous } = collectAudienceFaceUserIds(rows, {
      isGenericName: isGenericComeviewName,
      promoteUserIds: spokenUserIds,
      excludeKeys: visibleSeatKeys
    });
    // 診断シート(メンバー一覧ボタン)用に最新の席割りを保持。誰が顔付き席/点描かを data 化する。
    lastRosterInput = {
      allSeats: seating.seats,
      visibleSeats,
      audienceCount: totalAnonymous
    };
    // person-tile-unify 第4コミット(2026-06-17): 旧「ほか観客 N人」は来場者数(PV)や「匿名の観客」と
    //   二重に取り違えられ紛らわしかった。totalAnonymous の実態は「席(visibleSeats)に表示しきれなかった
    //   アクティブ参加者」(席に座った人を excludeKeys で除外済み・匿名とは限らず数値IDも含む)。
    //   誤読の核だった「観客」語を外し「ほか N人」に正本化(全員『会場参加者』前提で残りを表す)。
    //   来場者数(PV)の実値取得→二層表示は別途(PV 取得経路の新規配線が要るため範囲外・過剰実装回避)。
    title.textContent =
      totalAnonymous > 0
        ? `会場参加者 ${seating.participantCount}人 ・ ほか ${totalAnonymous}人`
        : `会場参加者 ${seating.participantCount}人`;
    // PR-C1: 人数ラスタライザ Canvas (Antigravity Enhanced)
    if (totalAnonymous > 0) {
      crowdCanvas.classList.add('nlsb-is-visible');
      // liveId をシードとして安定描画
      const seed = Array.from(activeLiveId).reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0);
      crowdAnimCount = totalAnonymous;
      crowdAnimSeed = seed;
      // 退避強化: 同じ人数+同じ seed なら静止描画は同一(純粋)→再描画を省く。ただし動きを付ける
      //   場合はアニメループ側が毎フレーム描くので、ここでは「初回/人数変化時の即時1枚」を担う。
      if (totalAnonymous !== lastCrowdCount || seed !== lastCrowdSeed) {
        drawCrowdOnCanvas(crowdCanvas, totalAnonymous, seed, crowdReducedMotion ? null : { timeMs: nowMs(), heatLevel: crowdHeatLevel });
        lastCrowdCount = totalAnonymous;
        lastCrowdSeed = seed;
      }
      startCrowdMotion();
    } else {
      crowdCanvas.classList.remove('nlsb-is-visible');
      lastCrowdCount = -1;
      crowdAnimCount = 0;
      stopCrowdMotion();
    }

    const visibleSeatIndexSet = new Set(visibleSeats.map((entry) => entry.seatIndex));
    const entryBySeatIndex = new Map(visibleSeats.map((entry) => [entry.seatIndex, entry]));
    for (let i = 0; i < seatNodes.length; i += 1) {
      const node = seatNodes[i];
      node.seat.classList.add('nlsb-is-empty');
      node.seat.classList.remove(
        'nlsb-seat-link',
        'nlsb-seat-vip',
        'nlsb-seat-regular'
      );
      node.seat.setAttribute('aria-hidden', 'true');
      node.seat.removeAttribute('title');
      delete node.seat.dataset.tierIndex;
      delete node.seat.dataset.venueRank;
      delete node.seat.dataset.streak;
      if (!visibleSeatIndexSet.has(i)) {
        if (node.seat.parentElement) node.seat.parentElement.removeChild(node.seat);
        node.seat.replaceChildren();
        node.tile = null;
      }
    }

    const laneBuckets = bucketVenueLaneSeats(visibleSeats, { maxTotal: visibleSeats.length });
    const visibleLaneItems = flattenVenueLaneBuckets(laneBuckets);
    emptyMessage.hidden = visibleLaneItems.length > 0;
    if (visibleLaneItems.length === 0) {
      resetStoryUserLaneDom(venueLaneEls);
    } else {
      paintStoryUserLaneDomFilled(
        venueLaneEls,
        venueStoryFaces,
        laneBuckets,
        visibleLaneItems.length,
        venuePersonTileIo,
        {
          recordedCommentRowsTotal: seating.participantCount,
          totalCandidates: seating.participantCount,
          wrapTileEl: (tileEl, item) => {
            const laneItem = /** @type {{ _venueSeatIndex?: unknown }} */ (item || {});
            const seatIndex = Math.max(0, Math.floor(Number(laneItem._venueSeatIndex) || 0));
            const node = seatNodes[seatIndex];
            if (!node) return tileEl;
            node.seat.replaceChildren(tileEl);
            node.tile = tileEl;
            return node.seat;
          }
        }
      );
    }

    for (const item of visibleLaneItems) {
      const seatIndex = Math.max(0, Math.floor(Number(item?._venueSeatIndex) || 0));
      const node = seatNodes[seatIndex];
      const entry = entryBySeatIndex.get(seatIndex);
      if (!node || !entry) continue;
      const participant = entry.participant || {};
      const uid = String(participant.userId || '').trim();
      const rawName = String(participant.name || '').trim();
      const displayName =
        String(item?.title || '').trim() ||
        rawName ||
        (uid ? anonymousDisplayLabel(uid) : anonymousDisplayLabel(participant.key || `会場${seatIndex + 1}`));
      const tile = node.seat.querySelector('.nl-story-userlane-cell');
      if (tile instanceof HTMLElement) node.tile = tile;
      node.seat.classList.toggle(
        'nlsb-seat-link',
        isNumericNicoUserId(uid) && nicoUserPageUrl(uid) !== ''
      );
      node.seat.title = displayName;
      node.seat.classList.remove('nlsb-is-empty');
      node.seat.setAttribute('aria-hidden', 'false');
      node.seat.classList.toggle('nlsb-seat-vip', item?._venueIsVip === true);
      node.seat.classList.remove('nlsb-seat-regular');
      const venueRank = Math.max(0, Math.floor(Number(entry.venueRank || item?._venueRank) || 0));
      if (venueRank >= 1 && venueRank <= 3) {
        node.seat.dataset.venueRank = String(venueRank);
      } else {
        delete node.seat.dataset.venueRank;
      }
      const speakerKey = uid ? `u:${uid}` : rawName ? `n:${rawName}` : '';
      const streakEntry = speakerKey ? speechStreaks.get(speakerKey) : null;
      const seatStreakStage = streakEntry ? streakGlowStage(streakEntry.count) : 0;
      if (seatStreakStage > 0) {
        node.seat.dataset.streak = String(seatStreakStage);
      } else {
        delete node.seat.dataset.streak;
      }
    }
    // 席が動いた(段の再描画/表示人数変化)後、表示中の吹き出しを席頭上へ追従させる。
    //   併せて「パン可能(縦に溢れている)」かを判定して grab カーソルの出し分けを更新する。
    //   v0.1.738: 全席が画面に収まる時は grab を出さない(掴めるのに動かない誤解を防ぐ)。
    const updatePanAffordance = () => {
      const canPan = seatsHost.scrollHeight > seatsHost.clientHeight + 2;
      seatsHost.classList.toggle('nlsb-can-pan', canPan);
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        repositionAllBubbles();
        updatePanAffordance();
      });
    } else {
      repositionAllBubbles();
      updatePanAffordance();
    }

    // v0.1.902: 健全度パネル「会場座席」セル用の純観測値を storage へ(min-gap で間引き)。
    //   配信者混入=v0.1.901 の本人除外が効いているかの回帰検出。visibleSeats に配信者 uid を
    //   持つ席があれば混入(本来あってはならない)。配信者 uid 未取得時は判定不能(broadcasterKnown=false)。
    const bcUid = String(_lastBroadcasterUid || '').trim();
    const broadcasterInSeats =
      bcUid !== '' &&
      visibleSeats.some(
        (entry) => String(entry?.participant?.userId || '').trim() === bcUid
      );
    const seatsDiagObs = {
      enabled: open,
      // ★v0.1.1050: 会場が観測した配信ID。パリティ突合で status が「現配信か」を判定し、前配信の
      //   残骸(古いスナップショット)を現配信と突き合わせて嘘の🔴を出さないためのガード(観測のみ)。
      liveId: String(activeLiveId || liveIdFromPathname() || ''),
      seatsShown: visibleSeats.length,
      participantCount: seating.participantCount,
      otherCount: totalAnonymous,
      broadcasterInSeats,
      broadcasterKnown: bcUid !== '',
      // ★これは会場パネル renderDiagPanel が nowMs()(相対)と引き算する用の相対時計。
      //   storage(状態速報)へ出す lastUpdateAt は publishVenueSeatsDiag が Date.now()(壁時計)で
      //   上書きするので、ここは相対のまま=会場パネルの「更新◯秒前」は相対同士で正しく出る。
      lastUpdateAt: nowMs(),
      // v0.1.1043: 「なぜ全員出ないか」を状態速報で数値切り分けするための計器。
      //   既に算出済みの値を載せるだけ(新規計算/再描画を足さない=churn 源にしない)。
      //   perRow*venueMaxRows と participantCount と 500 のどれで可視席が頭打ちかを status が判定。
      perRow,
      venueMaxRows,
      seatAreaWidth,
      hardCap: VENUE_FULLSCREEN_MAX_SEATS
    };
    publishVenueSeatsDiag(seatsDiagObs);
    // 2026-07-01 会議(venue-diag): 「🩺 会場の状態」パネル用に最新の観測値を保持。
    //   パネルが開いている時だけ再描画(sig 無変化なら DOM を触らない=hot path を汚さない)。
    _lastVenueSeatsDiagObs = seatsDiagObs;
    if (!diagPanel.hidden) renderDiagPanel();
    // v0.1.1053: 会場が生きている間だけプレゼンスを書く(popup側の効果音二重再生防止・3秒min-gap内蔵)。
    if (open) writeVenueEffectSoundPresence();
  };

  /**
   * 会場座席の観測値を storage へ書く(min-gap で間引き=描画 hot path を汚さない)。
   *   失敗は握る=会場を止めない(publishVoiceDiag と同型)。
   * @param {Partial<import('../lib/venueSeatsDiag.js').VenueSeatsDiagState>} obs
   */
  const publishVenueSeatsDiag = (obs) => {
    try {
      // min-gap 判定は単調増加の相対時計(nowMs=performance.now)でよい。
      const monotonic = nowMs();
      if (monotonic - _venueSeatsDiagLastWriteAt < 3000) return; // 3秒 min-gap。
      _venueSeatsDiagLastWriteAt = monotonic;
      // ★lastUpdateAt/capturedAt は storage 経由で状態速報の Date.now() と引き算される=【壁時計】でなければ
      //   ならない(相対時計 performance.now を混ぜると「更新 17億秒前=約56年前」の異常表示になる)。
      //   nowMs()(相対)と Date.now()(epoch)のクロック取り違えが会場座席セルの誤表示の真因。
      const wallNow = Date.now();
      const snap = buildVenueSeatsDiagSnapshot({ ...obs, lastUpdateAt: wallNow }, wallNow);
      if (!hasVenueExtensionContext()) return;
      chrome.storage.local.set({ [KEY_VENUE_SEATS_DIAG]: snap }).catch(() => {
        /* best-effort: storage 不可・context 消失 */
      });
    } catch {
      /* no-op */
    }
  };

  const aggregateParticipants = async () => {
    if (!open || aggregateInFlight) return;
    // v0.1.753: 拡張更新後の古いタブは chrome.* が全失敗する。storage を叩く前に先回りで検知し、
    //   無限リトライを止めて再読み込み案内を出す(黙って凍結しない)。
    if (!hasVenueExtensionContext()) { markContextInvalidated(); return; }
    const liveId = liveIdFromPathname();
    if (!liveId) return;
    aggregateInFlight = true;
    try {
      if (activeLiveId !== liveId) {
        activeLiveId = liveId;
        baseRows = [];
        seatByKey = new Map();
        spokenUserIds.clear(); // 別配信の昇格匿名を持ち越さない
        aggregatedChunkSeqs = []; // v0.1.754: 別配信の集約状態を持ち越さない
        aggregatedCandidates = [];
        liveRoster.clear(); // v0.1.754: 別配信の在席を持ち越さない
        // 配信切替は意図的な空表示(前配信を持ち越さない)。clearDisplay で lastGood も破棄。
        clearDisplay();
      }
      // v0.1.754 3時間安定化: まず安いインデックス1キーだけ読む。チャンク化済みなら【新規 seq の
      //   チャンクだけ】読んで差分集約→既存集約へマージ(O(新規分))。全件再読み(O(N)・数万件で
      //   メインスレッド圧迫・8秒timeout超で会場停止)をやめる。チャンクは append-only なので等価。
      const idxKey = chunkIndexKey(liveId);
      const idxBag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get(idxKey),
        8000
      );
      if (!open || liveIdFromPathname() !== liveId) return;
      const index = idxBag ? idxBag[idxKey] : null;
      // ⚠️ LANE_OPTS チェックリスト(新しい opts を足したら下の userLaneCandidatesFromStorage 呼び出し
      //   2 箇所すべてに渡ること):
      //   - requireText      : 本文ありの行だけ参加者にする(v0.1.740・配信者の本文空行混入を弾く)
      //   - broadcasterUid    : 配信者の数値 userId(下で storage から読む)
      //   - broadcasterIconUrl: 配信者アイコン URL(同上)
      //   broadcasterUid と broadcasterIconUrl は【両方そろって初めて】guard が有効になる
      //   (userLaneCandidatesFromStorage 内 Boolean(uid && iconUrl))。片方欠けると guard 無効=
      //   配信者アイコン付きの匿名行が会場に座る既知バグ(v0.1.793)が再発する。
      // v0.1.793: broadcaster ctx を storage(content-entry が書く)から読み LANE_OPTS に混ぜる。
      //   inline も standalone(venue.html)も storage 経由で取れる(content の変数は別バンドルで届かない)。
      //   経路の正本は src/lib/broadcastContext.js。ctx は補助情報なので、読めなくても(timeout 等)
      //   guard 無効で集計は続ける(局所 catch で握りつぶす=会場本体を止めない)。
      let _bcCtx = normalizeBroadcasterCtx(null);
      try {
        const _bcBag = await runStorageOpWithTimeout(
          () => chrome.storage.local.get(KEY_LIVE_BROADCASTER_CTX),
          3000
        );
        if (!open || liveIdFromPathname() !== liveId) return;
        _bcCtx = normalizeBroadcasterCtx(_bcBag?.[KEY_LIVE_BROADCASTER_CTX]);
      } catch {
        // broadcaster ctx が読めなくても会場は止めない(guard 無効のまま集計続行)。
      }
      const _bcUsable = isBroadcasterCtxUsableForGuard(_bcCtx, liveId);
      // v0.1.901: 配信者【本人除外】は uid だけで効く(iconUrl 不要)。アイコン化け防止(iconUrl 必須)とは
      //   別物なので、uid と配信が一致していれば iconUrl の有無によらず broadcasterUid を渡す。
      //   これで iconUrl 未取得でも本人(放送主)が会場席に座るのを防ぐ。配信一致は
      //   isBroadcasterCtxUsableForGuard と同じ規則(ctx.liveId 空は後方互換で許容)で判定する。
      const _bcLiveMatches = (() => {
        const cur = String(liveId ?? '').trim().toLowerCase();
        const own = String(_bcCtx.liveId ?? '').trim().toLowerCase();
        return !(cur && own && cur !== own);
      })();
      const _bcUidForExclude = _bcCtx.uid && _bcLiveMatches ? _bcCtx.uid : '';
      // v0.1.902: 健全度パネルの「配信者混入」セル用に、判明している配信者 uid を保持する。
      //   renderSeats が visibleSeats とこの uid を突合し、除外漏れ(本人が席に座る)を検知する。
      _lastBroadcasterUid = _bcUidForExclude;
      // v0.1.740: requireText:true で「実際にコメントした人(本文あり)」だけを参加者にする。
      const LANE_OPTS = {
        requireText: true,
        // 本人除外は uid だけで効くので _bcUidForExclude(iconUrl 不問)。アイコン化け防止の
        //   broadcasterIconUrl は従来どおり両方そろった _bcUsable 時のみ(誤除外を避ける)。
        broadcasterUid: _bcUidForExclude,
        broadcasterIconUrl: _bcUsable ? _bcCtx.iconUrl : ''
      };
      if (isChunkIndex(index, liveId) && Array.isArray(/** @type {any} */ (index).seqs)) {
        // --- チャンク化済み: 差分(新規 seq)だけ集約してマージ ---
        const allSeqs = /** @type {number[]} */ (/** @type {any} */ (index).seqs);
        const newSeqs = selectNewChunkSeqs(allSeqs, aggregatedChunkSeqs);
        if (newSeqs.length > 0) {
          const keys = newSeqs.map((seq) => chunkStorageKey(liveId, seq));
          const bag = await runStorageOpWithTimeout(
            () => chrome.storage.local.get(keys),
            8000
          );
          if (!open || liveIdFromPathname() !== liveId) return;
          /** @type {unknown[]} */
          let newRows = [];
          for (const key of keys) {
            const part = bag ? bag[key] : null;
            if (Array.isArray(part)) newRows = newRows.concat(part);
          }
          const newCandidates = userLaneCandidatesFromStorage(newRows, liveId, LANE_OPTS);
          aggregatedCandidates = mergeUserLaneAggregates(aggregatedCandidates, newCandidates);
          aggregatedChunkSeqs = aggregatedChunkSeqs.concat(newSeqs);
        }
        baseRows = venueRowsFromUserLaneCandidates(aggregatedCandidates);
      } else {
        // --- 未チャンク化(従来 main・小規模/移行前): 従来どおり全件読み(件数が小さいので安全) ---
        const result = await runStorageOpWithTimeout(
          () =>
            readChunkedComments(liveId, commentsStorageKey(liveId), (keys) =>
              chrome.storage.local.get(keys)
            ),
          8000
        );
        if (!open || liveIdFromPathname() !== liveId) return;
        const candidates = userLaneCandidatesFromStorage(result.rows, liveId, LANE_OPTS);
        baseRows = venueRowsFromUserLaneCandidates(candidates);
      }
      // パネルと同じ低頻度キャッシュで実サムネを補強し、会場だけ顔が欠ける差をなくす。
      const profileBag = await runStorageOpWithTimeout(
        () => chrome.storage.local.get(KEY_USER_COMMENT_PROFILE_CACHE),
        8000
      );
      if (!open || liveIdFromPathname() !== liveId) return;
      const profileMap =
        /** @type {Record<string, { avatarUrl?: unknown }>|null} */ (
          profileBag?.[KEY_USER_COMMENT_PROFILE_CACHE] || null
        );
      baseRows = enrichVenueRowsWithProfileAvatars(baseRows, profileMap);
      // commitDisplay 経由=空(0件)なら前回の非空表示を維持し、会場を空で再描画しない。
      commitDisplay(baseRows);
    } catch (err) {
      // v0.1.753: 拡張更新後の context invalidated は「一時的に読めない」ではなく恒久失敗。
      //   黙って前状態維持の無限リトライをやめ、ページ再読み込み案内を出してループを止める。
      if (isContextInvalidatedError(err) || !hasVenueExtensionContext()) {
        markContextInvalidated();
        return;
      }
      // storage timeout / 拡張更新中など一時的に読めない場合は前状態を維持し次回集計へ任せる。
      if (err !== STORAGE_OP_TIMED_OUT) {
        // 想定外エラーも会場は前状態維持(空再描画しない)。ログだけ残す。
        console.warn('[venue] aggregate failed; keeping last good', err);
      }
    } finally {
      aggregateInFlight = false;
    }
  };

  /** @type {number[]} */
  let aggregateBurstTimers = [];
  const clearAggregateBurst = () => {
    for (const t of aggregateBurstTimers) clearTimeout(t);
    aggregateBurstTimers = [];
  };

  const stopAggregation = () => {
    clearAggregateBurst();
    if (rosterPruneTimer) { clearInterval(rosterPruneTimer); rosterPruneTimer = 0; }
    if (rosterCommitRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rosterCommitRaf);
    }
    rosterCommitRaf = 0;
    if (!aggregateTimer) return;
    clearInterval(aggregateTimer);
    aggregateTimer = 0;
  };

  const startAggregation = () => {
    if (aggregateTimer || rosterPruneTimer) return;
    if (rosterDriven) {
      // v0.1.754 ストリーム駆動: storage は「開いた瞬間の catch-up を1回」だけ。aggregateParticipants
      //   が aggregatedCandidates(チャンク差分集計)を満たした後、それで在席を hydrate し、以降は
      //   onLiveComments のストリームに任せる(30秒の全集計ループは回さない=3時間でも軽い)。
      void (async () => {
        await aggregateParticipants(); // 1回だけ(チャンク差分読み)
        if (!open || !rosterDriven) return;
        hydrateRosterFromCandidates(liveRoster, aggregatedCandidates, {
          maxSeats: VENUE_ROSTER_MAX_SEATS
        });
        scheduleRosterCommit();
      })();
      // 沈黙中も退席を席へ反映する軽量 prune(全集計でなく O(席数) の掃除のみ)。
      rosterPruneTimer = window.setInterval(() => {
        if (!open || !rosterDriven) return;
        const before = liveRoster.size;
        pruneRoster(liveRoster, Date.now(), {
          windowMs: VENUE_ROSTER_WINDOW_MS,
          vipWindowMs: VENUE_ROSTER_VIP_WINDOW_MS,
          maxSeats: VENUE_ROSTER_MAX_SEATS
        });
        if (liveRoster.size !== before) {
          baseRows = rosterToVenueRows(liveRoster);
          commitDisplay(baseRows);
        }
      }, 5_000);
      return;
    }
    // --- standalone(venue.html)/ロールバック: 従来の storage 集計経路(不変) ---
    void aggregateParticipants();
    // v0.1.741 安定化(100回やっても出る): 開いた直後はコメント記録がまだ storage に
    //   書かれている途中のことがある。1回きりの集計+30秒間隔だと「開いた瞬間0人で待たされる」
    //   再現性の低さが出る。開いて数秒は短間隔でバースト再集計し、データが書かれ次第すぐ会場へ
    //   反映する(storage.onChanged 経由でも来るが、初期化タイミングの取りこぼしを確実に拾う保険)。
    clearAggregateBurst();
    for (const delay of [400, 1000, 2000, 3500, 5500, 8000]) {
      aggregateBurstTimers.push(
        window.setTimeout(() => {
          if (open) void aggregateParticipants();
        }, delay)
      );
    }
    aggregateTimer = window.setInterval(() => {
      void aggregateParticipants();
    }, AGGREGATE_INTERVAL_MS);
  };

  // v0.1.752: storage poll とリアルタイム live feed の両方が通る共通処理。引数 rows から
  //   新着発言を抽出(pickNewVenueSpeech)→席へマージ→吹き出し+読み上げ。両経路が同じ
  //   speechState.seenKeys を共有するので、同じコメントが poll と live で来ても1回だけ吹く。
  /** @param {Array<Record<string, any>>} rows */
  const processSpeechRows = (rows) => {
    // 熱量の色温度: コメントが来ない時もこの poll は回る(窓が空けば level 0 へ自然に冷める)。
    applyVenueHeat(rows);
    // 「会話の連鎖」: 発言が途切れた人のストリークを掃除(席のグローが自然に消える)。
    pruneSpeechStreaks(speechStreaks, Date.now());
    // primeEmit: 会場を開いた瞬間に直近3件を吹き出す(過疎番組でも会場が喋って見える)。
    //   2回目以降は primed 済みなので新着だけ。過去ログ一斉飛びは起きない。
    // v0.1.755 リアルタイム完璧化: maxEmit 8→24。洪水時に「9件目以降の新着を取りこぼす」のを防ぐ
    //   (会議結論=取りこぼさず全部通す)。同時表示数は BUBBLE_MAX(12)+流速可変寿命で抑えるので
    //   画面は埋まり続けない。24 は1ポーリング/1バーストの現実的上限(初回フラッシュは primeEmit で別管理)。
    const result = pickNewVenueSpeech(rows, speechState, { maxEmit: 24, primeEmit: 3 });
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
      // v0.1.757「読み飛ばし/音声だけ出て吹き出し出ない」根治(会議7体): showSpeechBubble は
      //   発言者の席(seatByKey)が無いと黙って return する。一方 voicePlayer は席非依存で必ず鳴る
      //   =非対称。v0.1.754 で rosterDriven 時に発言者の即着席を skip し席更新を rAF に分離したため、
      //   この同 tick の showSpeechBubble 時に新発言者の席が未作成→吹き出しドロップ(回帰)。
      //   対策: rosterDriven でも【発言者だけは showSpeechBubble の前に同期で在席へ touch し、席を
      //   同期 commit】して必ず座らせる(発言→即着席→吹き出し)。rAF コミットは通常更新用に残す。
      const nowMs = Date.now();
      if (rosterDriven) {
        for (const speech of result.speeches) {
          touchRoster(liveRoster, { userId: speech.userId, name: speech.name, text: speech.text }, nowMs);
        }
        baseRows = rosterToVenueRows(liveRoster);
        commitDisplay(baseRows); // 同期で renderSeats→seatByKey 更新(吹き出しが席を見つけられる)
      } else {
        // 非ストリーム(standalone/rollback)は従来どおり発言者マージで席を即更新。
        baseRows = mergeSpeakersIntoVenueRows(baseRows, result.speeches, nowMs);
        commitDisplay(baseRows);
      }
    }
    for (const speech of result.speeches) {
      // 吹き出しは「しゃべった瞬間」に必ず出す。音声(VOICEVOX)とは切り離す。
      //   旧実装は読み上げON時に onPlayStart(声の再生開始)で吹き出していたが、VOICEVOXが
      //   無い/起動していないと声が鳴らず onPlayStart が呼ばれない→吹き出しが永久に出ない
      //   バグだった(ユーザー実機で発覚)。会場の既定は読み上げ自動ONなので踏みやすい。
      //   吹き出しは視覚要素なので音声の成否に依存させない。声は鳴るなら別途鳴る。
      const bubble = showSpeechBubble(speech);
      // v0.1.778: ギフト/広告コメントなら投げ主のサムネから中央映像へアイテムを投げる。
      maybeThrowGiftFromSpeech(speech);
      if (voicePlayer.enabled) {
        // v0.1.771: 吹き出しを読み上げに連動。実際に鳴り始めたら speaking(消さない)、鳴り終えたら done。
        // v0.1.799「読み上げとコメントがずれる」根治: 床を鮮度ゲート(8秒)に合わせたので、鳴らずに
        //   捨てられた吹き出しが pending のまま8秒残らないよう、onDropped(再生では発火しない drop 専用
        //   シグナル)で resolved を通知し unvoiced(流速寿命)へ落とす。再生時は onAudioStart→speaking。
        //   onPlayStart(再生/破棄の両方で発火する曖昧信号)は配線しない(取りこぼし回避・従来どおり)。
        //   bubble が無い(空テキスト等で出なかった)場合は no-op で安全。
        voicePlayer.enqueue([{
          kind: 'comment',
          userId: speech.userId,
          nickname: speech.name,
          key: speech.key,
          text: speech.text,
          onAudioStart: bubble ? () => markBubbleSpeaking(bubble) : undefined,
          onAudioEnd: bubble ? () => markBubbleDone(bubble) : undefined,
          onDropped: bubble ? () => markBubbleResolved(bubble) : undefined
        }]);
      }
    }
  };

  // v0.1.754 ストリーム駆動在席: 在席 Map の変更を rAF で集約して席へ反映。コメント怒涛でも
  //   1フレーム1回の renderSeats に間引く(buildVenueSeating の prevSeatByKey で席は安定・軽い)。
  const scheduleRosterCommit = () => {
    if (rosterCommitRaf) return;
    const run = () => {
      rosterCommitRaf = 0;
      if (!open || !rosterDriven) return;
      pruneRoster(liveRoster, Date.now(), {
        windowMs: VENUE_ROSTER_WINDOW_MS,
        vipWindowMs: VENUE_ROSTER_VIP_WINDOW_MS,
        maxSeats: VENUE_ROSTER_MAX_SEATS
      });
      baseRows = rosterToVenueRows(liveRoster);
      commitDisplay(baseRows); // keep-last-good + renderSeats(prevSeatByKey で安定)
    };
    rosterCommitRaf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(run)
        : (run(), 0);
  };

  // v0.1.752 リアルタイム化: 録画側(content-entry.js persistCommentRows)が新着コメントを
  //   in-memory で即流すフック。storage 往復(~1.5秒のコアレッサ)を待たず吹き出す。
  //   commentNo を持つ行だけに絞る=後から storage 経路で来る同じコメントと venueSpeechKey が
  //   一致し seenKeys で dedup される(二重吹き出し防止)。会場が閉じている/別配信なら何もしない。
  //   throw しても録画パイプラインを壊さないよう、呼び出し側(content)で try/catch する。
  /**
   * @param {string} incomingLiveId
   * @param {ReadonlyArray<Record<string, unknown>>} rows
   */
  const onLiveComments = (incomingLiveId, rows) => {
    if (!open) return; // 閉じている間は何もしない(開いた時に pollSpeech が storage から再シード)
    const cur = liveIdFromPathname();
    if (!cur || cur !== incomingLiveId) return; // 配信切替中の遅延コールバックは捨てる
    if (speechLiveId !== cur) resetSpeechTracking(cur); // pollSpeech と同じ追従
    const feedRows = liveFeedSpeechRows(rows);
    if (feedRows.length === 0) return;
    processSpeechRows(feedRows); // 吹き出し/読み上げ(従来どおり)
    // v0.1.754: 在席は「通過した瞬間に touch」。storage 集計を待たない=3時間でも O(席数)。
    //   touchRoster が requireText/userId を内部で守る(匿名/本文空は席に入れない・v0.1.740)。
    if (!rosterDriven) return;
    const now = Date.now();
    for (const r of feedRows) touchRoster(liveRoster, r, now);
    scheduleRosterCommit();
  };

  const pollSpeech = async () => {
    if (!open || speechInFlight) return;
    // v0.1.753: 拡張更新後の古いタブは chrome.storage が全失敗する。先回りで検知して停止+案内。
    if (!hasVenueExtensionContext()) { markContextInvalidated(); return; }
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
      processSpeechRows(rows);
    } catch (err) {
      // v0.1.753: context invalidated(拡張更新後の古いタブ)は恒久失敗→停止+案内。
      if (isContextInvalidatedError(err) || !hasVenueExtensionContext()) {
        markContextInvalidated();
        return;
      }
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
    // v0.1.756 リアルタイム完璧化(ユーザー洞察: コメビュは速い→同じ経路に): コメビュ comeview は
    //   onChanged の newValue を【その場で直接】処理して速い。会場はここで pollSpeech(非同期の
    //   storage.local.get 再取得=1往復の遅延)していた。tail が変わったら newValue を直接
    //   processSpeechRows へ渡し、再取得を省いて即座に吹き出し/読み上げする(コメビュと同経路)。
    if (changes[tailKey] && Array.isArray(changes[tailKey].newValue)) {
      processSpeechRows(/** @type {Array<Record<string, any>>} */ (changes[tailKey].newValue));
    } else if (changes[tailKey] || changes[summaryKey]) {
      // tail が無い(summary だけ等)時は従来どおり storage から読む保険。
      void pollSpeech();
    }
    // v0.1.778: NDGR構造化ギフトevent(nls_gift_events_<lv>)の新着を投げ演出の主トリガにする。
    //   ギフトコメント本文は来ないことがある(NDGR仕様・診断 gifts:0 でも giftPoints あり)ので、
    //   構造化 event(userId/itemName/point を直接持つ)を一次ソースにする方が確実。
    const giftEventsKey = `nls_gift_events_${liveId}`;
    if (changes[giftEventsKey] && Array.isArray(changes[giftEventsKey].newValue)) {
      handleNewGiftEvents(/** @type {Array<Record<string, any>>} */ (changes[giftEventsKey].newValue));
    }
    // v0.1.741 安定化: 参加者データはコメントチャンク(nls_cchunk_<lv>_*)に入る。
    //   以前は summaryKey 変化時しか再集計せず、チャンクだけ更新された時に会場が古いまま/空に
    //   なる(=開いた瞬間0人で30秒待ち)再現性の低さがあった。チャンク/インデックス/サマリの
    //   いずれかが変わったら再集計し、コメントが書かれ次第ほぼ即座に会場へ反映する。
    // v0.1.754: ストリーム駆動時は在席を onLiveComments が更新する=storage チャンク変化での
    //   全集計(O(N))は回さない(これが3時間で重くなる元凶だった)。standalone/rollback のみ従来の再集計。
    if (rosterDriven) return;
    const idxKey = chunkIndexKey(liveId);
    const chunkPrefix = `nls_cchunk_${liveId}`;
    let chunkChanged = false;
    for (const k in changes) {
      if (k === idxKey || k === summaryKey || (k.indexOf(chunkPrefix) === 0)) {
        chunkChanged = true;
        break;
      }
    }
    if (chunkChanged) void aggregateParticipants();
  };

  const stopSpeechPolling = () => {
    if (!speechTimer) return;
    clearInterval(speechTimer);
    speechTimer = 0;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  };

  // v0.1.753: 拡張更新後の古いタブ(Extension context invalidated)で、会場が黙って凍結する
  //   のをやめ、ユーザーに「ページ再読み込み」を促す。chrome.* は全失敗するので集計/発話/群衆の
  //   全ループを止め(無効コンテキストへの無限リトライ停止)、ヘッダーに案内を1度だけ出す。
  //   復旧は content script の再起動が必要=ページ再読込のみ(この古いタブからは自己回復不能)。
  let _contextInvalidated = false;
  const markContextInvalidated = () => {
    if (_contextInvalidated) return; // 1度だけ
    _contextInvalidated = true;
    try { stopAggregation(); } catch { /* no-op */ }
    try { stopSpeechPolling(); } catch { /* no-op */ }
    try { stopCrowdMotion(); } catch { /* no-op */ }
    try {
      title.textContent = '⚠ 拡張が更新されました。ページを再読み込み(F5)してください';
      title.style.color = '#ffcf66';
    } catch { /* no-op */ }
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
    // v0.1.738: 診断パネルが開いていれば、まずそれだけ閉じる(会場ごと閉じない)。
    //   × が反応しない時の確実な代替手段(ユーザー報告対策)。
    if (!rosterPanel.hidden) {
      toggleRosterPanel(false);
      return;
    }
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
      // 3キャラ常駐: 集計を待たず先に描く=開いた瞬間から必ず誰かが居る(無人に見せない)。
      renderResidents();
      renderCharFrame(); // v0.1.777 額縁フレーム(四辺を3キャラで囲む)
      startAggregation();
      startSpeechPolling();
    } else {
      removeEscapeListener();
      removeBubbleReflowListener();
      stopAggregation();
      stopSpeechPolling();
      stopCrowdMotion();
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
    // v0.1.770: standalone(別窓化した会場タブ)はタブごと閉じる。インライン版は会場を畳むだけ。
    if (isStandalone) {
      // まず集計/再生を止めてから閉じる(pagehide でも止まるが先に止めて取りこぼし防止)。
      stopAggregation();
      stopSpeechPolling();
      stopCrowdMotion();
      try {
        window.close();
      } catch {
        /* window.close が拒否される環境(稀)では会場だけ畳んでフォールバック */
      }
      // window.close が無視された場合の保険: 会場ステージを閉じる。
      userChangedOpen = true;
      setOpen(false, false);
      return;
    }
    userChangedOpen = true;
    setOpen(false, true);
  });
  window.addEventListener(
    'pagehide',
    () => {
      stopAggregation();
      stopSpeechPolling();
      stopCrowdMotion();
      resetSpeechTracking();
      removeEscapeListener();
    },
    { once: true }
  );

  // v0.1.773 長時間ラグ対策(会議): タブが裏に回ると setTimeout/合成がスロットリングされ、
  //   復帰時に古い読み上げ backlog が溜まったまま=「今」から大きく遅れて喋り出す。可視復帰時に
  //   待機中の読み上げキューを一掃して「今」へリセットする(再生中の1本は止めない)。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!open || !voicePlayer.enabled) return;
    try { voicePlayer.flushPendingQueue(); } catch { /* no-op */ }
  });

  if (isStandalone) {
    setOpen(true, false);
  } else {
    // ユーザー要望: 「開いた瞬間会場モードになるのやめたほういいかも。過去のなにかをひきずるような」
    // ページロード時は常に閉じた状態からスタートし、意図して開く形にする。
    setOpen(false, false);
  }

  // v0.1.752: 録画側(content-entry.js)が新着コメントを in-memory で即流すための API を返す。
  //   watch タブの content script は同一コンテキストなので storage 往復を待たず吹き出せる。
  //   別コンテキストの standalone venue.html は呼ばれず、従来どおり pollSpeech のみで動く(無害)。
  return { onLiveComments };
}

export function mountVenueStandalone(/** @type {string} */ liveId) {
  _forcedLiveId = liveId;
  mountVenueBarButton({ standalone: true });
}
