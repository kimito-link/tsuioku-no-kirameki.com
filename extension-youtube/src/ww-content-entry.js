// ww-content-entry.js — ふわっちの視聴ページ(whowatch.tv/viewer/<配信の番号>)で、配信とコメントを読んで記録に渡す入口。
/* global chrome, location, setTimeout, clearTimeout, window, fetch, document, HTMLTextAreaElement, HTMLInputElement, Event, KeyboardEvent */
//
// ★設計(council/whowatch-support-PLAN.md・Kick の kick-content-entry.js と同じ形)
//   - 読むのはふわっちのページ自身が使う API(GET api.whowatch.tv/lives/<番号>?last_updated_at=<前回>)。ログイン不要の推定。
//     形は非公式資料による推定なので、届いた項目の名前(値は残さない)を計器 yt_diag_ww_chat に残して PC で確かめる。
//   - ページから直接読めなければ(CORS 等)、バックグラウンドに代わりに読んでもらう(YT_WW_API_GET・URL の形を確かめてから)。
//   - 記録は YouTube 版と同じ口(YT_STREAM_META / YT_CHAT_ITEMS)へ送る。配信キーは 'ww.<配信の番号>.<配信者の user id>'。
//   - 配信が終わったと分かったら(live_status 等)、終わった時刻を送って読むのをやめる。

import { parseWwLiveIdFromUrl, wwLiveApiUrl, wwUserProfileUrl, parseWwLive, parseWwComment, buildWwStreamKey } from '../../src/lib/whowatch/wwParse.js';
import { wwEventInfoUrl, parseWwEventInfo, parseWwLiveStats, mergePlatformStats } from '../../src/lib/platform/platformStats.js';
import { followerSampleFromDom, followerSampleFromWhowatch, followerSampleFromWhowatchProfile } from '../../src/lib/platform/followerCountSample.js';
import { createSlowFollowerFetch } from '../../src/lib/platform/slowFollowerFetch.js';
import { platformFetchTimeoutSignal } from '../../src/lib/platform/fetchTimeout.js';
import { startPageStallWatch } from '../../src/lib/stallTrace.js';
import { isOwnExtensionUi } from '../../src/lib/platform/pageControlPick.js';
import { withRevealedVenueOfficialComposer } from '../../src/lib/venueRevealOfficialComposer.js';
import { createPageWatchScheduler } from '../../src/lib/pageWatchScheduler.js';
import { isVenuePageHidden } from '../../src/lib/venuePaintSchedule.js';
import { isExtensionContextAlive } from '../../src/lib/reportSilentError.js';
try {
  const stallRoot = /** @type {any} */ (globalThis);
  if (!stallRoot.__nlStallWatch) {
    stallRoot.__nlStallWatch = startPageStallWatch({
      file: 'ww-content-entry.js',
      send: (summary) => {
        try { chrome.runtime.sendMessage({ type: 'NLS_STALL_SUMMARY', page: location.hostname, summary, events: stallRoot.__nlStallWatch.takeFresh() }); } catch { /* 計器 */ }
      },
    });
  }
} catch { /* 計器 */ }

// ページ自身は10秒おき(polling_interval)。3秒で取りこぼし0・遅れ中央値1.6秒だった(2026-11-08 PC 実測)。
//   5秒だと記録まで2〜5秒遅れ、ほかのサービス(0.2秒)より遅かった(2026-11-12 PC 実測)ので2秒にする。
//   読めないときは今までどおり倍々で間をあける(最大60秒)。
const POLL_MS = 2000;
const POLL_MAX_MS = 60_000;
const META_EVERY_MS = 30_000;
const MAX_SEEN = 8000;

/** 計器(りんくに聞かずに数で確かめる)。値そのものは残さず、項目の名前と数だけ */
const diag = {
  v: 1,
  liveId: '',
  streamKey: '',
  /** 読めた道('page' = ページから直接 / 'bg' = バックグラウンド経由) */
  via: '',
  polls: 0,
  pollFail: 0,
  /** いちばん良いイベント順位(0 = 出ていない・読めていない) */
  eventRank: 0,
  lastError: '',
  status: '',
  isLive: /** @type {boolean | null} */ (null),
  /** 1回の応答に来たコメントの数(最後の回・最大) */
  lastBatch: 0,
  maxBatch: 0,
  rawComments: 0,
  dropped: 0,
  items: 0,
  historyItems: 0,
  historyPages: 0,
  historyStopReason: '',
  paid: 0,
  paidItems: 0,
  withIcon: 0,
  /** @type {Record<string, string[]>} 届いた項目の名前(形の確かめ用) */
  shapes: {},
  /** @type {Record<string, number>} comment_type ごとの数 */
  types: {},
  /** 新しい順で届いたか(最初の2件の時刻で見る) */
  newestFirst: /** @type {boolean | null} */ (null),
  updatedAt: 0,
};

function safeSendMessage(/** @type {any} */ msg) {
  try {
    if (!chrome?.runtime?.id) return;
    chrome.runtime.sendMessage(msg, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* 拡張が入れ替わった直後 */
  }
}

let diagTimer = 0;
function saveDiagSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => {
    diagTimer = 0;
    diag.updatedAt = Date.now();
    try {
      void chrome.storage.local.set({ yt_diag_ww_chat: { ...diag, shapes: { ...diag.shapes }, types: { ...diag.types } } });
    } catch {
      /* no-op */
    }
  }, 2000);
}

/** 項目の名前を覚える(値は覚えない) @param {string} where @param {unknown} o */
function noteShape(where, o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return;
  const had = new Set(diag.shapes[where] || []);
  const before = had.size;
  for (const k of Object.keys(o).slice(0, 60)) had.add(k.slice(0, 40));
  if (had.size !== before) diag.shapes[where] = [...had].slice(0, 80);
}

/** @param {string} url */
async function bgGet(url) {
  const res = await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'YT_WW_API_GET', url }, (r) => {
        const le = chrome.runtime.lastError;
        resolve(r || { ok: false, reason: `bg_none:${String(le?.message || '').slice(0, 60)}` });
      });
    } catch {
      resolve(null);
    }
  });
  if (!res || !res.ok) throw new Error(`bg:${String(res?.reason || JSON.stringify(res)).slice(0, 70)}`);
  return res.json;
}

/** ページから直接 → だめならバックグラウンド。一度うまくいった道を先に使う @param {string} url */
async function getJson(url) {
  if (diag.via !== 'bg') {
    try {
      const res = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`ww_${res.status}`);
      const json = await res.json();
      diag.via = 'page';
      return json;
    } catch (e) {
      diag.lastError = String(/** @type {any} */ (e)?.message || e).slice(0, 80);
    }
  }
  const json = await bgGet(url);
  diag.via = 'bg';
  return json;
}

// ---- 1配信ぶんの読み取り ----
let current = /** @type {null | { liveId: string, stop: () => void }} */ (null);
/** @type {null | { count: number, rounded: boolean, source: string, noun?: string }} */
let lastWwKey = '';
let lastWwUserId = '';
const slowWwFollow = createSlowFollowerFetch();

/**
 * GET /users/<番号>/profile の follower_count を1回。コメントの読み取りは待たない。
 * @param {string} userId
 * @param {string} videoKey
 * @param {{ force?: boolean }} [opts]
 */
function requestWwFollowers(userId, videoKey, opts = {}) {
  const ticket = slowWwFollow.claim(videoKey, { hidden: document.hidden, force: opts.force === true });
  if (!ticket) {
    if (opts.force === true) slowWwFollow.whenIdle(() => requestWwFollowers(userId, videoKey, opts));
    return;
  }
  const url = wwUserProfileUrl(userId);
  if (!url) {
    slowWwFollow.finish(ticket, false);
    return;
  }
  void (async () => {
    let ok = false;
    try {
      const res = await fetch(url, {
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        keepalive: true,
        signal: platformFetchTimeoutSignal(),
      });
      if (!res.ok) throw new Error(`ww_profile_${res.status}`);
      const sample = followerSampleFromWhowatchProfile(await res.json());
      if (sample && slowWwFollow.currentKey() === videoKey) {
        lastWwKey = videoKey;
        ok = true;
        safeSendMessage({
          type: 'YT_STREAM_META',
          payload: { videoId: videoKey, followerSample: { ...sample, at: Date.now(), ...(opts.force ? { force: true } : {}) } },
        });
      }
    } catch {
      ok = false;
    } finally {
      slowWwFollow.finish(ticket, ok);
    }
  })();
}

/** 終わりの人数は裏方が読む。ページが閉じる fetch は移動で消える。 */
let wwEndArmKey = '';
let wwEndArmAt = 0;
/** @type {null | { platform: 'whowatch', videoKey: string, userId: string, livePageId: string }} */
let wwLeavePayload = null;
/** @param {string} userId @param {string} videoKey @param {string} livePageId */
function armWwFollowerEnd(userId, videoKey, livePageId) {
  if (!videoKey || !userId || !livePageId) return;
  wwLeavePayload = { platform: 'whowatch', videoKey, userId, livePageId };
  const now = Date.now();
  if (wwEndArmKey === videoKey && now - wwEndArmAt < 60_000) return;
  wwEndArmKey = videoKey;
  wwEndArmAt = now;
  safeSendMessage({ type: 'YT_FOLLOWER_END_ARM', ...wwLeavePayload });
}
/** 閉じる・about:blank へ移る。URL が見えなくても、利用者番号を知らせて裏方に読ませる。 */
function leaveWwFollowerEnd() {
  if (!wwLeavePayload) return;
  safeSendMessage({ type: 'YT_FOLLOWER_END_LEAVE', ...wwLeavePayload });
}
/** @param {string} userId @param {string} videoKey @param {string} livePageId */
function askWwFollowerEnd(userId, videoKey, livePageId) {
  wwEndArmAt = 0;
  armWwFollowerEnd(userId, videoKey, livePageId);
  safeSendMessage({
    type: 'YT_FOLLOWER_END_NOW',
    platform: 'whowatch',
    videoKey,
    userId,
    livePageId,
  });
}
/** 終わったと分かった配信(同じページにいる間は読み直さない) */
const endedLives = new Set();

/** @param {string} liveId */
function startReader(liveId) {
  let stopped = false;
  let timer = 0;
  let lastUpdatedAt = 0;
  let initialHistoryDone = false;
  let finalPollDone = false;
  let wait = POLL_MS;
  let key = '';
  let metaAt = 0;
  /** @type {Set<string>} */
  const seen = new Set();
  // ふわっち特有の公式の数字: 累計視聴(配信の応答)・イベント順位(events/event_info を1分おき)
  /** @type {Record<string, any> | null} */
  let liveStats = null;
  /** @type {Record<string, any> | null | undefined} undefined = まだ読んでいない */
  let eventStats;
  let eventAt = 0;
  let statsRead = false;
  const loadEvents = async () => {
    eventAt = Date.now();
    try {
      eventStats = parseWwEventInfo(await getJson(wwEventInfoUrl(liveId)));
      statsRead = true;
      diag.eventRank = eventStats?.eventRank ?? 0;
    } catch {
      /* 読めなければ前の値のまま */
    }
  };

  /** @param {NonNullable<ReturnType<typeof parseWwLive>>} info @param {object | null} sample */
  const sendMeta = (info, sample) => {
    if (!key) return;
    metaAt = Date.now();
    const u = info.user;
    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId: key,
        // 題の無い配信でコメビュの見出しに配信キー(ww.番号.番号)が出ていた(2026-11-08 PC 実測)
        title: info.title || `${u?.name || 'ふわっち'}の配信`,
        broadcasterName: u?.name || u?.userPath || '',
        broadcasterChannelId: u ? `ww:${u.id}` : '',
        broadcasterHandle: u?.userPath || '',
        broadcasterIconUrl: u?.iconUrl || '',
        concurrentViewers: typeof info.viewers === 'number' ? info.viewers : undefined,
        ...(info.startedAtMs ? { startedAt: info.startedAtMs, startedAtApprox: false } : {}),
        ...(statsRead ? { platformStats: mergePlatformStats(liveStats, eventStats) } : {}),
        ...(sample ? { followerSample: { ...sample, at: Date.now() } } : {}),
      },
    });
    if (sample) {
      lastWwKey = key;
    }
  };

  const poll = async () => {
    timer = 0;
    if (stopped) return;
    diag.polls += 1;
    const isInitialHistory = lastUpdatedAt === 0 && !initialHistoryDone;
    let json;
    try {
      json = await getJson(isInitialHistory ? wwLiveApiUrl(liveId, 0, 500) : wwLiveApiUrl(liveId, lastUpdatedAt));
    } catch (e) {
      diag.pollFail += 1;
      diag.lastError = String(/** @type {any} */ (e)?.message || e).slice(0, 80);
      wait = Math.min(POLL_MAX_MS, wait * 2);
      saveDiagSoon();
      return schedule();
    }
    if (stopped) return;
    noteShape('root', json);
    noteShape('live', json?.live);
    noteShape('liveUser', json?.live?.user);
    const info = parseWwLive(json, liveId);
    const ls = parseWwLiveStats(json);
    if (ls) {
      liveStats = ls;
      statsRead = true;
    }
    if (Date.now() - eventAt >= 60_000) await loadEvents();
    if (stopped) return;
    if (!info) {
      diag.pollFail += 1;
      diag.lastError = 'shape';
      wait = Math.min(POLL_MAX_MS, wait * 2);
      saveDiagSoon();
      return schedule();
    }
    wait = POLL_MS;
    diag.status = info.status;
    diag.isLive = info.isLive;
    if (info.updatedAt > lastUpdatedAt) lastUpdatedAt = info.updatedAt;
    if (!key) {
      key = buildWwStreamKey(liveId, { userId: info.user?.id });
      diag.streamKey = key;
    }
    const wwFollow = followerSampleFromWhowatch(json) || followerSampleFromDom(document, 'whowatch');
    if (info.user?.id && key) {
      lastWwUserId = info.user.id;
      armWwFollowerEnd(info.user.id, key, liveId);
      requestWwFollowers(info.user.id, key);
    }
    if (Date.now() - metaAt >= META_EVERY_MS) sendMeta(info, wwFollow);

    // コメント(新しい順らしい=古い順に並べ直して送る)
    const raw = info.comments;
    diag.lastBatch = raw.length;
    diag.maxBatch = Math.max(diag.maxBatch, raw.length);
    diag.rawComments += raw.length;
    /** @type {any[]} */
    const items = [];
    for (const c of raw) {
      noteShape('comment', c);
      noteShape('commentUser', c?.user);
      for (const k of ['play_item_pattern', 'item', 'play_item', 'gift']) if (c?.[k]) noteShape(`comment.${k}`, c[k]);
      const t = String(c?.comment_type ?? c?.type ?? '').slice(0, 40);
      if (t) diag.types[t] = (diag.types[t] || 0) + 1;
      const r = parseWwComment(c, { liveId });
      if (!r) {
        diag.dropped += 1;
        continue;
      }
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
      if (r.kind === 'superchat') {
        diag.paid += 1;
        diag.paidItems += r.amount;
      }
      if (r.iconUrl) diag.withIcon += 1;
      items.push(isInitialHistory ? { ...r, skipVoice: true } : r);
    }
    if (isInitialHistory) {
      initialHistoryDone = true;
      diag.historyPages += 1;
      diag.historyItems += items.length;
      diag.historyStopReason = raw.length >= 300 ? 'cap-301' : 'done';
    }
    if (diag.newestFirst === null && items.length >= 2 && items[0].postedAtMs !== items[1].postedAtMs) {
      diag.newestFirst = items[0].postedAtMs > items[1].postedAtMs;
    }
    items.sort((a, b) => a.postedAtMs - b.postedAtMs);
    if (items.length && key) {
      diag.items += items.length;
      safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: key, chatFilterLabel: '', items } });
    }
    saveDiagSoon();

    if (info.isLive === false) {
      // 終わったと分かった応答には、直前の数秒のコメントがまだ載っていないことがある(2026-11-08 PC 実測で1件)。
      // 3秒おいて最初から読み直してから止める(同じコメントは同じ id なので二重にはならない)
      if (!finalPollDone) {
        finalPollDone = true;
        lastUpdatedAt = 0;
        wait = POLL_MS;
        timer = setTimeout(() => void poll(), 3000);
        return;
      }
      endedLives.add(liveId);
      if (key) {
        if (info.user?.id) askWwFollowerEnd(info.user.id, key, liveId);
        safeSendMessage({
          type: 'YT_STREAM_META',
          payload: { videoId: key, endedAt: Date.now() },
        });
      }
      stopped = true;
      return;
    }
    schedule();
  };

  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => void poll(), wait);
  };

  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

function check() {
  const liveId = parseWwLiveIdFromUrl(location.href);
  if (!liveId || endedLives.has(liveId)) {
    if (current && current.liveId !== liveId) {
      if (!liveId && lastWwKey && lastWwUserId) askWwFollowerEnd(lastWwUserId, String(lastWwKey), current.liveId);
      current.stop();
      current = null;
    }
    if (!liveId) diag.liveId = '';
    return;
  }
  if (current?.liveId === liveId) return;
  current?.stop();
  diag.liveId = liveId;
  diag.streamKey = '';
  current = { liveId, stop: startReader(liveId) };
}

// ---- サイドパネル・会場からのコメント送信 ----
// ふわっち本体の入力欄に書いて送る。入力欄・ボタンの形は PC で確かめる(それまでは広めに探す)。
const WW_INPUT_SEL = 'form.item-form-area input, form.item-form-area textarea, textarea[placeholder*="コメント"], input[placeholder*="コメント"], textarea[name="comment"], input[name="comment"], form textarea';
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** ログインしていないと分かるか(見えている「ログイン」ボタンがあり、入力欄が無い・使えない) */
function wwSignedOut(/** @type {Element | null} */ input) {
  // 未ログインは入力欄と送信ボタンが disabled で、placeholder が「コメントを送るにはログインが必要です」(2026-11-08 PC 実測)
  if (input && /ログイン/.test(String(input.getAttribute('placeholder') || ''))) return true;
  const usable = input && !(/** @type {any} */ (input).disabled) && !(/** @type {any} */ (input).readOnly);
  if (usable) return false;
  const btns = [...document.querySelectorAll('button, a')].slice(0, 400);
  return btns.some(
    (b) => /ログイン|log ?in/i.test(String(b.textContent || '').trim().slice(0, 20)) && typeof b.getClientRects === 'function' && b.getClientRects().length > 0,
  );
}

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_ww_send_fail: { at: Date.now(), reason, liveId: diag.liveId } });
  } catch {
    /* no-op */
  }
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'WW_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!text) return { ok: false, reason: 'empty' };
      return await withRevealedVenueOfficialComposer(document, async () => {
      let input = /** @type {HTMLTextAreaElement | HTMLInputElement | null} */ (document.querySelector(WW_INPUT_SEL));
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = /** @type {any} */ (document.querySelector(WW_INPUT_SEL));
      }
      if (wwSignedOut(input)) {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      if (!input) {
        noteSendFail('no-input');
        return { ok: false, reason: 'no-input' };
      }
      input.focus();
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(120);
      const form = input.closest('form');
      const btn = /** @type {HTMLButtonElement | null} */ (
        form?.querySelector('button[type="submit"], button:not([type])') ||
          [...document.querySelectorAll('button')].find((b) => !isOwnExtensionUi(b) && /^(?:送信|コメント)$/.test(String(b.textContent || '').trim())) ||
          null
      );
      if (btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true')) {
        noteSendFail('send-disabled');
        return { ok: false, reason: 'send-disabled' };
      }
      if (btn) btn.click();
      else {
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        input.dispatchEvent(new KeyboardEvent('keydown', opts));
        input.dispatchEvent(new KeyboardEvent('keyup', opts));
      }
      await sleep(400);
      const ok = String(input.value || '').trim() !== text;
      try {
        void chrome.storage.local.set({ yt_diag_ww_send_last: { at: Date.now(), ok, len: text.length, liveId: diag.liveId, via: btn ? 'button' : 'enter' } });
      } catch {
        /* no-op */
      }
      if (!ok) noteSendFail('still-in-box');
      return { ok, reason: ok ? '' : 'still-in-box' };
      });
    })()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: String(e) }));
    return true;
  });
} catch {
  /* 拡張が入れ替わった直後 */
}

// ふわっちも1枚のページの中で URL だけ変わるかもしれないので、共通スケジューラで見張り、裏タブでは 10 秒に間引く
const wwWatchSched = createPageWatchScheduler({
  baseTickMs: 1000,
  getUrl: () => String(location.href || ''),
  isHidden: () => isVenuePageHidden(document),
  isAlive: () => isExtensionContextAlive(),
});
wwWatchSched.register({
  id: 'ww-watch',
  intervalMs: 1000,
  hiddenMode: 'throttle',
  hiddenIntervalMs: 10_000,
  runOnUrlChange: true,
  run: () => {
    void check();
  },
});
wwWatchSched.start({ runImmediately: true });
const resumeWwWatch = () => {
  wwWatchSched.start();
  wwWatchSched.kick();
};
document.addEventListener('visibilitychange', () => {
  if (!isVenuePageHidden(document)) resumeWwWatch();
});
window.addEventListener('pagehide', () => {
  wwWatchSched.stop();
  current?.stop();
  current = null;
  leaveWwFollowerEnd();
});
window.addEventListener('pageshow', (ev) => {
  if (ev?.persisted || !current) resumeWwWatch();
});
