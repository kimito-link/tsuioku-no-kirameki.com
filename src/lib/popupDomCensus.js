/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】popup.html(iframe)側の DOM 量の要約と判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】popup 側 DOM 量の判定基準はこのファイルのみ
 *
 * popupDomCensus.js — ★popup.html(iframe)側の DOM を数える(調査計画 Step 1)。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ なぜ要るか(2026-08-20)
 *   実機で watch ページに「ページが応答しません」が出た。
 *   ★v0.1.1454 の `dom-nodes` 計器は **watch ページ本体**を数えている。
 *   実測(ユーザー実機 v0.1.1455): watch本体 **1,441個**・メモリ **上限の2%**
 *   ＝ **watch 側は DOM もメモリも正常**。それでも凍った。
 *
 *   ★一方、過去の実測 **13,682要素** は **popup.html(iframe)側**の数字で、
 *   **誰も継続的に測っていなかった**。ここを埋める。
 *
 * ■ ★台帳(`instrumentSpec.js`)の宣言に従う
 *   `dom-nodes @ popup` … unit:'elements' / window:'instant' /
 *   resetTrigger:'popup_reopen' / normal:'<=1500(業界推奨)'
 *   ★`dom-nodes @ watch` とは **別行**。混ぜると誤診①が再発する。
 *
 * ■ 何が分かるか(Step 1 の判定)
 *   `total - baseline ≈ tiles × 5` なら **タイルが主因** ＝ 中身LODで解ける。
 *   大きく超えるなら **タイル以外に膨らむ主因**がある ＝ LODでは解けない。
 *   ★この分離を数字で出すのがこのモジュールの仕事。
 *
 * ■ 掟
 *   - 純関数。DOM は呼び出し側が数えて渡す(ここは document を触らない)
 *   - 測れないときは **na**。0 と混同しない
 *     ([[unobserved-must-not-hide-the-cell-2026-08-15]])
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * ★タイル0枚のときの popup.html の要素数(実測・2026-08-20)。
 *   `popup.html?inline=1&dock=sidepanel` を開いて計測: **1,092**(再測で1,093=±1)。
 *   ★**タイルが1枚も無くても業界推奨1,500の73%を消費している**。
 *   ＝ タイルを全部消しても1,500は切れない。この事実は削減方針の前提になる。
 */
export const POPUP_DOM_EMPTY_BASELINE = 1092;

/** 1タイルの想定要素数(`personTileDom.js` の createElement: cell/img/meta/idRow/nameRow)。 */
export const POPUP_DOM_ELEMENTS_PER_TILE = 5;

/** 業界推奨(Lighthouse の警告閾値)。 */
export const POPUP_DOM_WARN = 1_500;

/** これを超えたら危険(実測13,682は基準の9倍だった)。 */
export const POPUP_DOM_BAD = 5_000;

/**
 * ★`Number(null)` は 0、`Number('')` も 0 になる＝**測っていないのに「0個」**として
 *   通ってしまう。実測で数値が入ったときだけ通す
 *   ([[unobserved-must-not-hide-the-cell-2026-08-15]])。
 *   ★同じ穴を `aboutBlankGapVerdict.js` でも踏んでテストに助けられた。
 * @param {unknown} v @returns {number|null}
 */
function num(v) {
  if (typeof v !== 'number') return null;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * @typedef {object} PopupDomCensus
 * @property {'ok'|'warn'|'bad'|'na'} level
 * @property {number|null} total 文書全体の要素数
 * @property {number|null} tiles タイル(セル)の枚数
 * @property {number|null} hollow 枠だけタイルの枚数(LODが効いているか)
 * @property {number|null} aboveBaseline 空の基準値からの増分
 * @property {number|null} explainedByTiles タイルで説明できる分(tiles×5)
 * @property {number|null} unexplained ★タイルで説明できない分(ここが大きいとLODでは解けない)
 * @property {Record<string, { tiles:number|null, nodes:number|null, perTile:number|null }>} perLane
 * @property {string} line 人が読む1行
 */

/**
 * popup 側の DOM 量を要約する純関数。
 *
 * @param {{ total?: unknown, tiles?: unknown, hollow?: unknown,
 *   perLane?: Record<string, { tiles?: unknown, nodes?: unknown }> }|null|undefined} raw
 * @returns {PopupDomCensus}
 */
export function summarizePopupDomCensus(raw) {
  const total = num(raw && /** @type {any} */ (raw).total);
  const tiles = num(raw && /** @type {any} */ (raw).tiles);
  const hollow = num(raw && /** @type {any} */ (raw).hollow);

  /** @type {Record<string, { tiles:number|null, nodes:number|null, perTile:number|null }>} */
  const perLane = {};
  const src = (raw && /** @type {any} */ (raw).perLane) || {};
  for (const [k, v] of Object.entries(src)) {
    const t = num(v && /** @type {any} */ (v).tiles);
    const n = num(v && /** @type {any} */ (v).nodes);
    // ★0除算で嘘をつかない。タイル0枚なら「1枚あたり」は存在しない=na。
    const perTile = t != null && n != null && t > 0 ? Math.round((n / t) * 10) / 10 : null;
    perLane[k] = { tiles: t, nodes: n, perTile };
  }

  if (total == null) {
    return {
      level: 'na',
      total: null, tiles: null, hollow: null,
      aboveBaseline: null, explainedByTiles: null, unexplained: null,
      perLane,
      line: 'パネルの部品数: ⚪未計測'
    };
  }

  const aboveBaseline = total - POPUP_DOM_EMPTY_BASELINE;
  const explainedByTiles = tiles != null ? tiles * POPUP_DOM_ELEMENTS_PER_TILE : null;
  const unexplained = explainedByTiles != null ? aboveBaseline - explainedByTiles : null;

  const level = total > POPUP_DOM_BAD ? 'bad' : total > POPUP_DOM_WARN ? 'warn' : 'ok';

  /*
   * ★数字だけ出して解釈を丸投げしない。
   *   「タイルで説明できない分」が大きいなら、中身LODを入れても解けないと分かる。
   */
  const hint = level === 'bad'
    ? ' 🔴推奨の3倍超(描画・GCが重くなる)'
    : level === 'warn'
      ? ' ⚠推奨1,500を超過'
      : '';
  const tileText = tiles != null ? ` / タイル${tiles}枚` : '';
  const hollowText = hollow != null && hollow > 0 ? `(枠だけ${hollow}枚)` : '';
  const breakdown = unexplained != null
    ? ` / 内訳: 基準${POPUP_DOM_EMPTY_BASELINE} + タイル${explainedByTiles} + その他${unexplained}`
    : '';

  return {
    level,
    total, tiles, hollow,
    aboveBaseline, explainedByTiles, unexplained,
    perLane,
    line: `パネルの部品数: ${total}個${hint}${tileText}${hollowText}${breakdown}`
  };
}
