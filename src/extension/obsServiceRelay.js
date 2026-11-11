/**
 * YouTube・Twitch・Kick などのチャットを、OBSの透過ページへ中継する。
 * 裏方（service worker）で動く。ニコ生の視聴ページとは別の記録なので、こちらが送る。
 * いま見ている配信がニコ生のときは送らない。
 */

import { parseDeviceCred, resolvePublishCredentials } from '../lib/devicePublishCredentials.js';
import { createLiveEventSender } from '../lib/liveEventSender.js';
import {
  OBS_APP_ORIGIN,
  OBS_PRESENCE_POLL_MS,
  OBS_PUBLISHER_BEAT_STALE_MS,
  obsBrowserSourceOrDefault,
  shouldSendObsComments
} from '../lib/obsBrowserSource.js';
import {
  OBS_SERVICE_COMEVIEW_PAGE,
  OBS_YT_LAST_STREAM_URL_KEY,
  pickObsComeviewWatch,
  serviceStreamMatchesWatch
} from '../lib/obsComeviewPage.js';
import { serviceItemsToLiveTail } from '../lib/obsServiceComments.js';
import {
  KEY_LAST_WATCH_URL,
  KEY_LIVE_EVENTS_SENDER_BEAT,
  KEY_OBS_BROWSER_SOURCE,
  KEY_STATUS_DEVICE_CRED,
  KEY_STATUS_UPLOAD_CONFIG
} from '../lib/storageKeys.js';

/** @type {ReturnType<typeof createLiveEventSender> | null} */
let sender = null;
/** @type {ReturnType<typeof resolvePublishCredentials>} */
let creds = null;
let viewerAt = 0;
let viewerActive = false;
let realtime = false;
/** @type {ReturnType<typeof pickObsComeviewWatch> | null} */
let picked = null;
let pickedAt = 0;

function newSendId() {
  const u8 = new Uint8Array(12);
  crypto.getRandomValues(u8);
  return btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {{ liveId: string, sendId: string, events: any[], dropped: number }} body
 */
async function postEvents(body) {
  const c = creds;
  if (!c) return { ok: false };
  const origin = String(c.appOrigin || OBS_APP_ORIGIN).replace(/\/+$/, '');
  const payload = c.mode === 'shared' ? { ...body, v: c.viewToken } : body;
  const res = await fetch(`${origin}/api/status?action=events`, {
    method: 'POST',
    headers: c.headers,
    body: JSON.stringify(payload)
  });
  /** @type {any} */
  let j = null;
  try { j = await res.json(); } catch { j = null; }
  return { ok: res.ok, realtime: j?.realtime === true };
}

/** @param {number} nowMs */
async function refreshViewer(nowMs) {
  if (viewerAt && nowMs - viewerAt < OBS_PRESENCE_POLL_MS) return;
  viewerAt = nowMs;
  viewerActive = false;
  realtime = false;
  if (!creds) return;
  const q = creds.mode === 'shared' ? `&v=${encodeURIComponent(creds.viewToken)}` : '';
  const res = await fetch(`${String(creds.appOrigin || OBS_APP_ORIGIN).replace(/\/+$/, '')}/api/status?action=viewer${q}`, {
    headers: creds.headers,
    cache: 'no-store'
  });
  /** @type {any} */
  let j = null;
  try { j = await res.json(); } catch { j = null; }
  viewerActive = res.ok && j?.viewerActive === true;
  realtime = res.ok && j?.realtime === true;
}

/**
 * チャットの束が届いたとき。記録の保存は待たない。
 * @param {string} streamKey
 * @param {readonly any[]} items
 */
export async function relayObsServiceComments(streamKey, items) {
  if (!streamKey || !Array.isArray(items) || !items.length) return;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const nowMs = Date.now();
  const bag = await chrome.storage.local.get([
    KEY_OBS_BROWSER_SOURCE,
    KEY_STATUS_UPLOAD_CONFIG,
    KEY_STATUS_DEVICE_CRED,
    KEY_LIVE_EVENTS_SENDER_BEAT,
    KEY_LAST_WATCH_URL,
    OBS_YT_LAST_STREAM_URL_KEY
  ]);
  if (!obsBrowserSourceOrDefault(bag?.[KEY_OBS_BROWSER_SOURCE]).enabled) return;
  if (!picked || nowMs - pickedAt > 2000) {
    /** @type {Array<{ url?: string, lastAccessed?: number }>} */
    let tabs = [];
    try {
      if (typeof chrome.tabs?.query === 'function') tabs = await chrome.tabs.query({});
    } catch {
      tabs = [];
    }
    picked = pickObsComeviewWatch({
      tabs,
      nicoWatchUrl: bag?.[KEY_LAST_WATCH_URL],
      ytLast: bag?.[OBS_YT_LAST_STREAM_URL_KEY]
    });
    pickedAt = nowMs;
  }
  if (picked.page !== OBS_SERVICE_COMEVIEW_PAGE || !serviceStreamMatchesWatch(streamKey, picked.url)) return;
  const stored = bag?.[KEY_STATUS_UPLOAD_CONFIG];
  const uploadRaw = stored && typeof stored === 'object' ? /** @type {Record<string, unknown>} */ (stored) : {};
  const upload = {
    appOrigin: typeof uploadRaw.appOrigin === 'string' && uploadRaw.appOrigin ? uploadRaw.appOrigin : OBS_APP_ORIGIN,
    ingestKey: typeof uploadRaw.ingestKey === 'string' ? uploadRaw.ingestKey : undefined,
    viewToken: typeof uploadRaw.viewToken === 'string' ? uploadRaw.viewToken : undefined
  };
  creds = resolvePublishCredentials(upload, parseDeviceCred(bag?.[KEY_STATUS_DEVICE_CRED], upload.appOrigin));
  const beat = Number(bag?.[KEY_LIVE_EVENTS_SENDER_BEAT]) || 0;
  const publisherAlive = beat > 0 && nowMs - beat < OBS_PUBLISHER_BEAT_STALE_MS;
  await refreshViewer(nowMs);
  if (!shouldSendObsComments({ enabled: true, viewerActive, realtime, publisherAlive })) return;
  const tail = serviceItemsToLiveTail(streamKey, items, nowMs);
  if (!tail) return;
  if (!sender) sender = createLiveEventSender({ newSendId, post: postEvents });
  sender.ingest(tail);
  await sender.tick({ enabled: true, nowMs });
}
