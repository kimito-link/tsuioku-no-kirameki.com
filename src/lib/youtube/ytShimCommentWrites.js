/**
 * YouTube 系(YouTube・Twitch・Kick ほか)の画面で、ニコ生版の部品がコメントの控え(nls_comments_<疑似lv> /
 * nls_ctail_<疑似lv>)を chrome.storage に書こうとしたら捨てる(v0.1.1974)。
 *
 * ★経緯(PC 実測 0.1.1973・Kick 約1万2千〜1万4千行): 横の欄が nls_comments_<疑似lv> を90秒に39回、1回 約5.5MB
 *   (記録の全件)書いていた=90秒で 217MB を変換して保存へ渡していた。YouTube 系のコメントの正本は IndexedDB で、
 *   shim は読み出しを IndexedDB から組んで答える(このキーの保存値は読まない)ので、書いても誰も使わない。
 * @param {Record<string, any>} items set に渡された値
 * @param {(lv: string) => boolean} isPseudoLv 疑似 lv(YouTube 系の配信)か
 * @returns {{ items: Record<string, any>, dropped: number, droppedBytesApprox: number }}
 */
export function dropPseudoLvCommentWrites(items, isPseudoLv) {
  if (!items || typeof items !== 'object') return { items, dropped: 0, droppedBytesApprox: 0 };
  /** @type {Record<string, any> | null} */
  let out = null;
  let dropped = 0;
  let droppedBytesApprox = 0;
  for (const k of Object.keys(items)) {
    const m = /^(?:ytm:)?nls_(?:comments|ctail)_(lv\d{1,15})$/i.exec(k);
    if (!m || !isPseudoLv(m[1].toLowerCase())) continue;
    if (!out) out = { ...items };
    const v = items[k];
    droppedBytesApprox += Array.isArray(v) ? v.length : 0;
    delete out[k];
    dropped += 1;
  }
  return { items: out || items, dropped, droppedBytesApprox };
}
