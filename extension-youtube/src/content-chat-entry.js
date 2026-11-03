// content-chat-entry.js — YouTube Live チャット欄 DOM の監視・コメント取得 Content Script
/* global chrome, window, document, MutationObserver, URL, URLSearchParams, setTimeout, setInterval */

import { parseYtChatElement } from '../../src/lib/youtube/ytChatParse.js';

const CHAT_ITEM_SELECTOR = [
  'yt-live-chat-text-message-renderer',
  'yt-live-chat-paid-message-renderer',
  'yt-live-chat-paid-sticker-renderer',
  'yt-live-chat-membership-item-renderer',
  'ytd-sponsorships-live-chat-gift-purchase-announcement-renderer',
  'yt-live-chat-sponsorships-gift-purchase-announcement-renderer',
  'yt-gift-message-view-model',
].join(', ');

const MAX_SEEN_IDS = 5000;

/**
 * 現在のページまたは親フレームから YouTube の videoId を特定する。
 * @returns {string}
 */
function resolveCurrentVideoId() {
  try {
    const ownV = new URLSearchParams(window.location.search).get('v');
    if (ownV) return ownV.trim();
  } catch {
    // ignore
  }

  try {
    if (window.top && window.top !== window) {
      const topV = new URLSearchParams(window.top.location.search).get('v');
      if (topV) return topV.trim();
    }
  } catch {
    // cross-origin 時は参照不可
  }

  try {
    if (document.referrer) {
      const refUrl = new URL(document.referrer);
      const refV = refUrl.searchParams.get('v');
      if (refV) return refV.trim();
    }
  } catch {
    // ignore
  }

  return '';
}

/**
 * チャットヘッダーの表示モード（「トップチャット」／「すべてのチャット」等）を取得する。
 * @returns {string}
 */
function readChatFilterLabel() {
  try {
    const labelEl = document.querySelector(
      'yt-sort-filter-sub-menu-renderer #label, yt-live-chat-header-renderer #trigger #label',
    );
    return String(labelEl?.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * Service Worker へ安全にメッセージを送る（拡張リロード時の context invalidated を握りつぶす）。
 * @param {any} msg
 */
function safeSendMessage(msg) {
  try {
    if (!chrome?.runtime?.id) return;
    chrome.runtime.sendMessage(msg, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // context invalidated
  }
}

/**
 * 視聴ページ（/watch）で配信タイトル・配信者名を拾って SW へ通知する。
 */
function setupWatchPageMetaObserver() {
  const sendMeta = () => {
    const videoId = resolveCurrentVideoId();
    if (!videoId) return;

    const titleEl = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string',
    );
    const rawTitle =
      String(titleEl?.textContent || '').replace(/\s+/g, ' ').trim() ||
      String(document.title || '').replace(/\s*-\s*YouTube$/i, '').trim();

    const ownerNameEl = document.querySelector(
      '#owner #channel-name a, ytd-video-owner-renderer #channel-name a, #upload-info #channel-name a',
    );
    const broadcasterName = String(ownerNameEl?.textContent || '').replace(/\s+/g, ' ').trim();

    const ownerLinkEl = document.querySelector(
      '#owner a[href*="/channel/UC"], ytd-video-owner-renderer a[href*="/channel/UC"]',
    );
    const href = String(ownerLinkEl?.getAttribute('href') || '');
    const ucMatch = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
    const broadcasterChannelId = ucMatch ? ucMatch[1] : '';

    safeSendMessage({
      type: 'YT_STREAM_META',
      payload: {
        videoId,
        title: rawTitle,
        broadcasterName,
        broadcasterChannelId,
      },
    });
  };

  sendMeta();
  setTimeout(sendMeta, 1500);
  setTimeout(sendMeta, 4000);
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(sendMeta, 800);
  });
}

/**
 * チャット iframe（/live_chat, /live_chat_replay）でコメント要素を監視・収集する。
 */
function setupLiveChatObserver() {
  /** @type {Set<string>} */
  const seenIds = new Set();
  /** @type {any[]} */
  let pendingBatch = [];
  /** @type {any} */
  let flushTimer = null;
  let lastFilterLabel = '';

  const rememberId = (id) => {
    seenIds.add(id);
    if (seenIds.size > MAX_SEEN_IDS) {
      const first = seenIds.values().next().value;
      if (first) seenIds.delete(first);
    }
  };

  const flushBatch = () => {
    flushTimer = null;
    const filterLabel = readChatFilterLabel();
    if (pendingBatch.length === 0 && filterLabel === lastFilterLabel) return;
    lastFilterLabel = filterLabel;

    const items = pendingBatch;
    pendingBatch = [];
    safeSendMessage({
      type: 'YT_CHAT_ITEMS',
      payload: {
        videoId: resolveCurrentVideoId(),
        chatFilterLabel: filterLabel,
        items,
      },
    });
  };

  const queueFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flushBatch, 150);
  };

  const inspectElement = (el, allowRetry = true) => {
    if (!el || typeof el.tagName !== 'string') return;
    const rawId = String(el.getAttribute?.('id') || '').trim();
    if (rawId && seenIds.has(rawId)) return;

    const parsed = parseYtChatElement(el);
    if (!parsed) {
      if (allowRetry) {
        setTimeout(() => inspectElement(el, false), 120);
      }
      return;
    }
    if (seenIds.has(parsed.id)) return;
    rememberId(parsed.id);
    pendingBatch.push(parsed);
    queueFlush();
  };

  const scanAllExisting = (root = document) => {
    try {
      const nodes = root.querySelectorAll(CHAT_ITEM_SELECTOR);
      for (let i = 0; i < nodes.length; i += 1) {
        inspectElement(nodes[i], true);
      }
      queueFlush();
    } catch {
      // fail-soft
    }
  };

  scanAllExisting(document);

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i += 1) {
      const added = mutations[i].addedNodes;
      if (!added) continue;
      for (let j = 0; j < added.length; j += 1) {
        const node = /** @type {any} */ (added[j]);
        if (!node || node.nodeType !== 1) continue;
        if (typeof node.matches === 'function' && node.matches(CHAT_ITEM_SELECTOR)) {
          inspectElement(node, true);
        }
        if (typeof node.querySelectorAll === 'function') {
          const children = node.querySelectorAll(CHAT_ITEM_SELECTOR);
          for (let k = 0; k < children.length; k += 1) {
            inspectElement(children[k], true);
          }
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // フィルタ切替（「トップチャット」⇄「すべてのチャット」）の定期検知
  setInterval(() => {
    scanAllExisting(document);
  }, 2000);
}

function init() {
  const path = String(window.location.pathname || '');
  if (path.startsWith('/live_chat')) {
    setupLiveChatObserver();
  } else if (path.startsWith('/watch')) {
    setupWatchPageMetaObserver();
  }
}

init();
