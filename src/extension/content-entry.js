import { extractLiveIdFromUrl, isNicoLiveWatchUrl } from '../lib/broadcastUrl.js';
import { KEY_RECORDING, commentsStorageKey } from '../lib/storageKeys.js';
import { mergeNewComments } from '../lib/commentRecord.js';
import { extractCommentsFromNode } from '../lib/nicoliveDom.js';
import {
  findCommentListScrollHost,
  findNicoCommentPanel,
  harvestVirtualCommentList
} from '../lib/commentHarvest.js';

const DEBOUNCE_MS = 800;
const LIVE_POLL_MS = 4000;
const DEEP_HARVEST_DELAY_MS = 1200;
const BOOTSTRAP_DELAYS_MS = [400, 2000, 4500];

let recording = false;
let liveId = null;
/** @type {Set<Element|Node>} */
const pendingRoots = new Set();
let flushTimer = null;
let observer = null;
let harvestRunning = false;
/** @type {WeakMap<Element, true>} */
const scrollHooked = new WeakMap();

async function readRecordingFlag() {
  const r = await chrome.storage.local.get(KEY_RECORDING);
  return r[KEY_RECORDING] === true;
}

async function persistCommentRows(rows) {
  if (
    !rows?.length ||
    !recording ||
    !liveId ||
    !isNicoLiveWatchUrl(window.location.href)
  ) {
    return;
  }
  const key = commentsStorageKey(liveId);
  const bag = await chrome.storage.local.get(key);
  const existing = Array.isArray(bag[key]) ? bag[key] : [];
  const { next } = mergeNewComments(liveId, existing, rows);
  await chrome.storage.local.set({ [key]: next });
}

function syncLiveIdFromLocation() {
  if (!isNicoLiveWatchUrl(window.location.href)) {
    liveId = null;
    return;
  }
  const next = extractLiveIdFromUrl(window.location.href);
  if (next !== liveId) {
    liveId = next;
    pendingRoots.add(document.body);
    scheduleFlush();
    scheduleDeepHarvest('liveId-change');
  }
}

function enqueueNode(node) {
  if (!node) return;
  if (node.nodeType === Node.ELEMENT_NODE) {
    pendingRoots.add(node);
  } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    node.childNodes.forEach((c) => enqueueNode(c));
  }
}

async function flushToStorage() {
  if (
    !recording ||
    !liveId ||
    !isNicoLiveWatchUrl(window.location.href) ||
    !pendingRoots.size
  ) {
    pendingRoots.clear();
    return;
  }

  const rows = [];
  for (const n of pendingRoots) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      extractCommentsFromNode(/** @type {Element} */ (n)).forEach((r) =>
        rows.push(r)
      );
    }
  }
  pendingRoots.clear();

  if (!rows.length) return;
  await persistCommentRows(rows);
}

function scheduleFlush() {
  if (!recording || !liveId) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushToStorage().catch(() => {});
  }, DEBOUNCE_MS);
}

let deepHarvestTimer = null;
function scheduleDeepHarvest(_reason) {
  if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) return;
  if (deepHarvestTimer) clearTimeout(deepHarvestTimer);
  deepHarvestTimer = setTimeout(() => {
    deepHarvestTimer = null;
    runDeepHarvest().catch(() => {});
  }, DEEP_HARVEST_DELAY_MS);
}

async function runDeepHarvest() {
  if (
    harvestRunning ||
    !recording ||
    !liveId ||
    !isNicoLiveWatchUrl(window.location.href)
  ) {
    return;
  }
  harvestRunning = true;
  try {
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode,
      waitMs: 55
    });
    await persistCommentRows(rows);
  } finally {
    harvestRunning = false;
  }
}

function scanVisibleCommentsNow() {
  if (!recording || !liveId || !isNicoLiveWatchUrl(window.location.href)) return;
  const panel = findNicoCommentPanel(document);
  const root = panel || document.body;
  const rows = extractCommentsFromNode(root);
  void persistCommentRows(rows);
}

function attachCommentScrollHook() {
  const host = findCommentListScrollHost(document);
  if (!host || scrollHooked.has(host)) return false;
  scrollHooked.set(host, true);
  let t = null;
  host.addEventListener(
    'scroll',
    () => {
      if (!recording || !liveId) return;
      clearTimeout(t);
      t = setTimeout(() => scanVisibleCommentsNow(), 550);
    },
    { passive: true }
  );
  return true;
}

function tryAttachScrollHookSoon() {
  if (attachCommentScrollHook()) return;
  let n = 0;
  const id = setInterval(() => {
    n++;
    if (attachCommentScrollHook() || n > 40) clearInterval(id);
  }, 800);
}

async function start() {
  recording = await readRecordingFlag();
  syncLiveIdFromLocation();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY_RECORDING]) return;
    recording = changes[KEY_RECORDING].newValue === true;
    if (recording) {
      pendingRoots.add(document.body);
      scheduleFlush();
      scheduleDeepHarvest('recording-on');
      tryAttachScrollHookSoon();
    }
  });

  observer = new MutationObserver((records) => {
    if (
      !recording ||
      !liveId ||
      !isNicoLiveWatchUrl(window.location.href)
    ) {
      return;
    }
    for (const rec of records) {
      rec.addedNodes.forEach((n) => enqueueNode(n));
    }
    if (pendingRoots.size) scheduleFlush();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  if (recording && liveId) {
    pendingRoots.add(document.body);
    scheduleFlush();
    scheduleDeepHarvest('startup');
    tryAttachScrollHookSoon();
    for (const ms of BOOTSTRAP_DELAYS_MS) {
      setTimeout(() => {
        if (recording && liveId && isNicoLiveWatchUrl(window.location.href)) {
          scanVisibleCommentsNow();
        }
      }, ms);
    }
  }

  setInterval(() => {
    syncLiveIdFromLocation();
  }, LIVE_POLL_MS);
}

start().catch(() => {});
