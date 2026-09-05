/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】DOMの「木の形」を数字に要約する判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】木の形の判定基準はこのファイルのみ
 *
 * domTreeCensus.js — ★DOMの木を「絵」ではなく【数字】にして計器へ入れる。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー指示(2026-08-21)がこのモジュールの出発点
 *   「まずMCPデベロッパーツールで現在のDOMを全部把握して、
 *     それを計器に入れる基本から見直すべき」
 *   その後 DOM Tree Visualizer(可視化拡張)を見て:
 *   「これでできたものを計器にいれればいいかも」
 *   ★**考え方は正しい。ただし市販の可視化拡張ではこの症状に届かない。**
 *
 * ■ 市販の可視化拡張が使えない理由(調べた結果)
 *   1. ★拡張は **他の拡張のページ(chrome-extension://)に注入できない**
 *      = 黒くなっている当の文書(サイドパネル)を見られない
 *   2. 出るのは「いまの木の絵」で、★**黒い瞬間の時系列が残らない**
 *   3. 計器へ入れる形(JSON)で取り出せない
 *   4. ★content script が1つ増える ＝ いま追っている
 *      メインスレッド停止(実測 16.7秒中15.9秒)を**悪化させうる**
 *   → ★**自前で木を数字にする**。それが本モジュール。
 *
 * ■ 何を出すか(絵で人が気づくものを、数字にする)
 *   ・総数 / 最大の深さ / タグ別の上位
 *   ・★**一番子だくさんな親**＝どこが膨らんでいるか＝**直す場所**
 *   ★「深い」「偏っている」は可視化の絵で人が読み取るもの。
 *     それを数値化すれば、絵を見なくても速報1枚で分かる。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** タグ別の上位を何件出すか。 */
export const DOM_TREE_TOP_N = 5;

/** これより深いと警告(入れ子が深いほどスタイル再計算が重くなる)。 */
export const DOM_TREE_DEPTH_WARN = 20;

/** 1つの親がこれ以上の子を持つと警告(業界の目安: 1親60以下)。 */
export const DOM_TREE_WIDTH_WARN = 60;

/**
 * @typedef {object} DomNodeLite
 * @property {string} [tag] 小文字のタグ名
 * @property {number} [depth] ルートからの深さ(1起点)
 * @property {number} [childCount] 直接の子の数
 * @property {string} [id] 要素の id(あれば)
 */

/**
 * @typedef {object} DomTreeCensus
 * @property {'ok'|'warn'|'na'} level
 * @property {number|null} total 要素の総数
 * @property {number|null} maxDepth 最大の深さ
 * @property {Array<{ tag:string, count:number }>} topTags 多い順のタグ
 * @property {{ id:string, tag:string, childCount:number }|null} widest 一番子だくさんな親
 * @property {string} line 人が読む1行
 */

/** @param {unknown} v @returns {number} */
function n(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * DOMの木を要約する純関数。
 *
 * ★DOM は触らない。採取(走査)は呼び出し側が行い、軽い配列にして渡す。
 *
 * @param {ReadonlyArray<DomNodeLite>|null|undefined} nodes
 * @returns {DomTreeCensus}
 */
export function summarizeDomTree(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return {
      level: 'na',
      total: null,
      maxDepth: null,
      topTags: [],
      widest: null,
      line: 'DOMの木: ⚪未計測'
    };
  }

  /** @type {Record<string, number>} */
  const byTag = {};
  let maxDepth = 0;
  /** @type {{ id:string, tag:string, childCount:number }|null} */
  let widest = null;

  for (const raw of nodes) {
    const node = raw && typeof raw === 'object' ? raw : {};
    const tag = typeof node.tag === 'string' && node.tag ? node.tag : '(不明)';
    byTag[tag] = (byTag[tag] || 0) + 1;

    const depth = n(node.depth);
    if (depth > maxDepth) maxDepth = depth;

    const childCount = n(node.childCount);
    if (!widest || childCount > widest.childCount) {
      widest = {
        id: typeof node.id === 'string' && node.id ? node.id : '(id無し)',
        tag,
        childCount
      };
    }
  }

  const topTags = Object.entries(byTag)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, DOM_TREE_TOP_N);

  const deep = maxDepth > DOM_TREE_DEPTH_WARN;
  const wide = !!widest && widest.childCount > DOM_TREE_WIDTH_WARN;
  const level = deep || wide ? 'warn' : 'ok';

  /*
   * ★数字だけ出して解釈を丸投げしない。「どこが太いか」を名指しする
   *   ([[instrument-must-name-the-cause-2026-08-01]])。
   */
  const hint = deep && wide
    ? ' ⚠深くて広い(再計算が重くなる)'
    : deep
      ? ` ⚠深すぎ(推奨${DOM_TREE_DEPTH_WARN}以下)`
      : wide
        ? ` ⚠1つの親に子が多い(推奨${DOM_TREE_WIDTH_WARN}以下)`
        : '';
  const tagText = topTags.length
    ? ` / 多い順: ${topTags.map((t) => `${t.tag}${t.count}`).join(' ')}`
    : '';
  const widestText = widest
    ? ` / 一番太い親: ${widest.id}(${widest.tag}) 子${widest.childCount}`
    : '';

  return {
    level,
    total: nodes.length,
    maxDepth,
    topTags,
    widest,
    line: `DOMの木: ${nodes.length}個 / 深さ${maxDepth}${hint}${tagText}${widestText}`
  };
}
