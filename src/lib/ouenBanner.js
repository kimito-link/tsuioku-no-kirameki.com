/**
 * 応援動画バナーの表示判断（純粋関数）。
 *
 * ★なぜ JSON 駆動にするか（2026-08-25）
 *   応援する作品は案件ごとに変わる。動画が変わるたびに popup.html を編集して
 *   ストア再申請…では回らない。**データだけ差し替えれば済む**形にする。
 *
 * ★fail-closed: 読めない・壊れている・show=false は **出さない**。
 *   拡張の本体機能を邪魔しないことを、判断の既定にする。
 */

/**
 * @param {unknown} raw ouen-banner.json をパースしたもの
 * @returns {{show:false} | {show:true,title:string,note:string,when:string,url:string}}
 */
export function decideOuenBanner(raw) {
  /** @type {{show:false}} */
  const hidden = { show: false };
  if (!raw || typeof raw !== 'object') return hidden;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.show !== true) return hidden;

  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const url = typeof o.url === 'string' ? o.url.trim() : '';
  // ★タイトルとURLが無ければ出さない（空の枠が出るほうが害）
  if (!title || !url) return hidden;
  // ★http(s) 以外は弾く（javascript: 等を踏ませない）
  if (!/^https:\/\//i.test(url)) return hidden;

  return {
    show: true,
    title,
    note: typeof o.note === 'string' ? o.note.trim() : '',
    when: typeof o.when === 'string' ? o.when.trim() : '',
    url,
  };
}
