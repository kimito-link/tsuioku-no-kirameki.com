/**
 * 【層】L2 拡張の配線(chrome.* と fetch。判定は src/lib/phonePost.js)
 * 【この箱に入るもの】スマホから預かったコメントを、サーバーから受け取って PC の放送タブのコメント欄へ投稿する係
 * 【この箱に入らないもの】投稿用の鍵の発行・URL の表示(statusSmartphoneCard.js)・本文の検査や印の判定(lib)
 *
 * ★なぜ(v0.1.1734・スマホからコメントを届ける):
 *   スマホの WEB版はニコ生に直接書けない(ログインは PC のブラウザにある・ログイン情報は預からない)。
 *   送信担当(status.html?publisher=1・Web Locks で1つだけ)がサーバーの待ち行列を見に行き、
 *   PC の「コメント送信」と同じ経路(content script の NLS_POST_COMMENT)で投稿し、結果をサーバーへ返す。
 *   ★「スマホからコメントする」を ON にした人だけ動く(OFF・同意なし・鍵なしでは通信しない)。
 *   ★間隔はふだん10秒・スマホが入力中なら2秒(スマホが入力欄に触れた瞬間からサーバーに合図が立つ)。
 * @module phonePostRelay
 */

import { KEY_PHONE_POST } from '../lib/storageKeys.js';
import { extractLiveIdFromUrl, isNicoLiveWatchUrl } from '../lib/broadcastUrl.js';
import {
  PHONE_POST_PULL_IDLE_MS,
  classifyRelayError,
  isValidPostKey,
  parsePhonePostItem,
  phonePostPullDelayMs
} from '../lib/phonePost.js';

/** サーバーが断った・通信できないときの次の試行まで(ms)。 */
const RELAY_BACKOFF_MS = 60_000;
/** 1件の投稿を待つ上限(ms)。PC の送信の総締切(5秒)より長め=フレーム探しを含む。 */
const POST_TIMEOUT_MS = 10_000;

/** @param {string} appOrigin */
export function postApiUrl(appOrigin) {
  return `${String(appOrigin || '').replace(/\/+$/, '')}/api/post`;
}

/**
 * PC の照合ヘッダ(利用者の鍵、または共有キー+送り先)。
 * @param {import('../lib/devicePublishCredentials.js').PublishCredentials} creds
 * @returns {Record<string, string>}
 */
export function ownerHeaders(creds) {
  return { ...creds.headers, 'x-view-token': creds.viewToken };
}

/**
 * 「スマホからコメントする」の保存値(投稿用の鍵)。無い・形が違えば ''。
 * @returns {Promise<string>}
 */
export async function readPhonePostKey() {
  try {
    const bag = await chrome.storage.local.get(KEY_PHONE_POST);
    const v = bag?.[KEY_PHONE_POST];
    const pk = v && typeof v === 'object' ? String(/** @type {{ postKey?: unknown }} */ (v).postKey || '') : '';
    return isValidPostKey(pk) ? pk : '';
  } catch {
    return '';
  }
}

/**
 * 「✍️ スマホからコメントする」を ON: サーバーから投稿用の鍵をもらって保存する(前の鍵は無効になる)。
 * @param {import('../lib/devicePublishCredentials.js').PublishCredentials | null} creds
 * @returns {Promise<string>} 鍵・失敗なら ''
 */
export async function enablePhonePost(creds) {
  if (!creds) return '';
  try {
    const res = await fetch(`${postApiUrl(creds.appOrigin)}?action=enable`, { method: 'POST', headers: ownerHeaders(creds) });
    if (!res.ok) return '';
    const pk = String((await res.json())?.postKey || '');
    if (!isValidPostKey(pk)) return '';
    await chrome.storage.local.set({ [KEY_PHONE_POST]: { postKey: pk, enabledAt: Date.now() } });
    return pk;
  } catch {
    return '';
  }
}

/** 手元の鍵だけ捨てる(閲覧URLを作り直したとき=サーバー側はもう消えている)。 */
export async function forgetPhonePostKey() {
  try {
    await chrome.storage.local.remove(KEY_PHONE_POST);
  } catch {
    /* best-effort */
  }
}

/**
 * OFF: サーバーの鍵と待ち行列を消してから手元の鍵を捨てる(サーバーに届かなくても手元は捨てる=以後は取りに行かない)。
 * @param {import('../lib/devicePublishCredentials.js').PublishCredentials | null} creds
 */
export async function disablePhonePost(creds) {
  if (creds && (await readPhonePostKey())) {
    try {
      await fetch(`${postApiUrl(creds.appOrigin)}?action=disable`, { method: 'POST', headers: ownerHeaders(creds) });
    } catch {
      /* 鍵は30日で消える */
    }
  }
  await forgetPhonePostKey();
}

/**
 * @template T
 * @param {Promise<T>} p
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<T>}
 */
function withTimeout(p, ms, fallback) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); }
    );
  });
}

/**
 * その配信を開いている PC のタブを探す(前面・音が出ている・最近触ったものを優先)。
 * @param {string} lv
 * @returns {Promise<number[]>} tabId の並び
 */
async function findLiveTabs(lv) {
  /** @type {chrome.tabs.Tab[]} */
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return [];
  }
  return tabs
    .filter((t) => typeof t.id === 'number' && typeof t.url === 'string' && isNicoLiveWatchUrl(t.url))
    .filter((t) => String(extractLiveIdFromUrl(String(t.url)) || '').toLowerCase() === lv)
    .sort((a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.audible) - Number(a.audible) ||
      (Number(b.lastAccessed) || 0) - (Number(a.lastAccessed) || 0)
    )
    .map((t) => /** @type {number} */ (t.id));
}

/**
 * コメント欄のあるフレームを、点数の高い順に(PC の送信と同じ NLS_PING_COMMENT_FRAME で聞く)。
 * @param {number} tabId
 * @returns {Promise<number[]>}
 */
async function rankCommentFrames(tabId) {
  /** @type {{ frameId: number, score: number }[]} */
  const scored = [];
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    await Promise.all(
      (frames || []).map(async (f) => {
        try {
          const res = await chrome.tabs.sendMessage(tabId, { type: 'NLS_PING_COMMENT_FRAME' }, { frameId: f.frameId });
          const score = res && typeof res.score === 'number' ? res.score : 0;
          if (score > 0) scored.push({ frameId: f.frameId, score });
        } catch {
          /* content script の無いフレーム */
        }
      })
    );
  } catch {
    /* webNavigation が使えない=最上位だけ試す */
  }
  scored.sort((a, b) => b.score - a.score);
  const ids = scored.map((s) => s.frameId);
  if (!ids.includes(0)) ids.push(0);
  return ids;
}

/**
 * PC で開いている放送タブのコメント欄から1件投稿する。
 * @param {string} text
 * @param {string} lv
 * @returns {Promise<{ ok: boolean, error: string }>}
 */
export async function postCommentToLiveTab(text, lv) {
  const tabIds = await findLiveTabs(lv);
  if (!tabIds.length) return { ok: false, error: 'watchタブが見つかりません。' };
  let lastError = 'コメント送信に失敗しました。';
  for (const tabId of tabIds) {
    for (const frameId of await rankCommentFrames(tabId)) {
      const res = await withTimeout(
        chrome.tabs.sendMessage(tabId, { type: 'NLS_POST_COMMENT', text, fastSubmit: true }, { frameId }),
        POST_TIMEOUT_MS,
        { ok: false, error: 'timeout' }
      );
      if (res && res.ok === true) return { ok: true, error: '' };
      if (res && res.error) lastError = String(res.error);
    }
  }
  return { ok: false, error: lastError };
}

/**
 * 送信担当の中で動かし続ける。
 * @param {{
 *   getCreds: () => (import('../lib/devicePublishCredentials.js').PublishCredentials | null),
 *   isOptedIn: () => boolean,
 *   readPostKey?: () => Promise<string>,
 *   post?: (text: string, lv: string) => Promise<{ ok: boolean, error: string }>,
 *   fetchImpl?: typeof fetch,
 *   setTimer?: (fn: () => void, ms: number) => unknown
 * }} deps
 * @returns {{ tickNow: () => Promise<number> }} tickNow = 1回分(テスト用)。次までの ms を返す。
 */
export function startPhonePostRelay(deps) {
  const readKey = deps.readPostKey || readPhonePostKey;
  const post = deps.post || postCommentToLiveTab;
  const doFetch = deps.fetchImpl || ((...a) => fetch(...a));
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));

  const tickNow = async () => {
    if (!deps.isOptedIn()) return PHONE_POST_PULL_IDLE_MS;
    const creds = deps.getCreds();
    if (!creds || !(await readKey())) return PHONE_POST_PULL_IDLE_MS;
    const url = postApiUrl(creds.appOrigin);
    const headers = ownerHeaders(creds);
    const res = await doFetch(`${url}?action=pull`, { method: 'POST', headers });
    if (!res.ok) return RELAY_BACKOFF_MS;
    const body = await res.json();
    const items = (Array.isArray(body?.items) ? body.items : [])
      .map((/** @type {unknown} */ it) => parsePhonePostItem(JSON.stringify(it)))
      .filter(Boolean);
    for (const item of /** @type {import('../lib/phonePost.js').PhonePostItem[]} */ (items)) {
      const r = await post(item.text, item.lv);
      const ack = r.ok
        ? { id: item.id, state: 'sent' }
        : { id: item.id, state: 'failed', reason: classifyRelayError(r.error) };
      try {
        await doFetch(`${url}?action=ack`, { method: 'POST', headers, body: JSON.stringify(ack) });
      } catch {
        /* 結果を返せなくても、スマホは時間切れで「届かなかった」を出す(放送に流れていれば ✓✓ になる) */
      }
    }
    return phonePostPullDelayMs({ active: body?.active === true, hadItems: items.length > 0 });
  };

  const loop = () => {
    tickNow()
      .catch(() => RELAY_BACKOFF_MS)
      .then((ms) => { setTimer(loop, ms); });
  };
  setTimer(loop, 3_000);
  return { tickNow };
}
