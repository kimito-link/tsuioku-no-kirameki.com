// @ts-nocheck — comeview UI: read-only DOM/Chrome API。popup と独立。
/**
 * v0.1.652: 独自コメビュ「KIRAMEKI Comment View」(comeview.html)。
 * v0.1.676: ユーザー指示「(自前描画をやめて)そのまま一旦は POP にすればいい」に従い、
 *   一覧描画を【パネルの応援タイムラインと同一パイプライン】に置換した。
 *   - データ: readChunkedComments(本体チャンク正本)+テール+gift_events(POP と同じ)
 *   - 名前/サムネ: applyUserCommentProfileMapToEntries+buildTimelineRowHtml(POP と同じ)
 *   - 見た目: popup.html の .nl-tl-* CSS を移植(POP と同じ)
 *   これにより「コメビュだけ二重表示/名前欠け」の類は構造的に起きない(ソースも描画も同一)。
 *
 * わんコメ式機能: 行クリック→ユーザー詳細(ニックネーム[匿名OK]/ラベル/メモ/ID/リンク/
 *   発言一覧)。NG(非表示)は詳細パネルから。?user=<uid> 起動で詳細を自動オープン
 *   (パネルのタイムライン行クリックから飛んでくる)。
 *
 * ほぼリードオンリー: 書込はユーザー操作時の小さな UI 状態(NG/ノート)のみ・SW は起こさない。
 *
 * @module comeview-entry
 */

import {
  commentsStorageKey,
  KEY_USER_COMMENT_PROFILE_CACHE
} from '../lib/storageKeys.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { readChunkedComments } from '../lib/commentChunkStore.js';
import {
  isCommentDbAvailable,
  openCommentDb,
  countCommentsForLive as countCommentsForLiveDb,
  readAllCommentsForLive as readAllCommentsFromDb
} from '../lib/commentDb.js';
import { combineCanonicalComeviewRows } from '../lib/comeviewRows.js';
import { buildSupportActivityTimeline } from '../lib/supportActivityTimeline.js';
import { buildTimelineRowHtml } from '../lib/supportTimelineHtml.js';
import {
  normalizeUserCommentProfileMap,
  applyUserCommentProfileMapToEntries
} from '../lib/userCommentProfileCache.js';
import {
  comeviewUserKeyForRow,
  comeviewUserPageUrl,
  comeviewPinStorageKey,
  buildComeviewCopyText,
  resolveComeviewAvatarUrl,
  mergeComeviewRowWithProfile,
  normalizeComeviewNgList,
  addComeviewNgEntry,
  removeComeviewNgEntry,
  extractUserCommentRows,
  COMEVIEW_NG_STORAGE_KEY
} from '../lib/comeviewActions.js';
import {
  normalizeComeviewUserNotes,
  upsertComeviewUserNote,
  resolveComeviewDisplayName,
  formatComeviewTime,
  COMEVIEW_USER_NOTES_KEY
} from '../lib/comeviewUserNotes.js';
import {
  comeviewTimelineItemSignature,
  filterVisibleComeviewTimeline,
  keepLatestComeviewTimelineItems,
  pickNewComeviewTimelineItems,
  pickAppendedComeviewSnapshotRows,
  selectAppendedComeviewTimelineItems,
  commentNoOfComeviewRow,
  filterUnseenComeviewComments,
  pickUnseenComeviewGifts,
  isComeviewNearBottom
} from '../lib/comeviewInstantRender.js';
import { resolveVoiceForUser } from '../lib/voiceAssignment.js';
import {
  buildMergedVoiceText,
  buildVoiceReadingText,
  listVoicevoxStyleIds,
  probeVoicevoxAlive,
  synthesizeVoice
} from '../lib/voicevoxClient.js';
// ★v0.1.1329: 会場と同じ「再試行バックオフ」「無音WAV」をコメビュでも使う(二重定義しない)。
import { VOICE_ALIVE_RETRY_BACKOFF_MS, SILENT_WAV_DATA_URI } from '../lib/voicePlayer.js';
import {
  computeVoiceCongestion,
  mergeRepeatedVoiceItem,
  pushVoiceQueue,
  resolveVoiceSynthDepth
} from '../lib/voiceReadQueue.js';
import { makeInitialVoiceDiag, buildVoiceDiagSnapshot } from '../lib/voiceDiag.js';
import { KEY_VOICE_DIAG } from '../lib/voiceDiagKey.js';
import {
  upgradeAnonymousAvatarImage,
  upgradeAnonymousAvatarImages
} from '../lib/avatarPartsComposer.js';
import { isVoiceItemStale } from '../lib/voiceAgeGate.js';
import { runStorageOpWithTimeout } from '../lib/storageOpTimeout.js';
import {
  shouldRenderLoading,
  resolveVoiceLoadingView,
  VOICE_LOADING_FLICKER_GUARD_MS
} from '../lib/voiceLoadingState.js';

/** POP のタイムラインと同じ既定アバター(extension ルート相対・popup.html と同一)。 */
const DEFAULT_TILE_IMG =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
/** POP と同じ表示上限。 */
const TIMELINE_LIMIT = 120;
const HOT_POLL_INTERVAL_MS = 5000;
const RECONCILE_INTERVAL_MS = 60_000;
/**
 * v0.1.784: performFullRefresh の storage/IDB read を有界化する上限(ms)。これを超えて settle
 *   しない read は storage stall とみなし reject させ、_fullRefreshRunning の張り付き(=コメビュ凍結)
 *   を防ぐ。RECONCILE_INTERVAL_MS(60s)より十分短くし、次の tick で自然に再試行される範囲にする。
 */
const FULL_REFRESH_STORAGE_TIMEOUT_MS = 8000;
/**
 * ★v0.1.1321: 起動経路(main)の storage read を有界化する上限。
 *
 * ■ なぜ 1.5 秒か
 *   ここで読むのは【小さな単一キー】(最終watch URL / 読み上げ設定 / NGリスト)で、
 *   空いていれば数ms〜数十msで返る。1.5秒待って返らない＝storage が混んでいる状態なので、
 *   待ち続けるより【まず画面を出す】ほうが良い(取れなかった値は onChanged や
 *   後続の再読み込みで自動的に追いつく)。
 *   ★full refresh(8秒)より短くする: あちらは本体データで「取れないと意味が無い」が、
 *     こちらは設定値で「取れなくても画面は出せる」＝止めてよい理由が無い。
 */
const COMEVIEW_BOOT_READ_TIMEOUT_MS = 1500;
/** ★v0.1.1321: onChanged の二重登録防止(キーを動的に引くので1回張れば足りる)。 */
let _storageChangesWired = false;
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const VOICE_READING_ENABLED_KEY = 'nls_voice_reading_enabled_v1';
const VOICE_ASSIGNMENTS_KEY = 'nls_voice_assignments_v1';
/** v0.1.699: 名前(ハンドルネーム)も読むか。既定OFF=本文だけ読む(ユーザー要望)。 */
const VOICE_READ_NAME_KEY = 'nls_voice_read_name_enabled_v1';

let _liveId = '';
let _paused = false;
let _timer = null;
let _lastReconcileAt = 0;
let _fullRefreshPromise = null;
let _fullRefreshRequested = false;
let _fullRefreshForceBottom = false;
let _fullRefreshRunning = false;
/** @type {Array<Record<string, unknown>>} */
let _tailRows = [];
/** @type {Array<Record<string, unknown>>} */
let _giftRows = [];
/** @type {Array<Record<string, unknown>>|null} */
let _deferredTailRows = null;
/** @type {Array<Record<string, unknown>>|null} */
let _deferredGiftRows = null;
/** @type {Set<string>} 現在 DOM にある TimelineItem.key。 */
const _renderedKeys = new Set();
/**
 * v0.1.679: 表示済みコメントの commentNo(経路を跨いで安定な唯一の識別子)。
 * テール行と正本(IDB)行は同じコメントでも capturedAt/id がズレて TimelineItem.key が
 * 一致しないため、key だけの dedupe では二重表示が再発した(実機 lv350720162)。
 * 上限超過時は古い挿入分から捨てる(Set は挿入順を保つ)。
 * @type {Set<string>}
 */
const _seenCommentNos = new Set();
const SEEN_COMMENT_NOS_MAX = 8000;
/** @type {Map<string, number>} ギフト内容sig→最後に見た at(再キャプチャ重複の遮断)。 */
const _seenGiftAtBySig = new Map();
const SEEN_GIFT_SIGS_MAX = 2000;

function rememberSeenCommentNo(no) {
  if (!no) return;
  _seenCommentNos.add(no);
  if (_seenCommentNos.size > SEEN_COMMENT_NOS_MAX) {
    const drop = _seenCommentNos.size - SEEN_COMMENT_NOS_MAX;
    let i = 0;
    for (const k of _seenCommentNos) {
      _seenCommentNos.delete(k);
      i += 1;
      if (i >= drop) break;
    }
  }
}

function trimSeenGiftSigs() {
  if (_seenGiftAtBySig.size <= SEEN_GIFT_SIGS_MAX) return;
  const drop = _seenGiftAtBySig.size - SEEN_GIFT_SIGS_MAX;
  let i = 0;
  for (const k of _seenGiftAtBySig.keys()) {
    _seenGiftAtBySig.delete(k);
    i += 1;
    if (i >= drop) break;
  }
}
/** @type {Map<string, import('../lib/supportActivityTimeline.js').TimelineItem>} */
const _timelineItemsByKey = new Map();
let _commentCount = 0;
let _hoverBar = null;
let _hoverRow = null;
let _voiceReadingEnabled = false;
let _voiceToggleBusy = false;
/** v0.1.699: 名前読み(既定OFF=本文だけ)。 */
let _voiceReadNameEnabled = false;
let _voiceStyleIds = [];
let _voiceAssignments = {};
let _voiceQueue = [];
/**
 * v0.1.768: 先読み合成を【深さ1→最大3】に拡張(2026-06-16 会議+実コード裏取り)。
 *   従来は1スロット固定で、N の再生中に N+1 を1件だけ先行合成し、N+2 以降の合成が
 *   遊んでいた=フラッド時に合成が前に出られずコメビュに負ける唯一の構造的理由だった。
 *   item オブジェクトをキーに in-flight WAV Promise を持つ Map にし、詰まり具合に応じて
 *   先頭から深さ分(最大3)を並行で先行合成する。再生は元々1本ずつ=不協和は起きない。
 *   同一 VOICEVOX サーバへの並行 audio_query/synthesis は可能。CPU 有界化のため上限3。
 * @type {Map<any, { generation: number, promise: Promise<ArrayBuffer|null> }>}
 */
const _voicePrefetches = new Map();
let _voicePlaying = false;
let _voiceGeneration = 0;
let _voiceStopCurrent = null;
let _voiceSkipTimer = null;
let _initialVoicesPrimed = false;

/**
 * v0.1.852: 読み上げのリアルタイム性診断(「たまに遅れて出る」の真因切り分け)。純観測。
 *   comeview は content/popup と別ページなので、状態速報(status)へ集約するために専用 storage キーへ
 *   定期スナップショットを書く(popup 診断ブリッジと同思想)。記録/発話には一切触れない。
 */
const _voiceDiag = makeInitialVoiceDiag(); // プロパティのみ更新(再代入しない)。
let _voiceDiagLastWriteAt = 0;

/**
 * v0.1.895: drainVoiceQueue が今どのフェーズに居るかを記録する(固着位置の計器)。
 *   合成1065ms(通過)なのに最終発話が伸び続ける(L647 未到達)= どこかの await が永久 pending。
 *   再生側は v0.1.883 で watchdog 済みだが「合成待ち」「次ループ待ち」等で止まると無計器だった。
 *   フェーズ名を残せば、次の状態速報で「停止位置=◯◯」が出て真因を一発で確定できる(推測で直さない)。
 * @param {string} phase
 */
function markVoicePhase(phase) {
  _voiceDiag.lastPhase = String(phase || '');
  _voiceDiag.lastPhaseAt = Date.now();
}

/**
 * v0.1.895: 読み上げループの固着自動回復(番犬)。drainVoiceQueue が _voicePlaying=true のまま
 *   一定時間(VOICE_DRAIN_STUCK_MS)進まなくなったら、強制的に解放して再 drain する。真因(合成/
 *   再生/その他のどこで await が永久 pending か)を問わず固着から自動回復する根治的安全網=
 *   「最終発話が伸び続けて🔴のまま」を構造的に潰す。v0.1.883 の再生 watchdog を【ループ全体】へ拡張。
 *   観測専用の lastPhase と併用=回復しつつ、どこで詰まったかも残す。
 */
const VOICE_DRAIN_STUCK_MS = 30000; // 1件の読み上げ(合成8秒+再生20秒上限)が連続してもこれは超えない。
let _voiceDrainStuckTimer = null;

/** _voiceDiag を storage へ(min-gap で間引き)。失敗は握る=発話を止めない。 */
function publishVoiceDiag() {
  try {
    const now = Date.now();
    if (now - _voiceDiagLastWriteAt < 3000) return; // 3秒 min-gap=書き過ぎない。
    _voiceDiagLastWriteAt = now;
    // ★v0.1.1328: どの面が書いたかを残す(会場は 'venue' を書いている)。
    //   化石値を見たとき「どちらの実装のものか」が分からないと調査が始められない。
    const snap = { ...buildVoiceDiagSnapshot(_voiceDiag, now), source: 'comeview' };
    chrome.storage.local.set({ [KEY_VOICE_DIAG]: snap }).catch(() => {
      /* best-effort: storage 不可・context 消失 */
    });
  } catch {
    /* no-op */
  }
}

/** @type {Array<{key:string,name:string,at:number}>} ユーザーNG リスト(storage 永続)。 */
let _ngList = [];
/** @type {Set<string>} NG 中ユーザーキー(高速判定用)。 */
let _ngKeys = new Set();
/** @type {Record<string,{nickname:string,label:string,memo:string,at:number}>} ユーザーノート。 */
let _userNotes = {};
/** @type {Record<string,{nickname?:string,avatarUrl?:string}>} プロフィールキャッシュ(POPと同一情報源)。 */
let _profileCache = {};
/** @type {Set<string>} 行単位で隠したシグネチャ(この窓だけ・セッション限り)。 */
const _hiddenSigs = new Set();
/** @type {string} 表示中ピンの内容(再描画抑止用)。 */
let _pinShownSig = '';

/**
 * v0.1.677: ホバーアクション(わんコメ同型)のモノクロ SVG アイコン。
 * 固定定数のみ=ユーザー由来文字列は混ぜない(innerHTML 安全)。fill は CSS の currentColor。
 */
const CV_ACTION_ICONS = {
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9zm4 2v9h2v-9h-2zm4 0v9h2v-9h-2z"/></svg>',
  block:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.96 7.96 0 0 1 4 12zm8 8a7.96 7.96 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20z"/></svg>',
  person:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v2h16v-2c0-3.3-4.7-5-8-5z"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
  pin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5l-2 3v2h5v6l1 1 1-1v-6h5v-2l-2-3z"/></svg>'
};

function resolveLiveIdFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search).get('lv') || '';
    const m = String(p).trim().toLowerCase().match(/lv\d{1,15}/);
    if (m) return m[0];
  } catch {
    /* no-op */
  }
  return '';
}

async function resolveLiveIdFromStorage() {
  try {
    /*
     * ★v0.1.1321: 有界化する(コメビュが立ち上がらない実害の根治)。
     *
     * ■ 何が起きていたか(2026-08-11 実機)
     *   過去ログ取り込み(backfill)中は storage が混み、この生の get が返らず
     *   **main() がここで止まる**。画面は cvLiveMeta が静的既定の「—」のまま、
     *   本文は「コメントを待っています…」で固まる＝「立ち上がらない」に見えていた。
     *   (実際 storage が空くと自力で立ち上がった＝壊れてはいなかった)
     *   ★同型の事故は v0.1.784「storage stall でコメビュが凍結する不具合を根治」で
     *     一度手当てされているが、**起動経路は素通しのまま残っていた**。
     *
     * ■ 直し方: 待ち切らない。取れなければ空を返し、後続の onChanged
     *   (nls_last_watch_url の変化→switchToLiveId)が拾って自動で追いつく。
     *   ＝**まず画面を出して、データは後から**。
     */
    const bag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get(KEY_LAST_WATCH_URL),
      COMEVIEW_BOOT_READ_TIMEOUT_MS
    );
    const url = String(bag?.[KEY_LAST_WATCH_URL] || '');
    const m = url.toLowerCase().match(/lv\d{1,15}/);
    if (m) return m[0];
  } catch {
    /* timeout/失敗は空で続行(起動を止めない) */
  }
  return '';
}

/** ?lv= で配信を明示指定して開かれたか(明示なら配信切替に追従しない=固定窓)。 */
let _explicitLiveId = false;

/**
 * 配信切替に追従して別の lv へ切り替える(?lv= 明示で開いた窓は追従しない)。
 * 真因(2026-06-14): comeview を ?lv= 無しで開くと開いた瞬間の lv で固定され、watch タブが
 *   別配信へ移っても古い配信を見続け、新着が来ず「読み上げされない/コメントが流れない」になっていた。
 *   星野メソッド(摩擦ゼロ・自動追従)に従い、nls_last_watch_url の変化で自動的に新配信へ切替える。
 * @param {string} nextLiveId
 */
async function switchToLiveId(nextLiveId) {
  const lv = String(nextLiveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lv) || lv === _liveId) return;
  _liveId = lv;
  const meta = document.getElementById('cvLiveMeta');
  if (meta) meta.textContent = _liveId;
  // 前配信の表示・既読・読み上げキューをリセットして新配信を一から読む。
  _renderedKeys.clear();
  _seenCommentNos.clear();
  _seenGiftAtBySig.clear();
  _tailRows = [];
  _giftRows = [];
  _voiceQueue = [];
  _voiceGeneration += 1;
  _voicePrefetches.clear();
  await requestFullRefresh(true);
}

function isObsMode() {
  try {
    return new URLSearchParams(window.location.search).get('obs') === '1';
  } catch {
    return false;
  }
}

function updateVoiceToggle() {
  const button = document.getElementById('cvBtnVoice');
  if (!button) return;
  button.disabled = _voiceToggleBusy;
  button.classList.toggle('is-on', _voiceReadingEnabled);
  button.setAttribute('aria-pressed', String(_voiceReadingEnabled));
  button.textContent = _voiceReadingEnabled ? '🔊 読み上げ: ON' : '🔈 読み上げ: OFF';
  // v0.1.699: 名前読みトグル(読み上げON時だけ表示)。
  const nameBtn = document.getElementById('cvBtnVoiceName');
  if (nameBtn) {
    nameBtn.hidden = !_voiceReadingEnabled;
    nameBtn.classList.toggle('is-on', _voiceReadNameEnabled);
    nameBtn.setAttribute('aria-pressed', String(_voiceReadNameEnabled));
    nameBtn.textContent = _voiceReadNameEnabled ? '名前読み ON' : '名前読み OFF';
  }
}

function setVoiceStatus(message) {
  const status = document.getElementById('cvVoiceStatus');
  if (!status) return;
  // 臨時メッセージ(audio ブロック警告等)。ローディング演出 class は外す。空クリアも同様。
  status.classList.remove('is-loading');
  status.classList.toggle('is-error', /見つかりません|ブロック/.test(String(message || '')));
  status.textContent = String(message || '');
}

// v0.1.770 起動待ちの「楽しいローディング」(会議 2026-06-16・遅延ガードで一瞬成功はチラつかせない)。
//   会場(venueBar)と同じ純関数(voiceLoadingState)を共用。文言だけ comeview 用。
let _cvVoiceLoadingTimer = null;
function renderCvVoiceLoading(state, reason) {
  const status = document.getElementById('cvVoiceStatus');
  if (!status) return;
  // ★v0.1.1329: 失敗理由で文言を出し分ける(timeout を「見つかりません」と言わない)。
  const view = resolveVoiceLoadingView(state, 'comeview', reason);
  status.classList.toggle('is-loading', view.kind === 'loading');
  status.classList.toggle('is-error', view.kind === 'error');
  status.textContent = view.text;
}
function driveCvVoiceLoading(state, reason) {
  if (_cvVoiceLoadingTimer != null) {
    clearTimeout(_cvVoiceLoadingTimer);
    _cvVoiceLoadingTimer = null;
  }
  if (state === 'checking') {
    // 遅延ガード: すぐには描かない。180ms 後にまだ checking なら初めて演出を出す。
    const status = document.getElementById('cvVoiceStatus');
    if (status) {
      status.classList.remove('is-loading', 'is-error');
      status.textContent = '';
    }
    _cvVoiceLoadingTimer = window.setTimeout(() => {
      _cvVoiceLoadingTimer = null;
      if (shouldRenderLoading('checking', VOICE_LOADING_FLICKER_GUARD_MS)) renderCvVoiceLoading('checking');
    }, VOICE_LOADING_FLICKER_GUARD_MS);
    return;
  }
  renderCvVoiceLoading(state, reason);
}

function showVoiceSkipped(count) {
  const skipped = document.getElementById('cvVoiceSkip');
  if (!skipped || count <= 0) return;
  skipped.textContent = `${count}件スキップ`;
  if (_voiceSkipTimer != null) clearTimeout(_voiceSkipTimer);
  _voiceSkipTimer = window.setTimeout(() => {
    skipped.textContent = '';
    _voiceSkipTimer = null;
  }, 3000);
}

function persistVoiceReadingEnabled(enabled) {
  try {
    void chrome.storage.local.set({ [VOICE_READING_ENABLED_KEY]: enabled === true });
  } catch {
    /* no-op */
  }
}

function normalizeVoiceAssignments(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function stopVoicePlayback() {
  _voiceQueue = [];
  _voiceGeneration += 1;
  _voicePrefetches.clear();
  if (typeof _voiceStopCurrent === 'function') _voiceStopCurrent();
  _voiceStopCurrent = null;
}

function disableVoiceReading({ persist = true } = {}) {
  _voiceReadingEnabled = false;
  _voiceToggleBusy = false;
  stopVoicePlayback();
  updateVoiceToggle();
  if (persist) persistVoiceReadingEnabled(false);
}

/**
 * ★v0.1.1329: 音声解錠(会場の primeAudioUnlock と同じ手法をコメビュにも)。
 *   クリック直後に無音を1回鳴らして、以後の play() を解錠しておく。
 *   失敗しても握って続行する(悪化させない)。
 * @returns {Promise<boolean>}
 */
async function primeCvAudioUnlock() {
  try {
    if (typeof Audio !== 'function') return false;
    const a = new Audio();
    a.src = SILENT_WAV_DATA_URI;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === 'function') await p;
    try { a.pause(); } catch { /* no-op */ }
    return true;
  } catch {
    return false;
  }
}

async function enableVoiceReading({ persist = true } = {}) {
  if (isObsMode() || _voiceToggleBusy) return;
  _voiceToggleBusy = true;
  updateVoiceToggle();
  // v0.1.770: 起動待ちは状態駆動の楽しいローディング(遅延ガードで一瞬成功はチラつかせない)。
  driveCvVoiceLoading('checking');
  /*
   * ★v0.1.1329: 会場(VoicePlayer)に入れた3つの修正を【コメビュにも】移す。
   *   v1326/v1327 は VoicePlayer だけを直しており、独自実装のこちらは素通しだった
   *   =ユーザーがコメビュのボタンを押している限り「何も変わらない」状態だった。
   *   (読み上げは2実装に分岐している。同じ症状は両方に出る前提で直す)
   *
   *   ① 解錠を最初にやる: クリックの延長でいられる唯一の瞬間。await を挟んだ後では
   *      Chrome の自動再生ブロックに掛かる。
   *   ② 再試行 1回 → 3回(バックオフ)。MV3 SW のコールド起床が既定タイムアウトに
   *      間に合わないことがある。未起動なら即 refused で返るので待ちは増えない。
   *   ③ 失敗しても OFF を永続保存しない。ユーザーの「ONにしたい」意思を消さない。
   */
  await primeCvAudioUnlock();
  let probe = await probeVoicevoxAlive();
  if (!probe.ok) {
    driveCvVoiceLoading('connecting');
    for (const waitMs of VOICE_ALIVE_RETRY_BACKOFF_MS) {
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      probe = await probeVoicevoxAlive();
      if (probe.ok) break;
    }
  }
  if (!probe.ok) {
    // ★persist:false = 次に押せばまた試せる(OFFで固定しない)。
    disableVoiceReading({ persist: false });
    driveCvVoiceLoading('notfound', probe.reason);
    return;
  }

  _voiceStyleIds = await listVoicevoxStyleIds();
  _voiceGeneration += 1;
  _voiceReadingEnabled = true;
  _voiceToggleBusy = false;
  driveCvVoiceLoading('ready');
  updateVoiceToggle();
  if (persist) persistVoiceReadingEnabled(true);
}

function voiceUserKeyForItem(item) {
  const row = {
    userId: String(item?.userId || '').trim(),
    name: String(item?.nickname || '').trim()
  };
  return (
    comeviewUserKeyForRow(row) ||
    row.userId ||
    row.name ||
    'anon'
  );
}

/** item 1件ぶんの合成を起動し、in-flight WAV Promise を返す(まだ無ければ)。 */
function ensureVoicePrefetch(item, generation) {
  if (!item || generation !== _voiceGeneration) return null;
  const existing = _voicePrefetches.get(item);
  if (existing && existing.generation === generation) return existing.promise;
  const congestion = computeVoiceCongestion(_voiceQueue.length);
  const assigned = resolveVoiceForUser(
    item.userKey,
    _voiceAssignments,
    _voiceStyleIds
  );
  const promise = synthesizeVoice(
    buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
    {
      ...assigned,
      speedOffset: assigned.speedOffset + congestion.speedBoost
    }
  ).catch(() => null);
  _voicePrefetches.set(item, { generation, promise });
  return promise;
}

/**
 * v0.1.768: 先頭から深さ分(最大3)の item を先行合成する。詳細は _voicePrefetches の解説参照。
 *   深さは詰まり具合(resolveVoiceSynthDepth)で動的=落ち着いていれば1=無駄打ちしない。
 */
function startVoicePrefetch(generation) {
  if (generation !== _voiceGeneration) {
    _voicePrefetches.clear();
    return;
  }
  const depth = resolveVoiceSynthDepth(_voiceQueue.length, {
    pending: _voiceQueue.length
  });
  const wanted = new Set();
  for (let i = 0; i < depth && i < _voiceQueue.length; i++) {
    const item = _voiceQueue[i];
    if (!item) continue;
    wanted.add(item);
    ensureVoicePrefetch(item, generation);
  }
  for (const key of _voicePrefetches.keys()) {
    if (!wanted.has(key)) _voicePrefetches.delete(key);
  }
}

async function drainVoiceQueue() {
  if (_voicePlaying || !_voiceReadingEnabled || isObsMode()) return;
  _voicePlaying = true;
  markVoicePhase('drain_enter');
  // v0.1.895: 固着自動回復の番犬。このループが VOICE_DRAIN_STUCK_MS 進まないまま _voicePlaying=true で
  //   居座ったら、世代を上げて(古いループの await が解決しても L568 の generation ガードで停止)強制解放し、
  //   待機が残っていれば新しいループを起こす。真因(合成/再生/その他のどこで await が永久 pending か)を
  //   問わず「発話が止まったまま」から復帰する=v0.1.883 の再生 watchdog を【ループ全体】へ拡張。
  const drainGenerationAtStart = _voiceGeneration;
  const armDrainWatchdog = () => {
    if (_voiceDrainStuckTimer !== null) clearTimeout(_voiceDrainStuckTimer);
    _voiceDrainStuckTimer = setTimeout(() => {
      // まだ同じ世代で再生中=本当に固着している(正常進行なら直前にこのタイマーが張り直されている)。
      if (_voicePlaying && _voiceGeneration === drainGenerationAtStart) {
        markVoicePhase('stuck_recovered');
        _voiceDiag.playbackTimeoutTotal += 1; // 固着回復も再生TOと同じ「安全網発火」として計上。
        publishVoiceDiag();
        _voiceGeneration += 1; // 古い固着ループを次の await 境界で停止させる。
        _voicePrefetches.clear();
        if (typeof _voiceStopCurrent === 'function') { try { _voiceStopCurrent(); } catch { /* no-op */ } }
        _voiceStopCurrent = null;
        _voicePlaying = false;
        if (_voiceReadingEnabled && _voiceQueue.length) void drainVoiceQueue();
      }
    }, VOICE_DRAIN_STUCK_MS);
  };
  armDrainWatchdog();
  try {
    while (_voiceReadingEnabled && _voiceQueue.length) {
      // PR-V2: キュー一括フラッシュ (catch-up drop)
      const now = Date.now();
      let allStale = true;
      for (const qItem of _voiceQueue) {
        if (!isVoiceItemStale(qItem.enqueuedAt, now, _voiceQueue.length, qItem.priority === 'high').stale) {
          allStale = false;
          break;
        }
      }
      if (allStale && _voiceQueue.length > 0) {
        const dropCount = _voiceQueue.length;
        _voiceQueue = []; // 全て古い場合は一括で捨てる
        showVoiceSkipped(dropCount);
        _voiceDiag.staleDropTotal += dropCount; // v0.1.852 観測: 間引き累計=遅延の傍証。
        _voiceDiag.queueNow = 0;
        publishVoiceDiag();
        break;
      }

      const queueLength = _voiceQueue.length;
      // v0.1.852 観測: 待機ピークを記録(詰まりの最大)。
      if (queueLength > _voiceDiag.queueMax) _voiceDiag.queueMax = queueLength;
      _voiceDiag.queueNow = queueLength;
      const generation = _voiceGeneration;
      // v0.1.768: 先頭から深さ分(最大3)を【先に】合成起動してから先頭を取り出す。
      //   N の再生でブロックしている間に N+1/N+2/N+3 の合成が並走する。
      startVoicePrefetch(generation);

      const item = _voiceQueue.shift();
      if (!item) continue;

      // PR-V1: 合成前の鮮度ゲート判定
      const ageCheck = isVoiceItemStale(item.enqueuedAt, Date.now(), queueLength, item.priority === 'high');
      if (ageCheck.stale) {
        showVoiceSkipped(1);
        _voiceDiag.staleDropTotal += 1; // v0.1.852 観測。
        _voicePrefetches.delete(item); // prefetch が stale 向けなら破棄
        continue; // 読まずに捨てる
      }
      const congestion = computeVoiceCongestion(queueLength);
      // v0.1.852 観測: 直近の混雑対応(速度ブースト・先読み深さ)を記録。
      _voiceDiag.lastSpeedBoost = congestion.speedBoost;
      _voiceDiag.lastDepth = resolveVoiceSynthDepth(queueLength, { pending: queueLength });
      const assigned = resolveVoiceForUser(
        item.userKey,
        _voiceAssignments,
        _voiceStyleIds
      );
      // 先頭は startVoicePrefetch で必ず先読み起動済み(深さ>=1)。その in-flight を再利用する。
      const prefetch = _voicePrefetches.get(item);
      _voicePrefetches.delete(item);
      const _synthStart = Date.now(); // v0.1.852 観測: 合成所要(先読み済なら待ち時間=ほぼ0)。
      markVoicePhase(prefetch ? 'await_prefetch' : 'await_synth'); // v0.1.895: 合成待ちで止まったか。
      const wav = prefetch
        ? await prefetch.promise
        : await synthesizeVoice(
            buildMergedVoiceText(item, { maxChars: congestion.maxChars }),
            {
              ...assigned,
              speedOffset: assigned.speedOffset + congestion.speedBoost
            }
          );
      _voiceDiag.lastSynthMs = Math.max(0, Date.now() - _synthStart);
      markVoicePhase('synth_done'); // v0.1.895: 合成は通過した(ここで止まれば下の continue/再生で詰まり)。
      if (
        !wav ||
        !_voiceReadingEnabled ||
        generation !== _voiceGeneration ||
        isObsMode()
      ) {
        markVoicePhase('skip_after_synth'); // v0.1.895: 世代変更/無効化等で読まずにスキップした。
        continue;
      }

      startVoicePrefetch(generation);
      let objectUrl = '';
      try {
        markVoicePhase('await_playback'); // v0.1.895: 再生待ちに入る(watchdog 付き)。
        objectUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
        const audio = new Audio(objectUrl);
        await new Promise((resolve) => {
          let settled = false;
          // v0.1.883: 再生完了の安全網(watchdog)。'ended'/'error' が一度も来ないケース
          //   (裏タブで Chrome が音声を中断・音声デバイス切替・blob 再生 stall 等)に備える。
          //   これが無いと await が永久 pending=_voicePlaying が true のまま固着し、以降の
          //   drainVoiceQueue() が全て先頭 return=「待機が溜まるのに発話が止まったまま」になる
          //   (実機: 最終発話2234秒前・待機6・合成0ms の固着の真因)。まず固定上限で張り、
          //   メタデータが取れたら 実尺+余裕 に締めて短いクリップを長く待たない。
          /** @type {ReturnType<typeof setTimeout>|null} */
          let watchdog = null;
          const VOICE_PLAYBACK_HARD_CAP_MS = 20000; // 1コメント読み上げがこれを超えることは無い。
          const armWatchdog = (/** @type {number} */ ms) => {
            if (watchdog !== null) clearTimeout(watchdog);
            watchdog = setTimeout(() => {
              // ended/error が来ず安全網で打ち切った=本物の固着回避。観測して状態速報に出す。
              _voiceDiag.playbackTimeoutTotal += 1;
              finish();
            }, Math.max(1000, ms));
          };
          const finish = () => {
            if (settled) return;
            settled = true;
            if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
            audio.removeEventListener('ended', finish);
            audio.removeEventListener('error', finish);
            audio.removeEventListener('loadedmetadata', onMeta);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = '';
            _voiceStopCurrent = null;
            resolve();
          };
          const onMeta = () => {
            const dur = Number(audio.duration);
            if (Number.isFinite(dur) && dur > 0) armWatchdog(dur * 1000 + 1500);
          };
          _voiceStopCurrent = () => {
            try {
              audio.pause();
            } catch {
              /* no-op */
            }
            finish();
          };
          audio.addEventListener('ended', finish, { once: true });
          audio.addEventListener('error', finish, { once: true });
          audio.addEventListener('loadedmetadata', onMeta, { once: true });
          armWatchdog(VOICE_PLAYBACK_HARD_CAP_MS); // 先に固定上限で必ず張る(メタ未取得でも固着しない)。
          try {
            const playResult = audio.play();
            if (playResult && typeof playResult.catch === 'function') {
              playResult.catch((err) => {
                if (err && err.name === 'NotAllowedError') {
                  /*
                   * ★v0.1.1329: ここで読み上げを OFF にしない(会場と同じ修正)。
                   *   ブロックは【この1件が鳴らせなかった】だけで、機能が壊れたわけではない。
                   *   従来は _voiceReadingEnabled=false にしていたため、ユーザーには
                   *   「ONにした直後に戻る」と見えていた(実機報告)。
                   *   ONのまま案内を出し、ページを一度クリックすれば自然に復帰する。
                   */
                  _voiceDiag.audioBlockedTotal = (Number(_voiceDiag.audioBlockedTotal) || 0) + 1;
                  publishVoiceDiag();
                  setVoiceStatus('⚠️ブラウザが音声をブロックしています。ページのどこかを一度クリックすると鳴ります');
                }
                finish();
              });
            }
          } catch {
            finish();
          }
        });
      } catch {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
      // v0.1.852 観測: 1件 発話完了。最終発話時刻と件数・現在の待機を記録して storage へ。
      _voiceDiag.spokenTotal += 1;
      _voiceDiag.lastSpokenBase = Date.now();
      _voiceDiag.queueNow = _voiceQueue.length;
      _voiceDiag.enabled = _voiceReadingEnabled;
      markVoicePhase('spoke_done'); // v0.1.895: 1件読み上げ完了=正常進行(ここが最新なら固着していない)。
      // v0.1.895: 1件読み上げるたびに番犬を張り直す(次の1件のための新しい窓)。進行している限り発火しない。
      armDrainWatchdog();
      publishVoiceDiag();
    }
  } finally {
    _voicePlaying = false;
    markVoicePhase('drain_exit'); // v0.1.895: ループ正常終了(キュー空 or 無効化)=固着でない。
    if (_voiceDrainStuckTimer !== null) { clearTimeout(_voiceDrainStuckTimer); _voiceDrainStuckTimer = null; }
    if (_voiceReadingEnabled && _voiceQueue.length) void drainVoiceQueue();
  }
}

function enqueueVoiceTimelineItems(items) {
  if (!_voiceReadingEnabled || isObsMode() || !Array.isArray(items)) return;
  let droppedCount = 0;
  for (const item of items) {
    if (!item || (item.kind !== 'comment' && item.kind !== 'gift')) continue;
    // v0.1.699: 名前読みは既定OFF(本文だけ)。ONのときだけ「名前、本文」。
    const name = _voiceReadNameEnabled
      ? String(item.nickname || '').trim()
      : '';
    let body = '';
    let isHighPriority = false;
    if (item.kind === 'gift') {
      isHighPriority = true;
      const count = item.gift?.count > 1 ? `を${item.gift.count}個` : 'を';
      body = `ギフト、${item.gift?.name || 'アイテム'}${count}贈りました。${item.gift?.message || ''}`.trim();
    } else {
      body = String(item.text || '').trim();
    }

    if (!buildVoiceReadingText({ name, text: body })) continue;
    const candidate = {
      userKey: voiceUserKeyForItem(item),
      name,
      body,
      count: 1,
      enqueuedAt: Date.now(),
      priority: isHighPriority ? 'high' : 'normal'
    };
    const merged = mergeRepeatedVoiceItem(_voiceQueue, candidate);
    _voiceQueue = merged.queue;
    if (merged.merged) continue;
    // v0.1.782: わんコメ(OneComme limitQueue=10)式に、リアルタイム維持の主軸を件数ゲート
    //   (最古drop)に置く。上限 12→8 でラグを有界化(voicePlayer 会場/会話版と揃える)。
    //   時間ゲート(isVoiceItemStale)は安全網に格下げ済み(voiceAgeGate v0.1.782)。
    const pushed = pushVoiceQueue(
      _voiceQueue,
      candidate,
      { max: 8 }
    );
    _voiceQueue = pushed.queue;
    droppedCount += pushed.dropped.length;
  }
  if (droppedCount > 0) showVoiceSkipped(droppedCount);
  // v0.1.852 観測: 件数ゲート(max:8 最古drop)の drop も間引きに計上=「追いつけず捨てた」傍証。
  //   enabled/queueNow/queueMax も enqueue 時点で更新(発話前でも詰まりが見える)。
  _voiceDiag.staleDropTotal += droppedCount;
  _voiceDiag.enabled = _voiceReadingEnabled;
  _voiceDiag.queueNow = _voiceQueue.length;
  if (_voiceQueue.length > _voiceDiag.queueMax) _voiceDiag.queueMax = _voiceQueue.length;
  publishVoiceDiag();
  if (_voiceQueue.length) void drainVoiceQueue();
}

async function initializeVoiceReading() {
  if (isObsMode()) return;
  let bag = {};
  try {
    // ★v0.1.1321: 有界化(起動経路)。読み上げ設定が取れなくても画面は出す。
    //   既定(読み上げOFF・割当なし)で始まり、後で設定変更を onChanged が拾う。
    bag = await runStorageOpWithTimeout(
      () =>
        chrome.storage.local.get([
          VOICE_READING_ENABLED_KEY,
          VOICE_ASSIGNMENTS_KEY,
          VOICE_READ_NAME_KEY
        ]),
      COMEVIEW_BOOT_READ_TIMEOUT_MS
    );
  } catch {
    bag = {};
  }
  if (!bag || typeof bag !== 'object') bag = {};
  _voiceAssignments = normalizeVoiceAssignments(bag[VOICE_ASSIGNMENTS_KEY]);
  _voiceReadNameEnabled = bag[VOICE_READ_NAME_KEY] === true;
  updateVoiceToggle();
  // ?voice=1 で起動された(パネルの「読み上げ」ボタン経由)場合は、保存状態に関わらず読み上げON。
  let forceVoiceOn = false;
  try {
    forceVoiceOn = new URLSearchParams(window.location.search).get('voice') === '1';
  } catch {
    forceVoiceOn = false;
  }
  if (forceVoiceOn || bag[VOICE_READING_ENABLED_KEY] === true) {
    await enableVoiceReading({ persist: forceVoiceOn });
  }
}

/**
 * v0.1.674: ?user=<uid>(&uname=<表示名>) で起動されたら詳細パネルを自動で開く。
 * uname が自動生成の「匿名NNN」なら持ち込まない(コメビュ側で同じ番号を再生成する)。
 */
function resolveDetailRequestFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const uid = String(sp.get('user') || '').trim();
    if (!uid || uid.length > 128) return null;
    let name = String(sp.get('uname') || '').trim();
    if (/^匿名\d{1,3}$/.test(name)) name = '';
    return { userId: uid, name };
  } catch {
    return null;
  }
}

const AVATAR_COLORS = ['#0f8fd8', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
function avatarColor(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initial(name) {
  const s = String(name || '').trim();
  return s ? s.slice(0, 1) : '★';
}

function copyTextToClipboard(text) {
  const t = String(text || '');
  if (!t) return;
  try {
    void navigator.clipboard.writeText(t);
    return;
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* no-op */
  }
}

// ── NG(非表示)管理 ─────────────────────────────────────────────
function persistNgList() {
  try {
    void chrome.storage.local.set({ [COMEVIEW_NG_STORAGE_KEY]: _ngList });
  } catch {
    /* no-op */
  }
}

function setNgList(next) {
  _ngList = next;
  _ngKeys = new Set(next.map((e) => e.key));
  persistNgList();
  updateNgButton();
  void requestFullRefresh();
}

function addNg(row) {
  const { list, added } = addComeviewNgEntry(_ngList, row, Date.now());
  if (!added) return;
  setNgList(list);
}

function updateNgButton() {
  const btn = document.getElementById('cvBtnNg');
  if (!btn) return;
  const n = _ngList.length;
  btn.textContent = `NG ${n}`;
  btn.style.display = n > 0 ? '' : 'none';
}

async function loadNgList() {
  try {
    // ★v0.1.1321: 有界化(起動経路)。NGリストが取れなくても画面は出す。
    //   ★NGは「出さない」ための設定なので、取れないときに全部出るのは望ましくない。
    //     ただしここで止めると【何も出ない】=より悪い。空で開始し、
    //     下の onChanged / 再読み込みで取れ次第すぐ適用される。
    const bag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get(COMEVIEW_NG_STORAGE_KEY),
      COMEVIEW_BOOT_READ_TIMEOUT_MS
    );
    _ngList = normalizeComeviewNgList(bag?.[COMEVIEW_NG_STORAGE_KEY]);
    _ngKeys = new Set(_ngList.map((e) => e.key));
  } catch {
    _ngList = [];
    _ngKeys = new Set();
  }
  updateNgButton();
}

// ── ユーザーノート(ニックネーム/ラベル/メモ・匿名OK) ─────────────
function saveUserNotePatch(ukey, patch) {
  if (!ukey) return;
  _userNotes = upsertComeviewUserNote(_userNotes, ukey, patch, Date.now());
  try {
    void chrome.storage.local.set({ [COMEVIEW_USER_NOTES_KEY]: _userNotes });
  } catch {
    /* no-op */
  }
}

// ── 画面内パネル(ユーザー詳細/NG 管理) ─────────────────────────
function openPanel(title) {
  const panel = document.getElementById('cvPanel');
  const titleEl = document.getElementById('cvPanelTitle');
  const bodyEl = document.getElementById('cvPanelBody');
  if (!panel || !titleEl || !bodyEl) return null;
  titleEl.textContent = title;
  bodyEl.textContent = '';
  panel.style.display = '';
  return bodyEl;
}

function closePanel() {
  const panel = document.getElementById('cvPanel');
  if (panel) panel.style.display = 'none';
}

/**
 * ユーザー詳細パネル(わんコメ式+追憶独自):
 *   サムネ・名前・ID・コピー・↗ユーザーページ(セット原則)+ニックネーム/ラベル/メモ
 *   (匿名にも付けられる)+この配信での発言一覧(本体アーカイブから・時刻付き)+NG。
 */
async function showUserDetail(row) {
  row = mergeComeviewRowWithProfile(row, _profileCache) || row;
  const ukey = comeviewUserKeyForRow(row);
  if (!ukey || !_liveId) return;
  const label =
    resolveComeviewDisplayName(row, _userNotes, ukey) || row.userId || 'この人';
  const bodyEl = openPanel(`👤 ${label}`);
  if (!bodyEl) return;

  // --- ヘッダ: サムネ・名前・ID・リンクは「分かる限りセット」で出す ---
  const head = document.createElement('div');
  head.className = 'cv-detail-head';
  const avatarUrl = resolveComeviewAvatarUrl(row);
  if (avatarUrl) {
    const av = document.createElement('img');
    av.className = 'cv-detail-avatar';
    av.src = avatarUrl;
    av.alt = '';
    if (avatarUrl.startsWith('data:image/svg+xml') && row.userId) {
      upgradeAnonymousAvatarImage(av, row.userId, 64);
    }
    av.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'cv-avatar-fallback cv-detail-avatar';
      fb.style.background = avatarColor(row.userId || row.name);
      fb.textContent = initial(label);
      av.replaceWith(fb);
    };
    head.appendChild(av);
  } else {
    const fb = document.createElement('div');
    fb.className = 'cv-avatar-fallback cv-detail-avatar';
    fb.style.background = avatarColor(row.userId || row.name);
    fb.textContent = initial(label);
    head.appendChild(fb);
  }
  const headBody = document.createElement('div');
  headBody.className = 'cv-detail-head-body';
  const headName = document.createElement('div');
  headName.className = 'cv-detail-name';
  headName.textContent = label;
  headBody.appendChild(headName);
  const idLine = document.createElement('div');
  idLine.className = 'cv-detail-id';
  const idText = document.createElement('span');
  idText.textContent = row.userId ? `ID: ${row.userId}` : '(名前のみ・ID なし)';
  idLine.appendChild(idText);
  if (row.userId) {
    const cp = document.createElement('button');
    cp.type = 'button';
    cp.className = 'cv-panel-unng';
    cp.textContent = 'コピー';
    cp.addEventListener('click', () => copyTextToClipboard(row.userId));
    idLine.appendChild(cp);
  }
  const pageUrl = comeviewUserPageUrl(row.userId);
  if (pageUrl) {
    const lk = document.createElement('button');
    lk.type = 'button';
    lk.className = 'cv-panel-unng';
    lk.textContent = '↗ ユーザーページ';
    lk.title = 'ニコニコのユーザーページを開く';
    lk.addEventListener('click', () => {
      try {
        void chrome.tabs.create({ url: pageUrl });
      } catch {
        window.open(pageUrl, '_blank', 'noopener');
      }
    });
    idLine.appendChild(lk);
  }
  // NG(この人を非表示)。一覧の行からではなく詳細から行う(POP 同一描画を崩さない)。
  const ngBtn = document.createElement('button');
  ngBtn.type = 'button';
  ngBtn.className = 'cv-panel-unng';
  ngBtn.textContent = '🚫 非表示';
  ngBtn.title = 'この人のコメントをコメビュで非表示にする(ヘッダの NG から解除可)';
  ngBtn.addEventListener('click', () => {
    addNg(row);
    closePanel();
  });
  idLine.appendChild(ngBtn);
  headBody.appendChild(idLine);
  head.appendChild(headBody);
  bodyEl.appendChild(head);

  // --- ニックネーム/ラベル/メモ(変更したら即保存・匿名にも付けられる) ---
  const note = _userNotes[ukey] || { nickname: '', label: '', memo: '' };
  const form = document.createElement('div');
  form.className = 'cv-detail-form';
  const mkField = (caption, placeholder, value, field, multiline) => {
    const wrap = document.createElement('label');
    wrap.className = 'cv-detail-field';
    const cap = document.createElement('span');
    cap.textContent = caption;
    wrap.appendChild(cap);
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('change', () =>
      saveUserNotePatch(ukey, { [field]: input.value })
    );
    wrap.appendChild(input);
    form.appendChild(wrap);
  };
  mkField(
    'ニックネーム(あなた用のメモ名・匿名にも付けられます)',
    '例: 常連の柿ピーさん',
    note.nickname,
    'nickname',
    false
  );
  mkField('ラベル', '例: 常連 / 初見', note.label, 'label', false);
  mkField('メモ(自分用・画面には出ません)', '', note.memo, 'memo', true);
  bodyEl.appendChild(form);

  const loading = document.createElement('div');
  loading.className = 'cv-panel-note';
  loading.textContent = 'アーカイブから読み込み中…';
  bodyEl.appendChild(loading);

  // --- この配信での発言一覧(本体アーカイブから・クリック時だけ一度読む) ---
  let rawRows = [];
  try {
    rawRows = await readCanonicalComments(_liveId);
  } catch {
    rawRows = [];
  }

  const { rows, total } = extractUserCommentRows(rawRows, ukey, 200);
  loading.remove();
  const countNote = document.createElement('div');
  countNote.className = 'cv-panel-note';
  countNote.textContent = total
    ? `この配信での発言 全 ${total} 件${total > rows.length ? `(新しい ${rows.length} 件を表示)` : ''}`
    : 'この配信の記録にはまだ発言がありません';
  bodyEl.appendChild(countNote);
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const line = document.createElement('div');
    line.className = 'cv-panel-row';
    const no = document.createElement('span');
    no.className = 'cv-panel-no';
    no.textContent = r.no != null ? `#${r.no}` : '·';
    line.appendChild(no);
    const tx = document.createElement('span');
    tx.className = 'cv-panel-text';
    tx.textContent = r.text;
    line.appendChild(tx);
    const tm = document.createElement('span');
    tm.className = 'cv-panel-time';
    tm.textContent = formatComeviewTime(r.capturedAt);
    line.appendChild(tm);
    frag.appendChild(line);
  }
  bodyEl.appendChild(frag);
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

/** NG 管理パネル(サムネ・名前・ID セット+解除ボタン)。 */
function showNgPanel() {
  const bodyEl = openPanel('🚫 非表示にした人');
  if (!bodyEl) return;
  if (!_ngList.length) {
    const note = document.createElement('div');
    note.className = 'cv-panel-note';
    note.textContent = '非表示中のユーザーはいません';
    bodyEl.appendChild(note);
    return;
  }
  for (const e of [..._ngList].reverse()) {
    const line = document.createElement('div');
    line.className = 'cv-panel-row';
    const uid = e.key.startsWith('u:') ? e.key.slice(2) : '';
    const avatarUrl = resolveComeviewAvatarUrl({ avatar: '', userId: uid });
    if (avatarUrl) {
      const av = document.createElement('img');
      av.className = 'cv-ng-avatar';
      av.src = avatarUrl;
      av.alt = '';
      if (avatarUrl.startsWith('data:image/svg+xml') && uid) {
        upgradeAnonymousAvatarImage(av, uid, 64);
      }
      av.onerror = () => av.remove();
      line.appendChild(av);
    }
    const nm = document.createElement('span');
    nm.className = 'cv-panel-text';
    nm.textContent =
      e.name || resolveComeviewDisplayName({ userId: uid, name: '' }, {}, '') || e.key;
    line.appendChild(nm);
    if (uid) {
      const idSpan = document.createElement('span');
      idSpan.className = 'cv-panel-time';
      idSpan.textContent = uid;
      line.appendChild(idSpan);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv-panel-unng';
    btn.textContent = '解除';
    btn.addEventListener('click', () => {
      setNgList(removeComeviewNgEntry(_ngList, e.key));
      line.remove();
    });
    line.appendChild(btn);
    bodyEl.appendChild(line);
  }
}

// ── 一覧描画: POP の応援タイムラインと同一パイプライン ─────────────
/**
 * コメント本体を POP の readAllCommentsForLive と同じ優先順で読む:
 *   IDB(SW 集約書きの正本・uid/名前が揃う) > チャンク/main +テール。
 *   実機(lv350667621)で「チャンクだけ読むと uid 無しの劣化行・IDB は enriched」と確認済み。
 * @param {string} lv
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function readCanonicalComments(lv) {
  let rows = [];
  if (isCommentDbAvailable()) {
    let db = null;
    try {
      db = await openCommentDb();
      const cnt = await countCommentsForLiveDb(db, lv);
      if (cnt > 0) {
        const dbRows = await readAllCommentsFromDb(db, lv);
        if (Array.isArray(dbRows) && dbRows.length) rows = dbRows;
      }
    } catch {
      /* fallthrough: chunk 経路へ */
    } finally {
      try {
        if (db) db.close();
      } catch {
        /* no-op */
      }
    }
  }
  if (!rows.length) {
    try {
      const res = await readChunkedComments(lv, commentsStorageKey(lv), (keys) =>
        chrome.storage.local.get(keys)
      );
      rows = Array.isArray(res.rows) ? res.rows : [];
    } catch {
      rows = [];
    }
  }
  try {
    const tKey = tailStorageKey(lv);
    const bag = await chrome.storage.local.get(tKey);
    rows = combineCanonicalComeviewRows(rows, Array.isArray(bag[tKey]) ? bag[tKey] : []);
  } catch {
    /* テールは任意 */
  }
  return rows;
}

function updateCommentCount() {
  const countEl = document.getElementById('cvCount');
  if (countEl) countEl.textContent = `${_commentCount} 件`;
}

/**
 * 現在の全入力を時系列昇順へ統合する。共有 builder の asc+limit は古い側から
 * limit 件を返すため、ここでは全候補を通してから末尾120件へ絞る。
 */
function buildAllComeviewTimeline(comments, gifts) {
  const commentList = Array.isArray(comments) ? comments : [];
  const giftList = Array.isArray(gifts) ? gifts : [];
  return buildSupportActivityTimeline(commentList, giftList, {
    order: 'asc',
    limit: Math.max(TIMELINE_LIMIT, commentList.length + giftList.length)
  });
}

function timelineRowHtml(item) {
  return buildTimelineRowHtml(item, {
    defaultAvatar: DEFAULT_TILE_IMG,
    now: Date.now()
  });
}

function rememberTimelineElement(element, item, animate) {
  if (!(element instanceof HTMLElement) || !item?.key) return;
  element.dataset.cvKey = item.key;
  if (animate) element.classList.add('cv-row-in');
  _renderedKeys.add(item.key);
  _timelineItemsByKey.set(item.key, item);
}

function forgetTimelineElement(element) {
  if (!(element instanceof HTMLElement)) return;
  const key = element.dataset.cvKey || '';
  if (key) {
    _renderedKeys.delete(key);
    _timelineItemsByKey.delete(key);
  }
  if (_hoverRow === element) hideHoverBar();
}

function renderFullTimeline(timeline, forceBottom = false) {
  const listEl = document.getElementById('cvList');
  if (!listEl) return;
  const wasNearBottom =
    forceBottom ||
    isComeviewNearBottom({
      scrollTop: listEl.scrollTop,
      clientHeight: listEl.clientHeight,
      scrollHeight: listEl.scrollHeight
    });
  const bottomGap = Math.max(
    0,
    listEl.scrollHeight - listEl.clientHeight - listEl.scrollTop
  );

  hideHoverBar();
  _renderedKeys.clear();
  _timelineItemsByKey.clear();
  listEl.innerHTML = timeline.length
    ? timeline.map((item) => timelineRowHtml(item)).join('')
    : '<p class="nl-support-timeline__empty">まだコメントもギフトもありません（記録ONで時系列にたまります）</p>';

  const elements = Array.from(listEl.children).filter((element) =>
    element.matches('.nl-tl-row, .nl-tl-gift')
  );
  elements.forEach((element, index) =>
    rememberTimelineElement(element, timeline[index], false)
  );
  upgradeAnonymousAvatarImages(listEl);

  if (wasNearBottom) {
    listEl.scrollTop = listEl.scrollHeight;
  } else {
    listEl.scrollTop = Math.max(
      0,
      listEl.scrollHeight - listEl.clientHeight - bottomGap
    );
  }
}

function appendTimelineItems(items) {
  const listEl = document.getElementById('cvList');
  if (!listEl || !items.length) return;
  const shouldFollow = isComeviewNearBottom({
    scrollTop: listEl.scrollTop,
    clientHeight: listEl.clientHeight,
    scrollHeight: listEl.scrollHeight
  });
  const empty = listEl.querySelector('.nl-support-timeline__empty, #cvEmpty');
  if (empty) empty.remove();

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const template = document.createElement('template');
    template.innerHTML = timelineRowHtml(item).trim();
    const element = template.content.firstElementChild;
    if (!element) continue;
    rememberTimelineElement(element, item, true);
    fragment.appendChild(element);
  }
  listEl.appendChild(fragment);
  upgradeAnonymousAvatarImages(listEl);
  enqueueVoiceTimelineItems(items);

  let rows = listEl.querySelectorAll('[data-cv-key]');
  while (rows.length > TIMELINE_LIMIT) {
    const oldest = rows[0];
    forgetTimelineElement(oldest);
    oldest.remove();
    rows = listEl.querySelectorAll('[data-cv-key]');
  }
  if (shouldFollow) listEl.scrollTop = listEl.scrollHeight;
}

function normalizePin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim().slice(0, 500);
  if (!text) return null;
  return {
    name: String(raw.name || '').trim().slice(0, 200),
    text,
    at: Number(raw.at) || 0
  };
}

function renderPin(raw) {
  const pinBar = document.getElementById('cvPinBar');
  if (!pinBar) return;
  const pin = normalizePin(raw);
  const sig = pin ? JSON.stringify(pin) : '';
  if (sig === _pinShownSig) return;
  _pinShownSig = sig;
  pinBar.textContent = '';
  if (!pin) {
    pinBar.style.display = 'none';
    return;
  }

  const icon = document.createElement('span');
  icon.className = 'cv-pin-icon';
  icon.textContent = '📌';
  pinBar.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'cv-pin-body';
  if (pin.name) {
    const name = document.createElement('span');
    name.className = 'cv-pin-name';
    name.textContent = pin.name;
    body.appendChild(name);
  }
  const text = document.createElement('span');
  text.className = 'cv-pin-text';
  text.textContent = pin.text;
  body.appendChild(text);
  pinBar.appendChild(body);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cv-pin-close';
  close.textContent = '✕';
  close.title = 'コメピタを解除';
  close.addEventListener('click', () => {
    if (!_liveId) return;
    renderPin(null);
    try {
      void chrome.storage.local.remove(comeviewPinStorageKey(_liveId));
    } catch {
      /* no-op */
    }
  });
  pinBar.appendChild(close);
  pinBar.style.display = '';
}

function savePin(row) {
  if (!_liveId) return;
  const pin = normalizePin({
    name: row.name,
    text: row.text,
    at: Date.now()
  });
  if (!pin) return;
  renderPin(pin);
  try {
    void chrome.storage.local.set({
      [comeviewPinStorageKey(_liveId)]: pin
    });
  } catch {
    /* no-op */
  }
}

async function performFullRefresh(forceBottom) {
  if (!_liveId) return;
  const lv = _liveId;
  const tKey = tailStorageKey(lv);
  const giftKey = `nls_gift_events_${lv}`;
  const pinKey = comeviewPinStorageKey(lv);
  let bag = {};
  try {
    // v0.1.784 コメビュ凍結の根治: performFullRefresh は requestFullRefresh の while ループ内で
    //   _fullRefreshRunning=true を張る間に走る。共有 chrome.storage.local(単一 LevelDB)が複数
    //   watch タブの巨大 read-merge-write で stall すると、この get の await が【reject でなく
    //   永久 pending】になり得る(memory storage stall spiral と同根)。try/catch は reject しか
    //   拾えないため、pending だと performFullRefresh が settle せず _fullRefreshRunning が true に
    //   張り付き→processHotSnapshots が常に defer→新着コメントが永久に描画されない(=コメビュ凍結)。
    //   そこで storage read を有界化し、hang したら timeout で reject させ catch→return させる。
    //   次の timerTick(RECONCILE/hot poll)で自然に再試行され、stall が解ければ復帰する。
    bag = await runStorageOpWithTimeout(
      () => chrome.storage.local.get([
        tKey,
        giftKey,
        pinKey,
        COMEVIEW_USER_NOTES_KEY,
        KEY_USER_COMMENT_PROFILE_CACHE
      ]),
      FULL_REFRESH_STORAGE_TIMEOUT_MS
    );
  } catch {
    return;
  }

  _tailRows = Array.isArray(bag[tKey]) ? bag[tKey] : [];
  _giftRows = Array.isArray(bag[giftKey]) ? bag[giftKey] : [];
  _userNotes = normalizeComeviewUserNotes(bag[COMEVIEW_USER_NOTES_KEY]);
  _profileCache = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
  renderPin(bag[pinKey]);

  // v0.1.784: 正本読み(IDB countCommentsForLiveDb/readAllCommentsFromDb + chunk get + tail get)も
  //   同じ stall で hang し得る。readCanonicalComments 内の try/catch は reject しか拾わないため、
  //   ここでも有界化して hang を reject に変える。timeout 時は空扱いで描画は進める(テール合流で
  //   直近は出る)→ _fullRefreshRunning を解放することを最優先にする。
  let comments = [];
  try {
    comments = await runStorageOpWithTimeout(
      () => readCanonicalComments(lv),
      FULL_REFRESH_STORAGE_TIMEOUT_MS
    );
  } catch {
    comments = [];
  }
  // v0.1.679: 正本(IDB)が最新テールよりわずかに遅れることがあるので、テールを
  //   commentNo dedupe 付きで合流させる(整合リフレッシュで直近行が消えるのを防ぐ)。
  comments = combineCanonicalComeviewRows(comments, _tailRows);
  if (Object.keys(_profileCache).length) {
    comments = applyUserCommentProfileMapToEntries(comments, _profileCache).next;
  }
  const timeline = keepLatestComeviewTimelineItems(
    filterVisibleComeviewTimeline(
      buildAllComeviewTimeline(comments, _giftRows),
      _ngKeys,
      _hiddenSigs
    ),
    TIMELINE_LIMIT
  );
  _commentCount = comments.length;
  renderFullTimeline(timeline, forceBottom);
  // v0.1.679: 全量描画した行の識別子を「既出」に登録(以後の hot append が二重に足さない)。
  for (const item of timeline) {
    if (item.kind === 'gift') continue;
    rememberSeenCommentNo(commentNoOfComeviewRow(item));
  }

  if (!_initialVoicesPrimed) {
    _initialVoicesPrimed = true;
    if (timeline.length > 0) {
      // コメビュ起動直後に無音にならないよう、直近3件を読み上げる（primeEmit）
      const primes = timeline.slice(Math.max(0, timeline.length - 3));
      enqueueVoiceTimelineItems(primes);
    }
  }

  pickUnseenComeviewGifts(_giftRows, _seenGiftAtBySig);
  trimSeenGiftSigs();
  updateCommentCount();
  _lastReconcileAt = Date.now();
}

function requestFullRefresh(forceBottom = false) {
  _fullRefreshRequested = true;
  _fullRefreshForceBottom ||= forceBottom;
  if (_fullRefreshPromise) return _fullRefreshPromise;
  _fullRefreshPromise = (async () => {
    while (_fullRefreshRequested) {
      const nextForceBottom = _fullRefreshForceBottom;
      _fullRefreshRequested = false;
      _fullRefreshForceBottom = false;
      _fullRefreshRunning = true;
      try {
        await performFullRefresh(nextForceBottom);
      } finally {
        _fullRefreshRunning = false;
      }
      await flushDeferredHotSnapshots();
    }
  })().finally(() => {
    _fullRefreshPromise = null;
  });
  return _fullRefreshPromise;
}

function processHotSnapshots(nextTail, nextGifts) {
  const tail = Array.isArray(nextTail) ? nextTail : [];
  const gifts = Array.isArray(nextGifts) ? nextGifts : [];
  if (_paused || document.hidden || _fullRefreshRunning) {
    _deferredTailRows = tail;
    _deferredGiftRows = gifts;
    return;
  }

  // v0.1.679: スナップショット差分のあとに「経路を跨いだ既出」を遮断する。
  //   コメント=commentNo(テール/IDB/再キャプチャで唯一安定)・ギフト=内容sig±90秒。
  //   capturedAt 違いの再キャプチャ複製や、整合リフレッシュ済み行の再appendを防ぐ。
  const addedComments = filterUnseenComeviewComments(
    pickAppendedComeviewSnapshotRows(_tailRows, tail, 'comment'),
    _seenCommentNos
  );
  const addedGifts = pickUnseenComeviewGifts(
    pickAppendedComeviewSnapshotRows(_giftRows, gifts, 'gift'),
    _seenGiftAtBySig
  );
  trimSeenGiftSigs();
  _tailRows = tail;
  _giftRows = gifts;
  if (!addedComments.length && !addedGifts.length) return;
  for (const row of addedComments) rememberSeenCommentNo(commentNoOfComeviewRow(row));

  let profiledTail = tail;
  if (Object.keys(_profileCache).length) {
    profiledTail = applyUserCommentProfileMapToEntries(tail, _profileCache).next;
  }
  const appended = selectAppendedComeviewTimelineItems(
    buildAllComeviewTimeline(profiledTail, gifts),
    addedComments,
    addedGifts
  );
  const unseen = pickNewComeviewTimelineItems(appended, _renderedKeys);
  _commentCount += unseen.filter((item) => item.kind === 'comment').length;
  appendTimelineItems(
    filterVisibleComeviewTimeline(unseen, _ngKeys, _hiddenSigs)
  );
  updateCommentCount();
}

async function flushDeferredHotSnapshots() {
  if (!_deferredTailRows && !_deferredGiftRows) return;
  const tail = _deferredTailRows || _tailRows;
  const gifts = _deferredGiftRows || _giftRows;
  _deferredTailRows = null;
  _deferredGiftRows = null;
  processHotSnapshots(tail, gifts);
}

async function pollHotSnapshots() {
  if (_paused || document.hidden || !_liveId || _fullRefreshRunning) return;
  const tKey = tailStorageKey(_liveId);
  const giftKey = `nls_gift_events_${_liveId}`;
  try {
    const bag = await chrome.storage.local.get([tKey, giftKey]);
    processHotSnapshots(
      Array.isArray(bag[tKey]) ? bag[tKey] : [],
      Array.isArray(bag[giftKey]) ? bag[giftKey] : []
    );
  } catch {
    /* 次の onChanged / poll で再試行 */
  }
}

async function timerTick() {
  if (_paused || document.hidden) return;
  if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
    await requestFullRefresh();
    return;
  }
  await pollHotSnapshots();
}

function startTimer() {
  if (_timer != null) return;
  _timer = window.setInterval(() => void timerTick(), HOT_POLL_INTERVAL_MS);
}
function stopTimer() {
  if (_timer != null) {
    clearInterval(_timer);
    _timer = null;
  }
}

function hideHoverBar() {
  if (_hoverBar) {
    _hoverBar.classList.remove('is-visible');
    _hoverBar.style.display = 'none';
  }
  _hoverRow = null;
}

function actionDataForTimelineRow(element, item) {
  const name =
    element.querySelector('.nl-tl-row__name, .nl-tl-gift__name')?.textContent?.trim() ||
    String(item?.nickname || '').trim();
  const userId =
    element.getAttribute('data-nl-uid') || String(item?.userId || '').trim();
  let text = '';
  if (item?.kind === 'gift') {
    const itemName = String(item.itemName || 'ギフト').trim();
    const point = Number(item.point) || 0;
    text = point > 0 ? `${itemName}（${point.toLocaleString('ja-JP')}pt）` : itemName;
  } else {
    text =
      element.querySelector('.nl-tl-row__text')?.textContent?.trim() ||
      String(item?.text || '').trim();
  }
  return {
    id: String(item?.key || ''),
    no: item?.kind === 'comment' ? item.commentNo : null,
    name,
    text,
    userId,
    avatar: String(item?.avatarUrl || ''),
    selfPosted: item?.selfPosted === true,
    capturedAt: Number(item?.at) || null
  };
}

function positionHoverBar() {
  if (!_hoverBar || !_hoverRow || !_hoverRow.isConnected) {
    hideHoverBar();
    return;
  }
  const rect = _hoverRow.getBoundingClientRect();
  const width = _hoverBar.offsetWidth;
  const height = _hoverBar.offsetHeight;
  const left = Math.max(4, Math.min(window.innerWidth - width - 4, rect.right - width - 4));
  const top = Math.max(4, Math.min(window.innerHeight - height - 4, rect.top + 2));
  _hoverBar.style.left = `${left}px`;
  _hoverBar.style.top = `${top}px`;
}

function showHoverBar(row) {
  if (isObsMode() || !_hoverBar || !(row instanceof HTMLElement)) return;
  const key = row.dataset.cvKey || '';
  const item = _timelineItemsByKey.get(key);
  if (!item) return;
  _hoverRow = row;
  const userId = String(item.userId || '').trim();
  for (const button of _hoverBar.querySelectorAll('button[data-cv-action]')) {
    const action = button.dataset.cvAction;
    button.disabled = (action === 'block' || action === 'person') && !userId;
  }
  _hoverBar.style.display = 'flex';
  _hoverBar.classList.add('is-visible');
  positionHoverBar();
}

function createHoverBar() {
  if (isObsMode() || _hoverBar) return;
  const bar = document.createElement('div');
  bar.className = 'cv-hover-actions';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'コメント操作');
  const actions = [
    ['trash', 'この行を隠す'],
    ['block', 'この人を非表示'],
    ['person', 'この人の詳細'],
    ['copy', '名前と本文をコピー'],
    ['pin', 'コメピタ']
  ];
  for (const [action, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cvAction = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = CV_ACTION_ICONS[action];
    bar.appendChild(button);
  }
  bar.addEventListener('mouseenter', () => {
    if (_hoverRow) bar.classList.add('is-visible');
  });
  bar.addEventListener('mouseleave', (event) => {
    if (
      _hoverRow &&
      event.relatedTarget instanceof Node &&
      _hoverRow.contains(event.relatedTarget)
    ) {
      return;
    }
    hideHoverBar();
  });
  bar.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest('button[data-cv-action]')
        : null;
    if (!button || button.disabled || !_hoverRow) return;
    event.preventDefault();
    event.stopPropagation();
    const key = _hoverRow.dataset.cvKey || '';
    const item = _timelineItemsByKey.get(key);
    if (!item) return;
    const row = actionDataForTimelineRow(_hoverRow, item);
    switch (button.dataset.cvAction) {
      case 'trash': {
        const sig = comeviewTimelineItemSignature(item);
        if (sig) _hiddenSigs.add(sig);
        const target = _hoverRow;
        forgetTimelineElement(target);
        target.remove();
        hideHoverBar();
        break;
      }
      case 'block':
        addNg(row);
        hideHoverBar();
        break;
      case 'person':
        void showUserDetail(row);
        hideHoverBar();
        break;
      case 'copy':
        copyTextToClipboard(buildComeviewCopyText(row));
        hideHoverBar();
        break;
      case 'pin':
        savePin(row);
        hideHoverBar();
        break;
      default:
        break;
    }
  });
  document.body.appendChild(bar);
  _hoverBar = bar;
}

function wireStorageChanges() {
  /*
   * ★v0.1.1321: `if (!_liveId) return;` を撤去し、キーを【毎回 _liveId から引き直す】。
   *
   * ■ なぜ必要か(コメビュが立ち上がらない件の第2の穴)
   *   旧実装は起動時の `_liveId` からキーを closure で固定し、`_liveId` が
   *   空なら【何も配線せずに return】していた。
   *   ＝storage が混んで起動時に liveId を取れないと、**復帰役である
   *     onChanged 自体が張られず、永久に追いつけない**。
   *   ★この関数は「配信が変わったら追従する」ための復帰経路そのものなので、
   *     liveId が未確定のときこそ張っておく必要がある(順序を逆にしていた)。
   *
   * ■ 直し方: キーは listener の中で **その時点の _liveId** から作る。
   *   これで「起動時は空 → 後で switchToLiveId で決まる」でも正しく追従する。
   *   ★二重登録しないよう _storageChangesWired で1回に固定する
   *     (switchToLiveId は _liveId を書き換えるだけでよくなる)。
   */
  if (_storageChangesWired) return;
  _storageChangesWired = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    // ★キーは固定しない(配信が変わっても同じ listener で追従できる)。
    const tKey = _liveId ? tailStorageKey(_liveId) : '';
    const giftKey = _liveId ? `nls_gift_events_${_liveId}` : '';
    const pinKey = _liveId ? comeviewPinStorageKey(_liveId) : '';
    // 配信切替に追従(?lv= 明示窓は固定)。watch タブが別配信へ移ったら自動で新配信を読む。
    if (!_explicitLiveId && changes[KEY_LAST_WATCH_URL]) {
      const url = String(changes[KEY_LAST_WATCH_URL].newValue || '');
      const m = url.toLowerCase().match(/lv\d{1,15}/);
      if (m && m[0] !== _liveId) void switchToLiveId(m[0]);
    }
    if (pinKey && changes[pinKey]) renderPin(changes[pinKey].newValue);
    if (changes[COMEVIEW_USER_NOTES_KEY]) {
      _userNotes = normalizeComeviewUserNotes(
        changes[COMEVIEW_USER_NOTES_KEY].newValue
      );
    }
    if (changes[KEY_USER_COMMENT_PROFILE_CACHE]) {
      _profileCache = normalizeUserCommentProfileMap(
        changes[KEY_USER_COMMENT_PROFILE_CACHE].newValue
      );
    }
    if (changes[COMEVIEW_NG_STORAGE_KEY]) {
      const next = normalizeComeviewNgList(
        changes[COMEVIEW_NG_STORAGE_KEY].newValue
      );
      if (JSON.stringify(next) !== JSON.stringify(_ngList)) {
        _ngList = next;
        _ngKeys = new Set(next.map((entry) => entry.key));
        updateNgButton();
        void requestFullRefresh();
      }
    }
    if (!isObsMode() && changes[VOICE_ASSIGNMENTS_KEY]) {
      _voiceAssignments = normalizeVoiceAssignments(
        changes[VOICE_ASSIGNMENTS_KEY].newValue
      );
    }
    if (!isObsMode() && changes[VOICE_READING_ENABLED_KEY]) {
      const nextEnabled = changes[VOICE_READING_ENABLED_KEY].newValue === true;
      if (!nextEnabled && _voiceReadingEnabled) {
        disableVoiceReading({ persist: false });
        setVoiceStatus('');
      } else if (
        nextEnabled &&
        !_voiceReadingEnabled &&
        !_voiceToggleBusy
      ) {
        void enableVoiceReading({ persist: false });
      }
    }
    // ★キーが未確定(liveId未取得)のうちは本文の更新はしない(空キーで誤爆させない)。
    if ((tKey && changes[tKey]) || (giftKey && changes[giftKey])) {
      processHotSnapshots(
        changes[tKey]
          ? Array.isArray(changes[tKey].newValue)
            ? changes[tKey].newValue
            : []
          : _tailRows,
        changes[giftKey]
          ? Array.isArray(changes[giftKey].newValue)
            ? changes[giftKey].newValue
            : []
          : _giftRows
      );
    }
  });
}

function wireButtons() {
  const btnVoice = document.getElementById('cvBtnVoice');
  if (btnVoice && !isObsMode()) {
    btnVoice.addEventListener('click', () => {
      if (_voiceReadingEnabled) {
        disableVoiceReading();
        setVoiceStatus('');
      } else {
        void enableVoiceReading();
      }
    });
  }
  // v0.1.699: 名前読みトグル(既定OFF・読み上げON時のみ表示)。
  const btnVoiceName = document.getElementById('cvBtnVoiceName');
  if (btnVoiceName && !isObsMode()) {
    btnVoiceName.addEventListener('click', () => {
      _voiceReadNameEnabled = !_voiceReadNameEnabled;
      updateVoiceToggle();
      try {
        void chrome.storage.local.set({ [VOICE_READ_NAME_KEY]: _voiceReadNameEnabled });
      } catch {
        /* no-op */
      }
    });
  }
  const btnWin = document.getElementById('cvBtnWindow');
  if (btnWin) {
    btnWin.addEventListener('click', () => {
      const url = chrome.runtime.getURL(
        `comeview.html?lv=${encodeURIComponent(_liveId)}`
      );
      try {
        chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  const btnObs = document.getElementById('cvBtnObs');
  if (btnObs) {
    btnObs.addEventListener('click', () => {
      const url = chrome.runtime.getURL(
        `comeview.html?lv=${encodeURIComponent(_liveId)}&obs=1`
      );
      try {
        chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  const btnPause = document.getElementById('cvBtnPause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      _paused = !_paused;
      btnPause.textContent = _paused ? '再開' : '一時停止';
      if (!_paused) {
        if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
          void requestFullRefresh();
        } else {
          void flushDeferredHotSnapshots();
          void pollHotSnapshots();
        }
      }
    });
  }
  const btnNg = document.getElementById('cvBtnNg');
  if (btnNg) btnNg.addEventListener('click', () => showNgPanel());
  const btnPanelClose = document.getElementById('cvPanelClose');
  if (btnPanelClose) btnPanelClose.addEventListener('click', () => closePanel());

  // 行クリック→ユーザー詳細(POP のタイムラインと同じ data-nl-uid 属性を使う)。
  const listEl = document.getElementById('cvList');
  if (listEl) {
    listEl.addEventListener('mouseover', (event) => {
      const row =
        event.target instanceof Element
          ? event.target.closest('.nl-tl-row, .nl-tl-gift')
          : null;
      if (row && listEl.contains(row)) showHoverBar(row);
    });
    listEl.addEventListener('mouseleave', (event) => {
      if (
        _hoverBar &&
        event.relatedTarget instanceof Node &&
        _hoverBar.contains(event.relatedTarget)
      ) {
        return;
      }
      hideHoverBar();
    });
    listEl.addEventListener('scroll', () => hideHoverBar(), { passive: true });
    listEl.addEventListener('click', (ev) => {
      const t =
        ev.target instanceof Element ? ev.target.closest('[data-nl-uid]') : null;
      if (!t) return;
      ev.preventDefault();
      const uid = t.getAttribute('data-nl-uid') || '';
      if (!uid) return;
      const key = t instanceof HTMLElement ? t.dataset.cvKey || '' : '';
      const item = _timelineItemsByKey.get(key);
      if (item) {
        void showUserDetail(actionDataForTimelineRow(t, item));
        return;
      }
      let uname = t.getAttribute('data-nl-uname') || '';
      if (/^匿名\d{1,3}$/.test(uname)) uname = '';
      void showUserDetail({ name: uname, text: '', userId: uid });
    });
  }
  createHoverBar();
  window.addEventListener('resize', () => hideHoverBar(), { passive: true });
}

async function main() {
  if (isObsMode()) document.body.classList.add('is-obs');
  const urlLiveId = resolveLiveIdFromUrl();
  _explicitLiveId = !!urlLiveId; // ?lv= 明示窓は配信切替に追従しない(固定窓)
  /*
   * ★v0.1.1321: 起動の順序を「まず操作できる画面を出す」に組み替えた。
   *
   * ■ 何が起きていたか(2026-08-11 実機・ユーザー報告「コメビュが立ち上がらない」)
   *   旧: liveId取得 → wireButtons → 読み上げ設定 → NG → **wireStorageChanges** → 全件読み
   *   起動経路の storage read は無制限に待つ実装だったため、backfill 中は最初の await で
   *   止まり、画面は cvLiveMeta が静的既定の「—」・本文「コメントを待っています…」で固着。
   *   ★さらに悪いことに、**復帰役の wireStorageChanges が3つの await の後ろ**にあった。
   *     ＝止まると「後から自動で追いつく」経路すら張られない=永久に立ち上がらない。
   *     (実際は storage が空くと自力で回復した＝壊れてはいなかったが、待たされていた)
   *
   * ■ 直し方(順序と有界化の両方)
   *   1) ボタン配線と **wireStorageChanges を最優先**で張る
   *      ＝storage が詰まっていても操作でき、liveId は後から onChanged で自動追従できる。
   *   2) 各 read は有界化(COMEVIEW_BOOT_READ_TIMEOUT_MS)＝待ち切らない。
   *   3) 設定系(読み上げ/NG)は **await しない**＝画面表示を人質にしない。
   *      取れ次第それぞれが自分で反映する(いずれも冪等)。
   */
  wireButtons();
  wireStorageChanges();
  _liveId = urlLiveId || (await resolveLiveIdFromStorage());
  const meta = document.getElementById('cvLiveMeta');
  if (meta) {
    // ★liveId が取れないのは「無い」ではなく「まだ来ていない」ことがある(storage混雑)。
    //   断定せず、待てば来ると伝える(onChanged が拾ったら switchToLiveId が上書きする)。
    meta.textContent = _liveId ? _liveId : '配信を探しています…';
  }
  // 設定系は画面表示をブロックしない(失敗しても既定で動く)。
  void initializeVoiceReading();
  void loadNgList();
  await requestFullRefresh(true);
  // パネルのタイムライン行クリックから ?user= 付きで開かれたら、詳細を自動で開く。
  const detailReq = resolveDetailRequestFromUrl();
  if (detailReq) {
    void showUserDetail({
      id: '',
      no: null,
      name: detailReq.name,
      text: '',
      userId: detailReq.userId,
      avatar: '',
      selfPosted: false,
      capturedAt: null
    });
  }
  startTimer();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else {
      startTimer();
      if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
        void requestFullRefresh();
      } else {
        void flushDeferredHotSnapshots();
        void pollHotSnapshots();
      }
    }
  });
}

void main();
