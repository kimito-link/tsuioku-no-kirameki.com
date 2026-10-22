/**
 * v0.1.1738: スマホ(WEB版)で「経過」「最終取り込み」が止まって見えるのを防ぐ。
 *   PC は中身が変わらないとき送らない(時刻だけの変化は送信の理由にしない・最長120秒)ので、
 *   届いた値は「送った時点」のもの。送った時刻(generatedAt)からの経過分をスマホ側で足して見せる。
 *   終了した配信は足さない(経過は終了時点で止まっているのが正しい)。
 *   PC とスマホの時計のずれで変な値にならないよう、足す量は 0〜10分 に収める。
 *
 * ★制約: 純関数(chrome 非依存・副作用なし)。
 * @module liveElapsedExtrapolate
 */

/** 足す量の上限(これより古い送信は「止まっている」ので、それ以上は進めない)。 */
export const MAX_EXTRAPOLATE_MS = 10 * 60 * 1000;

/** @param {unknown} v */
function toEpochMs(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/**
 * @param {any} live summarizeOneLive の1要素
 * @param {unknown} generatedAt 送った時刻(ISO 文字列か epoch ms)
 * @param {number} nowMs
 * @returns {any} 進めた写し(進められなければ元のまま)
 */
export function extrapolateLiveForDisplay(live, generatedAt, nowMs) {
  if (!live || typeof live !== 'object' || live.endedAt) return live;
  const gen = toEpochMs(generatedAt);
  const now = Number(nowMs) || 0;
  if (!gen || !now) return live;
  const age = Math.min(MAX_EXTRAPOLATE_MS, Math.max(0, now - gen));
  if (!age) return live;
  const out = { ...live };
  if (typeof live.elapsedSec === 'number' && Number.isFinite(live.elapsedSec)) {
    out.elapsedSec = live.elapsedSec + Math.floor(age / 1000);
  }
  if (typeof live.lastIngestAgoMs === 'number' && Number.isFinite(live.lastIngestAgoMs)) {
    out.lastIngestAgoMs = live.lastIngestAgoMs + age;
  }
  return out;
}
