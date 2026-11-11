/**
 * 配信のまとめは配信ごとの小さい鍵(ytm:sum:v1:)に書く。
 * 古い一覧が残っていればそちらも見る。
 * @param {{ evaluate: Function }} sw
 * @param {string} videoId
 */
export async function readStreamSummary(sw, videoId) {
  return sw.evaluate(async (key) => {
    const slimKey = 'ytm:sum:v1:' + encodeURIComponent(key);
    const bag = await chrome.storage.local.get([slimKey, 'yt_stream_summaries']);
    return bag[slimKey] || bag.yt_stream_summaries?.[key] || null;
  }, videoId);
}
