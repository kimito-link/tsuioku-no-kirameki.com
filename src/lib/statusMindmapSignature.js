/**
 * statusMindmapSignature.js — マインドマップの再描画を止める署名を作る純関数。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-19・ユーザー「診断ページ重い」)
 *   status-entry.js:2797 は `JSON.stringify(model)` を署名にしていた。
 *   ところがモデルには【時刻由来の文字列】が入っている:
 *     statusMindmapModel.js:109  `${Math.round(ago / 1000)} 秒前`
 *     status-entry.js:3245       `Date.now() - 取得時刻` で毎tick再計算
 *   ＝記録中の配信が1件でもあれば署名が毎tick変わり、
 *     `host.innerHTML = ''`(:2804)が【一度もスキップされない】。
 *     100〜200ノードを2秒ごとに全再構築していた。
 *
 * ■ ★これは v0.1.1409 で健全度セルについて直したのと【同じ型】のバグ
 *   当時の直し方(status-entry.js:2425-2427)がそのまま手本になる:
 *     「署名は level と数値だけで作る(表示は従来どおり text を出す)。
 *       level が変われば必ず再描画されるので、異常の見落としは起きない。
 *       秒数の刻みだけが画面に反映されなくなるが、それは次の tick で追いつく」
 *   ＝同じ原則をマインドマップにも適用する。
 *
 * ■ ★副作用として直るもの
 *   status-entry.js:2787 が嘆いていた「ユーザーが開いた枝が2秒で閉じる」も止まる
 *   (毎tick作り直さなくなるため)。
 *
 * ■ 掟
 *   - 純関数。DOM も Date も触らない(モデルは呼び出し側が渡す)。
 *   - ★時間で変わる文字列を署名に混ぜない
 *     [[timestamp-in-dedupe-key-double-counts]] / v0.1.1409 / v0.1.1320 / v0.1.1412 で
 *     このリポは【3回】踏んでいる。
 *
 * @module statusMindmapSignature
 */

/**
 * 署名から外す値の見分け方。
 * ★「◯秒前」「◯分前」「◯秒経過」のように【時間の経過】を表す文字列だけを落とす。
 *   件数(◯件)やパーセント(◯%)は落とさない = 中身が変われば必ず再描画される。
 */
const ELAPSED_VALUE_RE = /^\s*-?\d+(?:\.\d+)?\s*(秒前|分前|時間前|秒経過|分経過|秒|ms)\s*$/;

/**
 * この値が「時間の経過」を表すか。★構造で判定する(文字列に閉じない)。
 *
 * @param {unknown} value ノードの value
 * @returns {boolean} true=署名から外す
 */
export function isElapsedValue(value) {
  if (typeof value !== 'string') return false;
  return ELAPSED_VALUE_RE.test(value);
}

/**
 * マインドマップの署名を作る。
 *
 * ★方針(v0.1.1409 と同じ):
 *   - label / badge / children の構造は【そのまま含める】= 異常の見落としを作らない
 *   - value のうち【時間の経過だけ】を落とす = 秒の刻みで再描画しない
 *
 * @param {unknown} model MindNode(ルート)
 * @returns {string} 署名。作れないときは '' (呼び出し側は従来どおり毎回描く=安全側)
 */
export function buildStatusMindmapSignature(model) {
  /** @param {any} node @returns {string} */
  const walk = (node) => {
    if (!node || typeof node !== 'object') return '';
    const label = String(node.label ?? '');
    const badge = String(node.badge ?? '');
    // ★時間の経過を表す value は署名に入れない(表示には従来どおり出る)
    const rawValue = node.value;
    const value = isElapsedValue(rawValue) ? '' : String(rawValue ?? '');
    const kids = Array.isArray(node.children) ? node.children.map(walk).join(',') : '';
    return `${label}|${value}|${badge}[${kids}]`;
  };
  try {
    return walk(model);
  } catch {
    return '';
  }
}
