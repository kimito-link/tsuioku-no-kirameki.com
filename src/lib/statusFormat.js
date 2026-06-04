// @ts-nocheck
/**
 * status 整形の純関数群。
 *
 * 拡張の status ページ(src/extension/status-entry.js)と、
 * スマホ閲覧用 Web 版(app/app.js)で同じ描画を保つため、
 * 整形ロジックをここに一本化する(単一ソース)。
 *
 * 入力の `livesData` は summarizeOneLive が返す正規化済みの配列:
 *   { lv, broadcasterName, title, recordedCount, officialCommentCount,
 *     officialRatePct, watchCount, adPoints, giftPoints, elapsedSec,
 *     capturedAt, lastIngestAgoMs }
 *
 * いずれも DOM/Chrome API に依存しない。
 *
 * @module statusFormat
 */

/**
 * 概要テキスト(配信数・累計記録・公式累計・取得率)を組み立てる。
 * @param {object[]} livesData
 * @returns {string} 空配列なら ''
 */
export function buildOverviewText(livesData) {
  if (!Array.isArray(livesData) || !livesData.length) return '';
  const lines = [];
  const total = livesData.length;
  let recordedSum = 0;
  let officialSum = 0;
  for (const r of livesData) {
    recordedSum += r.recordedCount || 0;
    officialSum += r.officialCommentCount || 0;
  }
  const ratePct = officialSum > 0 ? Math.round((recordedSum / officialSum) * 100) : null;
  lines.push(`記録中 ${total} 配信 / 累計 記録 ${recordedSum.toLocaleString('ja-JP')} 件`);
  if (officialSum > 0) {
    lines.push(`公式累計 ${officialSum.toLocaleString('ja-JP')} 件 (取得率 ${ratePct}%)`);
  }
  return lines.join('\n');
}

/**
 * 1 配信ぶんのブロックテキストを組み立てる。
 * @param {object} live summarizeOneLive の 1 要素
 * @returns {string}
 */
export function buildLiveBlockText(live) {
  const lines = [];
  const head =
    `[${live.lv}] ${live.broadcasterName || '(配信者名 不明)'}` +
    (live.elapsedSec != null ? ` ・ 経過 ${formatElapsed(live.elapsedSec)}` : '');
  lines.push(head);
  // 配信タイトル(snapshot から取れた場合のみ)。
  if (live.title) {
    lines.push(`  「${live.title}」`);
  }
  const numLine =
    `  記録 ${(live.recordedCount || 0).toLocaleString('ja-JP')}` +
    (live.officialCommentCount != null
      ? ` / 公式 ${live.officialCommentCount.toLocaleString('ja-JP')}`
      : '') +
    (live.officialRatePct != null ? ` (取得率 ${live.officialRatePct}%)` : '');
  lines.push(numLine);
  if (live.watchCount != null) {
    lines.push(`  来場 ${live.watchCount.toLocaleString('ja-JP')} 人`);
  }
  const ptParts = [];
  if (live.adPoints != null) ptParts.push(`広告 ${live.adPoints.toLocaleString('ja-JP')}pt`);
  if (live.giftPoints != null) ptParts.push(`ギフト ${live.giftPoints.toLocaleString('ja-JP')}pt`);
  if (ptParts.length) lines.push('  ' + ptParts.join(' / '));
  if (live.lastIngestAgoMs != null) {
    lines.push(`  最終取り込み ${formatAgo(live.lastIngestAgoMs)}前`);
  }
  return lines.join('\n');
}

/**
 * 経過秒を `h:mm:ss` / `m:ss` に整形する。
 * @param {number|null|undefined} sec
 * @returns {string} 不正値は '?'
 */
export function formatElapsed(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 経過ミリ秒を「N秒/N分/N時間」に整形する。
 * @param {number|null|undefined} ms
 * @returns {string} 不正値は '?'
 */
export function formatAgo(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '?';
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分`;
  return `${Math.round(ms / 3_600_000)}時間`;
}
