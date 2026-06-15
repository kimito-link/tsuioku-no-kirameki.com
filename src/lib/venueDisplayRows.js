/**
 * venueDisplayRows.js
 *
 * 会場モードの「空っぽ・途中で消える・ちらつき」根治の正本(2026-06-15・会議+根本原因調査)。
 *
 * 根本原因: aggregateParticipants(30秒) と pollSpeech(1.5秒) が共有 baseRows を上書きし、
 *   集計が一瞬0件/失敗で来ると renderSeats(空) が走って全席+吹き出しが消える。
 *
 * 設計: 「一度非空になったら、入力が空でも前回の非空データを保持して空で再描画しない」。
 *   popup-entry.js の lastGoodRefreshOpenBag(直近成功データ再利用でチラつき防止)と同じ idiom。
 *   配信切替時は呼び出し側が lastGood を [] にリセットして前配信を持ち越さない(世代管理)。
 *
 * このファイルは純関数(DOM/chrome 非依存・テスト可能)。
 */

/**
 * 表示行を「新鮮データ優先・空なら前回保持」で決める。
 *
 * @param {unknown} incoming 今回の集計/マージ結果(空配列や非配列になりうる)
 * @param {unknown} lastGood 直近の非空表示行(初回は [])
 * @returns {{ rows: any[], nextLastGood: any[], usedFallback: boolean }}
 *   rows=今回描画すべき行 / nextLastGood=次回呼び出しに渡す lastGood / usedFallback=前回保持を使ったか
 */
export function resolveDisplayRows(incoming, lastGood) {
  const inRows = Array.isArray(incoming) ? incoming : [];
  const prev = Array.isArray(lastGood) ? lastGood : [];

  // 新鮮データが来ていれば必ず採用し、lastGood を更新する(古いデータに固着しない=INV-2)。
  if (inRows.length > 0) {
    return { rows: inRows, nextLastGood: inRows, usedFallback: false };
  }
  // 入力が空でも、前回の非空データがあれば維持する(空で再描画しない=INV-1)。
  if (prev.length > 0) {
    return { rows: prev, nextLastGood: prev, usedFallback: true };
  }
  // 本当に誰も居ない(初回など)。
  return { rows: [], nextLastGood: [], usedFallback: false };
}
