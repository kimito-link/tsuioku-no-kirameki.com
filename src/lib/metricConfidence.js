/**
 * 診断の各数値に「どういう意味か・どれだけ信頼できるか」の短い注釈を付ける純関数(v0.1.861)。
 *
 * 背景: 2026-06-21 セッションで数字の意味の取り違えが繰り返し問題になった—
 *   ・「ユニーク127人」は marketing の『のべ別キー』で匿名を1件ずつ別人カウント=過大(v0.1.859)
 *   ・「コメントした人」は匿名(a:hash)主体だと実態に近いが userId 空は数えられず推定寄り
 *   ・「沈黙視聴者」は名前のとおり常に推定
 *   ・「取得率」は backfill 中は暫定(まだ過去ログを取り込んでいる途中)
 *   数字だけを見ると確定値と推定値・正本と過大値の区別がつかず、見る人(ユーザー/AI/司令塔)が誤読する。
 *   各数値に注釈を1つ付けて『この数字はこう読む』を明示=取り違えを根本から防ぐ(self-verifying の予防版)。
 *
 * 原則: 表示専用・新規データ取得ゼロ。注釈は既存の診断コンテキスト(NDGR接続/匿名率/backfill状態)から
 *   機械的に決まるものだけ(推測の信頼度を盛らない)。空文字なら『注釈不要=素直に確定値』。
 *
 * @typedef {{
 *   ndgrConnected?: boolean,      // NDGR 受信できているか(匿名 userId は NDGR にしか無い)
 *   withUidPercent?: number|null, // 保存コメントの userId 付き率(低い=匿名主体)
 *   backfillRunning?: boolean,    // 過去ログ取り込み中(取得率がまだ暫定)
 *   anyCatchingUp?: boolean       // 裏タブ等で追いつき中
 * }} MetricContext
 */

/** @param {unknown} v @returns {number|null} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * withUidPercent が低い=匿名(184)主体か。閾値 50 は statusActionAdvisor の uid-low と揃える。
 * @param {MetricContext|undefined} ctx
 */
function isAnonymousHeavy(ctx) {
  const p = num(ctx?.withUidPercent);
  return p != null && p < 50;
}

/**
 * 指標名と文脈から、数値に添える短い注釈(括弧内に入れる本体・括弧は付けない)を返す。
 * 注釈不要なら ''。
 * @param {string} metric 指標キー
 * @param {MetricContext} [ctx]
 * @returns {string}
 */
export function metricConfidenceNote(metric, ctx = {}) {
  switch (metric) {
    case 'commenters':
      // コメントした人。匿名主体だと a:hash で同一人物は1人に畳めるが userId 空は数えられない=推定寄り。
      //   NDGR が「明示的に切れている」時だけ更に不確か(ctx 未指定=不明は煽らない=注釈なし)。
      if (ctx.ndgrConnected === false) return '推定・NDGR未受信で不確か';
      if (isAnonymousHeavy(ctx)) return '匿名多め=推定寄り';
      return ''; // 非匿名主体 or 文脈不明=実人数に近い扱い=注釈不要。
    case 'uniqueUsers':
      // marketing の「のべ別キー」。userId 空を1件ずつ別人カウント=実人数より過大。常に注意書き。
      return 'のべ別キー=匿名で過大';
    case 'silentEstimate':
      return '推定'; // 来場−コメント者の引き算=推定。名前どおり常に推定。
    case 'visitors':
      // 来場は DOM(viewerCountFromDom)から取れていれば確定寄り。取れず推定経路なら不確か。
      return ''; // 来場の確定/推定は呼び出し側が値の出所を持つ場合のみ。既定は注釈なし。
    case 'captureRate':
      // 取得率。backfill 中/追いつき中はまだ過去ログを取り込む途中=暫定。
      if (ctx.backfillRunning || ctx.anyCatchingUp) return '暫定・取り込み中';
      return '';
    default:
      return '';
  }
}

/**
 * 数値テキストに注釈を括弧付きで添える小ヘルパ。注釈が空なら数値だけ返す。
 * @param {string} valueText 例: "26人"
 * @param {string} metric
 * @param {MetricContext} [ctx]
 * @returns {string} 例: "26人(匿名多め=推定寄り)"
 */
export function withConfidence(valueText, metric, ctx = {}) {
  const note = metricConfidenceNote(metric, ctx);
  return note ? `${valueText}(${note})` : String(valueText);
}
