/**
 * displayRecordedCount.js — 「画面に出す記録件数」の正本を1つに固定する純関数(v0.1.839・第1)。
 *
 * 背景(council/count-simplify-SYNTHESIS.md): 「記録件数」が実装で6カウンタに分裂し、表示が画面ごとに
 * 食い違う(ユーザー根底批判)。根治の第1歩=【表示の正本は recordedCountForDisplay(per-live 単調化済み)
 * の1本だけ】と決め、診断専用カウンタ(savedCommentsUidStats / commentIngestBySource)を表示に混ぜない
 * ことを純関数+テストで固定する(挙動不変の宣言)。
 *
 * 表示の正本(採用): panel summary の recordedCount(= content の recordedCountForDisplay(lid) 由来)。
 * 表示に【使ってはいけない】診断専用カウンタ:
 *   - savedCommentsUidStats.totalSaved/withUid(最後の flush batch だけ・全保存でない)
 *   - commentIngestBySource.*(取込源別の累積・重複/未保存込み)
 *   - displayEntriesBase.length を max で混ぜること(UI生成数・未生成/除外で減り 0 潰しの一因)
 *
 * 副作用なし。第2以降で countToShow の max・配信者除外の引き算・各ゲートを段階的に剥がす。
 */

/** 表示記録件数の正本フィールド名(panel summary 上)。診断カウンタと取り違えない単一の真実。 */
export const DISPLAY_RECORDED_COUNT_FIELD = 'recordedCount';

/** 表示に使ってはいけない診断専用カウンタの名前(取り違え検知・ドキュメント兼用)。 */
export const DIAGNOSTIC_ONLY_COUNT_FIELDS = Object.freeze([
  'savedCommentsUidStats',
  'commentIngestBySource',
  'totalSaved',
  'withUid'
]);

/**
 * panel summary から「画面に出す記録件数」を取り出す唯一の入口。
 * recordedCount(per-live 単調化済みの表示正本)だけを見る。無ければ 0(負・非数は 0 に丸める)。
 * @param {{ recordedCount?: unknown }|null|undefined} summary
 * @returns {number}
 */
export function selectDisplayRecordedCount(summary) {
  if (!summary || typeof summary !== 'object') return 0;
  const n = Number(/** @type {any} */ (summary).recordedCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
