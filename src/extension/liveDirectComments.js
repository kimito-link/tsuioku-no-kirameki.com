/**
 * liveDirectComments.js — iPhone アプリの中だけで、ニコ生のコメントを端末が直接受け取って流す(拡張なし 第3段)。
 *
 * ■ 何をするか
 *   /live?lv=lvNNN を iPhone アプリ(mobile/・Capacitor の server.url 型)で開いたときだけ、
 *   「💬 コメントを流す」を出す。押すと、PC も配信者の協力も無しに、その公開配信のコメントを
 *   端末がニコニコから直接受け取って並べ、🗣 で iPhone の声で読み上げる。
 *   受け取ったコメントは端末の中だけ(当サイトのサーバーへは送らない)。
 *
 * ■ 経路(2026-10-28 りんくの PC で実測・plan-6-no-extension.md ③)
 *   1. watch ページ … CapacitorHttp(ニコニコはアプリの Origin に CORS を許さない)
 *   2. viewUri の握手 … WebView の WebSocket(どの Origin でも握手できた)= src/server/nicoliveGuest.js の fetchViewUri
 *   3. view / segment … CapacitorHttp(最後まで読む形。遅れの中央値 約6秒・429/403 なし)
 *   読み方は src/lib/ndgrLiveFollow.js(公開の型どおり)。
 *
 * ■ 出さないとき(何も描かない)
 *   アプリの外(ブラウザ・LP の /live/)、CapacitorHttp が無い古いアプリ、?lv= が無いとき。
 *
 * ■ 秘密を出さない: webSocketUrl・viewUri・segment の URI は画面にもログにも出さない。
 *
 * @module extension/liveDirectComments
 */
import { escapeHtml as esc } from '../lib/htmlText.js';
import { extractEmbeddedData } from '../lib/nicoliveRankingPick.js';
import { pickWsUrlFromEmbeddedData } from '../lib/embeddedDataExtract.js';
import { followNdgrLive } from '../lib/ndgrLiveFollow.js';
import { fetchViewUri } from '../server/nicoliveGuest.js';
import { createNativeSpeechVoice } from '../../app/live-view-native-voice.js';

/** 画面に並べる最大件数(古い方から消す)。 */
export const DIRECT_COMMENTS_MAX = 40;

/**
 * アプリの中で CapacitorHttp が使えるときだけ、その部品を返す。
 * @param {any} cap globalThis.Capacitor
 * @returns {any|null}
 */
export function nativeHttpOf(cap) {
  try {
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('CapacitorHttp')) return null;
    const http = (cap.Plugins && cap.Plugins.CapacitorHttp) || null;
    return http && typeof http.get === 'function' ? http : null;
  } catch {
    return null;
  }
}

/**
 * CapacitorHttp の data(base64 の文字列か ArrayBuffer)をバイト列に。
 * @param {any} data
 * @returns {Uint8Array}
 */
export function bytesFromNativeData(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data !== 'string' || !data) return new Uint8Array();
  try {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}

/**
 * @param {any} http CapacitorHttp
 * @returns {(url: string) => Promise<{ status: number, bytes: Uint8Array }>}
 */
export function nativeFetchBytes(http) {
  return async (url) => {
    // view の ?at= は次の区切りの時刻まで待ってから返る(長くて約16秒)ので、読む上限は長めにとる。
    const r = await http.get({ url, responseType: 'arraybuffer', connectTimeout: 10_000, readTimeout: 45_000 });
    return { status: Number(r && r.status) || 0, bytes: bytesFromNativeData(r && r.data) };
  };
}

/**
 * 1配信のコメントを受け取り始める。止めるまで(または取れなくなるまで)続く。
 * @param {{
 *   lv: string, http: any, signal: AbortSignal,
 *   onComments: (rows: { no: string, text: string, name: string, atMs: number }[]) => void,
 *   onGifts?: (rows: { name: string, itemName: string, point: number|null, atMs: number }[]) => void,
 *   onState: (state: 'connecting'|'live'|'ended'|'failed'|'retrying') => void,
 *   WebSocketImpl?: any
 * }} a
 */
export async function startDirectComments(a) {
  a.onState('connecting');
  try {
    const r = await a.http.get({ url: `https://live.nicovideo.jp/watch/${a.lv}`, responseType: 'text', connectTimeout: 10_000, readTimeout: 15_000 });
    const html = typeof r?.data === 'string' ? r.data : '';
    const props = html ? extractEmbeddedData(html) : null;
    const wsUrl = props ? pickWsUrlFromEmbeddedData(props) : '';
    if (!wsUrl) {
      a.onState('ended'); // 終わった配信・非公開の配信は視聴の接続先が無い
      return;
    }
    const opts = a.WebSocketImpl !== undefined ? { timeoutMs: 8000, WebSocketImpl: a.WebSocketImpl } : { timeoutMs: 8000 };
    const { viewUri } = await fetchViewUri(wsUrl, opts);
    if (!viewUri || a.signal.aborted) {
      if (!a.signal.aborted) a.onState('failed');
      return;
    }
    a.onState('live');
    const end = await followNdgrLive({ viewUri, fetchBytes: nativeFetchBytes(a.http), onComments: a.onComments, onGifts: a.onGifts, signal: a.signal });
    if (end !== 'aborted') a.onState('failed');
  } catch {
    if (!a.signal.aborted) a.onState('failed');
  }
}

/** 切れたときにつなぎ直すまでの待ち(つながったら最初に戻る)。使い切ったらあきらめて「もう一度押して」。 */
export const DIRECT_RETRY_DELAYS_MS = Object.freeze([3_000, 10_000, 30_000, 60_000]);

/**
 * startDirectComments を、切れたら自動でつなぎ直しながら回す(長い配信の途中で通信が切れても止めない)。
 * 配信が終わった(ended)・止めた(abort)ときは、つなぎ直さない。
 * @param {Parameters<typeof startDirectComments>[0] & { sleep?: (ms: number, signal: AbortSignal) => Promise<void> }} a
 *   onState には 'retrying' も来る。
 */
export async function runDirectComments(a) {
  const sleep = a.sleep || abortableSleep;
  let tries = 0;
  for (;;) {
    let last = '';
    await startDirectComments({
      ...a,
      onState: (s) => {
        last = s;
        if (s === 'live') tries = 0;
        if (s !== 'failed') a.onState(s);
      }
    });
    if (a.signal.aborted || last !== 'failed') return;
    if (tries >= DIRECT_RETRY_DELAYS_MS.length) {
      a.onState('failed');
      return;
    }
    a.onState(/** @type {any} */ ('retrying'));
    await sleep(DIRECT_RETRY_DELAYS_MS[tries], a.signal);
    tries += 1;
    if (a.signal.aborted) return;
  }
}

/** @param {number} ms @param {AbortSignal} signal */
function abortableSleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(undefined); }, { once: true });
  });
}

const STATE_TEXT = {
  idle: 'PC が無くても、このアプリがニコニコから直接コメントを受け取って流します(受け取ったコメントは iPhone の中だけ)。',
  connecting: 'つないでいます…',
  live: '受け取り中(数秒遅れで届きます)',
  retrying: '通信が切れました。つなぎ直しています…',
  ended: 'この配信は終わっているか、見られない配信です。',
  failed: 'うまく受け取れませんでした。もう一度押してください。'
};

/**
 * ギフト1件の行(「🎁 名前 さんが アイテム(100pt)」)。名前が無い匿名のギフトは「匿名」。
 * @param {{ name: string, itemName: string, point: number|null }} row
 */
export function giftItem(row) {
  const li = document.createElement('li');
  li.className = 'direct-gift';
  const pt = row.point != null && row.point > 0 ? `(${row.point}pt)` : '';
  li.innerHTML = `🎁 <span class="direct-name">${esc(row.name || '匿名')}</span> さんが ${esc(row.itemName || 'ギフト')}${esc(pt)}`;
  return li;
}

/**
 * /live?lv= の上に「💬 コメントを流す」の欄を出す。アプリの外では何もしない。
 * @param {{ lv: string, mountBefore: Element|null, cap?: any }} a
 * @returns {boolean} 欄を出したら true
 */
export function mountDirectComments(a) {
  const cap = a.cap !== undefined ? a.cap : /** @type {any} */ (globalThis).Capacitor;
  const http = nativeHttpOf(cap);
  if (!http || !a.lv || !a.mountBefore || !a.mountBefore.parentNode) return false;

  const box = document.createElement('section');
  box.className = 'direct-comments';
  box.setAttribute('aria-label', 'コメント(このアプリが直接受け取ります)');
  box.innerHTML =
    '<div class="direct-head"><button type="button" class="btn" data-direct-toggle>💬 コメントを流す</button>' +
    '<button type="button" class="btn" data-direct-voice hidden>🗣 読み上げ</button></div>' +
    '<p class="direct-state" aria-live="polite"></p><ol class="direct-list"></ol>';
  a.mountBefore.parentNode.insertBefore(box, a.mountBefore);
  const toggleBtn = /** @type {HTMLButtonElement} */ (box.querySelector('[data-direct-toggle]'));
  const voiceBtn = /** @type {HTMLButtonElement} */ (box.querySelector('[data-direct-voice]'));
  const stateEl = /** @type {HTMLElement} */ (box.querySelector('.direct-state'));
  const listEl = /** @type {HTMLElement} */ (box.querySelector('.direct-list'));

  const voice = createNativeSpeechVoice({ cap });
  const paintVoice = () => {
    if (!voice) return;
    voiceBtn.hidden = false;
    voiceBtn.textContent = voice.isOn() ? '🗣 読み上げ中' : '🗣 読み上げ';
    voiceBtn.setAttribute('aria-pressed', voice.isOn() ? 'true' : 'false');
  };
  if (voice) {
    voice.onChange(paintVoice);
    voiceBtn.addEventListener('click', () => { voice.toggle(); paintVoice(); });
  }

  /** @type {AbortController|null} */
  let ac = null;
  /** @param {keyof typeof STATE_TEXT} s */
  const setState = (s) => {
    stateEl.textContent = STATE_TEXT[s];
    const running = s === 'connecting' || s === 'live' || s === 'retrying';
    toggleBtn.textContent = running ? '⏹ 止める' : '💬 コメントを流す';
    if (!running) ac = null;
  };
  setState('idle');

  /** @param {{ no: string, text: string, name: string }[]} rows */
  const onComments = (rows) => {
    for (const row of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="direct-name">${esc(row.name || '匿名')}</span> ${esc(row.text)}`;
      listEl.insertBefore(li, listEl.firstChild);
    }
    while (listEl.children.length > DIRECT_COMMENTS_MAX) listEl.lastChild?.remove();
    if (voice) voice.onRows(rows);
  };

  // ギフトは目立つ色で並べるだけ(読み上げは PC と同じくコメントだけ=phoneVoice.js はギフトを読まない)。
  /** @param {{ name: string, itemName: string, point: number|null }[]} rows */
  const onGifts = (rows) => {
    for (const row of rows) listEl.insertBefore(giftItem(row), listEl.firstChild);
    while (listEl.children.length > DIRECT_COMMENTS_MAX) listEl.lastChild?.remove();
  };

  toggleBtn.addEventListener('click', () => {
    if (voice) voice.wake();
    if (ac) {
      ac.abort();
      setState('idle');
      return;
    }
    const mine = new AbortController();
    ac = mine;
    void runDirectComments({ lv: a.lv, http, signal: mine.signal, onComments, onGifts, onState: (s) => { if (ac === mine) setState(/** @type {any} */ (s)); } });
  });
  paintVoice();
  return true;
}
