/**
 * りんく成長グリッド（story growth）の描画上限。
 * コメント数に比例して DOM が増えるため、直近ウィンドウだけ描画する。
 */
export const STORY_GROWTH_MAX_CELLS = 360;

/**
 * アイコングリッドのラベル文言を作る純関数(v0.1.1202)。
 *
 * 2026-07-31 ユーザー報告「レーンには居るのにグリッドに居ない人がいる」の根治。
 * グリッドは直近 STORY_GROWTH_MAX_CELLS 件だけを描く「ウィンドウ表示」だが、ラベルは
 * 全件数(例: 2,716)を出していたため、その真下に360個しかアイコンが無いのに
 * 「2,716人ぶん並んでいる=全員居る」と読めてしまい、「居ないのか、切られたのか」を
 * ユーザーが区別できなかった。実際には43分前の発言が窓の外に落ちていただけ。
 *
 * ★応援レーン側は「いま N 件を表示中（ほか M人・直近アクティブ順）」と既に誠実に
 *   併記している(storyUserLaneGuideHtml.js:82)。同じ方針をグリッドにも適用する
 *   =「黙って切らない」(popup-entry.js:6898 の明示方針)。
 *
 * @param {number} total 全コメント件数(切り捨て前)
 * @param {number} [maxCells] 描画上限(既定=STORY_GROWTH_MAX_CELLS)
 * @returns {string}
 */
export function buildStoryGrowthGaugeLabel(total, maxCells) {
  const all = Math.max(0, Math.floor(Number(total) || 0));
  if (all <= 0) return '応援 0 コメント';
  const cap = Math.max(1, Math.floor(Number(maxCells) || STORY_GROWTH_MAX_CELLS));
  const hint = 'ホバーでプレビュー・クリックで詳細固定（Esc・外側クリックで閉じる）';
  if (all <= cap) {
    return `応援 ${all.toLocaleString('ja-JP')} コメント / ${hint}`;
  }
  // 切り捨てが起きているときだけ、何件を描いていて何件が窓の外かを明記する。
  const hidden = all - cap;
  return (
    `応援 ${all.toLocaleString('ja-JP')} コメント` +
    `（いま直近 ${cap.toLocaleString('ja-JP')} 件を表示中・ほか ${hidden.toLocaleString('ja-JP')} 件は表示枠の外）` +
    ` / ${hint}`
  );
}
