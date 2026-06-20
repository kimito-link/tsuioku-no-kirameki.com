/**
 * HTML/メディアキットレポート用のコメント集合を選ぶ純関数。
 *
 * 背景(v0.1.853 根治): レポートは「全件」が必要。従来 resolveCommentsForHtmlExport は popup を
 * 当該配信で開いていると in-memory の表示エントリ(応援アイコン列/ストーリー UI 用の【表示専用・
 * キャップ済み】displayList)へ短絡し、storage に7,855件あってもレポートが27件しか反映しない断線が
 * あった。正しくは storage の正本(全件)を最優先し、storage が空(稀な読み失敗)の時だけ、空レポート
 * よりマシな最終手段として in-memory 表示エントリにフォールバックする。
 *
 * @template T
 * @param {T[]|null|undefined} full storage 全件(readAllCommentsForLive の結果)
 * @param {T[]|null|undefined} memEntries in-memory 表示エントリ(キャップ済み・フォールバック専用)
 * @param {boolean} memMatchesLive memEntries が今レポート対象の配信のものか
 * @returns {T[]}
 */
export function pickCommentsForExport(full, memEntries, memMatchesLive) {
  const fullArr = Array.isArray(full) ? full : [];
  if (fullArr.length > 0) return fullArr; // storage 全件が正本(最優先)。
  // storage が空のときだけ: 同一配信の表示エントリがあれば空より良いので使う。
  if (memMatchesLive && Array.isArray(memEntries) && memEntries.length > 0) {
    return memEntries;
  }
  return fullArr; // どちらも無ければ空(=該当データ無し)。
}
