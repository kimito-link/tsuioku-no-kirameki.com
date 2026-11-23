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

/**
 * 会場帯・状態ページ向けに、表示用の件数文字列を数値へ戻す。
 * 「1,956」「1956」を受け、プレースホルダー（— など）や非数は null。
 * @param {unknown} text
 * @returns {number|null}
 */
export function parseDisplayCountText(text) {
  if (text == null) return null;
  const s = String(text).trim();
  if (!s || s === '—' || s === '-' || s === '–' || s === '…' || s === '...') return null;
  const n = Number(s.replace(/[,，\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * この配信の「記録件数」を、会場帯と状態ページで同じ値に揃える。
 * 正本（panel_summary の recordedCount）と鏡/写しの数字があるときは大きい方を使う。
 * （開いた瞬間の「記録 1」が鏡に凍ったまま正本を潰さない。同一配信内で件数が減って見えないようにする。）
 * どれも無ければ null（未知を「0件」と出さない）。
 *
 * @param {{ recordedCount?: unknown, mirrorTexts?: unknown[] }} [input]
 * @returns {number|null}
 */
export function resolveRecordsCountForDisplay(input = {}) {
  /** @type {number[]} */
  const xs = [];
  const raw = input?.recordedCount;
  if (raw != null && raw !== '') {
    const rec = Number(raw);
    if (Number.isFinite(rec) && rec >= 0) xs.push(Math.floor(rec));
  }
  const texts = Array.isArray(input?.mirrorTexts) ? input.mirrorTexts : [];
  for (const t of texts) {
    const n = parseDisplayCountText(t);
    if (n != null) xs.push(n);
  }
  if (!xs.length) return null;
  return Math.max(...xs);
}
