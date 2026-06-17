/**
 * HTML / マーケ DL 待ち中の りんく・こん太・たぬ姉 セリフ（popup 吹き出し用）。
 */

/** @typedef {{ who: 'link'|'konta'|'tanunee', name: string, text: string }} ExportWaitLine */

/** @type {readonly ExportWaitLine[]} */
export const EXPORT_WAIT_LINES_HTML = Object.freeze([
  Object.freeze({ who: 'link', name: 'りんく', text: 'コメントを整理して、ページに載せてるよ！' }),
  Object.freeze({ who: 'konta', name: 'こん太', text: 'みんなの応援を、きれいなレポートにまとめ中〜' }),
  Object.freeze({ who: 'tanunee', name: 'たぬ姉', text: '数字や表も、いま組み立てているわ' }),
  Object.freeze({ who: 'link', name: 'りんく', text: 'コメントが多いと、少しだけ時間がかかるよ' }),
  Object.freeze({ who: 'konta', name: 'こん太', text: 'もうちょっとだけ待っててね…がんばるよ！' }),
  Object.freeze({ who: 'tanunee', name: 'たぬ姉', text: 'ゆっくりで大丈夫。ちゃんと仕上げるわ' })
]);

/** @type {readonly ExportWaitLine[]} */
export const EXPORT_WAIT_LINES_MARKETING = Object.freeze([
  Object.freeze({ who: 'link', name: 'りんく', text: 'マーケ分析のグラフを準備してるよ！' }),
  Object.freeze({ who: 'konta', name: 'こん太', text: '来てくれた人のデータ、集計してる〜' }),
  Object.freeze({ who: 'tanunee', name: 'たぬ姉', text: '傾向やランキングをまとめているわ' }),
  Object.freeze({ who: 'link', name: 'りんく', text: '過去の配信と比べる準備もしてるよ' }),
  Object.freeze({ who: 'konta', name: 'こん太', text: 'がんばってるから、あと少し待って！' }),
  Object.freeze({ who: 'tanunee', name: 'たぬ姉', text: '重いときは時間がかかるの、ごめんね' })
]);

/**
 * コメント件数に応じて buildHtmlReportDocument のタイムアウト（ms）を決める。
 *
 * v0.1.806: 旧式 +3ms/件 は緩すぎて 5000件で ~97秒どまり=実際の組み立て(全件マーケ集計+
 *   audience gap など実測 ~100〜120秒)に届かず「完了間際で問答無用 kill」=html_report_build_timeout
 *   の主因だった。傾きを +12ms/件に上げ、上限も 300秒へ。yield 分割(popup 側)と併せて『重い配信でも
 *   必ず最後まで完了させる(落とさない)』を最優先にする(星野ロミ式=失敗体験の除去)。
 * @param {number} commentCount
 * @returns {number}
 */
export function resolveHtmlReportBuildTimeoutMs(commentCount) {
  const n = Math.max(0, Number(commentCount) || 0);
  if (n <= 2500) return 90_000;
  return Math.min(300_000, 90_000 + Math.floor((n - 2500) * 12));
}

/**
 * @param {'html'|'marketing'} kind
 * @returns {readonly ExportWaitLine[]}
 */
export function exportWaitLinesForKind(kind) {
  return kind === 'marketing' ? EXPORT_WAIT_LINES_MARKETING : EXPORT_WAIT_LINES_HTML;
}
