// ab-content-entry.js — ABEMA の放送ページで、ページが受け取ったコメントを記録に渡す入口。
/* global chrome, location, setTimeout, setInterval, window, document, KeyboardEvent, InputEvent */
//
// ★写し役(ab-main-entry.js)の postMessage だけを読む。別ホストへ取りに行かない。
//   記録は YT_STREAM_META / YT_CHAT_ITEMS。画面に出ている分は全部渡す。
//   読み上げと会場の PICK UP は、新しい端だけ（過去分は skipVoice）。
//   配信キーは ab.<login>.<チャット>。チャットが変わったら前のキーを終わらせる。

import {
  parseAbLoginFromUrl,
  buildAbStreamKey,
  abMessagesNearPlayhead,
  abCommentRow,
  pickAbBroadcasterImage,
  abLinearChannelId,
  abUrlsFromCss,
  abUrlsFromSrcset,
  abViewsFromSnippets,
  abPreferViewCount,
  abViewCounterText,
} from '../../src/lib/abema/abParse.js';
import {
  AB_OPEN_COMMENT_KEY,
  AB_PANEL_NOTE,
  AB_PANEL_POLL_MS,
  abOpenCommentEnabled,
  createAbPanelController,
  stepAbCommentPanel,
  abCommentsLookOpen,
} from '../../src/lib/abema/abCommentPanel.js';
import { makeDiagTabToken, shouldSkipDiagWrite } from '../../src/lib/platform/diagTabShare.js';

const OUT = 'nl-ab-iso';
const IN = 'nl-ab-main';
const NOTE_ID = 'nl-ab-note';
const WAIT_MS = 25_000;
const MAX_SEEN = 4000;

const diag = {
  updatedAt: 0,
  pageLogin: '',
  streamKey: '',
  chatId: '',
  batches: 0,
  items: 0,
  dropped: 0,
  denied: false,
  sawPayload: false,
  title: '',
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

const TAB_TOKEN = makeDiagTabToken();
let diagTimer = 0;
function saveDiagSoon() {
  if (diagTimer) return;
  diagTimer = setTimeout(() => {
    diagTimer = 0;
    diag.updatedAt = Date.now();
    const snap = { ...diag, tab: TAB_TOKEN };
    try {
      void Promise.resolve(diag.streamKey ? null : chrome.storage.local.get('yt_diag_ab_chat'))
        .then((bag) => {
          if (shouldSkipDiagWrite(bag?.yt_diag_ab_chat, { tab: TAB_TOKEN, streamKey: diag.streamKey, now: Date.now() })) return;
          return chrome.storage.local.set({ yt_diag_ab_chat: snap });
        })
        .catch(() => {});
    } catch {
      /* no-op */
    }
  }, 2000);
}

let pageLogin = '';
let streamKey = '';
let chatId = '';
let sawPayload = false;
let denied = false;
let dismissed = false;
let watchStartedAt = 0;
/** @type {Set<string>} */
let seen = new Set();
/** @type {any[]} */
let pending = [];
let flushTimer = 0;
let metaAt = 0;
/** @type {{ title: string, startedAtMs: number | null, views: number | null, concurrent: number | null, imageUrl: string, channelId: string }} */
let program = { title: '', startedAtMs: null, views: null, concurrent: null, imageUrl: '', channelId: '' };

/** 番組詳細に出ている「3.7万」だけを拾う。コメント件数の 3,662 は万が付かないので入れない。 */
function domSlotViews() {
  try {
    const counter = document.querySelector('.com-tv-FeedProgramDetailViewCounter');
    if (counter instanceof HTMLElement) {
      const n = abViewCounterText(counter.textContent);
      if (n != null) return n;
    }
  } catch {
    /* ページの形が違っても記録は続ける */
  }
  /** @type {{ text: string, label: string }[]} */
  const snippets = [];
  try {
    const nodes = document.querySelectorAll('span, button, a, p, dd');
    for (let i = 0; i < nodes.length && snippets.length < 12; i += 1) {
      const el = nodes[i];
      if (!(el instanceof HTMLElement) || el.childElementCount > 1) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 12 || !/[万億]/.test(text)) continue;
      const parent = el.parentElement;
      const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${parent?.getAttribute('aria-label') || ''} ${String(parent?.className || '')}`;
      snippets.push({ text, label });
    }
  } catch {
    /* ページの形が違っても記録は続ける */
  }
  return abViewsFromSnippets(snippets);
}
let sentIcon = '';

/** ページに出ているチャンネル画像か番組画像。コメントした人の顔は集めない。 */
function currentBroadcasterImage() {
  /** @type {{ property: string, name: string, content: string }[]} */
  const metas = [];
  /** @type {string[]} */
  const images = [];
  try {
    for (const el of document.querySelectorAll('meta[property], meta[name]')) {
      const property = el.getAttribute('property') || '';
      const name = el.getAttribute('name') || '';
      if (!/^(?:og:image|twitter:image)/i.test(property || name)) continue;
      metas.push({ property, name, content: el.getAttribute('content') || '' });
    }
    for (const el of document.querySelectorAll('img, [style*="abema"], [style*="hayabusa"]')) {
      if (images.length >= 30) break;
      if (el instanceof HTMLImageElement) {
        const src = el.currentSrc || el.getAttribute('src') || '';
        if (/hayabusa\.io|abema(?:-tv)?\.(?:com|tv|io)/i.test(src)) images.push(src);
        images.push(...abUrlsFromSrcset(el.getAttribute('srcset') || ''));
      }
      images.push(...abUrlsFromCss(el.getAttribute('style') || ''));
    }
  } catch {
    /* ページの形が違っても記録は続ける */
  }
  return pickAbBroadcasterImage({
    login: pageLogin,
    channelId: program.channelId,
    apiImage: program.imageUrl,
    metas,
    images,
  });
}

function pageTitle() {
  const t = String(document.title || '').replace(/\s*[|｜]\s*ABEMA\s*$/i, '').trim();
  return t && t !== 'ABEMA' && t !== 'エラー' ? t.slice(0, 200) : '';
}

function endStream() {
  if (!streamKey) return;
  const ended = streamKey;
  streamKey = '';
  diag.streamKey = '';
  safeSendMessage({ type: 'YT_STREAM_META', payload: { videoId: ended, endedAt: Date.now() } });
}

function sendMeta() {
  if (!streamKey) return;
  const title = program.title || pageTitle();
  diag.title = title;
  /** @type {Record<string, unknown>} */
  const payload = {
    videoId: streamKey,
    title: title || 'ABEMAの配信',
    broadcasterName: title || 'ABEMAの配信',
    broadcasterChannelId: `ab:@${pageLogin}`,
    broadcasterHandle: pageLogin,
  };
  const icon = currentBroadcasterImage();
  if (icon) {
    payload.broadcasterIconUrl = icon;
    sentIcon = icon;
  }
  const views = abPreferViewCount(program.views, domSlotViews());
  if (views != null) payload.slotViewCount = views;
  if (program.concurrent != null && program.concurrent >= 0) payload.concurrentViewers = program.concurrent;
  if (program.startedAtMs) {
    payload.startedAt = program.startedAtMs;
    payload.startedAtApprox = false;
  }
  safeSendMessage({ type: 'YT_STREAM_META', payload });
  metaAt = Date.now();
  saveDiagSoon();
}

function flush() {
  flushTimer = 0;
  if (!pending.length || !streamKey) {
    pending = [];
    return;
  }
  const rows = pending;
  pending = [];
  diag.items += rows.length;
  safeSendMessage({ type: 'YT_CHAT_ITEMS', payload: { videoId: streamKey, chatFilterLabel: '', items: rows } });
  saveDiagSoon();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 200);
}

/** @param {string} text */
function showNote(text) {
  if (dismissed || !document.body) return;
  let box = document.getElementById(NOTE_ID);
  if (!box) {
    box = document.createElement('div');
    box.id = NOTE_ID;
    box.setAttribute('role', 'status');
    box.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:2147483646',
      'max-width:min(320px,calc(100vw - 24px))',
      'padding:10px 32px 10px 12px',
      'border-radius:10px',
      'background:rgba(20,20,28,.92)',
      'color:#fff',
      'font:13px/1.5 system-ui,sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,.35)',
    ].join(';');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '閉じる');
    close.style.cssText = 'position:absolute;top:4px;right:6px;border:0;background:none;color:#fff;font-size:16px;cursor:pointer';
    close.addEventListener('click', () => {
      dismissed = true;
      box?.remove();
    });
    box.appendChild(close);
    document.body.appendChild(box);
  }
  const label = box.querySelector('[data-nl-ab-label]') || document.createElement('span');
  label.setAttribute('data-nl-ab-label', '1');
  label.textContent = text;
  if (!label.parentNode) box.insertBefore(label, box.firstChild);
}

function hideNote() {
  document.getElementById(NOTE_ID)?.remove();
}

const panel = createAbPanelController();
let autoOpen = true;
let settingReady = false;
let lastPanelAt = 0;

function loadAutoOpen() {
  try {
    chrome.storage.local.get(AB_OPEN_COMMENT_KEY, (bag) => {
      autoOpen = abOpenCommentEnabled(bag?.[AB_OPEN_COMMENT_KEY]);
      settingReady = true;
      syncSettingChip();
      pollPanel(true);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes?.[AB_OPEN_COMMENT_KEY]) return;
      autoOpen = abOpenCommentEnabled(changes[AB_OPEN_COMMENT_KEY].newValue);
      syncSettingChip();
    });
  } catch {
    settingReady = true;
  }
}

function syncSettingChip() {
  if (!pageLogin || !document.body) {
    document.getElementById('nl-ab-open')?.remove();
    return;
  }
  let box = document.getElementById('nl-ab-open');
  if (!box) {
    box = document.createElement('label');
    box.id = 'nl-ab-open';
    box.style.cssText = [
      'position:fixed',
      'left:12px',
      'bottom:12px',
      'z-index:2147483646',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'max-width:min(280px,calc(100vw - 24px))',
      'padding:8px 10px',
      'border-radius:10px',
      'background:rgba(20,20,28,.92)',
      'color:#fff',
      'font:12px/1.4 system-ui,sans-serif',
    ].join(';');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = autoOpen;
    input.addEventListener('change', () => {
      autoOpen = input.checked;
      try {
        chrome.storage.local.set({ [AB_OPEN_COMMENT_KEY]: input.checked });
      } catch {
        /* 拡張が入れ替わった直後 */
      }
    });
    const span = document.createElement('span');
    span.textContent = 'コメント欄を自動で開く';
    box.append(input, span);
    document.body.appendChild(box);
  }
  const input = box.querySelector('input');
  if (input instanceof HTMLInputElement && input.checked !== autoOpen) input.checked = autoOpen;
}

/** @param {boolean} [force] */
function pollPanel(force) {
  if (!pageLogin || !settingReady) return;
  const now = Date.now();
  if (!force && now - lastPanelAt < AB_PANEL_POLL_MS) return;
  lastPanelAt = now;
  stepAbCommentPanel(panel, document, { enabled: autoOpen, now, arrived: sawPayload });
}

function panelNeedsHand() {
  if (sawPayload || abCommentsLookOpen(document)) return false;
  const st = panel.status();
  return !!(st.userClosed || st.gaveUp);
}

function maybeNote() {
  if (!pageLogin || sawPayload || dismissed) {
    if (sawPayload) hideNote();
    return;
  }
  if (denied) {
    showNote('追憶のきらめき: コメントを読めませんでした。ログインが必要な配信かもしれません。');
    return;
  }
  if (panelNeedsHand()) {
    showNote(`追憶のきらめき: ${AB_PANEL_NOTE}`);
    return;
  }
  const opening = panel.status();
  if (autoOpen && !opening.gaveUp && !opening.userClosed && !abCommentsLookOpen(document)) return;
  if (watchStartedAt && Date.now() - watchStartedAt >= WAIT_MS) {
    showNote('追憶のきらめき: このページのコメントはまだ届いていません。コメントが出る配信で、再生が進むと記録します。');
  }
}

/** @param {any} body @param {number | null} sinceMs @param {number | null} untilMs */
function onBatch(body, sinceMs, untilMs) {
  if (!pageLogin || !body || !Array.isArray(body.messages)) return;
  sawPayload = true;
  diag.sawPayload = true;
  diag.batches += 1;
  hideNote();
  const nextChat = String(body.chatId || chatId || 'live');
  if (nextChat !== chatId) {
    endStream();
    chatId = nextChat;
    diag.chatId = chatId;
    seen = new Set();
  }
  const key = buildAbStreamKey(pageLogin, { session: chatId });
  if (!key) return;
  if (key !== streamKey) {
    endStream();
    streamKey = key;
    diag.streamKey = key;
    sendMeta();
  }
  const near = abMessagesNearPlayhead(body.messages, { sinceMs, untilMs });
  const now = Date.now();
  for (const msg of near) {
    const row = abCommentRow(msg, { pageLogin, nowMs: now });
    if (!row || seen.has(row.id)) {
      if (!row) diag.dropped += 1;
      continue;
    }
    seen.add(row.id);
    if (seen.size > MAX_SEEN) seen.delete(/** @type {string} */ (seen.values().next().value));
    pending.push(row);
  }
  if (pending.length) scheduleFlush();
  else saveDiagSoon();
}

function syncPage() {
  const login = parseAbLoginFromUrl(location.href);
  if (login === pageLogin) {
    maybeNote();
    const icon = pageLogin ? currentBroadcasterImage() : '';
    if (streamKey && ((icon && icon !== sentIcon) || Date.now() - metaAt > 30_000)) sendMeta();
    return;
  }
  endStream();
  pageLogin = login;
  chatId = '';
  sawPayload = false;
  denied = false;
  dismissed = false;
  watchStartedAt = login ? Date.now() : 0;
  sentIcon = '';
  program = { title: '', startedAtMs: null, views: null, concurrent: null, imageUrl: '', channelId: '' };
  seen = new Set();
  pending = [];
  panel.reset();
  lastPanelAt = 0;
  diag.pageLogin = login;
  diag.chatId = '';
  diag.denied = false;
  diag.sawPayload = false;
  diag.title = '';
  hideNote();
  saveDiagSoon();
}

window.addEventListener('message', (ev) => {
  if (ev.source !== window || ev.origin !== location.origin) return;
  const data = ev.data;
  if (!data || data.source !== IN) return;
  if (data.t === 'batch') onBatch(data.body, data.sinceMs, data.untilMs);
  else if (data.t === 'meta' && data.meta) {
    const expectId = abLinearChannelId(pageLogin);
    const rows = Array.isArray(data.meta.slotRows) ? data.meta.slotRows : [];
    const mine = rows.find((r) => expectId && String(r?.channelId || '').toLowerCase() === expectId);
    if (mine && Number(mine.views) > 0) program.views = Math.floor(Number(mine.views));
    if (mine && Number(mine.startedAtMs) > 0) program.startedAtMs = Math.floor(Number(mine.startedAtMs));
    const incomingId = String(data.meta.channelId || '').toLowerCase();
    if (!rows.length && expectId && incomingId && incomingId !== expectId) return;
    const title = String(data.meta.title || '').slice(0, 200);
    if (title) program.title = title;
    if (Number(data.meta.startedAtMs) > 0) program.startedAtMs = Number(data.meta.startedAtMs);
    if (data.meta.views != null && Number.isFinite(Number(data.meta.views))) program.views = Number(data.meta.views);
    if (data.meta.concurrent != null && Number.isFinite(Number(data.meta.concurrent))) program.concurrent = Number(data.meta.concurrent);
    if (data.meta.imageUrl) program.imageUrl = String(data.meta.imageUrl);
    if (incomingId) program.channelId = incomingId;
    if (streamKey) sendMeta();
  } else if (data.t === 'denied') {
    denied = true;
    diag.denied = true;
    maybeNote();
    saveDiagSoon();
  }
});

try {
  window.postMessage({ source: OUT, t: 'hello' }, location.origin);
} catch {
  /* まだページの世界が無い */
}

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** @param {string} reason */
function noteSendFail(reason) {
  try {
    void chrome.storage.local.set({ yt_diag_ab_send_fail: { at: Date.now(), reason, pageLogin } });
  } catch {
    /* no-op */
  }
}

function findComposer() {
  const nodes = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
  for (const el of nodes) {
    if (!(el instanceof HTMLElement) || !el.getClientRects().length) continue;
    const ph = `${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-placeholder') || ''}`;
    if (/コメント/.test(ph)) return el;
  }
  return null;
}

try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== 'AB_SEND_COMMENT') return undefined;
    (async () => {
      const text = String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
      if (!text) return { ok: false, reason: 'empty' };
      let input = findComposer();
      for (let i = 0; !input && i < 6; i += 1) {
        await sleep(250);
        input = findComposer();
      }
      if (!input) {
        noteSendFail('no-input');
        return { ok: false, reason: 'no-input' };
      }
      const ph = `${input.getAttribute('placeholder') || ''} ${input.getAttribute('aria-label') || ''}`;
      if (/ログイン/.test(ph)) {
        noteSendFail('not-signed-in');
        return { ok: false, reason: 'not-signed-in' };
      }
      input.focus();
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        input.value = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      } else {
        try {
          document.execCommand('selectAll', false);
          document.execCommand('insertText', false, text);
        } catch {
          input.textContent = text;
          input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        }
      }
      await sleep(150);
      const btn = [...document.querySelectorAll('button')].find((b) => /送信/.test(`${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`));
      if (btn instanceof HTMLElement) btn.click();
      else {
        const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        input.dispatchEvent(new KeyboardEvent('keydown', opts));
        input.dispatchEvent(new KeyboardEvent('keyup', opts));
      }
      await sleep(400);
      const left = input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement
        ? input.value.trim()
        : String(input.innerText || input.textContent || '').trim();
      const ok = left !== text;
      if (!ok) noteSendFail('still-in-box');
      return { ok, reason: ok ? '' : 'still-in-box' };
    })()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, reason: String(e) }));
    return true;
  });
} catch {
  /* 拡張が入れ替わった直後 */
}

function watchSpaNavigation() {
  const fire = () => {
    syncPage();
    pollPanel(true);
  };
  window.addEventListener('popstate', fire);
  /** @param {'pushState' | 'replaceState'} name */
  const wrap = (name) => {
    const hist = history;
    const orig = hist[name];
    if (typeof orig !== 'function') return;
    const mark = `__nlAb${name}`;
    if (/** @type {any} */ (hist)[mark]) return;
    /** @type {any} */ (hist)[mark] = true;
    hist[name] = function abHistory(...args) {
      const ret = orig.apply(this, args);
      try {
        fire();
      } catch {
        /* ページの遷移は止めない */
      }
      return ret;
    };
  };
  try {
    wrap('pushState');
    wrap('replaceState');
  } catch {
    /* 履歴を包めなくても、1秒ごとの確認でチャンネル切り替えに追いつく */
  }
}

loadAutoOpen();
syncPage();
watchSpaNavigation();
setInterval(() => {
  syncPage();
  pollPanel(false);
  maybeNote();
  syncSettingChip();
}, 1000);
window.addEventListener('pagehide', () => endStream());
