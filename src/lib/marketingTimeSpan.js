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
  let previousMax = -Infinity;
  let dated = 0;
  for (let i = 0; i < list.length; i += 1) {
    const t = toEpochMs(list[i]?.capturedAt);
    if (!Number.isFinite(t) || t <= 0) continue;
    if (t < minT) minT = t;
    dated += 1;
    if (t >= maxT) { previousMax = maxT; maxT = t; }
    else if (t > previousMax) previousMax = t;
  }
  if (!(maxT >= minT)) return { comments: list, windowed: false, spanMinutes: 0, fromMs: 0, toMs: 0 };
  const spanMinutes = Math.round((maxT - minT) / 60_000);
  if (maxT - minT <= limit) return { comments: list, windowed: false, spanMinutes, fromMs: minT, toMs: maxT };
  const isolated = dated >= 3 && previousMax - minT <= limit && maxT - previousMax > 2 * limit;
  const to = isolated ? previousMax : maxT;
  const from = to - limit;
  /** @type {T[]} */
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const t = toEpochMs(list[i]?.capturedAt);
    if (!Number.isFinite(t) || t <= 0 || (t >= from && t <= to)) out.push(list[i]);
  }
  return { comments: out, windowed: true, spanMinutes, fromMs: from, toMs: to };
}

/**
 * 時間の流れの列(速さ・笑い・気分・1分ごとの件数)1本あたりの点の数の上限。
 * 1分ごとなら 24時間、30秒ごとなら 12時間まで、ライブ配信は今までと同じ細かさのまま。
 * これより長い幅(動画のコメントは何年にもわたる)は、1点の幅を広げて点の数をこの中に収める。
 */
export const MARKETING_SERIES_MAX_BUCKETS = 1440;

/** 広げるときの1点の幅(きりのいい幅だけ使う)。 */
const NICE_BUCKET_MS = [
  30_000, 60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 2 * 3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
  86_400_000, 2 * 86_400_000, 7 * 86_400_000, 14 * 86_400_000, 30 * 86_400_000,
  91 * 86_400_000, 182 * 86_400_000, 365 * 86_400_000
];

/**
 * 時間の流れの列の1点の幅を決める。幅(spanMs)を baseMs ごとに区切って maxBuckets 点に収まれば baseMs のまま。
 * 収まらないときは、収まる最小のきりのいい幅にする(点の数はいつも maxBuckets 以下)。
 * @param {number} spanMs 最初と最後のコメントの時刻の差
 * @param {number} baseMs 既定の1点の幅(1分なら 60000)
 * @param {number} [maxBuckets]
 * @returns {number}
 */
export function seriesBucketMs(spanMs, baseMs, maxBuckets = MARKETING_SERIES_MAX_BUCKETS) {
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 60_000;
  const cap = Math.max(2, Math.floor(Number(maxBuckets) || MARKETING_SERIES_MAX_BUCKETS));
  const span = Number.isFinite(spanMs) && spanMs > 0 ? spanMs : 0;
  if (Math.floor(span / base) + 1 <= cap) return base;
  const need = Math.ceil(span / (cap - 1));
  for (const s of NICE_BUCKET_MS) if (s >= base && s >= need) return s;
  return Math.ceil(need / 86_400_000) * 86_400_000;
}

/**
 * v0.1.2265: ライブの列の点の数の上限(7日を30秒ごと=20161点)。7日以内のライブは今までの細かさ(1分・30秒)のまま。
 *   描く側の守り(capSeriesPoints)もこの数まで。動画の列は MARKETING_SERIES_MAX_BUCKETS 以下なので変わらない。
 */
export const MARKETING_LIVE_SERIES_MAX_BUCKETS = MARKETING_TIMELINE_MAX_MINUTES * 2 + 1;

/**
 * v0.1.2265: 種類つきの1点の幅。ライブで幅が7日以内なら baseMs のまま(今までと同じ出力)。
 *   7日を超える幅(ライブでも、同じ鍵に何週間も記録がたまったとき)は、動画と同じく点の数を上限に収める。
 *   0.1.2263 の一時版はライブを上限から外していて、30日分のライブ記録で HTML が 23MB・400日分で 307MB になった。
 * @param {number} spanMs
 * @param {number} baseMs
 * @param {string} [contentKind]
 * @returns {number}
 */
export function seriesBucketMsForKind(spanMs, baseMs, contentKind) {
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 60_000;
  const span = Number.isFinite(spanMs) && spanMs > 0 ? spanMs : 0;
  if (contentKind === 'live' && span <= MARKETING_TIMELINE_MAX_MINUTES * 60_000) return base;
  return seriesBucketMs(span, base);
}

/**
 * 1点の幅を短い日本語に(「30秒」「1分」「6時間」「7日」)。
 * @param {number} ms
 */
export function formatBucketMsJa(ms) {
  const v = Number(ms) || 0;
  if (v < 60_000) return `${Math.max(1, Math.round(v / 1000))}秒`;
  if (v < 3_600_000) return `${Math.round(v / 60_000)}分`;
  if (v < 86_400_000) return `${Math.round(v / 3_600_000)}時間`;
  return `${Math.round(v / 86_400_000)}日`;
}

/**
 * 最初のコメントからの経過を、1点の幅に合う細かさの日本語に(「3分30秒」「5時間」「120日」)。
 * @param {number} offsetMs
 * @param {number} bucketMs
 */
export function formatSeriesOffsetJa(offsetMs, bucketMs) {
  const o = Math.max(0, Number(offsetMs) || 0);
  const b = Number(bucketMs) || 60_000;
  if (b < 60_000) return `${Math.floor(o / 60_000)}分${Math.floor((o % 60_000) / 1000)}秒`;
  if (b < 3_600_000) return `${Math.floor(o / 60_000)}分`;
  if (b < 86_400_000) return `${Math.floor(o / 3_600_000)}時間`;
  return `${Math.floor(o / 86_400_000)}日`;
}

/**
 * 長い列でも落ちない最大値(最小 1)。Math.max(1, ...arr) は列が長いと「Maximum call stack size exceeded」になる。
 * @param {ArrayLike<number>} arr
 * @returns {number}
 */
export function maxOfList(arr) {
  let m = 1;
  const n = arr ? arr.length : 0;
  for (let i = 0; i < n; i += 1) {
    const v = Number(arr[i]);
    if (v > m) m = v;
  }
  return m;
}

/**
 * 描画する点の数を上限までに間引く(元の列が上限以下ならそのまま返す)。間引くときは等間隔に選ぶ。
 * @template T
 * @param {readonly T[]} list
 * @param {number} [maxPoints]
 * @returns {readonly T[]}
 */
export function capSeriesPoints(list, maxPoints = MARKETING_SERIES_MAX_BUCKETS) {
  const arr = Array.isArray(list) ? list : [];
  const cap = Math.max(2, Math.floor(Number(maxPoints) || MARKETING_SERIES_MAX_BUCKETS));
  if (arr.length <= cap) return arr;
  /** @type {T[]} */
  const out = [];
  const step = (arr.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i += 1) out.push(arr[Math.round(i * step)]);
  return out;
}

/**
 * v0.1.2263(りんく 11-28「古い動画のマーケHTMLの見出しが 9856800 分」): 配信の長さ(分)を、見出し・カードに出す形にする。
 *   7日以内(ライブ)は今までと同じ「N分」。それより長い幅(動画のコメントは何年にもわたる)は「コメントの期間 11年3日」。
 *   どのサービスでも、何百万分のような数を出さない。
 * @param {unknown} durationMinutes
 * @returns {{ long: boolean, text: string, value: string, label: string }}
 */
export function marketingSpanDisplay(durationMinutes) {
  const m = Math.max(0, Math.floor(Number(durationMinutes) || 0));
  if (m <= MARKETING_TIMELINE_MAX_MINUTES) return { long: false, text: `${m}分`, value: String(m), label: '分' };
  const days = Math.floor(m / (24 * 60));
  const years = Math.floor(days / 365);
  const rest = days % 365;
  const value = years > 0 ? `${years}年${rest > 0 ? `${rest}日` : ''}` : `${days}日`;
  return { long: true, text: `コメントの期間 ${value}`, value, label: 'コメントの期間' };
}

/**
 * 1日以上の間(動画のコメントの間など)を「68日」「11年3日」に。1日未満は null(呼び出し側の今までの書き方のまま)。
 * @param {unknown} ms
 * @returns {string | null}
 */
export function formatLongGapJa(ms) {
  const v = Number(ms) || 0;
  if (v < 86_400_000) return null;
  const days = Math.floor(v / 86_400_000);
  const years = Math.floor(days / 365);
  const rest = days % 365;
  return years > 0 ? `${years}年${rest > 0 ? `${rest}日` : ''}` : `${days}日`;
}
