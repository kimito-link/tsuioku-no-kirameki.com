/**
 * 状態速報の共有 URL を組み立てる純関数。
 *
 * status-entry.js の uploadStatusSnapshot 内に直書きされていた URL 組み立て
 * (`${appOrigin}/?v=...` / `${appOrigin}/live-view?v=...` / `${appOrigin}/api/status`)を
 * テスト可能な純関数として切り出したもの。chrome / DOM / 可変グローバルに依存しない。
 *
 * app/app.js の wireLiveViewLink も同形の URL を組むため、将来の重複削減の受け皿にもなる。
 *
 * @module statusShareUrls
 */

/**
 * 閲覧トークンを URL に載せる安全な形にエンコードする。
 * @param {string} viewToken
 * @returns {string}
 */
function encodeViewToken(viewToken) {
  return encodeURIComponent(String(viewToken ?? ''));
}

/**
 * 状態速報 Web 版 / 応援ライブビュー Web 版の閲覧 URL と、ingest(送信)先 URL を組み立てる。
 *
 * 元の uploadStatusSnapshot と完全同一の組み立て:
 *   - 閲覧:   `${appOrigin}/?v=<token>` と `${appOrigin}/live-view?v=<token>`
 *   - 送信:   `${appOrigin}/api/status`
 *
 * @param {string} appOrigin 送信先オリジン(例 'https://app.tsuioku-no-kirameki.com')。末尾スラッシュは正規化する。
 * @param {string} viewToken 閲覧トークン(?v=)。
 * @returns {{ statusUrl: string, liveViewUrl: string, ingestUrl: string }}
 */
export function buildStatusShareUrls(appOrigin, viewToken) {
  // appOrigin の末尾スラッシュを 1 つだけ落とす(`.../` でも `...` でも同じ結果に)。
  const origin = String(appOrigin ?? '').replace(/\/+$/, '');
  const v = encodeViewToken(viewToken);
  return {
    statusUrl: `${origin}/?v=${v}`,
    liveViewUrl: `${origin}/live-view?v=${v}`,
    ingestUrl: `${origin}/api/status`
  };
}
