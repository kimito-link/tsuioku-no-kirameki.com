/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】フレームの innerText 断片から視聴者数を拾う / snapshot へ合流させる判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】「既にある値を上書きしない」という合流規則はこのファイルのみ
 *
 * ★なぜ切り出したか(2026-08-12・v0.1.1338)
 *   popup-entry.js が max-lines(22,119行)に到達し、1行も足せなくなった。
 *   上限を上げるのは「22,000行になった原因」そのものなので採らない。
 *   この2関数は I/O も chrome.* も持たない純粋計算で、依存も
 *   parseViewerCountFromLooseText(既に lib)だけ＝【内部依存が最も少ない】
 *   ([[extract-by-dependency-count-not-size]]: 大きい順でなく依存が少ない順に抽出する)。
 *
 * ★挙動は一切変えない。popup-entry.js から【そのまま】移設した(移設版=refactor)。
 *
 * @module viewerCountProbeMerge
 */

import { parseViewerCountFromLooseText } from './liveAudienceDom.js';

/**
 * innerText 断片から視聴者数を拾う(content より先にポップアップ側で試す)。
 *
 * @param {ReadonlyArray<{ frameId?: number, score?: number, text?: string }>|null|undefined} frames
 * @returns {number|null} 最初に拾えた値。1つも拾えなければ null
 */
export function probeViewerCountFromFrameTexts(frames) {
  const list = Array.isArray(frames) ? frames : [];
  for (const f of list) {
    const n = parseViewerCountFromLooseText(f?.text);
    if (n != null) return n;
  }
  return null;
}

/**
 * 拾った視聴者数を snapshot へ合流させる。
 *
 * ★規則: 既に有効な値があるなら【上書きしない】。
 *   probe は補助的な推定で、content script が取れた実値より弱い。
 *   ここを逆にすると弱い値が強い値を潰す(パリティが崩れる)。
 *
 * @template {{ viewerCountFromDom?: unknown }} T
 * @param {T|null|undefined} snap
 * @param {number|null|undefined} probe
 * @returns {T|null|undefined} 合流後の snapshot(変更が無ければ元の参照をそのまま返す)
 */
export function mergeViewerProbeIntoSnapshot(snap, probe) {
  if (!snap || probe == null) return snap;
  const cur = /** @type {any} */ (snap).viewerCountFromDom;
  if (typeof cur === 'number' && Number.isFinite(cur) && cur >= 0) return snap;
  return { ...snap, viewerCountFromDom: probe };
}
