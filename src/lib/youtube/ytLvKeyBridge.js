/**
 * 疑似 lv → 配信キー。マーケの過去比較が他サービスの配信を混ぜないために使う。
 * 本体（ニコ生）はこの関数を登録しない。未登録のときは空で、過去比較の絞り込みは動かない。
 * ytNicoShim をマーケ本体から import しない（YouTube の束をニコ生の束に入れない）。
 */

/** @type {null | ((lv: string) => { platform: string, channelId: string } | null)} */
let resolver = null;

/** @param {((lv: string) => { platform: string, channelId: string } | null) | null} fn */
export function setYtLvMetaResolver(fn) {
  resolver = typeof fn === 'function' ? fn : null;
}

/**
 * @param {string} lv
 * @returns {{ platform: string, channelId: string } | null}
 */
export function ytLvMetaForLv(lv) {
  if (!resolver) return null;
  try {
    const meta = resolver(String(lv || ''));
    if (!meta || !meta.platform) return null;
    return {
      platform: String(meta.platform),
      channelId: String(meta.channelId || ''),
    };
  } catch {
    return null;
  }
}
