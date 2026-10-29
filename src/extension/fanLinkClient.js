/**
 * 【層】L2 拡張の配線(chrome.storage と fetch。形の判定は src/lib/fanLink.js)
 * 【この箱に入るもの】状態画面の「👥 ファンにも公開」の ON/OFF(サーバーにファン用リンクを出してもらう・取り消す)
 * 【この箱に入らないもの】画面(statusSmartphoneCard.js)・サーバーの係(src/server/fanLinkApi.js)
 *
 * ★なぜ(v0.1.1823・配信者中継): 配信者が自分の PC で ON にすると、拡張を持たないファンも
 *   その配信をスマホで見られる。ファン用リンクは読むだけ(コメントの投稿・声づくりはできない)。
 * @module fanLinkClient
 */

import { KEY_FAN_LINK } from '../lib/storageKeys.js';
import { isFanToken } from '../lib/fanLink.js';

/** @param {string} appOrigin */
function fanApiUrl(appOrigin) {
  return `${String(appOrigin || '').replace(/\/+$/, '')}/api/status?action=fan`;
}

/**
 * @param {import('../lib/devicePublishCredentials.js').PublishCredentials} creds
 * @param {boolean} on
 */
async function callFan(creds, on) {
  const res = await fetch(fanApiUrl(creds.appOrigin), {
    method: 'POST',
    headers: creds.headers,
    // 共有キー(開発者の診断用)の経路では送り先を本文の v で伝える(利用者の鍵ならサーバーが決める)。
    body: JSON.stringify(creds.mode === 'shared' ? { on, v: creds.viewToken } : { on })
  });
  if (!res.ok) return null;
  return res.json();
}

/** 保存しているファン用リンク。無い・形が違えば ''。 @returns {Promise<string>} */
export async function readFanToken() {
  try {
    const bag = await chrome.storage.local.get(KEY_FAN_LINK);
    const v = bag?.[KEY_FAN_LINK];
    const f = v && typeof v === 'object' ? String(/** @type {{ fanToken?: unknown }} */ (v).fanToken || '') : '';
    return isFanToken(f) ? f : '';
  } catch {
    return '';
  }
}

/**
 * ON: サーバーにファン用リンクを出してもらう(既にあれば同じリンクの寿命が延びる)。
 * @param {import('../lib/devicePublishCredentials.js').PublishCredentials | null} creds
 * @returns {Promise<string>} ファン用リンク・失敗なら ''
 */
export async function enableFanLink(creds) {
  if (!creds) return '';
  try {
    const j = await callFan(creds, true);
    const f = String(j?.fanToken || '');
    if (!isFanToken(f)) return '';
    await chrome.storage.local.set({ [KEY_FAN_LINK]: { fanToken: f, enabledAt: Date.now() } });
    return f;
  } catch {
    return '';
  }
}

/**
 * OFF: サーバーで取り消してから手元も捨てる(届かなくても手元は捨てる=30日で消える)。
 * @param {import('../lib/devicePublishCredentials.js').PublishCredentials | null} creds
 */
export async function disableFanLink(creds) {
  if (creds) {
    try {
      await callFan(creds, false);
    } catch {
      /* 30日で消える */
    }
  }
  try {
    await chrome.storage.local.remove(KEY_FAN_LINK);
  } catch {
    /* best-effort */
  }
}
