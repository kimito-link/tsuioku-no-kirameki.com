// ミクチャのギフトの絵を resource_id から引く(バックグラウンドで使う・council/mixch-support-PLAN.md)。
//   index.json(約66KB・697件)は1日1回だけ読み、絵の URL は覚えておく(ギフトの種類ごとに file の JSON を1回)。
//   外部の資源なので、読めない・形が違うときは '' を返して絵なしのまま記録を続ける(AGENTS.md §3.6)。
import { MX_RES_INDEX_URL, parseMxResourceIndex, mxResourcePreviewUrl } from './mxParse.js';

export const MX_RES_INDEX_KEY = 'yt_mx_res_index';
export const MX_RES_PREVIEW_KEY = 'yt_mx_res_previews';
const INDEX_TTL_MS = 24 * 3600_000;
const MAX_PREVIEWS = 1000;
const MAX_IDS = 40;

/**
 * @param {{
 *   fetchJson: (url: string) => Promise<unknown>,
 *   storageGet: (key: string) => Promise<any>,
 *   storageSet: (bag: Record<string, any>) => Promise<void>,
 *   now?: () => number,
 * }} deps
 */
export function createMxGiftImageResolver(deps) {
  const now = deps.now || Date.now;
  /** @type {{ at: number, files: Record<string, string> } | null} */
  let index = null;
  /** @type {Promise<Record<string, string>> | null} */
  let indexLoading = null;
  /** 読めなかった時刻(落ちている間に1件ごとに 66KB を読み直さない・5分あける) */
  let indexFailAt = 0;
  /** @type {Record<string, string> | null} 空文字=絵が無いと分かった */
  let previews = null;

  const loadIndex = async () => {
    if (index && now() - index.at < INDEX_TTL_MS) return index.files;
    if (indexLoading) return indexLoading;
    if (now() - indexFailAt < 5 * 60_000) return index?.files || {};
    indexLoading = (async () => {
      try {
        const saved = await deps.storageGet(MX_RES_INDEX_KEY);
        if (saved && typeof saved === 'object' && now() - Number(saved.at || 0) < INDEX_TTL_MS && saved.files && typeof saved.files === 'object') {
          index = { at: Number(saved.at), files: saved.files };
          return index.files;
        }
        const map = parseMxResourceIndex(await deps.fetchJson(MX_RES_INDEX_URL));
        if (!map.size) {
          indexFailAt = now();
          return index?.files || {}; // 空=前のを使い続ける(上書きしない)
        }
        index = { at: now(), files: Object.fromEntries(map) };
        await deps.storageSet({ [MX_RES_INDEX_KEY]: index });
        return index.files;
      } catch {
        indexFailAt = now();
        return index?.files || {};
      } finally {
        indexLoading = null;
      }
    })();
    return indexLoading;
  };

  const loadPreviews = async () => {
    if (previews) return previews;
    try {
      const saved = await deps.storageGet(MX_RES_PREVIEW_KEY);
      previews = saved && typeof saved === 'object' ? { ...saved } : {};
    } catch {
      previews = {};
    }
    return previews;
  };

  /**
   * @param {unknown[]} ids resource_id
   * @returns {Promise<Record<string, string>>} resource_id → 絵の URL(分からなければ '')
   */
  return async function resolve(ids) {
    const want = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x)).filter((x) => /^\d{1,9}$/.test(x)))].slice(0, MAX_IDS);
    /** @type {Record<string, string>} */
    const out = {};
    if (!want.length) return out;
    const cache = await loadPreviews();
    const missing = want.filter((id) => !Object.prototype.hasOwnProperty.call(cache, id));
    if (missing.length) {
      const files = await loadIndex();
      let changed = false;
      await Promise.all(
        missing.map(async (id) => {
          const fileUrl = files[id];
          if (!fileUrl) return; // index が読めないときは覚えない(次にまた試す)
          try {
            cache[id] = mxResourcePreviewUrl(await deps.fetchJson(fileUrl));
            changed = true;
          } catch {
            /* 次にまた試す */
          }
        }),
      );
      if (changed) {
        const keys = Object.keys(cache);
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PREVIEWS))) delete cache[k];
        try {
          await deps.storageSet({ [MX_RES_PREVIEW_KEY]: cache });
        } catch {
          /* 覚えられなくても今回の分は返す */
        }
      }
    }
    for (const id of want) out[id] = cache[id] || '';
    return out;
  };
}
