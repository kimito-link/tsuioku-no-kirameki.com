/**
 * 「OBSのブラウザへ送る」がオンのあいだだけ、視聴ページから新着を中継する。
 * 判定は src/lib/obsBrowserSource.js。送る係はスマホと同じ liveEventSender（約3秒・約5KB）。
 * オフのときはタイマーを置かない。状態速報の送信担当が生きているときは、こちらは送らない。
 */

import { resolvePublishCredentials, parseDeviceCred } from '../lib/devicePublishCredentials.js';
import { createLiveEventSender } from '../lib/liveEventSender.js';
import { KEY_LIVE_EVENTS_TAIL, KEY_LIVE_EVENTS_WANTED } from '../lib/liveEvents.js';
import {
  OBS_APP_ORIGIN,
  OBS_PRESENCE_POLL_MS,
  OBS_PUBLISHER_BEAT_STALE_MS,
  obsBrowserSourceOrDefault,
  shouldSendObsComments,
  wantedWritePlan
} from '../lib/obsBrowserSource.js';
import {
  KEY_LIVE_EVENTS_SENDER_BEAT,
  KEY_OBS_BROWSER_SOURCE,
  KEY_STATUS_DEVICE_CRED,
  KEY_STATUS_UPLOAD_CONFIG
} from '../lib/storageKeys.js';

const LOCK = 'nls-obs-browser-source';
const TICK_MS = 1000;

/** @type {boolean} */
let started = false;
/** @type {boolean} */
let enabled = false;
/** @type {boolean} */
let holding = false;
/** @type {(() => void) | null} */
let stopLock = null;
/** @type {ReturnType<typeof setInterval> | null} */
let presenceTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let sendTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let retryTimer = null;
/** @type {ReturnType<typeof createLiveEventSender> | null} */
let sender = null;
/** @type {ReturnType<typeof resolvePublishCredentials>} */
let creds = null;
let lastWritten = 0;
let sending = false;

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

function stopSending() {
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = null;
  sending = false;
  if (sender) void sender.tick({ enabled: false, nowMs: Date.now() });
}

async function releaseWanted() {
  try {
    const bag = await chrome.storage.local.get(KEY_LIVE_EVENTS_WANTED);
    const plan = wantedWritePlan({
      nowMs: Date.now(),
      enabled: false,
      sending: false,
      currentUntil: Number(bag?.[KEY_LIVE_EVENTS_WANTED]) || 0,
      lastWritten
    });
    lastWritten = 0;
    if (plan.write === null) return;
    await chrome.storage.local.set({ [KEY_LIVE_EVENTS_WANTED]: plan.write });
  } catch {
    /* 期限を戻せなくても、次の確認で送りは止める */
  }
}

function stop() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  stopSending();
  void releaseWanted();
  holding = false;
  if (stopLock) {
    const release = stopLock;
    stopLock = null;
    release();
  }
}

async function presence() {
  if (!enabled || !holding) return;
  const nowMs = Date.now();
  try {
    const bag = await chrome.storage.local.get([
      KEY_STATUS_DEVICE_CRED,
      KEY_STATUS_UPLOAD_CONFIG,
      KEY_LIVE_EVENTS_WANTED,
      KEY_LIVE_EVENTS_SENDER_BEAT,
      KEY_LIVE_EVENTS_TAIL
    ]);
    const upload = bag?.[KEY_STATUS_UPLOAD_CONFIG] && typeof bag[KEY_STATUS_UPLOAD_CONFIG] === 'object'
      ? bag[KEY_STATUS_UPLOAD_CONFIG]
      : { appOrigin: OBS_APP_ORIGIN };
    const origin = String(upload.appOrigin || OBS_APP_ORIGIN);
    creds = resolvePublishCredentials(upload, parseDeviceCred(bag?.[KEY_STATUS_DEVICE_CRED], origin));
    const beat = Number(bag?.[KEY_LIVE_EVENTS_SENDER_BEAT]) || 0;
    const publisherAlive = beat > 0 && nowMs - beat < OBS_PUBLISHER_BEAT_STALE_MS;
    let viewerActive = false;
    let realtime = false;
    if (creds) {
      const q = creds.mode === 'shared' ? `&v=${encodeURIComponent(creds.viewToken)}` : '';
      const res = await fetch(`${String(creds.appOrigin || origin).replace(/\/+$/, '')}/api/status?action=viewer${q}`, {
        headers: creds.headers,
        cache: 'no-store'
      });
      /** @type {any} */
      let j = null;
      try { j = await res.json(); } catch { j = null; }
      viewerActive = res.ok && j?.viewerActive === true;
      realtime = res.ok && j?.realtime === true;
    }
    const next = shouldSendObsComments({ enabled, viewerActive, realtime, publisherAlive });
    const plan = wantedWritePlan({
      nowMs,
      enabled,
      sending: next,
      currentUntil: Number(bag?.[KEY_LIVE_EVENTS_WANTED]) || 0,
      lastWritten
    });
    if (plan.write !== null) {
      lastWritten = plan.write;
      await chrome.storage.local.set({ [KEY_LIVE_EVENTS_WANTED]: plan.write });
    }
    if (!sender) {
      sender = createLiveEventSender({ newSendId, post: postEvents });
      sender.ingest(bag?.[KEY_LIVE_EVENTS_TAIL]);
    }
    sending = next;
    if (sending && !sendTimer) {
      sendTimer = setInterval(() => { void sender?.tick({ enabled: sending, nowMs: Date.now() }); }, TICK_MS);
    }
    if (!sending) stopSending();
  } catch {
    stopSending();
  }
}

function begin() {
  if (presenceTimer || !enabled) return;
  presenceTimer = setInterval(() => { void presence(); }, OBS_PRESENCE_POLL_MS);
  void presence();
}

function ensure() {
  if (holding || !enabled) return;
  const locks = globalThis.navigator?.locks;
  if (!locks || typeof locks.request !== 'function') {
    holding = true;
    begin();
    return;
  }
  void locks.request(LOCK, { ifAvailable: true }, (lock) => {
    if (!lock) {
      if (!retryTimer && enabled) retryTimer = setTimeout(() => { retryTimer = null; ensure(); }, 30_000);
      return undefined;
    }
    holding = true;
    begin();
    return new Promise((release) => { stopLock = release; });
  }).catch(() => {
    if (!holding && enabled) {
      holding = true;
      begin();
    }
  });
}

/** 視聴ページの起動時に1回。オフなら何もしない。 */
export function startObsBrowserSource() {
  if (started || typeof chrome === 'undefined' || !chrome.storage?.local) return;
  started = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY_OBS_BROWSER_SOURCE]) {
      enabled = obsBrowserSourceOrDefault(changes[KEY_OBS_BROWSER_SOURCE].newValue).enabled;
      if (enabled) ensure();
      else stop();
    }
    if (changes[KEY_LIVE_EVENTS_TAIL] && sender) sender.ingest(changes[KEY_LIVE_EVENTS_TAIL].newValue);
  });
  void chrome.storage.local.get(KEY_OBS_BROWSER_SOURCE).then((bag) => {
    enabled = obsBrowserSourceOrDefault(bag?.[KEY_OBS_BROWSER_SOURCE]).enabled;
    if (enabled) ensure();
  }).catch(() => {});
}
