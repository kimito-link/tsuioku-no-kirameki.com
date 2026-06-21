/**
 * HTML/マーケ/メディアキットレポートで「ダウンロードして初めて見られる」主要集計を、
 * 保存せずに status の診断/速報でリアルタイム確認するための軽量プレビュー純関数。
 *
 * 背景(ユーザー要望 2026-06-21「DLする中身を診断でリアルタイムに見れれば解像度が上がる」):
 * レポートは保存しないと中身(来場と応援参加・ユーザー別・セグメント等)が分からず、先日の
 * 「保存コメント数27の過小集計」のようなバグも保存後でないと気づけなかった。レポートが使う
 * 既存の純関数(aggregateMarketingReport / analyzeAudienceEngagementGap)を再利用し、
 * 主要KPIだけをコンパクトに取り出す=保存前に中身が分かる。記録/取得には一切触れない純関数。
 *
 * @typedef {{
 *   liveId: string,
 *   totalComments: number,       // 本文ありコメント数(マーケ集計の母数)
 *   uniqueUsers: number,         // marketing の「のべ別キー」数(匿名で過大・実人数の正本は commenters)
 *   commentsPerMinute: number,   // 分速
 *   heavyPct: number,            // ヘビー層%(segmentPcts.heavy)
 *   oncePct: number,             // 一度きり%
 *   visitors: number,            // 来場(audienceGap.totalVisitors)
 *   commenters: number,          // コメントした人(audienceGap.uniqueCommenters)
 *   silentEstimate: number,      // 沈黙視聴者の推定(audienceGap.silentVisitorEstimate)
 *   topSupporters?: import('./supporterRanking.js').SupporterRow[] // 応援者ランキング上位(ちくらん風・v0.1.865)
 * }} ReportPreview
 */

import { withConfidence } from './metricConfidence.js';
import { buildSupporterRanking, buildSupporterRankingLines } from './supporterRanking.js';

/**
 * @param {(...args: any[]) => any} aggregateMarketingReport DI: marketingAggregate.aggregateMarketingReport
 * @param {(...args: any[]) => any} analyzeAudienceEngagementGap DI: audienceEngagementGap.analyzeAudienceEngagementGap
 * @param {any[]} comments 当該配信の全保存コメント(レポートと同じ入力)
 * @param {string} liveId
 * @param {{ broadcasterUserId?: string, totalVisitors?: number, officialCommentCount?: number }} [opts]
 * @returns {ReportPreview}
 */
export function buildReportPreview(
  aggregateMarketingReport,
  analyzeAudienceEngagementGap,
  comments,
  liveId,
  opts = {}
) {
  const lid = String(liveId || '').trim().toLowerCase();
  const rows = Array.isArray(comments) ? comments : [];
  /** @param {unknown} x */
  const num = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };

  let mkt = null;
  try {
    mkt = aggregateMarketingReport(rows, liveId, {
      broadcasterUserId: opts?.broadcasterUserId || ''
    });
  } catch {
    mkt = null;
  }

  let gap = null;
  try {
    // analyzeAudienceEngagementGap: input は {comments, visitorCount, officialCommentCount}、
    //   liveId/broadcasterUserId は options 側(audienceEngagementGap.js:286-287)。
    gap = analyzeAudienceEngagementGap(
      {
        comments: rows,
        visitorCount: opts?.totalVisitors,
        officialCommentCount: opts?.officialCommentCount
      },
      { liveId, broadcasterUserId: opts?.broadcasterUserId || '' }
    );
  } catch {
    gap = null;
  }

  // v0.1.865: 応援者ランキング(ちくらん風)。topUsers(件数順)から上位を整形して同梱=既存の
  //   popup→storage→status ブリッジに乗せる(新規キー無し)。匿名扱い/0件除外は supporterRanking が正本。
  /** @type {import('./supporterRanking.js').SupporterRow[]} */
  let topSupporters = [];
  try {
    topSupporters = buildSupporterRanking(mkt?.topUsers, { limit: 10 });
  } catch {
    topSupporters = [];
  }

  return {
    liveId: lid,
    totalComments: num(mkt?.totalComments),
    uniqueUsers: num(mkt?.uniqueUsers),
    commentsPerMinute: num(mkt?.commentsPerMinute),
    heavyPct: num(mkt?.segmentPcts?.heavy),
    oncePct: num(mkt?.segmentPcts?.once),
    visitors: num(gap?.totalVisitors),
    commenters: num(gap?.uniqueCommenters),
    silentEstimate: num(gap?.silentVisitorEstimate),
    topSupporters
  };
}

/**
 * watch snapshot から buildReportPreview の opts(来場/公式コメント数)を取り出す純関数。
 *   レポート本体(popup の audienceGapForReport)と同じソースに揃える。有限数でなければ undefined
 *   (= analyzeAudienceEngagementGap 側が他の経路で推定)。popup の行数膨張を避けるため切り出し。
 * @param {{viewerCountFromDom?: unknown, officialCommentCount?: unknown, broadcasterUserId?: unknown}|null|undefined} snapshot
 * @returns {{ broadcasterUserId: string, totalVisitors: number|undefined, officialCommentCount: number|undefined }}
 */
export function extractReportPreviewInputs(snapshot) {
  /** @param {unknown} x */
  const fin = (x) => {
    if (x == null) return undefined;
    const n = Number(x);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    broadcasterUserId: String(snapshot?.broadcasterUserId || '').trim(),
    totalVisitors: fin(snapshot?.viewerCountFromDom),
    officialCommentCount: fin(snapshot?.officialCommentCount)
  };
}

/**
 * プレビューを status 速報の1行(複数行)に整形する純関数。保存せずに中身が分かる。
 * 値がほぼ空(コメント0)なら ''(まだ何も無い=ノイズにしない)。
 * @param {ReportPreview|null|undefined} p
 * @param {import('./metricConfidence.js').MetricContext} [ctx] 信頼度注釈の文脈(NDGR接続/匿名率など・任意)
 * @returns {string}
 */
export function buildReportPreviewLines(p, ctx = {}) {
  if (!p || typeof p !== 'object') return '';
  const total = Number(p.totalComments) || 0;
  if (total <= 0) return '';
  const parts = [];
  parts.push(`本文コメント ${total.toLocaleString('ja-JP')}`);
  // v0.1.859: 「コメントした人」は HTML レポート本体(resolveCommentsParticipation・marketingChartsHtml.js)と
  //   同じ正本=gap の commenters(識別可能な実人数・匿名 a:hash 含む)を使う。marketing の uniqueUsers は
  //   userId 空コメントを `anon:commentNo` で1件ずつ別人カウントするため過大=正本にしない(二枚舌を出さない)。
  //   commenters が未取得(popup 未起動等)の時だけ uniqueUsers を「のべ別キー」と明示してフォールバック。
  // v0.1.861: 数値に信頼度注釈を添える(匿名主体=推定寄り 等)=見る人が確定値と推定を取り違えない。
  if (p.commenters > 0) {
    parts.push(`コメントした人 ${withConfidence(`${p.commenters.toLocaleString('ja-JP')}人`, 'commenters', ctx)}`);
  } else if (p.uniqueUsers > 0) {
    parts.push(`${withConfidence(p.uniqueUsers.toLocaleString('ja-JP'), 'uniqueUsers', ctx)}`);
  }
  if (p.commentsPerMinute > 0) parts.push(`分速 ${p.commentsPerMinute}`);
  if (p.heavyPct > 0) parts.push(`ヘビー ${p.heavyPct}%`);
  if (p.oncePct > 0) parts.push(`一度きり ${p.oncePct}%`);
  const lines = [`レポート内容(保存前): ${parts.join(' / ')}`];
  // 来場と応援参加(audienceGap)は値があるときだけ。コメントした人は上で出したので来場/沈黙のみ。
  if (p.visitors > 0) {
    const g = [`来場 ${p.visitors.toLocaleString('ja-JP')}`];
    if (p.silentEstimate > 0) {
      g.push(`沈黙視聴者 ${withConfidence(p.silentEstimate.toLocaleString('ja-JP'), 'silentEstimate', ctx)}`);
    }
    lines.push(`  来場と応援参加: ${g.join(' / ')}`);
  }
  // v0.1.865: 応援者ランキング(ちくらん風)。上位があれば続けて出す(空ならノイズにしない)。
  const rankLines = buildSupporterRankingLines(p.topSupporters, { max: 5 });
  if (rankLines) lines.push(rankLines);
  return lines.join('\n');
}
