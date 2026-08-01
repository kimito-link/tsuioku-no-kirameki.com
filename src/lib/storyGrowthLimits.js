/**
 * りんく成長グリッド（story growth）の描画上限。
 * コメント数に比例して DOM が増えるため、直近ウィンドウだけ描画する。
 */
export const STORY_GROWTH_MAX_CELLS = 360;

/**
 * グリッドの表示窓の先頭位置を決める純関数(v0.1.1217)。
 *
 * ユーザー報告(2026-08-01)「積み上げ式にならず、もともと記録されたアイコンがちらちら変わる。
 * この人はどんな発言をしたのかが追いづらい」の根治。
 *
 * 【旧】offset = 全件数 - 上限
 *   → 上限を超えると**コメント1件ごとに offset が1進み、全マスの中身がずれる**。
 *     i番目のマスに毎回別人が入るので、狙った人を掴む前に位置が変わっていた。
 *     v0.1.1208 の churn 計器が「積み上がりのみ」と報告したのは計器の盲点で、
 *     DOM枚数を変えず中身だけ書き換える経路(patchStoryGrowthIconsFromSource)を
 *     数えていなかったため(v0.1.1215 で計測可能にした)。
 *
 * 【新】offset = 0 で固定
 *   → 最初の360件を「名簿」として凍結する。一度並んだ人は二度と動かない。
 *     上限到達後の新規コメントはグリッドに出さず、件数ラベルで「ほかN件」と伝える。
 *
 * ★会議(2026-08-01・4体)の結論。3体が本案を支持:
 *   - グリッドの役割は「固定された名簿からの逆引き」。「今来た人に気づく」のは
 *     応援レーン(直近アクティブ順・storyUserLaneGuideHtml.js:82)とランキングが担う
 *   - 上限前後で体験が地続きになる(0〜359=積み上がる / 360で名簿完成 / 以降はラベルが伸びる)
 *   - DOM が360で完全に頭打ちになり、1万件・4時間超でも一定
 *   - diff-skip 機構(ちらつき対策で7版かけた資産)を壊さない
 *   反対意見(新規が見えなくなる)は事実誤認だった。応援レーンに新規は出る。
 *
 * @param {number} sourceLength 全コメント件数
 * @param {number} [maxCells] 描画上限(既定=STORY_GROWTH_MAX_CELLS)
 * @returns {number} 表示窓の先頭位置(常に0=先頭固定)
 */
export function resolveStoryGrowthWindowOffset(sourceLength, maxCells) {
  const len = Math.max(0, Math.floor(Number(sourceLength) || 0));
  const cap = Math.max(1, Math.floor(Number(maxCells) || STORY_GROWTH_MAX_CELLS));
  // 先頭固定。上限未満でも超過でも 0(=最初の1件目から並べる)。
  //   ★この関数が常に0を返すことが「ちらつかない」の担保。将来ここを
  //     len - cap のような式に戻すと、上限超過で全マスがずれる問題が再発する。
  void len;
  void cap;
  return 0;
}

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
  // v0.1.1217: 窓を先頭固定にしたので「直近N件」ではなく「はじめのN件」が実態。
  //   ここを「直近」のままにすると、実際には出ていない最新のコメントが
  //   グリッドにあるかのような嘘になる(「黙って切らない」方針に反する)。
  const hidden = all - cap;
  return (
    `応援 ${all.toLocaleString('ja-JP')} コメント` +
    `（グリッドははじめの ${cap.toLocaleString('ja-JP')} 件で固定・` +
    `そのあとの ${hidden.toLocaleString('ja-JP')} 件は下の応援レーンに出ます）` +
    ` / ${hint}`
  );
}

/**
 * グリッド各セルの「同一ユーザー」注記を作る純関数(v0.1.1209)。
 *
 * {@link buildStoryGrowthGaugeLabel} と同じ「黙って切らない」問題の、別の表面。
 * ゲージラベルは v0.1.1202 で手当て済みだったが、セルの aria-label / title は漏れていた。
 *
 * 数え方の実体: ordinal も total も buildSupportAccentIndex(userSupportGridAccent.js) が
 * 「表示ウィンドウ内だけ」を走査した値であり、全件の集計ではない。にもかかわらず文言が
 * 「一覧に同ユーザー計N件」と書いていたため、
 *   - 窓の外にも発言があるのに「一覧にはこれで全部」と読める
 *   - 43分前の発言が窓外へ落ちた瞬間、ordinal が黙って巻き戻る
 * という乖離があった。窓が効いているときは「枠内での数え」であることを明示する。
 *
 * ★ユーザー単位の全件数は窓内から算出できない(出すにはセルごとの全件走査=O(N²)が要る。
 *   それは userSupportGridAccent.js:189 が「ページが応答しません」の真因として撤去した経路)。
 *   よって枠外の件数は数字で出さず、「ある場合あり」という可能性の明示に留める。
 *
 * ★引数はスカラーのみ。配列を受け取らない形にすることで、この関数が
 *   ホットパス(applyStoryGrowthIconAttributes=セル描画ごと)に走査を持ち込めないことを
 *   型シグネチャで保証する。
 *
 * @param {object} [args]
 * @param {number} [args.ordinal] 表示ウィンドウ内で何件目か(1始まり)
 * @param {number} [args.total] 表示ウィンドウ内の同一ユーザー総数
 * @param {boolean} [args.windowed] 窓が全件より小さいか(=切り捨てが起きているか)
 * @returns {string} 注記(単独ユーザーなら空文字)
 */
export function buildSupportSameUserBlurb({ ordinal, total, windowed } = {}) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n <= 1) return '';
  const nth = Math.max(1, Math.floor(Number(ordinal) || 1));
  // 窓が全件を覆っているときは、従来どおりの文言(後方互換)。
  if (!windowed) return `同一ユーザー${nth}件目、一覧に同ユーザー計${n}件。`;
  // 切り捨てが起きているときだけ、数えた範囲が「枠内」であることを明示する。
  return `同一ユーザー${nth}件目、表示中の枠内で計${n}件（枠外にもある場合あり）。`;
}
