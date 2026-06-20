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
 *   uniqueUsers: number,         // ユニークコメント者
 *   commentsPerMinute: number,   // 分速
 *   heavyPct: number,            // ヘビー層%(segmentPcts.heavy)
 *   oncePct: number,             // 一度きり%
 *   visitors: number,            // 来場(audienceGap.totalVisitors)
 *   commenters: number,          // コメントした人(audienceGap.uniqueCommenters)
 *   silentEstimate: number       // 沈黙視聴者の推定(audienceGap.silentVisitorEstimate)
 * }} ReportPreview
 */

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

  return {
    liveId: lid,
    totalComments: num(mkt?.totalComments),
    uniqueUsers: num(mkt?.uniqueUsers),
    commentsPerMinute: num(mkt?.commentsPerMinute),
    heavyPct: num(mkt?.segmentPcts?.heavy),
    oncePct: num(mkt?.segmentPcts?.once),
    visitors: num(gap?.totalVisitors),
    commenters: num(gap?.uniqueCommenters),
    silentEstimate: num(gap?.silentVisitorEstimate)
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
 * @returns {string}
 */
export function buildReportPreviewLines(p) {
  if (!p || typeof p !== 'object') return '';
  const total = Number(p.totalComments) || 0;
  if (total <= 0) return '';
  const parts = [];
  parts.push(`本文コメント ${total.toLocaleString('ja-JP')}`);
  if (p.uniqueUsers > 0) parts.push(`ユニーク ${p.uniqueUsers.toLocaleString('ja-JP')}人`);
  if (p.commentsPerMinute > 0) parts.push(`分速 ${p.commentsPerMinute}`);
  if (p.heavyPct > 0) parts.push(`ヘビー ${p.heavyPct}%`);
  if (p.oncePct > 0) parts.push(`一度きり ${p.oncePct}%`);
  const head = `レポート内容(保存前): ${parts.join(' / ')}`;
  // 来場と応援参加(audienceGap)は値があるときだけ2行目に。
  if (p.visitors > 0 || p.commenters > 0) {
    const g = [];
    if (p.visitors > 0) g.push(`来場 ${p.visitors.toLocaleString('ja-JP')}`);
    if (p.commenters > 0) g.push(`コメントした人 ${p.commenters.toLocaleString('ja-JP')}`);
    if (p.silentEstimate > 0) g.push(`沈黙視聴者(推定) ${p.silentEstimate.toLocaleString('ja-JP')}`);
    return `${head}\n  来場と応援参加: ${g.join(' / ')}`;
  }
  return head;
}
