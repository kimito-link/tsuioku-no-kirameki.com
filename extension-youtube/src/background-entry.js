// background-entry.js — YouTube Live コメントの IndexedDB 全件記録・配信要約・Offscreen 読み上げ管理 Service Worker
/* global chrome, setTimeout, clearTimeout */

// 開発版が、拡張のフォルダの新しい版に自分で入れ替わる(ニコ生版 v0.1.1802 と同じキットの写し)。
//   git pull で manifest の版が上がれば、2分以内に 🔄 を押したのと同じになる。
import { SELF_UPDATE_ALARM, checkForNewVersion, scheduleSelfUpdateCheck } from '../../src/extension/self-update.js';
import {
  VOICEVOX_BASE_URL,
  probeVoicevoxAlive,
  listVoicevoxStyleIds,
} from '../../src/lib/voicevoxClient.js';
import {
  YT_VOICE_MODES,
  YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD,
  YT_DEFAULT_STYLE_IDS,
  resolveYtVoiceForChannel,
  enqueueYtVoiceItem,
} from '../../src/lib/youtube/ytVoiceQueue.js';
import { mergeYtStreamSummary, prepareYtCommentsForIdb } from '../../src/lib/youtube/ytStreamStorePolicy.js';
import {
  appendYtStreamCommentsIdb,
  resetYtCommentsDb,
  getYtStreamCommentsByVideoId,
  getYtStreamCommentsSince,
  deleteYtCommentsByPks,
  readAllYtCommentKeys,
  deleteYtCommentPksAcrossVideos,
  getYtCommentsByPks,
} from './ytIdbStore.js';
import { createYtViewerSampler } from '../../src/lib/youtube/ytViewerSampler.js';
import { pickSwitchLeakPks } from '../../src/lib/youtube/ytSwitchLeakCleanup.js';
import { pickYtCrossVideoDuplicates } from '../../src/lib/youtube/ytCrossVideoDuplicates.js';
// ニコ生版の background にある、会場とコメビュの受け口(VOICEVOX 中継・読み手の取り合い・窓を開く)の写し
import './background-nico-relay.js';

/** 最後に「記録できた」を残した時刻(書きすぎないよう30秒に1回) */
let lastIngestDiagAt = 0;
import { parseYtVideoIdFromUrl } from '../../src/lib/youtube/ytPageMeta.js';
import { platformOfStreamKey, isStreamTabToReload, STREAM_PLATFORM_TAB_URLS } from '../../src/lib/platform/streamPlatform.js';
import { isWwApiUrl } from '../../src/lib/whowatch/wwParse.js';
import { createMxGiftImageResolver } from '../../src/lib/mixch/mxGiftImages.js';
import { pickJapaneseVoices, lightVoiceToneFor } from '../../src/lib/voiceLightFallback.js';
import { ytLeaderboardSig } from '../../src/lib/youtube/ytLeaderboardSig.js';
import { ytVoiceAssignPersistDecision, YT_VOICE_ASSIGN_PERSIST_MS } from '../../src/lib/youtube/ytVoiceAssignPersist.js';
import { swStaleDecision } from '../../src/lib/swStaleCheck.js';
/** @type {Map<string, string>} 配信 → 最後に書いた公式ランキングの指紋(0.1.1959) */
const lastLeaderboardSig = new Map();

const mxGiftImages = createMxGiftImageResolver({
  fetchJson: async (url) => {
    const res = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return res.json();
  },
  storageGet: async (key) => (await chrome.storage.local.get(key))?.[key],
  storageSet: (bag) => chrome.storage.local.set(bag),
});

// 本体に同梱したとき(scripts/youtube-build.mjs の本体向け束・2026-11-05): 本体の background.js が importScripts で読む。
//   パネルの開き方・offscreen・自分で入れ替わる仕組みは本体のものを使う(ここで触ると本体の動きが変わる)。
/* global NL_YT_MERGED */
const YT_MERGED = typeof NL_YT_MERGED !== 'undefined' && NL_YT_MERGED === true;

// パネルを閉じていても同接を1分ごとに記録する(マーケの同接推移カーブ・ytViewerSampler.js)
const ytViewerSampler = createYtViewerSampler({ merged: YT_MERGED });

const STORAGE_KEYS = Object.freeze({
  STREAM_SUMMARIES: 'yt_stream_summaries',
  ACTIVE_VIDEO_ID: 'yt_active_video_id',
  VOICE_SETTINGS: 'yt_voice_settings',
  VOICE_ASSIGNMENTS: 'yt_voice_assignments',
  VOICE_QUEUE: 'yt_voice_queue',
  VOICE_STATE: 'yt_voice_state',
});

// ★読み上げはニコ生版と同じくコメビュ(comeview.html の「読み上げ」)が担う。YouTube 版に元からあった
//   この裏方の読み上げ(offscreen)も動くと、同じコメントが二重に読まれる(2026-11-04 りんくの実機で確認)。
//   なので裏方は止めておく(仕組みは残す)。
const BACKGROUND_READER_ENABLED = false;

const DEFAULT_VOICE_SETTINGS = Object.freeze({
  enabled: true,
  mode: YT_VOICE_MODES.ALL,
  broadcasterNameOverride: '',
  /** VOICEVOX が追いつかない間 PC の声で読むか: 'auto'(既定) / 'off'(VOICEVOX だけで読む) */
  lightVoice: 'auto',
  availableStyleIds: Array.from(YT_DEFAULT_STYLE_IDS),
});

/**
 * ★v0.1.1968: 人ごとの声の割り当て(yt_voice_assignments・数百KB)の控え。束ごとに storage から読み書きすると
 *   onChanged で全ページへ新旧の値が配られ横の欄が数分止まった(PC 実測)。控えを正にし、変わったときだけ
 *   最短30秒に1回書く(src/lib/youtube/ytVoiceAssignPersist.js)。
 * @type {Record<string, any> | null}
 */
let voiceAssignMem = null;
/**
 * ★v0.1.1970 計器: 30秒の間引きが混んだ配信で効いていない(PC 実測 240秒で46回・間隔1〜14秒)原因を切り分ける。
 *   bootAt が書き込みのたびに変わっていれば service worker の作り直し(控えが毎回空になる)。
 *   SW の devtools から globalThis.__ytVoiceAssignDiag で読む。yt_diag_sw_boot には起動の回数と直近の時刻を残す。
 */
/* global NL_BUILD_ID */
/** このバンドルの build id(esbuild の define・無ければ空) */
const SW_RUNNING_BUILD_ID = typeof NL_BUILD_ID !== 'undefined' ? String(NL_BUILD_ID) : '';
const voiceAssignDiag = { bootAt: Date.now(), now: 0, later: 0, flush: 0, memMissReads: 0, gaps: /** @type {number[]} */ ([]) };
try {
  /** @type {any} */ (globalThis).__ytVoiceAssignDiag = voiceAssignDiag;
  void chrome.storage.local.get('yt_diag_sw_boot').then((bag) => {
    const prev = bag?.yt_diag_sw_boot || {};
    const recent = Array.isArray(prev.recent) ? prev.recent.slice(-19) : [];
    recent.push(voiceAssignDiag.bootAt);
    return chrome.storage.local.set({ yt_diag_sw_boot: { count: (Number(prev.count) || 0) + 1, recent, buildId: SW_RUNNING_BUILD_ID } });
  }).catch(() => {});
  // ★v0.1.1972: 古い中身のまま動いていたら1回だけ読み込み直す(src/lib/swStaleCheck.js)
  void (async () => {
    let diskText = null;
    try {
      const res = await fetch(chrome.runtime.getURL('dist/yt-background.js'), { cache: 'no-store' });
      diskText = res.ok ? await res.text() : null;
    } catch {
      diskText = null;
    }
    const bag = await chrome.storage.local.get('yt_diag_sw_stale').catch(() => ({}));
    const prev = bag?.yt_diag_sw_stale || {};
    const now = Date.now();
    const decision = swStaleDecision({
      runningBuildId: SW_RUNNING_BUILD_ID,
      diskText,
      isStore: Boolean(chrome.runtime.getManifest()?.update_url),
      lastReloadAt: Number(prev.lastReloadAt) || 0,
      now,
    });
    const next = { at: now, decision, running: SW_RUNNING_BUILD_ID, lastReloadAt: decision === 'reload' ? now : Number(prev.lastReloadAt) || 0, reloads: (Number(prev.reloads) || 0) + (decision === 'reload' ? 1 : 0) };
    await chrome.storage.local.set({ yt_diag_sw_stale: next }).catch(() => {});
    if (decision === 'reload') chrome.runtime.reload();
  })().catch(() => {});
} catch {
  /* 計器は失敗しても記録を止めない */
}
let voiceAssignDirty = false;
let voiceAssignWrittenAt = 0;
/** @type {ReturnType<typeof setTimeout> | null} */
let voiceAssignTimer = null;
function scheduleVoiceAssignFlush() {
  if (voiceAssignTimer) return;
  const wait = Math.max(1000, YT_VOICE_ASSIGN_PERSIST_MS - (Date.now() - voiceAssignWrittenAt));
  voiceAssignTimer = setTimeout(() => {
    voiceAssignTimer = null;
    void runSerialized(async () => {
      if (!voiceAssignDirty || !voiceAssignMem) return;
      voiceAssignDirty = false;
      voiceAssignDiag.flush++;
      if (voiceAssignWrittenAt) voiceAssignDiag.gaps = [...voiceAssignDiag.gaps.slice(-19), Date.now() - voiceAssignWrittenAt];
      voiceAssignWrittenAt = Date.now();
      await chrome.storage.local.set({ [STORAGE_KEYS.VOICE_ASSIGNMENTS]: voiceAssignMem });
    }).catch(() => {
      voiceAssignDirty = true;
    });
  }, wait);
}

/** 並列メッセージによる storage / IndexedDB 競合を防ぐ直列化キュー */
let storageJobChain = Promise.resolve();

/** @type {Promise<void> | null} */
let creatingOffscreenPromise = null;

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function runSerialized(fn) {
  // 1つの仕事が返ってこなくても(保存の待ちが固まる等)、後ろの仕事を止めない。20秒で次へ進む。
  const guarded = () =>
    Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => setTimeout(() => reject(new Error('job_timeout')), 20000)),
    ]);
  const next = /** @type {Promise<any>} */ (storageJobChain.then(guarded, guarded));
  storageJobChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * サイドパネルを閉じていても VOICEVOX 再生を継続するための Offscreen Document を起動・維持する。
 * @returns {Promise<boolean>}
 */
async function ensureOffscreenDocument() {
  try {
    if (YT_MERGED) return false; // offscreen は1つだけ=本体のもの(YouTube の読み上げはコメビュが担う)
    if (!chrome?.offscreen?.createDocument) return false;
    if (chrome.runtime?.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (Array.isArray(contexts) && contexts.length > 0) {
        return true;
      }
    } else if (typeof chrome.offscreen.hasDocument === 'function') {
      const has = await chrome.offscreen.hasDocument();
      if (has) return true;
    }

    if (!creatingOffscreenPromise) {
      creatingOffscreenPromise = chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification:
            'サイドパネルを閉じていても VOICEVOX によるチャット読み上げ音声を再生し続けるため',
        })
        .catch((err) => {
          const msg = String(err?.message || err || '');
          if (!msg.includes('Only a single offscreen')) {
            throw err;
          }
        })
        .finally(() => {
          creatingOffscreenPromise = null;
        });
    }
    await creatingOffscreenPromise;
    return true;
  } catch {
    return false;
  }
}

/**
 * Offscreen Document へ読み上げキュー消化の合図を送る。
 */
async function nudgeOffscreenDrain() {
  const ready = await ensureOffscreenDocument();
  if (!ready) return;
  try {
    chrome.runtime.sendMessage({ type: 'YT_OFFSCREEN_DRAIN' }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // ignore
  }
}

/**
 * 送信元タブ URL から videoId (`v=`) を抽出するフォールバック。
 * @param {any} sender
 * @returns {string}
 */
function extractVideoIdFromSender(sender) {
  return parseYtVideoIdFromUrl(String(sender?.url || '')) || parseYtVideoIdFromUrl(String(sender?.tab?.url || ''));
}

/**
 * PC に入っている日本語の声(chrome.tts・Windows では Haruka / Ayumi / Ichiro など)。
 * @returns {Promise<{ name: string, lang: string }[]>}
 */
async function getJapaneseTtsVoices() {
  if (!chrome?.tts?.getVoices) return [];
  const raw = await new Promise((resolve) => {
    try {
      chrome.tts.getVoices((vs) => resolve(Array.isArray(vs) ? vs : []));
    } catch {
      resolve([]);
    }
  });
  return pickJapaneseVoices(
    /** @type {any[]} */ (raw).map((v) => ({
      name: String(v.voiceName || ''),
      voiceURI: String(v.voiceName || ''),
      lang: String(v.lang || ''),
      localService: v.remote !== true,
    })),
  );
}

/**
 * 1件を PC の声で読み、読み終わる(か打ち切る)まで待つ。人ごとの声・高さ・速さは lightVoiceToneFor。
 * @param {string} text
 * @param {string} userKey
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function speakLightTts(text, userKey) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, reason: 'empty' };
  const voices = await getJapaneseTtsVoices();
  if (!voices.length) return { ok: false, reason: 'no-voice' };
  const tone = lightVoiceToneFor(userKey, voices.length);
  const voice = voices[tone.voiceIndex % voices.length];
  return new Promise((resolve) => {
    let started = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: started, reason: started ? '' : 'not-started' });
    };
    const timer = setTimeout(() => {
      try {
        chrome.tts.stop();
      } catch {
        // no-op
      }
      finish();
    }, t.length * 400 + 5000);
    try {
      chrome.tts.speak(
        t,
        {
          voiceName: voice.name,
          lang: voice.lang || 'ja-JP',
          pitch: tone.pitch,
          rate: tone.rate,
          enqueue: false,
          onEvent: (ev) => {
            if (ev.type === 'start') started = true;
            else if (['end', 'interrupted', 'cancelled', 'error'].includes(ev.type)) {
              if (ev.type === 'end') started = true;
              finish();
            }
          },
        },
        () => {
          if (chrome.runtime.lastError) finish();
        },
      );
    } catch {
      finish();
    }
  });
}

/**
 * サイドパネルのコメントを、その配信を開いているタブのチャット欄へ渡して送信させる。
 * @param {string} videoId
 * @param {string} text
 */
async function relayCommentToChatFrame(videoId, text) {
  return relayToChatFrame(videoId, { type: 'YT_SEND_COMMENT_TO_FRAME', videoId, text });
}

/**
 * その配信を開いているタブのチャット欄へ1通渡す(コメント送信・0.1.113 スーパーチャットの窓を開く)。
 * @param {string} videoId
 * @param {Record<string, unknown>} payload
 */
async function relayToChatFrame(videoId, payload) {
  // Twitch/Kick の配信(配信キー tw.<login>.… / kk.<slug>.…)は、そのチャンネルを開いているタブへ(tw-/kick-content-entry.js が受ける)
  const plat = platformOfStreamKey(videoId);
  const twLogin = plat ? plat.loginOfStreamKey(videoId) : '';
  if (plat && twLogin) {
    if (payload.type !== 'YT_SEND_COMMENT_TO_FRAME') return { ok: false, reason: 'unsupported' };
    const twTabs = (await chrome.tabs.query({ url: [plat.tabUrl] }))
      .filter((t) => plat.channelFromUrl(String(t.url || '')) === twLogin)
      .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
    if (!twTabs.length) return { ok: false, reason: 'no-tab' };
    let lastTw = { ok: false, reason: 'no-chat-frame' };
    for (const t of twTabs) {
      if (typeof t.id !== 'number') continue;
      try {
        const res = await chrome.tabs.sendMessage(t.id, { ...payload, type: plat.sendType }, { frameId: 0 });
        if (res && res.ok) return res;
        if (res) lastTw = res;
      } catch {
        // そのタブに入口がまだ無い(読み込み中)
      }
    }
    return lastTw;
  }
  const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*'] });
  const scored = tabs
    .map((t) => {
      const vid = parseYtVideoIdFromUrl(String(t.url || ''));
      let score = 0;
      if (videoId && vid === videoId) score += 10;
      if (String(t.url || '').includes('/live_chat')) score += 2;
      if (t.active) score += 1;
      return { t, score };
    })
    .filter((x) => x.score >= (videoId ? 10 : 1))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { ok: false, reason: 'no-tab' };
  let last = { ok: false, reason: 'no-chat-frame' };
  for (const { t } of scored) {
    if (typeof t.id !== 'number') continue;
    try {
      const res = await chrome.tabs.sendMessage(t.id, payload);
      if (res && res.ok) return res;
      if (res) last = res;
    } catch {
      // そのタブにチャット欄が無い
    }
  }
  return last;
}

function setupSidePanelBehavior() {
  try {
    if (YT_MERGED) return; // 本体はボタンを押したら自分で開く(openPanelOnActionClick は false のまま)
    if (chrome?.sidePanel?.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

setupSidePanelBehavior();
ensureOffscreenDocument();
/**
 * 拡張を更新すると、開いている YouTube のタブの中の古いプログラム(content script)は切れて、
 * 記録も人数も黙って止まる(2026-11-03 実機: 記録 975 のまま30分止まった)。
 * ニコ生版の reloadExistingWatchTabs と同じく、更新のときに視聴タブを読み込み直す。
 * @param {string} reason
 */
async function reloadExistingYtWatchTabs(reason) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/watch*', 'https://www.youtube.com/live/*'] });
  } catch {
    return;
  }
  // 他のサービス(Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・TikTok・ABEMA)の配信ページも同じく止まる
  //   (2026-11-09 実機: 更新前から開いていた SHOWROOM のタブが記録 0 のまま)。配信ページの形の URL だけ読み込み直す
  try {
    const others = await chrome.tabs.query({ url: [...STREAM_PLATFORM_TAB_URLS] });
    for (const t of others) if (isStreamTabToReload(t.url)) tabs.push(t);
  } catch {
    // no-op
  }
  let reloaded = 0;
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    try {
      await chrome.tabs.reload(tab.id);
      reloaded += 1;
    } catch {
      // no-op
    }
  }
  try {
    await chrome.storage.local.set({ yt_last_auto_tab_reload: { at: Date.now(), reason, tabCount: tabs.length, reloaded } });
  } catch {
    // no-op
  }
}

// 会場モード(拡張の画面 venue.html)の真ん中に YouTube を埋め込むと、どこから埋め込んだかが YouTube に届かず
//   「エラー153(動画プレーヤーの設定エラー)」で断られる。この拡張の画面から開く埋め込みにだけ、
//   YouTube 自身のページから開いたという Referer を付ける(ほかのサイトの埋め込みには触らない)。
async function setupEmbedReferer() {
  try {
    const dnr = chrome.declarativeNetRequest;
    if (!dnr?.updateSessionRules) return;
    await dnr.updateSessionRules({
      removeRuleIds: [7101],
      addRules: [
        {
          id: 7101,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://www.youtube.com/' }],
          },
          condition: {
            urlFilter: '||www.youtube.com/embed/',
            resourceTypes: ['sub_frame'],
            initiatorDomains: [chrome.runtime.id],
          },
        },
      ],
    });
  } catch {
    // 古い Chrome などで使えなくても他は止めない
  }
}
void setupEmbedReferer();

chrome.runtime.onInstalled.addListener((details) => {
  setupSidePanelBehavior();
  ensureOffscreenDocument();
  if (details && details.reason === 'update') void reloadExistingYtWatchTabs('update');
});
chrome.runtime.onStartup?.addListener(() => {
  ensureOffscreenDocument();
});

if (!YT_MERGED) try {
  scheduleSelfUpdateCheck();
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === SELF_UPDATE_ALARM) void checkForNewVersion().catch(() => {});
  });
} catch {
  // alarms が使えない環境では従来どおり手で 🔄
}

// ★0.1.1904(2026-11-06 りんく実機「前の配信の人が混ざる」): コメントの id → そのコメントが記録された配信。
//   1件のコメントは1つの配信にしか無い。別の配信として送られてきたら(チャット欄が前の配信のまま残っていたとき)入れない。
//   正本は IndexedDB の索引(ytIdbStore.js by_id)。これは保存より先に会場へ届けるときに使う手元の控え(最新 20,000 件)。
/** @type {Map<string, string>} */
const ytCommentOwnerById = new Map();
const YT_COMMENT_OWNER_CAP = 20000;
/** @param {string} id @param {string} vid */
function noteYtCommentOwner(id, vid) {
  if (!id || !vid) return;
  ytCommentOwnerById.delete(id);
  ytCommentOwnerById.set(id, vid);
  if (ytCommentOwnerById.size > YT_COMMENT_OWNER_CAP) {
    const first = ytCommentOwnerById.keys().next().value;
    if (first) ytCommentOwnerById.delete(first);
  }
}
let ytOwnerRejectTotal = 0;
/** @param {string} videoId @param {{ newlyAdded?: any[], rejected?: Array<{ id: string, owner: string }> }} res */
function rememberYtCommentOwners(videoId, res) {
  for (const r of res?.newlyAdded || []) noteYtCommentOwner(String(r?.id || ''), videoId);
  const rej = res?.rejected || [];
  if (!rej.length) return;
  for (const r of rej) noteYtCommentOwner(r.id, r.owner);
  ytOwnerRejectTotal += rej.length;
  // 計器: 別の配信のコメントとして入れなかった数(どの配信に・どの配信のものが来たか)。見た目は変えない。
  void chrome.storage.local
    .set({ yt_diag_owner_reject: { at: Date.now(), total: ytOwnerRejectTotal, last: { to: videoId, from: rej[0].owner, n: rej.length } } })
    .catch(() => {});
}

const KEY_BACKFILL_STATE = 'yt_backfill_state';
/**
 * 次に埋める配信を1つ選ぶ。終わって2分以上たち、まだ埋め終わっていない配信。
 * アーカイブの処理が終わるまでチャットが出ないので、出ていなければ15分あけて試し直す(最大48回=約12時間)。
 * 走っている途中で止まったもの(running のまま10分)も試し直す。
 * @param {Record<string, any>} summaries
 * @param {Record<string, any>} state
 * @param {number} now
 */
function pickBackfillVideo(summaries, state, now) {
  let best = '';
  let bestEnded = 0;
  for (const [vid, sum] of Object.entries(summaries)) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) continue;
    // 終わった時刻が分かっている配信。分からなくても、20分以上コメントが来ていない配信は終わったかもしれないので
    //   試す(まだ配信中なら、読みに行った側がアーカイブのチャットが無いと返し、15分あけて試し直す)。
    const endedAt = Number(sum?.endedAt || 0) || (now - Number(sum?.updatedAt || now) > 20 * 60_000 ? Number(sum.updatedAt) : 0);
    if (!(endedAt > 0) || now - endedAt < 120_000) continue;
    if (now - endedAt > 7 * 24 * 3600_000) continue; // 1週間より前の配信は追わない
    const st = state[vid] || {};
    if (st.status === 'done') continue;
    if (Number(st.tries || 0) >= 48) continue;
    const wait = st.status === 'running' ? 600_000 : 900_000;
    if (st.lastTryAt && now - Number(st.lastTryAt) < wait) continue;
    if (endedAt > bestEnded) {
      best = vid;
      bestEnded = endedAt;
    }
  }
  return best;
}

// 0.1.37 一回きりの片付け(りんく 2026-11-04 OK): 0.1.35 までは、配信を切り替えた瞬間にチャット欄に残っていた
//   前の配信のコメントが新しい配信の記録に入っていた。実機で分かった1件(初音ミク ZcCrxy_B4fg → DaiGo GRvNsGECdtc・
//   11:30:53 の最初の1秒に23件)だけを、見分けの条件(ytSwitchLeakCleanup.js)に当てはまる分に限って消す。
const SWITCH_LEAK_CLEANUPS = [{ key: 'yt_cleanup_switch_leak_GRvNsGECdtc', target: 'GRvNsGECdtc', prev: 'ZcCrxy_B4fg' }];
async function runSwitchLeakCleanups() {
  for (const job of SWITCH_LEAK_CLEANUPS) {
    try {
      const done = await chrome.storage.local.get(job.key);
      if (done && done[job.key]) continue;
      const target = await getYtStreamCommentsByVideoId(job.target);
      const prev = await getYtStreamCommentsByVideoId(job.prev);
      if (!target.length || !prev.length) continue; // 記録が無い PC では何もしない(印も付けない)
      const pks = pickSwitchLeakPks(target, prev);
      const total = pks.length ? await deleteYtCommentsByPks(job.target, pks) : target.length;
      const data = await chrome.storage.local.get(STORAGE_KEYS.STREAM_SUMMARIES);
      const summaries = (data && data[STORAGE_KEYS.STREAM_SUMMARIES]) || {};
      if (summaries[job.target]) {
        summaries[job.target] = { ...summaries[job.target], itemCount: total };
        await chrome.storage.local.set({ [STORAGE_KEYS.STREAM_SUMMARIES]: summaries });
      }
      await chrome.storage.local.set({ [job.key]: { at: Date.now(), removed: pks.length, total } });
    } catch {
      // 失敗したら印を付けず、次に起きたときにもう一度
    }
  }
}
void runSwitchLeakCleanups();

// 0.1.1907 一回きりの片付け(りんく 2026-11-06「消して」): 0.1.1903 までに、チャット欄が前の配信のまま残って
//   別の配信の記録にも入ってしまったコメントを消す。同じ id が2つ以上の配信にあれば、先に記録した1件だけ残す
//   (ytCrossVideoDuplicates.js)。消した記録は控え(yt_cleanup_cross_video_v1_removed)に全部残すので、あとで戻せる。
//   0.1.1904 からは入口で同じ id を入れないので、片付けたものは戻ってこない。
// ★v2(0.1.1915・2026-11-07 実データで83件残り): アーカイブから埋めた行を本物として優先する決め方に変えたので、もう1回だけ片付ける。
//   v1 の結果と控え(yt_cleanup_cross_video_v1・_removed)はそのまま残す。
const KEY_CROSS_VIDEO_CLEANUP = 'yt_cleanup_cross_video_v2';
async function runCrossVideoCleanupOnce() {
  try {
    const done = await chrome.storage.local.get(KEY_CROSS_VIDEO_CLEANUP);
    if (done && done[KEY_CROSS_VIDEO_CLEANUP]) return;
    const rows = await readAllYtCommentKeys();
    const pick = pickYtCrossVideoDuplicates(rows);
    const deleting = new Set(pick.deletePks);
    for (const r of rows) {
      if (r.id && r.videoId && !deleting.has(r.pk)) noteYtCommentOwner(r.id, r.videoId);
    }
    let removedCount = 0;
    if (pick.deletePks.length) {
      const vids = Object.keys(pick.byVideo);
      // ★消す前に控えを取る(消したあとに止まっても、控えは必ず残っている)。控えは足していく。
      const toRemove = await getYtCommentsByPks(pick.deletePks);
      const backupKey = `${KEY_CROSS_VIDEO_CLEANUP}_removed`;
      const prevBackup = (await chrome.storage.local.get(backupKey))?.[backupKey];
      const prevRows = Array.isArray(prevBackup?.rows) ? prevBackup.rows : [];
      const seenPk = new Set(prevRows.map((/** @type {any} */ x) => String(x?.pk || '')));
      await chrome.storage.local.set({
        [backupKey]: { at: Date.now(), rows: prevRows.concat(toRemove.filter((x) => !seenPk.has(String(x?.pk || '')))) },
      });
      const { totals, removed } = await deleteYtCommentPksAcrossVideos(pick.deletePks, vids);
      removedCount = removed.length;
      await runSerialized(async () => {
        const data = await chrome.storage.local.get(STORAGE_KEYS.STREAM_SUMMARIES);
        const summaries = (data && data[STORAGE_KEYS.STREAM_SUMMARIES]) || {};
        let changed = false;
        for (const [vid, total] of Object.entries(totals)) {
          if (!summaries[vid]) continue;
          summaries[vid] = { ...summaries[vid], itemCount: total };
          changed = true;
        }
        if (changed) await chrome.storage.local.set({ [STORAGE_KEYS.STREAM_SUMMARIES]: summaries });
      });
    }
    await chrome.storage.local.set({
      [KEY_CROSS_VIDEO_CLEANUP]: { at: Date.now(), scanned: rows.length, removed: removedCount, byVideo: pick.byVideo, pairs: pick.pairs },
    });
  } catch (err) {
    // 失敗したら印を付けず、次に起きたときにもう一度(途中まで消えていても、残りを次で消す・二度消しは起きない)
    try {
      void chrome.storage.local.set({ [`${KEY_CROSS_VIDEO_CLEANUP}_error`]: { at: Date.now(), error: String(err).slice(0, 200) } });
    } catch {
      /* no-op */
    }
  }
}
void runCrossVideoCleanupOnce();

const KEY_HANDLE_ICONS = 'yt_handle_icons';
let handleIconsBusy = false;
/** @param {string[]} handles */
async function resolveHandleIcons(handles) {
  if (handleIconsBusy || !handles.length) return;
  handleIconsBusy = true;
  try {
    const bag = await chrome.storage.local.get(KEY_HANDLE_ICONS);
    const map = (bag && bag[KEY_HANDLE_ICONS]) || {};
    let changed = false;
    for (const h of handles) {
      const k = h.toLowerCase();
      const cur = map[k];
      if (cur && (cur.icon || Date.now() - Number(cur.at || 0) < 86400000)) continue;
      let icon = '';
      try {
        const res = await fetch(`https://www.youtube.com/${encodeURIComponent(h).replace(/^%40/, '@')}`, { credentials: 'omit' });
        if (res.ok) {
          const html = await res.text();
          const m = html.match(/<meta property="og:image" content="([^"]+)"/);
          const u = m ? m[1].replace(/&amp;/g, '&') : '';
          if (/^https:\/\/yt\d?\.(ggpht|googleusercontent)\.com\//.test(u)) icon = u;
        }
      } catch {
        /* 取れなければ次の日にもう一度 */
      }
      map[k] = { icon, at: Date.now() };
      changed = true;
    }
    if (changed) await chrome.storage.local.set({ [KEY_HANDLE_ICONS]: map });
  } finally {
    handleIconsBusy = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  // 視聴ページの中の会場(venue-inline.js)は拡張の IndexedDB を読めないので、ここで読んで渡す
  if (message.type === 'YT_GET_STREAM_COMMENTS') {
    if (!sender || sender.id !== chrome.runtime.id) return false;
    const vid = String(message.videoId || '');
    const after = Number(message.afterRecordedAt || 0);
    (after > 0 ? getYtStreamCommentsSince(vid, after) : getYtStreamCommentsByVideoId(vid))
      .then((items) => sendResponse({ ok: true, items: Array.isArray(items) ? items : [] }))
      .catch((err) => sendResponse({ ok: false, items: [], error: String(err && err.message || err) }));
    return true;
  }

  // 視聴ページの中の会場が、拡張の中の画像・音をネットワークを通さずに使うため(ytLocalAssetUrls.js)。
  //   YouTube のページから chrome-extension:// を直接読むと、ページの見張り(connection-allowlist)がエラー一覧に積もる。
  if (message.type === 'YT_GET_EXT_ASSET') {
    if (!sender || sender.id !== chrome.runtime.id) return false;
    const rel = String(message.path || '');
    if (!/^(?:images|sound)\/[\w\-./]+\.(?:png|jpe?g|gif|webp|svg|mp3|ogg|wav)$/i.test(rel) || rel.includes('..')) {
      sendResponse({ ok: false });
      return false;
    }
    (async () => {
      const res = await fetch(chrome.runtime.getURL(rel));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
      return { ok: true, b64: btoa(bin), mime: res.headers.get('content-type') || '' };
    })()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }

  if (message.type === 'YT_CAPTURE_FRAME') {
    (async () => {
      const want = String(message.videoId || '');
      const tabs = await chrome.tabs.query({ url: ['https://www.youtube.com/*'] });
      const sorted = tabs
        .filter((t) => !String(t.url || '').includes('/live_chat'))
        .sort((a, b) => {
          const sa = (parseYtVideoIdFromUrl(String(a.url || '')) === want ? 10 : 0) + (a.active ? 1 : 0);
          const sb = (parseYtVideoIdFromUrl(String(b.url || '')) === want ? 10 : 0) + (b.active ? 1 : 0);
          return sb - sa;
        });
      for (const t of sorted) {
        if (typeof t.id !== 'number') continue;
        try {
          const res = await chrome.tabs.sendMessage(t.id, { type: 'YT_CAPTURE_FRAME_IN_PAGE' }, { frameId: 0 });
          if (res) return res;
        } catch {
          // そのタブに content script が無い
        }
      }
      return { ok: false, reason: 'no-tab' };
    })()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

  if (message.type === 'YT_SPEAK_LIGHT') {
    const payload = message.payload || {};
    speakLightTts(String(payload.text || ''), String(payload.userKey || ''))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

  if (message.type === 'YT_REPORT_VOICE_ENGINE') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_STATE]);
      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const overloaded = payload.overloaded === true;
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_STATE]: {
          ...prevState,
          engineOverloaded: overloaded,
          lightVoiceActive: payload.lightActive === true,
          // 一度でも混雑したら「読み上げが遅い PC」として GPU の案内を出し続ける(ニコ生版 KEY_VOICE_WEAK_PC と同じ考え)
          weakPcSeen: prevState.weakPcSeen === true || overloaded,
          updatedAt: Date.now(),
        },
      });
      return { ok: true };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_OPEN_SUPERCHAT') {
    const videoId = String(message.videoId || '');
    relayToChatFrame(videoId, { type: 'YT_OPEN_SUPERCHAT_IN_FRAME', videoId })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

  if (message.type === 'YT_SEND_COMMENT') {
    relayCommentToChatFrame(String(message.videoId || ''), String(message.text || ''))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
    return true;
  }

  // ふわっちの視聴ページが API を直接読めなかったとき(CORS 等)の代わり。ふわっちのページから・API の決まった形の URL だけ
  //   (council/whowatch-support-PLAN.md・どちらで読めたかは計器 yt_diag_ww_chat の via に出る)
  if (message.type === 'YT_WW_API_GET') {
    const url = String(message.url || '');
    const from = String(sender?.tab?.url || sender?.url || '');
    if (!isWwApiUrl(url) || !/^https:\/\/(?:www\.)?whowatch\.tv\//.test(from)) {
      sendResponse({ ok: false, reason: 'bad-url' });
      return false;
    }
    fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' } })
      .then(async (res) => (res.ok ? { ok: true, json: await res.json() } : { ok: false, reason: `http_${res.status}` }))
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, reason: String(err).slice(0, 80) }));
    return true;
  }

  // ミクチャのギフトの絵(資源の置き場は CORS が無いのでページから読めない・2026-11-08 PC 実測)。ミクチャのページから・番号だけ
  if (message.type === 'YT_MX_GIFT_IMAGES') {
    const from = String(sender?.tab?.url || sender?.url || '');
    if (!/^https:\/\/mixch\.tv\//.test(from)) {
      sendResponse({ ok: false, reason: 'bad-origin' });
      return false;
    }
    mxGiftImages(Array.isArray(message.ids) ? message.ids : [])
      .then((images) => sendResponse({ ok: true, images }))
      .catch((err) => sendResponse({ ok: false, reason: String(err).slice(0, 80) }));
    return true;
  }

  if (message.type === 'YT_STREAM_META') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || '').trim();
      if (!videoId) return { ok: false };

      const data = await chrome.storage.local.get([
        STORAGE_KEYS.STREAM_SUMMARIES,
        STORAGE_KEYS.ACTIVE_VIDEO_ID,
      ]);
      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      summaries[videoId] = mergeYtStreamSummary(
        summaries[videoId],
        {
          videoId,
          title: payload.title ? String(payload.title) : undefined,
          broadcasterName: payload.broadcasterName ? String(payload.broadcasterName) : undefined,
          broadcasterChannelId: payload.broadcasterChannelId
            ? String(payload.broadcasterChannelId)
            : undefined,
          broadcasterIconUrl: payload.broadcasterIconUrl
            ? String(payload.broadcasterIconUrl)
            : undefined,
          broadcasterHandle: payload.broadcasterHandle ? String(payload.broadcasterHandle) : undefined,
          concurrentViewers:
            typeof payload.concurrentViewers === 'number' ? payload.concurrentViewers : undefined,
          slotViewCount: typeof payload.slotViewCount === 'number' ? payload.slotViewCount : undefined,
          // 別の動画と同じ開始時刻は、ページ内の移動で前の動画の欄を読んだもの→使わない
          startedAt:
            typeof payload.startedAt === 'number' &&
            !Object.entries(summaries).some(([vid, s]) => vid !== videoId && Number(s?.startedAt) === payload.startedAt)
              ? payload.startedAt
              : undefined,
          startedAtApprox: payload.startedAtApprox === true,
          endedAt: typeof payload.endedAt === 'number' ? payload.endedAt : undefined,
        },
        Date.now(),
      );

      const metaUpdates = { [STORAGE_KEYS.STREAM_SUMMARIES]: summaries };
      // 裏の ABEMA タブは claimActive:false。要約は更新し、いま見ている配信は奪わない。
      if (payload.claimActive !== false) metaUpdates[STORAGE_KEYS.ACTIVE_VIDEO_ID] = videoId;
      await chrome.storage.local.set(metaUpdates);
      void ytViewerSampler.maybeSample(videoId, payload.concurrentViewers, summaries[videoId]);
      return { ok: true, videoId };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_HANDLE_ICONS') {
    // 顔の分からない人(YouTube のギフトだけ送った人など・@名前 しか分からない)の顔を、チャンネルのページの
    // og:image(チャンネルのアイコン)から引いて yt_handle_icons に覚える。1回に5人まで・失敗は1日おいて再挑戦。
    const handles = (Array.isArray(message.handles) ? message.handles : [])
      .map((h) => String(h || '').trim())
      .filter((h) => /^@[^\s/?#]{1,100}$/.test(h));
    void resolveHandleIcons(handles.slice(0, 5));
    return false;
  }
  if (message.type === 'YT_LEADERBOARD') {
    // YouTube の「トップファン」の順位。配信ごとに最新の1つだけ置く(ニコ生版の「ギフト貢献度」の欄に出す)
    const payload = message.payload || {};
    const videoId = String(payload.videoId || extractVideoIdFromSender(sender) || '').trim();
    const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 100) : [];
    if (!videoId || !rows.length) return false;
    // Twitch の公式ランキングは期間がチャンネルごとに違う(累計・今月・今週・今日)。見出しに出すので一緒に置く
    const period = ['ALLTIME', 'MONTH', 'WEEK', 'DAY'].includes(String(payload.period || '')) ? String(payload.period) : '';
    // 0.1.1959: 中身が前回と同じなら書かない(TikTok・SHOWROOM は同じ表を決まった間隔で送ってくる。書くたびに横の欄が描き直していた)
    const sig = ytLeaderboardSig(rows, period);
    if (lastLeaderboardSig.get(videoId) === sig) return false;
    lastLeaderboardSig.set(videoId, sig);
    if (lastLeaderboardSig.size > 200) lastLeaderboardSig.delete(lastLeaderboardSig.keys().next().value);
    void chrome.storage.local
      .set({ [`yt_leaderboard_${videoId}`]: { videoId, capturedAt: Date.now(), rows, ...(period ? { period } : {}) } })
      .catch(() => lastLeaderboardSig.delete(videoId));
    return false;
  }

  // ---- 配信が終わったあと、アーカイブのチャットから記録の抜けを埋める(0.1.41・りんく 2026-11-04 OK) ----
  //   ニコ生版は公式のギフト履歴が配信の最初から返るのでさかのぼれるが、YouTube は配信中に前の分を取る窓口が無い。
  //   終わるとアーカイブのチャット(リプレイ)に全部残るので、YouTube のタブ(content)が裏で読んで送ってくる。
  if (message.type === 'YT_BACKFILL_NEXT') {
    runSerialized(async () => {
      const data = await chrome.storage.local.get([STORAGE_KEYS.STREAM_SUMMARIES, KEY_BACKFILL_STATE]);
      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      const state = data[KEY_BACKFILL_STATE] || {};
      const now = Date.now();
      const vid = pickBackfillVideo(summaries, state, now);
      if (!vid) return { videoId: '' };
      const prev = state[vid] || {};
      state[vid] = { ...prev, status: 'running', lastTryAt: now, tries: Number(prev.tries || 0) + 1 };
      await chrome.storage.local.set({ [KEY_BACKFILL_STATE]: state });
      return { videoId: vid, endedAt: Number(summaries[vid]?.endedAt || 0) };
    })
      .then((res) => sendResponse(res))
      .catch(() => sendResponse({ videoId: '' }));
    return true;
  }
  if (message.type === 'YT_BACKFILL_ITEMS') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const videoId = String(payload.videoId || '').trim();
      const incoming = Array.isArray(payload.items) ? payload.items : [];
      if (!videoId || !incoming.length) return { added: 0 };
      // 記録した時刻=書かれた時刻にする(時刻の順に並び、コメビュの読み上げは古いものとして読まない)
      const items = incoming
        .filter((x) => x && x.id)
        .map((x) => ({ ...x, recordedAt: Number(x.postedAtMs) > 0 ? Number(x.postedAtMs) : Date.now() }));
      // ★0.1.1915: アーカイブはその配信自身のチャット=本物。別の配信に紛れ込んでいた同じコメントは消して取り戻す
      //   (それまでは入口の確認が無く、同じコメントが2つの配信に残っていた・2026-11-07 実データ83件)。
      const res = await appendYtStreamCommentsIdb(videoId, items, { claimFromOthers: true });
      rememberYtCommentOwners(videoId, { newlyAdded: res.newlyAdded });
      const reclaimed = Array.isArray(res.reclaimed) ? res.reclaimed : [];
      for (const r of reclaimed) noteYtCommentOwner(r.id, videoId);
      /** @type {Record<string, number>} */
      let otherTotals = {};
      if (reclaimed.length) {
        // 消した行の控え(片付けと同じ所に足す・あとで戻せる)
        const backupKey = `${KEY_CROSS_VIDEO_CLEANUP}_removed`;
        const prev = (await chrome.storage.local.get(backupKey))?.[backupKey];
        const prevRows = Array.isArray(prev?.rows) ? prev.rows : [];
        const seen = new Set(prevRows.map((/** @type {any} */ x) => String(x?.pk || '')));
        const add = reclaimed.map((r) => r.row).filter((x) => x && !seen.has(String(x.pk || '')));
        await chrome.storage.local.set({ [backupKey]: { at: Date.now(), rows: prevRows.concat(add) } });
        const fromVids = [...new Set(reclaimed.map((r) => r.from))];
        otherTotals = (await deleteYtCommentPksAcrossVideos([], fromVids)).totals;
        // 計器: アーカイブが別の配信から取り戻した数
        void chrome.storage.local
          .set({ yt_diag_backfill_reclaim: { at: Date.now(), to: videoId, n: reclaimed.length, from: fromVids.slice(0, 5) } })
          .catch(() => {});
      }
      const data = await chrome.storage.local.get(STORAGE_KEYS.STREAM_SUMMARIES);
      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      let changed = false;
      if (summaries[videoId] && res.newlyAdded.length) {
        summaries[videoId] = mergeYtStreamSummary(summaries[videoId], { videoId, itemCount: res.totalCount }, Date.now());
        changed = true;
      }
      for (const [v, total] of Object.entries(otherTotals)) {
        if (!summaries[v]) continue;
        summaries[v] = { ...summaries[v], itemCount: total };
        changed = true;
      }
      if (changed) await chrome.storage.local.set({ [STORAGE_KEYS.STREAM_SUMMARIES]: summaries });
      return { added: res.newlyAdded.length, total: res.totalCount };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ added: 0, error: String(err) }));
    return true;
  }
  if (message.type === 'YT_BACKFILL_DONE') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const videoId = String(payload.videoId || '').trim();
      if (!videoId) return;
      const data = await chrome.storage.local.get(KEY_BACKFILL_STATE);
      const state = data[KEY_BACKFILL_STATE] || {};
      state[videoId] = {
        ...(state[videoId] || {}),
        status: String(payload.status || 'error'),
        finishedAt: Date.now(),
        added: Number(payload.added || 0),
        calls: Number(payload.calls || 0),
        reason: String(payload.reason || '').slice(0, 200),
      };
      await chrome.storage.local.set({ [KEY_BACKFILL_STATE]: state });
    })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'YT_CHAT_ITEMS') {
    // 2026-11-05 りんく「もっとリアルタイムに」: 同じタブの視聴ページの会場へ、保存より先にそのまま届ける。
    //   保存(下の runSerialized)は他の仕事と1列に並ぶので、そこを待つと吹き出しが数秒遅れていた(PC 実測 中央値3.9秒)。
    //   届けるのは保存と同じ形(pk・recordedAt 付き)。あとで保存から来る同じ行は pk/id で同じ行として扱われる。
    try {
      const tabId = sender?.tab?.id;
      const p0 = message.payload || {};
      const vidNow = String(p0.videoId || extractVideoIdFromSender(sender) || '').trim();
      if (typeof tabId === 'number' && vidNow && Array.isArray(p0.items) && p0.items.length) {
        // 別の配信の記録に入っていると分かっているコメントは、保存より先に会場へ届けない(保存の側でも入れない)
        const recs = prepareYtCommentsForIdb(vidNow, p0.items).filter((r) => {
          const owner = ytCommentOwnerById.get(String(r?.id || ''));
          return !owner || owner === vidNow;
        });
        if (recs.length) {
          void Promise.resolve(chrome.tabs.sendMessage(tabId, { type: 'YT_LIVE_ROWS', videoId: vidNow, items: recs }, { frameId: 0 })).catch(() => {});
        }
      }
    } catch {
      /* 直接届けられなくても、保存からいつもどおり届く */
    }
    runSerialized(async () => {
      const payload = message.payload || {};
      const videoId =
        String(payload.videoId || extractVideoIdFromSender(sender) || '').trim() || 'live_default';
      const incoming = Array.isArray(payload.items) ? payload.items : [];
      const chatFilterLabel = String(payload.chatFilterLabel || '').trim();

      const data = await chrome.storage.local.get([
        STORAGE_KEYS.STREAM_SUMMARIES,
        STORAGE_KEYS.ACTIVE_VIDEO_ID,
        STORAGE_KEYS.VOICE_SETTINGS,
        ...(voiceAssignMem ? [] : [STORAGE_KEYS.VOICE_ASSIGNMENTS]),
        STORAGE_KEYS.VOICE_QUEUE,
        STORAGE_KEYS.VOICE_STATE,
      ]);

      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      const prevSummary = summaries[videoId] || null;

      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      if (!voiceAssignMem) {
        voiceAssignDiag.memMissReads++;
        // storage から読んだ直後=storage と控えは同じ。service worker が作り直されても、その直後の束で
        // すぐ書かないよう「いま書いた」扱いにする(作り直しが続くと書き込みが束ごとに戻るため・v0.1.1970)
        if (!voiceAssignWrittenAt) voiceAssignWrittenAt = Date.now();
      }
      const assignmentsAtStart = voiceAssignMem || data[STORAGE_KEYS.VOICE_ASSIGNMENTS] || {};
      let assignments = assignmentsAtStart;
      let voiceQueue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      const prevVoiceState = data[STORAGE_KEYS.VOICE_STATE] || {};
      let voiceState = {
        ...prevVoiceState,
        effectiveMode: prevVoiceState.effectiveMode || settings.mode,
        autoSwitched: Boolean(prevVoiceState.autoSwitched),
        updatedAt: Date.now(),
      };

      const broadcasterName =
        String(settings.broadcasterNameOverride || '').trim() ||
        String(prevSummary?.broadcasterName || '').trim();

      // 各コメントに投稿者ごとの決定論的な VOICEVOX styleId を付与
      const enrichedIncoming = [];
      for (const rawItem of incoming) {
        if (!rawItem || !rawItem.id) continue;
        const voice = resolveYtVoiceForChannel(rawItem.channelId || rawItem.name || 'anonymous', {
          availableStyleIds: settings.availableStyleIds,
          assignments,
        });
        assignments = voice.assignments;

        enrichedIncoming.push({
          ...rawItem,
          voiceUserKey: voice.userKey,
          voiceStyleId: voice.styleId,
          pitchOffset: voice.pitchOffset,
          speedOffset: voice.speedOffset,
          recordedAt: Date.now(),
        });
      }

      // IndexedDB へ全件保存（間引きなし・重複 pk のみスキップ）
      // 失敗したら、つながりを開き直して1回だけやり直す(切れたつながりで黙って保存できなくなるのを防ぐ)
      let idbResult;
      try {
        idbResult = await appendYtStreamCommentsIdb(videoId, enrichedIncoming, { rejectOwnedElsewhere: true });
      } catch (err) {
        resetYtCommentsDb();
        try {
          idbResult = await appendYtStreamCommentsIdb(videoId, enrichedIncoming, { rejectOwnedElsewhere: true });
        } catch (err2) {
          void chrome.storage.local.set({
            yt_ingest_diag: { at: Date.now(), ok: false, videoId, error: String(err2 || err).slice(0, 200) },
          });
          throw err2;
        }
      }
      rememberYtCommentOwners(videoId, idbResult);
      if (Date.now() - lastIngestDiagAt > 30000) {
        lastIngestDiagAt = Date.now();
        void chrome.storage.local.set({
          yt_ingest_diag: { at: Date.now(), ok: true, videoId, received: incoming.length, added: idbResult.newlyAdded.length },
        });
      }

      // 新規追加されたコメントだけを読み上げキューへ投入
      let enqueuedAny = false;
      if (BACKGROUND_READER_ENABLED && settings.enabled) {
        for (const newItem of idbResult.newlyAdded) {
          const prevLen = voiceQueue.length;
          const enq = enqueueYtVoiceItem(voiceQueue, newItem, {
            mode: settings.mode,
            broadcasterName,
            availableStyleIds: settings.availableStyleIds,
            assignments,
          });
          voiceQueue = enq.queue;
          if (voiceQueue.length > prevLen) {
            enqueuedAny = true;
          }
          assignments = enq.assignments;
          voiceState = {
            ...voiceState,
            effectiveMode: enq.effectiveMode,
            autoSwitched: enq.autoSwitched,
            updatedAt: Date.now(),
          };
        }
      }

      // chrome.storage.local にはコメント配列を置かず、配信一覧の要約だけを保存する
      summaries[videoId] = mergeYtStreamSummary(
        prevSummary,
        {
          videoId,
          chatFilterLabel: chatFilterLabel || undefined,
          itemCount: idbResult.totalCount,
        },
        Date.now(),
      );

      const updates = {
        [STORAGE_KEYS.STREAM_SUMMARIES]: summaries,
        [STORAGE_KEYS.VOICE_QUEUE]: voiceQueue,
        [STORAGE_KEYS.VOICE_STATE]: voiceState,
      };
      // 声の割り当ては控えを正にし、変わったときだけ最短30秒に1回書く(v0.1.1968)
      voiceAssignMem = assignments;
      if (assignments !== assignmentsAtStart) voiceAssignDirty = true;
      const assignWrite = ytVoiceAssignPersistDecision({ dirty: voiceAssignDirty, lastWrittenAt: voiceAssignWrittenAt, now: Date.now() });
      if (assignWrite === 'now') {
        updates[STORAGE_KEYS.VOICE_ASSIGNMENTS] = assignments;
        voiceAssignDirty = false;
        voiceAssignDiag.now++;
        if (voiceAssignWrittenAt) voiceAssignDiag.gaps = [...voiceAssignDiag.gaps.slice(-19), Date.now() - voiceAssignWrittenAt];
        voiceAssignWrittenAt = Date.now();
      } else if (assignWrite === 'later') {
        voiceAssignDiag.later++;
        scheduleVoiceAssignFlush();
      }
      if (payload.claimActive !== false && (videoId !== 'live_default' || !data[STORAGE_KEYS.ACTIVE_VIDEO_ID])) {
        updates[STORAGE_KEYS.ACTIVE_VIDEO_ID] = videoId;
      }

      await chrome.storage.local.set(updates);
      if (BACKGROUND_READER_ENABLED && settings.enabled && (enqueuedAny || voiceQueue.length > 0)) {
        nudgeOffscreenDrain();
      }
      return {
        ok: true,
        addedCount: idbResult.newlyAdded.length,
        totalCount: idbResult.totalCount,
        videoId,
      };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_SHIFT_VOICE_QUEUE') {
    runSerialized(async () => {
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_QUEUE,
      ]);
      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      if (!BACKGROUND_READER_ENABLED || !settings.enabled || queue.length === 0) {
        return { ok: true, entry: null, remaining: queue.length, enabled: BACKGROUND_READER_ENABLED && Boolean(settings.enabled) };
      }
      const [entry, ...rest] = queue;
      await chrome.storage.local.set({ [STORAGE_KEYS.VOICE_QUEUE]: rest });
      return {
        ok: true,
        entry,
        remaining: rest.length,
        enabled: true,
        lightVoice: settings.lightVoice === 'off' ? 'off' : 'auto',
      };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_REPORT_VOICEVOX_STATUS') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const online = Boolean(payload.online);
      const reason = String(payload.reason || (online ? 'ok' : 'unreachable'));
      const availableStyleIds =
        Array.isArray(payload.availableStyleIds) && payload.availableStyleIds.length > 0
          ? payload.availableStyleIds
          : null;

      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_STATE,
        STORAGE_KEYS.VOICE_QUEUE,
      ]);
      const currentSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      if (availableStyleIds) {
        currentSettings.availableStyleIds = availableStyleIds;
      }
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      const isOverThreshold =
        currentSettings.enabled !== false &&
        currentSettings.mode === YT_VOICE_MODES.ALL &&
        queue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;

      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const nextState = {
        ...prevState,
        effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : currentSettings.mode,
        autoSwitched: isOverThreshold,
        voicevoxOnline: online,
        voicevoxReason: reason,
        availableStyleCount: currentSettings.availableStyleIds.length,
        voicevoxCheckedAt: Date.now(),
        updatedAt: Date.now(),
      };

      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_SETTINGS]: currentSettings,
        [STORAGE_KEYS.VOICE_STATE]: nextState,
      });
      return { ok: true, state: nextState };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_REPORT_VOICE_SPOKEN') {
    runSerialized(async () => {
      const payload = message.payload || {};
      const data = await chrome.storage.local.get([STORAGE_KEYS.VOICE_STATE]);
      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const nextState = {
        ...prevState,
        lastSpokenSummary: String(payload.lastSpokenSummary || ''),
        lastSpokenAt: Date.now(),
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_STATE]: nextState,
      });
      return { ok: true };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_RECHECK_VOICEVOX') {
    runSerialized(async () => {
      await ensureOffscreenDocument();
      const probe = await probeVoicevoxAlive({ baseUrl: VOICEVOX_BASE_URL });
      const online = Boolean(probe.ok);
      const reason = probe.ok ? 'ok' : probe.reason === 'timeout' ? 'timeout' : 'unreachable';
      let styles = [];
      if (online) {
        styles = await listVoicevoxStyleIds({ baseUrl: VOICEVOX_BASE_URL });
      }
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_STATE,
        STORAGE_KEYS.VOICE_QUEUE,
      ]);
      const currentSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      if (styles.length > 0) {
        currentSettings.availableStyleIds = styles;
      }
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      const isOverThreshold =
        currentSettings.enabled !== false &&
        currentSettings.mode === YT_VOICE_MODES.ALL &&
        queue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;

      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const nextState = {
        ...prevState,
        effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : currentSettings.mode,
        autoSwitched: isOverThreshold,
        voicevoxOnline: online,
        voicevoxReason: reason,
        availableStyleCount: currentSettings.availableStyleIds.length,
        voicevoxCheckedAt: Date.now(),
        updatedAt: Date.now(),
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_SETTINGS]: currentSettings,
        [STORAGE_KEYS.VOICE_STATE]: nextState,
      });
      if (online && currentSettings.enabled && queue.length > 0) {
        nudgeOffscreenDrain();
      }
      return { ok: true, online, reason, state: nextState };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_UPDATE_VOICE_SETTINGS') {
    runSerialized(async () => {
      const patch = message.payload || {};
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_QUEUE,
        STORAGE_KEYS.VOICE_STATE,
      ]);
      const current = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      const next = {
        ...current,
        ...patch,
      };
      const queue = Array.isArray(data[STORAGE_KEYS.VOICE_QUEUE])
        ? data[STORAGE_KEYS.VOICE_QUEUE]
        : [];
      const nextQueue = next.enabled === false ? [] : queue;
      const isOverThreshold =
        next.enabled !== false &&
        next.mode === YT_VOICE_MODES.ALL &&
        nextQueue.length >= YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD;

      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      const updates = {
        [STORAGE_KEYS.VOICE_SETTINGS]: next,
        [STORAGE_KEYS.VOICE_STATE]: {
          ...prevState,
          effectiveMode: isOverThreshold ? YT_VOICE_MODES.SELECT : next.mode,
          autoSwitched: isOverThreshold,
          availableStyleCount: Array.isArray(next.availableStyleIds)
            ? next.availableStyleIds.length
            : prevState.availableStyleCount || YT_DEFAULT_STYLE_IDS.length,
          updatedAt: Date.now(),
        },
      };
      if (next.enabled === false) {
        updates[STORAGE_KEYS.VOICE_QUEUE] = [];
      }
      await chrome.storage.local.set(updates);
      if (next.enabled && nextQueue.length > 0) {
        nudgeOffscreenDrain();
      }
      return { ok: true, settings: next };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === 'YT_CLEAR_VOICE_QUEUE') {
    runSerialized(async () => {
      const data = await chrome.storage.local.get([
        STORAGE_KEYS.VOICE_SETTINGS,
        STORAGE_KEYS.VOICE_STATE,
      ]);
      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      const prevState = data[STORAGE_KEYS.VOICE_STATE] || {};
      await chrome.storage.local.set({
        [STORAGE_KEYS.VOICE_QUEUE]: [],
        [STORAGE_KEYS.VOICE_STATE]: {
          ...prevState,
          effectiveMode: settings.mode,
          autoSwitched: false,
          updatedAt: Date.now(),
        },
      });
      return { ok: true };
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
