/**
 * 「ギフトの瞬間」分析(純関数)。マーケレポートの新章用。v0.1.1672。
 *
 * ■ 何を答えるか(2026-10-18 ユーザー「どんなタイミングでギフトがとんだか・配信者にとって知りたい情報」)
 *   ギフトが飛んだ時刻の前5分と後5分で、コメント・同接がどう動いたか。誰が・いつ・何を。
 *   設計: docs/handoff/marketing-report-redesign-SPEC-2026-10-18.md(設計=Fable・会議素材=無料LLM5体)
 * ■ 守ること
 *   - 時刻軸は【絶対時刻(epoch ms)】に揃える: ギフト=公式 publishedAt(秒)×1000・コメント/同接=このPCが受け取った capturedAt。
 *     配信内経過(sortKey)や timeline の minute は軸に使わない(原点が別物)。
 *   - 軸が合わない(タイムシフト・時計ずれ・別配信)ときは瞬間を出さず理由を出す。
 *   - 前後の増減は「同じ時間に起きたこと」で、因果ではない。注記を必ず付け、n<5 では中央値・割合を出さない。
 *   - pt と contribution(=ptの10倍)を混ぜない。公式の合計と明細の合計は照合し、一致しないなら一致と言わない。
 *   - 副作用なし・DOM/storage/ネットワークに触れない。
 */

/** 次回の一言に入れてはいけない語(断定・因果)。テストで機械照合する。 */
export const GIFT_MOMENT_FORBIDDEN_WORDS = Object.freeze(['が原因', 'すれば増える', '必ず', '確実', '間違いなく']);

import { toEpochMs } from './timeAuthority.js';

const WINDOW_MS = 5 * 60_000;
const CHAIN_GAP_MS = 60_000;
const MIN_MOMENTS_FOR_TREND = 5;
const VIEWER_NEAR_MS = 90_000;
const AXIS_SLACK_MS = 10 * 60_000;

/** @param {number} n */
const ja = (n) => Math.floor(n).toLocaleString('en-US');

/** @param {number[]} xs @returns {number|null} 中央値 */
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 昇順の数値配列で、[lo, hi) に入る個数。 @param {number[]} sorted @param {number} lo @param {number} hi */
function countIn(sorted, lo, hi) {
  const lower = (/** @type {number} */ x) => {
    let a = 0;
    let b = sorted.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (sorted[m] < x) a = m + 1;
      else b = m;
    }
    return a;
  };
  return lower(hi) - lower(lo);
}

/** @param {readonly { at: number, value: number, kind?: string }[]} points @param {number} target */
function nearestViewer(points, target) {
  let best = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.abs(p.at - target);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best && bestD <= VIEWER_NEAR_MS ? best : null;
}

/** 窓内のコメント本文から話題語を上位3つ(2回以上出たものだけ)。Intl.Segmenter が無い環境では空。 @param {unknown[]} texts @returns {string[]} */
function topWords(texts) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  let seg = null;
  try {
    seg = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  } catch {
    seg = null;
  }
  if (!seg) return [];
  for (const t of texts) {
    for (const part of seg.segment(String(t || ''))) {
      if (!part.isWordLike) continue;
      const w = part.segment.trim();
      if (w.length < 2) continue;
      if (/^[0-9a-z_-]+$/i.test(w) && w.length < 4) continue; // 短い英数字(w・数字)は話題語にしない
      if (/^(.)\1+$/.test(w)) continue; // 「ああああ」「wwww」
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([w]) => w);
}

/**
 * @typedef {{ at: number, userId: string, senderName: string, itemName: string, points: number, contribution: number, avatarUrl: string }} MomentGift
 * @typedef {{
 *   startAt: number, endAt: number, gifts: MomentGift[], chain: boolean, points: number, contribution: number,
 *   fullWindow: boolean, before: { comments: number }, after: { comments: number },
 *   viewers: { before: number, after: number, diff: number, kind: string }|null, topics: string[]
 * }} GiftMoment
 */

/**
 * @param {{
 *   history?: readonly unknown[]|null,
 *   comments?: readonly { capturedAt?: unknown, text?: unknown }[]|null,
 *   concurrentPoints?: readonly { at: number, value: number, kind?: string }[]|null,
 *   officialTotalPoint?: number|null,
 *   officialRemaining?: number|null,
 *   sampled?: boolean
 * }} input
 * @returns {{
 *   hasHistory: boolean, axisOk: boolean, moments: GiftMoment[],
 *   summary: { n: number, k: number|null, medianDelta: number|null, viewersMedian: number|null, viewersN: number, chainCount: number, quietCount: number },
 *   notes: string[], excluded: { noTime: number, outOfRange: number }, totals: { giftCount: number, points: number }
 * }}
 */
export function analyzeGiftMoments(input) {
  const historyIn = Array.isArray(input?.history) ? input.history : [];
  /** @type {MomentGift[]} */
  const gifts = [];
  let noTime = 0;
  const seen = new Set();
  let totalPointsAll = 0;
  for (const raw of historyIn) {
    if (!raw || typeof raw !== 'object') continue;
    const h = /** @type {Record<string, any>} */ (raw);
    const points = Math.floor(Number(h.points));
    if (!Number.isFinite(points) || points <= 0) continue;
    const key = String(h.kokenHistoryId || '').trim() || `${h.itemName}|${h.publishedAt}|${points}|${h.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    totalPointsAll += points;
    const pub = Number(h.publishedAt);
    if (!Number.isFinite(pub) || pub <= 0) {
      noTime += 1;
      continue;
    }
    gifts.push({
      at: Math.floor(pub) * 1000,
      userId: String(h.userId == null ? '' : h.userId).trim(),
      senderName: String(h.senderName == null ? '' : h.senderName).trim(),
      itemName: String(h.itemName == null ? '' : h.itemName).trim(),
      points,
      contribution: Math.max(0, Math.floor(Number(h.contribution)) || 0),
      avatarUrl: /^https?:\/\//i.test(String(h.senderAvatarUrl || '')) ? String(h.senderAvatarUrl) : ''
    });
  }
  gifts.sort((a, b) => a.at - b.at);

  /** @type {{ n: number, k: number|null, medianDelta: number|null, viewersMedian: number|null, viewersN: number, chainCount: number, quietCount: number }} */
  const emptySummary = { n: 0, k: null, medianDelta: null, viewersMedian: null, viewersN: 0, chainCount: 0, quietCount: 0 };
  /** @type {string[]} */
  const notes = [];
  const result = {
    hasHistory: gifts.length > 0 || noTime > 0,
    axisOk: false,
    /** @type {GiftMoment[]} */
    moments: [],
    summary: emptySummary,
    notes,
    excluded: { noTime, outOfRange: 0 },
    totals: { giftCount: gifts.length, points: totalPointsAll }
  };
  if (!result.hasHistory) return result;

  // --- 公式の合計との照合・100件上限(軸に関係なく出す) ---
  const remaining = Math.max(0, Math.floor(Number(input?.officialRemaining) || 0));
  // null/undefined/空 は「公式の合計が無い」(Number(null) は 0 になるので、0 と取り違えて不一致と言わない)
  const offTotal = input?.officialTotalPoint == null || String(input.officialTotalPoint) === '' ? NaN : Number(input.officialTotalPoint);
  if (remaining > 0) {
    notes.push(`公式が返す履歴は新しい順に100件までです。古い方の残り ${remaining}件は載っていません(公式の値)。`);
  } else if (Number.isFinite(offTotal) && offTotal >= 0) {
    notes.push(
      totalPointsAll === Math.floor(offTotal)
        ? `公式の合計 ${ja(offTotal)}pt と一致(全件を取得できています)。`
        : `公式の合計 ${ja(offTotal)}pt と、明細の合計 ${ja(totalPointsAll)}pt が一致しません。`
    );
  }

  // --- 軸の検疫 ---
  const cts = (Array.isArray(input?.comments) ? input.comments : [])
    // 時刻の解釈は timeAuthority に委ねる(取れなければ 0 → 捨てる)。
    .map((c) => toEpochMs(c?.capturedAt))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  if (cts.length === 0) {
    notes.push('コメントの記録が無いため、ギフトの前後の比較は出せません。');
    return result;
  }
  const cMin = cts[0];
  const cMax = cts[cts.length - 1];
  if (!gifts.length) return result;
  // 拡張を開く前(コメントの記録が始まる前)のギフトは、前後の比較の対象から外す(途中から開いた配信で全体が不可になるのを防ぐ)。
  //   1件も重ならないときだけ「軸が合わない」(タイムシフト視聴・時計のずれ・別配信の取り違え)とする。
  const inRange = gifts.filter((g) => g.at >= cMin - AXIS_SLACK_MS && g.at <= cMax + AXIS_SLACK_MS);
  if (inRange.length === 0) {
    notes.push('ギフトの公式時刻と、このPCがコメントを受け取った時刻が重なりません(タイムシフト視聴や時計のずれの可能性)。瞬間ごとの前後比較は出せません。');
    return result;
  }
  const outOfRange = gifts.length - inRange.length;
  if (outOfRange > 0) {
    notes.push(`コメントの記録を始める前(または終えた後)のギフト ${outOfRange}件は、前後の比較から外しています。`);
    result.excluded.outOfRange = outOfRange;
  }
  gifts.length = 0;
  gifts.push(...inRange);
  result.axisOk = true;

  // --- 瞬間(60秒以内の連鎖は1つ) ---
  /** @type {MomentGift[][]} */
  const groups = [];
  for (const g of gifts) {
    const last = groups[groups.length - 1];
    if (last && g.at - last[last.length - 1].at <= CHAIN_GAP_MS) last.push(g);
    else groups.push([g]);
  }
  const commentsAll = Array.isArray(input?.comments) ? input.comments : [];
  const viewerPoints = Array.isArray(input?.concurrentPoints) ? input.concurrentPoints : [];
  /** @type {GiftMoment[]} */
  const moments = groups.map((grp) => {
    const startAt = grp[0].at;
    const endAt = grp[grp.length - 1].at;
    const fullWindow = startAt - WINDOW_MS >= cMin && endAt + WINDOW_MS <= cMax;
    const before = countIn(cts, startAt - WINDOW_MS, startAt);
    const after = countIn(cts, endAt + 1, endAt + WINDOW_MS + 1);
    const vb = nearestViewer(viewerPoints, startAt - WINDOW_MS);
    const va = nearestViewer(viewerPoints, endAt + WINDOW_MS);
    const viewers = vb && va ? { before: vb.value, after: va.value, diff: va.value - vb.value, kind: vb.kind === va.kind ? vb.kind : 'mixed' } : null;
    const texts = commentsAll
      .filter((c) => {
        const t = toEpochMs(c?.capturedAt);
        return t > 0 && t >= startAt - WINDOW_MS && t <= endAt + WINDOW_MS;
      })
      .map((c) => c?.text);
    return {
      startAt,
      endAt,
      gifts: grp,
      chain: grp.length >= 2,
      points: grp.reduce((s, g) => s + g.points, 0),
      contribution: grp.reduce((s, g) => s + g.contribution, 0),
      fullWindow,
      before: { comments: before },
      after: { comments: after },
      viewers,
      topics: topWords(texts)
    };
  });
  result.moments = moments;

  // --- 集計(窓が足りる瞬間だけ) ---
  const full = moments.filter((m) => m.fullWindow);
  const n = full.length;
  const trend = n >= MIN_MOMENTS_FOR_TREND;
  const vdiffs = full.filter((m) => m.viewers).map((m) => /** @type {NonNullable<GiftMoment['viewers']>} */ (m.viewers).diff);
  result.summary = {
    n,
    k: trend ? full.filter((m) => m.after.comments > m.before.comments).length : null,
    medianDelta: trend ? median(full.map((m) => m.after.comments - m.before.comments)) : null,
    viewersMedian: trend ? median(vdiffs) : null,
    viewersN: vdiffs.length,
    chainCount: moments.filter((m) => m.chain).length,
    quietCount: full.filter((m) => m.before.comments + m.after.comments < 3).length
  };
  if (!trend) {
    notes.push(`ギフトの瞬間が ${n}件(5件未満)なので、傾向はまだ言えません。瞬間ごとの数字だけ載せています。`);
  }
  if (input?.sampled === true) notes.push('コメントは一部サンプル(重い配信)のため、件数は実際より小さく出ます。');
  notes.push('ギフトの時刻は公式(koken)の公開時刻、コメント・同接は拡張がこのPCで受け取った時刻です。前後の増減は「同じ時間に起きたこと」であり、ギフトが原因とは限りません。');
  return result;
}

/**
 * 数字から導く「次回に試すこと」(最大3行)。断定せず、「〜かもしれません/価値があります/見比べると」に限る。
 * @param {{ n: number, k: number|null, medianDelta: number|null, chainCount: number, quietCount: number }} summary
 * @returns {string[]}
 */
export function buildGiftMomentNextActions(summary) {
  const s = summary || { n: 0, k: null, medianDelta: null, chainCount: 0, quietCount: 0 };
  if (!(s.n >= MIN_MOMENTS_FOR_TREND)) return ['次の配信でも同じ章を見比べると、傾向が見えてきます。'];
  /** @type {string[]} */
  const lines = [];
  if (s.k != null && s.k / s.n >= 0.6) {
    lines.push('ギフトの後にコメントが増えやすい回でした。次回はギフトが来たら名前を呼んで一言返す時間を取ると、同じ流れを作れるかもしれません。');
  }
  if (s.chainCount >= 2) {
    lines.push(`ギフトが続けて飛んだ瞬間が ${s.chainCount}回ありました。最初の1件のお礼を丁寧にすると、続きやすいのかもしれません。`);
  }
  if (s.quietCount / s.n >= 0.5) {
    lines.push('静かな時間にも支えてくれる人がいます。コメントが少ない時間帯のお礼を意識する価値があります。');
  }
  return lines.slice(0, 3);
}
