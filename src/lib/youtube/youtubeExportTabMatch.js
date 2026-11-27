/**
 * マーケ書き出しが、今開いている YouTube タブの DOM を読んでよいか。
 * 動画 ID が一致するときだけ読む。ID が無い・違う動画なら読まない。
 */

/** @param {unknown} href */
export function youtubeVideoIdFromUrl(href) {
  try {
    const u = new URL(String(href || ''));
    if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return '';
    const v = String(u.searchParams.get('v') || '').trim();
    if (v) return v;
    const m = String(u.pathname || '').match(/\/(?:live|shorts|embed)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/**
 * タブの URL が、書き出し対象の videoId と一致するか。
 * videoId が空のときは、ただ一つ開いている視聴タブでも採用しない。
 * @param {unknown} tabUrl
 * @param {unknown} videoId
 */
export function youtubeTabMatchesVideo(tabUrl, videoId) {
  const want = String(videoId || '').trim();
  if (!want) return false;
  return youtubeVideoIdFromUrl(tabUrl) === want;
}

/**
 * 書き出しメッセージを受けた視聴ページが、まだ同じ videoId か。
 * スクレイプの直前にもう一度使う。
 * @param {unknown} href
 * @param {unknown} videoId
 */
export function youtubeExportPageMatchesVideo(href, videoId) {
  return youtubeTabMatchesVideo(href, videoId);
}
