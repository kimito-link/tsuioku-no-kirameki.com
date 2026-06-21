/**
 * 「ちくらん風」配信カードの表示モデル純関数(v0.1.866)。
 *
 * 背景(ユーザー要望 2026-06-21・ニコ生公式『注目番組ランキング(ちくらん)』のスクショ提示):
 *   視聴中の各配信を、公式ちくらんのように【サムネ + 配信者名 + タイトル + 経過 + 来場 + コメント + ギフト】
 *   の一覧で見たい。status の livesData(summarizeOneLive の戻り)に既にこれらの値がある(thumbnailUrl は
 *   v0.1.866 で追加)=既存データを活かすだけ(星野ロミ式・過剰実装回避)。
 *
 * 設計(self-verifying):
 *   - 表示専用の純関数。値の整形(千区切り/経過/欠落は null)だけ。取れない値は null=DOM 側で出さない
 *     (空欄を「0」と偽らない)。
 *   - 並び順は呼び出し側が決める(既定は来場降順)。ここは1配信→1カードモデルの整形に専念。
 *
 * @typedef {{
 *   lv: string,
 *   broadcasterName: string,
 *   title: string,
 *   thumbnailUrl: string,        // '' なら無し(DOM はプレースホルダ表示)
 *   elapsedText: string|null,    // 'h:mm:ss' / 'm:ss'。取れなければ null
 *   watchCount: number|null,     // 来場
 *   commentCount: number|null,   // 記録コメント数(recordedCount)
 *   giftPoints: number|null,     // ギフトpt
 *   adPoints: number|null,       // 広告pt
 *   ended: boolean
 * }} ChikuranCardModel
 */

/** @param {unknown} v @returns {number|null} null/undefined/'' は null(Number(null)=0 の握り潰しを防ぐ) */
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 経過秒を h:mm:ss / m:ss に整形(statusFormat.formatElapsed と同仕様・依存を増やさないため内製)。
 * @param {unknown} sec @returns {string|null}
 */
export function formatElapsedText(sec) {
  const s = numOrNull(sec);
  if (s == null || s < 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  /** @param {number} n */
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/**
 * livesData の1要素(summarizeOneLive 戻り)を、ちくらん風カードの表示モデルに整形する。
 * @param {any} live
 * @returns {ChikuranCardModel|null} lv が無ければ null
 */
export function buildChikuranCardModel(live) {
  const lv = String(live?.lv || '').trim().toLowerCase();
  if (!lv) return null;
  return {
    lv,
    broadcasterName: String(live?.broadcasterName || '').trim(),
    title: String(live?.title || '').trim(),
    thumbnailUrl: String(live?.thumbnailUrl || '').trim(),
    elapsedText: formatElapsedText(live?.elapsedSec),
    watchCount: numOrNull(live?.watchCount),
    commentCount: numOrNull(live?.recordedCount),
    giftPoints: numOrNull(live?.giftPoints),
    adPoints: numOrNull(live?.adPoints),
    ended: !!live?.endedAt
  };
}

/**
 * 配信一覧を「ちくらん風」の並び順にする(既定=来場降順・同数はコメント降順・終了は末尾)。
 * @param {object[]} livesData
 * @returns {ChikuranCardModel[]}
 */
export function buildChikuranList(livesData) {
  const list = (Array.isArray(livesData) ? livesData : [])
    .map(buildChikuranCardModel)
    .filter((m) => m != null);
  return /** @type {ChikuranCardModel[]} */ (list).sort((a, b) => {
    if (a.ended !== b.ended) return a.ended ? 1 : -1; // 放送中を上、終了を下。
    const aw = a.watchCount ?? -1;
    const bw = b.watchCount ?? -1;
    if (bw !== aw) return bw - aw; // 来場降順。
    return (b.commentCount ?? -1) - (a.commentCount ?? -1); // 同数はコメント降順。
  });
}
