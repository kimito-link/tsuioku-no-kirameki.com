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
  abPreferViewCount,
  abCounterValue,
  abChannelNameText,
  abChannelNameFromTitle,
  abReadProgramDetailAudience,
} from '../../src/lib/abema/abParse.js';
import {
  AB_OPEN_COMMENT_KEY,
  AB_PANEL_NOTE,
  AB_PANEL_POLL_MS,
  abOpenCommentEnabled,
  abImageScanDue,
  abShouldClaimActiveVideo,
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
/** @type {{ title: string, startedAtMs: number | null, views: number | null, comments: number | null, concurrent: number | null, imageUrl: string, channelId: string }} */
let program = { title: '', startedAtMs: null, views: null, comments: null, concurrent: null, imageUrl: '', channelId: '' };

/**
 * ページに出ている数（abbr.com-a-Counter）。title の正確な数を先に使う。
 * 2026-11-11 PC 実測（将棋チャンネル）: 視聴数は番組情報欄の
 * .com-tv-FeedProgramDetailViewCounter（表示「2.1 万」・title="21139」）。コメント欄を開くと番組情報欄は DOM から消える。
 * コメント数は下のバーの .com-tv-LinearFooterCommentButton__text（title="1707"）にどちらの状態でも残る。
 * @param {string[]} selectors
 */
function domCounter(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLElement)) continue;
      const abbr = el.matches('abbr') ? el : el.querySelector('abbr') || el;
      const n = abCounterValue(abbr.getAttribute('title'), abbr.textContent);
      if (n != null) return n;
    } catch {
      /* ページの形が違っても記録は続ける */
    }
  }
  return null;
}

/** 番組情報欄の視聴数（欄が開いているときだけ出ている）。おすすめ欄の別番組の数は拾わない。 */
function domSlotViews() {
  const n = domCounter(['.com-tv-FeedProgramDetailViewCounter abbr.com-a-Counter', '.com-tv-FeedProgramDetailViewCounter']);
  return n != null && n > 0 ? n : null;
}

/**
 * 最後に画面で読めた視聴数とコメント数。コメント欄を開くと番組情報欄は DOM から消える
 * (2026-11-11 PC 実測: 開いてから 2〜7 秒だけ出ていた)ので、見えているあいだに毎秒読んで残す。
 */
let lastDomViews = /** @type {number|null} */ (null);
let lastDomComments = /** @type {number|null} */ (null);
let lastDomViewText = '';

/** 「詳細情報をみる」の上に出ている 👁 1.6万 / 💬 1,339。クラス名が無くても読む。 */
function domDetailAudience() {
  try {
    return abReadProgramDetailAudience(document);
  } catch {
    return { views: /** @type {number|null} */ (null), comments: /** @type {number|null} */ (null), viewText: '' };
  }
}

function noteDomCounts() {
  if (!pageLogin) return;
  const detail = domDetailAudience();
  const v = domSlotViews() ?? (detail.views != null && detail.views > 0 ? detail.views : null);
  const rawComments = domSlotComments() ?? detail.comments;
  const c = rawComments != null && rawComments > 0 ? rawComments : null;
  let changed = false;
  if (v != null && v !== lastDomViews) {
    changed = lastDomViews == null;
    lastDomViews = v;
  }
  if (c != null && c !== lastDomComments) {
    changed = changed || lastDomComments == null;
    lastDomComments = c;
  }
  if (detail.viewText && detail.viewText !== lastDomViewText) {
    changed = changed || !lastDomViewText;
    lastDomViewText = detail.viewText;
  }
  // 初めて読めたときだけすぐ送る。あとは今までの間隔(sendMeta の呼び出し)で送る。
  if (changed && streamKey) sendMeta();
}

/** コメント数（下のバーのコメントボタン、無ければ番組情報欄）。入力欄の残り文字数（com-o-CommentForm__count）は数えない。 */
function domSlotComments() {
  return domCounter([
    '.com-tv-LinearFooterCommentButton__text abbr.com-a-Counter',
    '.com-tv-FeedProgramDetailCommentCounter abbr.com-a-Counter',
    '.com-tv-FeedProgramDetailCommentCounter',
  ]);
}

/**
 * チャンネル名（「将棋チャンネル」）。文字として出ている所は無く、ロゴの alt と document.title の頭だけ。
 * ロゴは見ているチャンネルのもの（/channels/<id>/）に絞る。チャンネル一覧には全チャンネル分のロゴがある。
 */
function domChannelName() {
  const want = abLinearChannelId(pageLogin);
  const sels = ['h1.com-tv-LinearFooter__logo img[alt]', '.com-tv-TVScreenPoster__channel-logo-wrapper img[alt]'];
  for (const sel of sels) {
    try {
      for (const img of document.querySelectorAll(sel)) {
        const src = img.getAttribute('src') || '';
        if (want && !src.includes(`/channels/${want}/`)) continue;
        const alt = abChannelNameText(img.getAttribute('alt'));
        if (alt) return alt;
      }
    } catch {
      /* ページの形が違っても記録は続ける */
    }
  }
  return abChannelNameFromTitle(document.title);
}

let sentIcon = '';
let imageScanAt = 0;
let cachedIcon = '';
let lastClaimAt = 0;
let lastClaimId = '';

/** ページに出ているチャンネル画像か番組画像。コメントした人の顔は集めない。毎秒は見ない。 */
function currentBroadcasterImage() {
  const now = Date.now();
  if (!abImageScanDue(imageScanAt, !!cachedIcon, now)) return cachedIcon;
  imageScanAt = now;
  /** @type {{ property: string, name: string, content: string }[]} */
  const metas = [];
  /** @type {string[]} */
  const images = [];
  try {
    for (const el of document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[property="og:image:url"]')) {
      metas.push({
        property: el.getAttribute('property') || '',
        name: el.getAttribute('name') || '',
        content: el.getAttribute('content') || '',
      });
    }
    const nodes = document.querySelectorAll('img[src*="hayabusa"], img[src*="abema"], img[srcset*="hayabusa"], img[srcset*="abema"], [style*="hayabusa"], [style*="abema"]');
    for (let i = 0; i < nodes.length && images.length < 8; i += 1) {
      const el = nodes[i];
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
  cachedIcon = pickAbBroadcasterImage({
    login: pageLogin,
    channelId: program.channelId,
    apiImage: program.imageUrl,
    metas,
    images,
  }) || '';
  return cachedIcon;
}

function tabForeground() {
  let visible = false;
  let focused = false;
  try {
    visible = document.visibilityState === 'visible';
    focused = typeof document.hasFocus === 'function' && document.hasFocus();
  } catch {
    /* 読めないタブは「いまの配信」を書かない */
  }
  return { visible, focused };
}

/** 見えているタブか操作中のタブだけ true。同じ配信の連打は間引く。前面に出たときは force。 */
function claimActiveNow(videoId, force) {
  const fg = tabForeground();
  const now = Date.now();
  const ok = abShouldClaimActiveVideo({
    visible: fg.visible,
    focused: fg.focused,
    videoId,
    lastVideoId: lastClaimId,
    now,
    lastClaimAt,
    force: !!force,
  });
  if (!ok) return false;
  lastClaimAt = now;
  lastClaimId = String(videoId || '');
  return true;
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
  safeSendMessage({
    type: 'YT_STREAM_META',
    payload: { videoId: ended, endedAt: Date.now(), claimActive: claimActiveNow(ended) },
  });
}

/** @param {boolean} [forceClaim] 前面に出たときだけ、間引きを飛ばして「いまの配信」を書く */
function sendMeta(forceClaim) {
  if (!streamKey) return;
  const title = program.title || pageTitle();
  diag.title = title;
  // 配信者の名前はチャンネル名（「将棋チャンネル」）。番組名やページタイトル全体は入れない。
  const channelName = domChannelName();
  /** @type {Record<string, unknown>} */
  const payload = {
    videoId: streamKey,
    title: title || channelName || 'ABEMAの配信',
    broadcasterName: channelName || 'ABEMA',
    broadcasterChannelId: `ab:@${pageLogin}`,
    broadcasterHandle: pageLogin,
    claimActive: claimActiveNow(streamKey, !!forceClaim),
  };
  const icon = currentBroadcasterImage();
  if (icon) {
    payload.broadcasterIconUrl = icon;
    sentIcon = icon;
  }
  // 画面に出ている数（title の正確な数）を先に使う。欄が閉じているあいだはページ自身の応答の数。
  const views = domSlotViews() ?? lastDomViews ?? (Number(program.views) > 0 ? abPreferViewCount(program.views, null) : null);
  if (views != null && views > 0) payload.slotViewCount = views;
  const comments = domSlotComments() ?? lastDomComments ?? program.comments;
  if (comments != null && comments > 0) payload.slotCommentCount = comments;
  if (lastDomViewText) payload.slotViewText = lastDomViewText;
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
  safeSendMessage({
    type: 'YT_CHAT_ITEMS',
    payload: { videoId: streamKey, chatFilterLabel: '', items: rows, claimActive: claimActiveNow(streamKey) },
  });
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

/** @param {boolean} [force] ページの移動で、見つけたあともう一度だけ探す */
function pollPanel(force) {
  if (!pageLogin || !settingReady) return;
  const st = panel.status();
  if (!force && (st.sawArea || st.gaveUp || st.userClosed)) return;
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
    if (streamKey && (Date.now() - metaAt > 30_000 || (!sentIcon && abImageScanDue(imageScanAt, false, Date.now())))) sendMeta();
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
  imageScanAt = 0;
  cachedIcon = '';
  program = { title: '', startedAtMs: null, views: null, comments: null, concurrent: null, imageUrl: '', channelId: '' };
  lastDomViews = null;
  lastDomComments = null;
  lastDomViewText = '';
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
    if (mine && Number(mine.comments) >= 0 && mine.comments != null) program.comments = Math.floor(Number(mine.comments));
    if (mine && Number(mine.startedAtMs) > 0) program.startedAtMs = Math.floor(Number(mine.startedAtMs));
    const incomingId = String(data.meta.channelId || '').toLowerCase();
    if (!rows.length && expectId && incomingId && incomingId !== expectId) return;
    const title = String(data.meta.title || '').slice(0, 200);
    if (title) program.title = title;
    if (Number(data.meta.startedAtMs) > 0) program.startedAtMs = Number(data.meta.startedAtMs);
    if (data.meta.views != null && Number.isFinite(Number(data.meta.views))) program.views = Number(data.meta.views);
    if (data.meta.comments != null && Number.isFinite(Number(data.meta.comments))) program.comments = Number(data.meta.comments);
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
  let path = location.pathname;
  const fire = () => {
    const next = location.pathname;
    const moved = next !== path;
    path = next;
    syncPage();
    if (!moved) return;
    panel.reset();
    lastPanelAt = 0;
    imageScanAt = 0;
    cachedIcon = '';
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
  noteDomCounts();
  pollPanel(false);
  maybeNote();
  syncSettingChip();
}, 1000);
let foregroundTimer = 0;
function claimWhenForeground() {
  if (foregroundTimer || !streamKey) return;
  foregroundTimer = setTimeout(() => {
    foregroundTimer = 0;
    const fg = tabForeground();
    if (!streamKey || (!fg.visible && !fg.focused)) return;
    sendMeta(true);
  }, 400);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') claimWhenForeground();
});
window.addEventListener('focus', claimWhenForeground);
window.addEventListener('pagehide', () => endStream());
