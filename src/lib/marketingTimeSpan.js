/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】マーケ分析の「時間の流れ」(1分ごと・秒ごとの列)に渡すコメントの時間の幅の上限
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.* / Observer / タイマー
 * 【正本宣言】時間の幅の上限はこのファイルだけで決める(marketingAggregate・marketingChartsHtml が使う)
 *
 * v0.1.2263(りんく 11-27 YouTube 動画のマーケHTML「Maximum call stack size exceeded」→「Invalid string length」):
 *   分析の部品(速さ・沈黙・笑い・疲れ・気分など)は、1本の配信(数時間)の中を1分ごとに数える作り。
 *   動画のコメントは何年にもわたるので、1分ごとの列が数百万になり、配列・文字列が上限を超えた。
 *   部品ごとに直すと、新しい部品を足すたびに同じ事故が起きる。入口で「時間の幅」を1か所で決めて、
 *   どの部品にも上限を超えた幅を渡さない。数(人数・件数・ランキング)は全件のまま。
 */

import { toEpochMs } from './timeAuthority.js';

/** 時間の流れを1分ごとに作る最大の幅(7日)。ライブ配信はこの中に収まる。 */
export const MARKETING_TIMELINE_MAX_MINUTES = 7 * 24 * 60;

/**
 * 時間の流れの分析に渡すコメントを、新しい側の上限の幅(既定 7日)だけにする。幅に収まれば同じ配列をそのまま返す(コピーしない)。
 * 時刻の無いコメント(capturedAt が 0 など)は、もともと時間の流れには入らないので、そのまま残す。
 * @template {{ capturedAt?: unknown }} T
 * @param {readonly T[] | null | undefined} comments
 * @param {number} [maxMinutes]
 * @returns {{ comments: readonly T[], windowed: boolean, spanMinutes: number, fromMs: number, toMs: number }}
 */
export function boundCommentsToTimeWindow(comments, maxMinutes = MARKETING_TIMELINE_MAX_MINUTES) {
  const list = Array.isArray(comments) ? comments : [];
  const limit = Math.max(1, Math.floor(Number(maxMinutes) || MARKETING_TIMELINE_MAX_MINUTES)) * 60_000;
  let minT = Infinity;
  let maxT = -Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const t = toEpochMs(list[i]?.capturedAt);
    if (!Number.isFinite(t) || t <= 0) continue;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  if (!(maxT >= minT)) return { comments: list, windowed: false, spanMinutes: 0, fromMs: 0, toMs: 0 };
  const spanMinutes = Math.round((maxT - minT) / 60_000);
  if (maxT - minT <= limit) return { comments: list, windowed: false, spanMinutes, fromMs: minT, toMs: maxT };
  const from = maxT - limit;
  /** @type {T[]} */
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const t = toEpochMs(list[i]?.capturedAt);
    if (!Number.isFinite(t) || t <= 0 || t >= from) out.push(list[i]);
  }
  return { comments: out, windowed: true, spanMinutes, fromMs: from, toMs: maxT };
}
