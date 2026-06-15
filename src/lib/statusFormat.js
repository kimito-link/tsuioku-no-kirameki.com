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

import { buildPerfDiagLine } from './perfDiag.js';

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
  // 配信終了が検知済みなら見出しに ⚠ 終了 を付けて、更新が止まった枠と区別する。
  const endedMark = live.endedAt ? '⚠ 終了 ' : '';
  const head =
    `${endedMark}[${live.lv}] ${live.broadcasterName || '(配信者名 不明)'}` +
    (live.elapsedSec != null ? ` ・ 経過 ${formatElapsed(live.elapsedSec)}` : '');
  lines.push(head);
  // 配信タイトル(snapshot から取れた場合のみ)。
  if (live.title) {
    lines.push(`  「${live.title}」`);
  }
  // v0.1.642: 取得率(%)を主役にする。記録/速報/パネルで件数が数件ズレても、
  //   ユーザーが知りたいのは「全部取れたか=何%か」。状態ラベル付きで%を先頭に出し、
  //   件数は括弧内の補助に回す(ユーザー指摘「監視htmlは%で見せるべき」)。
  lines.push('  ' + buildCaptureRateLine(live));
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
  // 複数タブ paint 負荷の診断行(perfDiag があるときだけ)。白フラッシュ原因の見える化。
  const perfLine = buildPerfDiagLine(live.perfDiag);
  if (perfLine) lines.push(perfLine);
  return lines.join('\n');
}

/**
 * v0.1.642: 取得率(%)を主役にした1行を組み立てる。状態ラベル + %(大) + 件数(括弧の補助)。
 *   記録/速報/パネルで件数が数件ズレても「何%取れたか」で「全部取れた」が一目で分かる。
 *
 * @param {{ recordedCount?: number, officialCommentCount?: number|null, officialRatePct?: number|null }} live
 * @returns {string}
 */
export function buildCaptureRateLine(live) {
  const rec = Number(live?.recordedCount) || 0;
  const off = live?.officialCommentCount;
  const pct = live?.officialRatePct;
  const counts =
    `記録 ${rec.toLocaleString('ja-JP')}` +
    (off != null ? ` / 公式 ${Number(off).toLocaleString('ja-JP')}` : '');
  // 取得率が取れないとき(公式件数未取得)は従来どおり件数のみ。
  if (pct == null || !Number.isFinite(Number(pct))) {
    return counts;
  }
  const p = Number(pct);
  // 状態ラベル: 100%到達=✅完了 / 80%+=もう少し / それ未満=取得中。
  const label = p >= 100 ? '✅ 取得完了' : p >= 80 ? '🟢 ほぼ取得' : p >= 40 ? '🟡 取得中' : '🔴 取得中';
  return `${label} ${p}% (${counts})`;
}

/**
 * v0.1.692: 過去ログ取得(backfill)の診断行を組み立てる(status 概要併記用)。
 *   従来 status-entry.js にインライン実装だったものを純関数化。aborted の真因
 *   (crawl 例外メッセージ errMsg)があれば併記し、status を見るだけで真因調査できるようにする。
 * @param {{lid?:string, rows?:number, done?:number, stopReason?:string, errMsg?:string}|null|undefined} bp
 * @returns {string} lid が無ければ ''
 */
export function buildBackfillProgressLine(bp) {
  if (!bp || !bp.lid) return '';
  return (
    `過去ログ取得: [${bp.lid}] ${Number(bp.done) === 1 ? '完了' : '取得中'}・取得${Number(bp.rows) || 0}件` +
    (bp.stopReason ? `・停止理由=${bp.stopReason}` : '') +
    (bp.errMsg ? `・エラー: ${bp.errMsg}` : '')
  );
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
