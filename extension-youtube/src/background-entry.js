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
} from './ytIdbStore.js';
import { pickSwitchLeakPks } from '../../src/lib/youtube/ytSwitchLeakCleanup.js';
// ニコ生版の background にある、会場とコメビュの受け口(VOICEVOX 中継・読み手の取り合い・窓を開く)の写し
import './background-nico-relay.js';

/** 最後に「記録できた」を残した時刻(書きすぎないよう30秒に1回) */
let lastIngestDiagAt = 0;
import { parseYtVideoIdFromUrl } from '../../src/lib/youtube/ytPageMeta.js';
import { pickJapaneseVoices, lightVoiceToneFor } from '../../src/lib/voiceLightFallback.js';

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
      const res = await chrome.tabs.sendMessage(t.id, { type: 'YT_SEND_COMMENT_TO_FRAME', videoId, text });
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

try {
  scheduleSelfUpdateCheck();
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === SELF_UPDATE_ALARM) void checkForNewVersion().catch(() => {});
  });
} catch {
  // alarms が使えない環境では従来どおり手で 🔄
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

  if (message.type === 'YT_SEND_COMMENT') {
    relayCommentToChatFrame(String(message.videoId || ''), String(message.text || ''))
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, reason: String(err) }));
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

      await chrome.storage.local.set({
        [STORAGE_KEYS.STREAM_SUMMARIES]: summaries,
        [STORAGE_KEYS.ACTIVE_VIDEO_ID]: videoId,
      });
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
    void chrome.storage.local
      .set({ [`yt_leaderboard_${videoId}`]: { videoId, capturedAt: Date.now(), rows } })
      .catch(() => {});
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
      const res = await appendYtStreamCommentsIdb(videoId, items);
      const data = await chrome.storage.local.get(STORAGE_KEYS.STREAM_SUMMARIES);
      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      if (summaries[videoId] && res.newlyAdded.length) {
        summaries[videoId] = mergeYtStreamSummary(summaries[videoId], { videoId, itemCount: res.totalCount }, Date.now());
        await chrome.storage.local.set({ [STORAGE_KEYS.STREAM_SUMMARIES]: summaries });
      }
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
        const recs = prepareYtCommentsForIdb(vidNow, p0.items);
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
        STORAGE_KEYS.VOICE_ASSIGNMENTS,
        STORAGE_KEYS.VOICE_QUEUE,
        STORAGE_KEYS.VOICE_STATE,
      ]);

      const summaries = data[STORAGE_KEYS.STREAM_SUMMARIES] || {};
      const prevSummary = summaries[videoId] || null;

      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ...(data[STORAGE_KEYS.VOICE_SETTINGS] || {}),
      };
      let assignments = data[STORAGE_KEYS.VOICE_ASSIGNMENTS] || {};
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
        idbResult = await appendYtStreamCommentsIdb(videoId, enrichedIncoming);
      } catch (err) {
        resetYtCommentsDb();
        try {
          idbResult = await appendYtStreamCommentsIdb(videoId, enrichedIncoming);
        } catch (err2) {
          void chrome.storage.local.set({
            yt_ingest_diag: { at: Date.now(), ok: false, videoId, error: String(err2 || err).slice(0, 200) },
          });
          throw err2;
        }
      }
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
        [STORAGE_KEYS.VOICE_ASSIGNMENTS]: assignments,
        [STORAGE_KEYS.VOICE_QUEUE]: voiceQueue,
        [STORAGE_KEYS.VOICE_STATE]: voiceState,
      };
      if (videoId !== 'live_default' || !data[STORAGE_KEYS.ACTIVE_VIDEO_ID]) {
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
