/**
 * v0.1.230: iframe relay の送信元 frame URL を意味のあるカテゴリに分類する純関数群。
 *
 * 経緯:
 *   v0.1.226-229 の実機観測で、relay 経路では nicoad iframe（広告ランキングを
 *   表示する公式 iframe）も「contributionRanking」フィールドに値を入れて親に送って
 *   くる現象が確定した（lv350481542 の screenshot で「公式の貢献度ランキング順」
 *   ラベル下に広告 pt 23692貢 / 18291貢 等が混入）。
 *
 *   原因は iframe 側 `scrapeContributionRankingFromDom(document)` が nicoad iframe
 *   の DOM 構造（広告ランキング）も `.contribution-ranking-list .ranker` 等で
 *   ヒットしてしまい、貢献度ランキングと広告ランキングを区別せずに送っていたこと。
 *
 *   親側受信時に frameUrl から発生元を判別し、「貢献度ランキングとして信用してよい
 *   送信元」だけを popup に流す方針に切り替える。
 *
 * カテゴリ:
 *   - 'audition': audition.nicovideo.jp/embedded/richview/...
 *     公式の貢献度ランキング・イベント参加バナーを持つ。
 *   - 'koken':    koken.nicovideo.jp/supporter/contents/.../gift
 *     ギフト履歴を持つ。
 *   - 'gift':     gift.nicovideo.jp/live/.../purchase
 *     ギフト購入 UI（ranking/history は持たない、heartbeat のみ）。
 *   - 'nicoad':   nicoad.nicovideo.jp/live/publish/...
 *     ニコニ広告ランキング（貢献度ランキングとは別物。pt 表示も別系統）。
 *   - 'unknown':  上記いずれでもない。
 *
 * 副作用なし、純関数。
 */

/** @typedef {'audition'|'koken'|'gift'|'nicoad'|'unknown'} GiftSubAppFrameSource */

/**
 * frameUrl 文字列を frame source カテゴリに分類する。
 * @param {string|null|undefined} frameUrl
 * @returns {GiftSubAppFrameSource}
 */
export function classifyGiftSubAppFrameSource(frameUrl) {
  const s = String(frameUrl || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('audition.nicovideo.jp')) return 'audition';
  if (s.includes('koken.nicovideo.jp')) return 'koken';
  if (s.includes('gift.nicovideo.jp')) return 'gift';
  if (s.includes('nicoad.nicovideo.jp')) return 'nicoad';
  return 'unknown';
}

/**
 * frameSource が「貢献度ランキング」として信用してよい送信元か判定する。
 * 公式仕様で貢献度ランキングは audition iframe（richview）に居り、koken も
 * 同じく公式チャネル経由のため許容。nicoad は広告ランキングなので除外。
 *
 * @param {GiftSubAppFrameSource} frameSource
 * @returns {boolean}
 */
export function isContributionRankingTrustedSource(frameSource) {
  return frameSource === 'audition' || frameSource === 'koken';
}

/**
 * frameSource が「ギフト履歴」として信用してよい送信元か判定する。
 * ギフト履歴は koken iframe（supporter/.../gift）が出す。audition は出さない。
 *
 * @param {GiftSubAppFrameSource} frameSource
 * @returns {boolean}
 */
export function isGiftHistoryTrustedSource(frameSource) {
  return frameSource === 'koken';
}

/**
 * frameSource が「イベントバナー」として信用してよい送信元か判定する。
 * イベントバナー（owner-name + 「○○さんが参加しています」）は audition iframe
 * が出す。
 *
 * @param {GiftSubAppFrameSource} frameSource
 * @returns {boolean}
 */
export function isEventBannerTrustedSource(frameSource) {
  return frameSource === 'audition';
}
