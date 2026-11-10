// pfEmoteStore.js — Twitch/Kick の視聴ページ(content)で見た絵文字の「名前 → 画像」を storage に覚える。
//   顔(yt_tw_icons)と同じく視聴ページから直接書く(1.5秒まとめて1回)。画面(ytNicoShim.js)が読んで本文を画像にする。
import { mergeEmoteDict } from '../../src/lib/platform/streamEmotes.js';

/**
 * @param {string} storageKey yt_tw_emotes / yt_kk_emotes
 */
export function createEmoteSaver(storageKey) {
  /** @type {Record<string, string>} */
  let dict = {};
  let loaded = false;
  let timer = 0;
  let dirty = false;
  const save = async () => {
    timer = 0;
    if (!dirty) return;
    dirty = false;
    try {
      // 別のタブが覚えた分も残す(読んでから足す)
      const old = (await chrome.storage.local.get(storageKey))?.[storageKey];
      dict = mergeEmoteDict(old, Object.entries(dict).map(([name, url]) => ({ name, url })));
      loaded = true;
      await chrome.storage.local.set({ [storageKey]: dict });
    } catch {
      /* 拡張が入れ替わった直後 */
    }
  };
  return {
    /**
     * 記録の行から絵文字の対応を抜き取る(行そのものには残さない=記録を太らせない)。
     * @param {any[]} items
     * @returns {number} 覚えている数
     */
    takeFrom(items) {
      /** @type {{ name: string, url: string }[]} */
      const fresh = [];
      for (const r of items) {
        if (!Array.isArray(r?.emotes)) continue;
        for (const e of r.emotes) if (dict[e?.name] !== e?.url) fresh.push(e);
        delete r.emotes;
      }
      if (fresh.length) {
        dict = mergeEmoteDict(dict, fresh);
        dirty = true;
        if (!timer) timer = /** @type {any} */ (setTimeout(() => void save(), loaded ? 1500 : 300));
      }
      return Object.keys(dict).length;
    },
  };
}
