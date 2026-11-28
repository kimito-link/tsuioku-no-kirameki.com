/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】動画ページのカードに足す「動画の数字」(コメント総数・投稿日・長さ)の正規化と1行の HTML
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / 新しい Observer / タイマー
 * 【書けるstorageキー】なし
 * 【正本宣言】動画カードの「再生 ・ コメント ・ 投稿 ・ 長さ」の並びと書き方はこのファイル
 *
 * v0.1.2263(りんく 11-27「動画ページは動画の数字で」): ページが既に持っている値だけを使う(作らない・通信しない)。
 *   いいね(動画そのもの)は正確な数が読める YouTube・TikTok だけ。コメントへのいいねで代わりにしない。読めないサービスは出さない(0 にしない)。
 *   配信の開始時刻を投稿日に、経過を長さに使わない。
 */

/** @param {unknown} v @returns {number | null} */
export function videoMetricCount(v) {
  if (typeof v !== 'number' && (typeof v !== 'string' || !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * ISO 8601 の長さ(PT1H2M3S)か秒数を秒にする。分からなければ null。
 * @param {unknown} v
 * @returns {number | null}
 */
export function videoLengthSeconds(v) {
  if (typeof v === 'number' || /^\d+$/.test(String(v ?? '').trim())) {
    const n = videoMetricCount(v);
    return n != null && n > 0 ? n : null;
  }
  const m = String(v ?? '').trim().match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!m || !(m[1] || m[2] || m[3] || m[4])) return null;
  const s = (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Math.floor(Number(m[4] || 0));
  return s > 0 ? s : null;
}

/** @param {number} sec */
function lengthText(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 投稿日(YYYY-MM-DD か ISO の日時)を「2026/11/13」にする。読めなければ ''。日時に時差があれば、その日付のまま(ページの表示どおり)。
 * @param {unknown} v
 */
export function videoPublishedText(v) {
  const m = String(v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : '';
}

/**
 * likes は動画そのもののいいね(正確な数: YouTube の player の likeCount・TikTok の diggCount だけ)。
 * @param {{ commentTotal?: unknown, publishDate?: unknown, length?: unknown, likes?: unknown }} src
 * @returns {{ likes: number | null, commentTotal: number | null, publishedText: string, lengthText: string }}
 */
export function normalizeVideoFacts(src) {
  const s = src && typeof src === 'object' ? src : {};
  const sec = videoLengthSeconds(s.length);
  return {
    likes: videoMetricCount(s.likes),
    commentTotal: videoMetricCount(s.commentTotal),
    publishedText: videoPublishedText(s.publishDate),
    lengthText: sec != null ? lengthText(sec) : '',
  };
}

/**
 * 「コメント 2,506 件 ・ 投稿 2026/11/13 ・ 長さ 12:34」。どれも無ければ ''。
 * @param {{ likes?: number | null, commentTotal?: number | null, publishedText?: string, lengthText?: string } | null | undefined} facts
 * @returns {string} HTML(エスケープ済み)
 */
export function videoFactsLineHtml(facts) {
  const f = facts || {};
  const parts = [];
  if (f.likes != null) parts.push(`いいね ${Number(f.likes).toLocaleString('ja-JP')}`);
  if (f.commentTotal != null) parts.push(`コメント ${Number(f.commentTotal).toLocaleString('ja-JP')} 件`);
  if (f.publishedText) parts.push(`投稿 ${f.publishedText}`);
  if (f.lengthText) parts.push(`長さ ${f.lengthText}`);
  if (!parts.length) return '';
  const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p class="nlsb-video-watch-card__facts">${parts.map(esc).join(' ・ ')}</p>`;
}
