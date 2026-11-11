// ab-content-entry.js — ABEMA の放送ページで、ページが受け取ったコメントを記録に渡す入口。
/* global chrome, location, setTimeout, setInterval, window, document, KeyboardEvent, InputEvent */
//
// ★写し役(ab-main-entry.js)の postMessage だけを読む。別ホストへ取りに行かない。
//   記録は YT_STREAM_META / YT_CHAT_ITEMS。読み上げと会場の PICK UP は、この口に載ったコメントを
//   ほかの配信と同じく扱う。再生位置から離れた過去分はパーサーが落とす。
//   配信キーは ab.<login>.<チャット>。チャットが変わったら前のキーを終わらせる。

import {
  parseAbLoginFromUrl,
  buildAbStreamKey,
  abMessagesNearPlayhead,
  abCommentRow,
} from '../../src/lib/abema/abParse.js';
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
/** @type {{ title: string, startedAtMs: number | null, viewers: number | null }} */
let program = { title: '', startedAtMs: null, viewers: null };

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
    broadcasterIconUrl: '',
  };
  if (program.viewers != null && program.viewers >= 0) payload.concurrentViewers = program.viewers;
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

function maybeNote() {
  if (!pageLogin || sawPayload || dismissed) {
    if (sawPayload) hideNote();
    return;
  }
  if (denied) {
    showNote('追憶のきらめき: コメントを読めませんでした。ログインが必要な配信かもしれません。');
    return;
  }
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
    if (streamKey && Date.now() - metaAt > 30_000) sendMeta();
    return;
  }
  endStream();
  pageLogin = login;
  chatId = '';
  sawPayload = false;
  denied = false;
  dismissed = false;
  watchStartedAt = login ? Date.now() : 0;
  program = { title: '', startedAtMs: null, viewers: null };
  seen = new Set();
  pending = [];
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
    program = {
      title: String(data.meta.title || '').slice(0, 200),
      startedAtMs: Number(data.meta.startedAtMs) > 0 ? Number(data.meta.startedAtMs) : null,
      viewers: data.meta.viewers == null ? null : Number(data.meta.viewers),
    };
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

syncPage();
setInterval(() => {
  syncPage();
  maybeNote();
}, 1000);
window.addEventListener('pagehide', () => endStream());
