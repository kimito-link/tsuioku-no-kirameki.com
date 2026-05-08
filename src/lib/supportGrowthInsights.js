/**
 * マーケ分析 / HTML レポート向け「次回の行動提案」を既存集計データから組み立てる（純粋関数）。
 * 画面文言は専門用語を避け、保存データの限界（ギフトは userId ごと 1 行・初回検知時刻寄り）を前提にする。
 */

import { maskLabelForShare } from './privacyDisplay.js';
import { buildCommentVelocityTimeline, buildLaughterDensityTimeline } from './commentVelocityTimeline.js';
import { detectCommentSilenceZones } from './commentSilenceZones.js';
import { classifyCommentersAgainstHistory } from './commenterHistoricalAnalytics.js';
import {
  buildCommenterFirstSecondLatency,
  detectTalentPeakMoments,
  scoreSentimentTimeline
} from './commenterCulturalAnalytics.js';
import { detectCommentPropagation, detectCommentSyncBursts } from './commentEchoDetector.js';
import { buildConcurrentTimelineSeries } from './concurrentTimelineSeries.js';
import { analyzeConcurrentPeak } from './concurrentPeakAnalysis.js';

/**
 * @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport
 * @typedef {import('./commentRecord.js').StoredComment} StoredComment
 * @typedef {import('./giftRecord.js').StoredGiftUser} StoredGiftUser
 */

/**
 * @typedef {{
 *   phase: string,
 *   line: string,
 *   because: string,
 *   effect: string
 * }} NextActionItem
 */

/**
 * @typedef {{
 *   label: string,
 *   timeHint: string,
 *   because: string
 * }} SupportWindowItem
 */

/**
 * @typedef {{
 *   headline: string,
 *   beforeHint: string,
 *   afterHint: string,
 *   thankTimingHint: string
 * }} GiftFlowItem
 */

/**
 * @typedef {{
 *   summaryLine: string,
 *   voiceExamples: string[]
 * }} OnboardingInsight
 */

/**
 * @typedef {{
 *   atLabel: string,
 *   reason: string,
 *   sampleLine: string,
 *   promoHint: string,
 *   kind: 'laugh' | 'talk' | 'echo' | 'mood'
 * }} ClipMomentItem
 */

/**
 * @typedef {{
 *   line: string
 * }} ListenerRewardItem
 */

/**
 * @typedef {{
 *   good: string[],
 *   bad: string[]
 * }} AskTimingInsight
 */

/**
 * @typedef {{
 *   hasGiftSignals: boolean,
 *   lowData: boolean,
 *   departedSilenceHeavy: boolean,
 *   positiveLean: boolean,
 *   giftFlowRows: number,
 *   newVisitorLean: boolean,
 *   endRetentionOk: boolean
 * }} SupportGrowthAdviceSlice
 */

/**
 * @param {StoredComment[]} comments
 * @param {string} broadcasterUserId
 * @returns {StoredComment[]}
 */
function filterBroadcaster(comments, broadcasterUserId) {
  const uid = String(broadcasterUserId || '').trim();
  if (!uid) return Array.isArray(comments) ? comments.slice() : [];
  return (Array.isArray(comments) ? comments : []).filter(
    (c) => String(c?.userId || '').trim() !== uid
  );
}

/**
 * @param {number} ms
 * @param {number} streamStart
 */
function formatOffsetClock(ms, streamStart) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || typeof streamStart !== 'number') return '—';
  const rel = Math.max(0, ms - streamStart);
  const m = Math.floor(rel / 60_000);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `開始から約 ${h}時間${mm}分`;
  return `開始から約 ${m}分`;
}

/** @param {string} text */
function roughTokens(text) {
  const t = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!t) return [];
  const parts = t.split(/\s+/).filter((w) => w.length >= 2 && w.length <= 24);
  return parts.slice(0, 40);
}

/** @param {Map<string, number>} counts @param {number} n */
function topKeys(counts, n) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/**
 * @param {string} nick
 * @param {boolean} mask
 */
function safeNick(nick, mask) {
  const s = String(nick || '').trim();
  if (!s) return 'ギフト参加者';
  return mask ? maskLabelForShare(s) : s;
}

/**
 * @param {string} text
 * @param {boolean} mask
 */
function safeCommentSnippet(text, mask) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const slice = t.length > 48 ? `${t.slice(0, 47)}…` : t;
  if (!mask) return slice;
  return maskLabelForShare(slice.length > 12 ? slice : `${slice}••`);
}

/**
 * @param {{
 *   report: MarketingReport,
 *   comments: StoredComment[],
 *   giftUsers?: StoredGiftUser[],
 *   sessionSummaryRows?: import('./concurrentTimelineSeries.js').ConcurrentTimelineRow[],
 *   pastBroadcasts?: import('./commenterHistoricalAnalytics.js').BroadcastBundle[],
 *   broadcasterUserId?: string,
 *   maskShareLabels?: boolean
 * }} opts
 */
export function buildSupportGrowthInsights(opts) {
  const report = opts.report;
  const mask = opts.maskShareLabels === true;
  const broadcasterUserId = String(opts.broadcasterUserId || '').trim();

  const comments = filterBroadcaster(opts.comments || [], broadcasterUserId);
  const giftUsers = Array.isArray(opts.giftUsers) ? opts.giftUsers.slice() : [];
  const sessionSummaryRows = Array.isArray(opts.sessionSummaryRows) ? opts.sessionSummaryRows : [];
  const pastBroadcasts = Array.isArray(opts.pastBroadcasts) ? opts.pastBroadcasts : [];

  const streamStart = (() => {
    let min = 0;
    for (const c of comments) {
      const at = c?.capturedAt;
      if (typeof at !== 'number' || !Number.isFinite(at)) continue;
      if (!min || at < min) min = at;
    }
    return min;
  })();

  const total = comments.length;
  const lowData = total < 8;

  const velocity = buildCommentVelocityTimeline(comments, { bucketMs: 60_000, rollingWindowMin: 5 });
  const laughter = buildLaughterDensityTimeline(comments, { bucketMs: 30_000 });
  const silenceZones = detectCommentSilenceZones(comments, {
    thresholdMs: 60_000,
    quality: { windowMs: 30_000 }
  });
  const sentimentCurve = scoreSentimentTimeline(comments, { bucketMs: 60_000 });
  const newVsRepeat = classifyCommentersAgainstHistory({
    currentLiveId: report.liveId,
    currentComments: comments,
    pastBroadcasts: pastBroadcasts.map((b) => ({
      liveId: String(b?.liveId || ''),
      comments: filterBroadcaster(b?.comments || [], broadcasterUserId)
    })),
    heavyThreshold: 5
  });
  const firstSecondLatency = buildCommenterFirstSecondLatency(comments);
  const talentPeaks = detectTalentPeakMoments(comments);
  const echoPropagation = detectCommentPropagation(comments, { windowMs: 30_000, minDistinctUsers: 3 });
  const echoSync = detectCommentSyncBursts(comments, { windowMs: 5000, minDistinctUsers: 3 });

  const concurrentSeries = buildConcurrentTimelineSeries(sessionSummaryRows);
  const concurrentPeak = analyzeConcurrentPeak(concurrentSeries);

  const departedHeavySilence = silenceZones.filter((z) => String(z?.quality) === 'departed').length;
  const sentimentTotals = sentimentCurve.totals;
  const pos = sentimentTotals.positive + sentimentTotals.surprise;
  const neg = sentimentTotals.negative + sentimentTotals.confusion;
  const positiveLean = pos >= neg * 1.2;

  const endRetentionOk =
    concurrentPeak?.endRetentionRatio != null && concurrentPeak.endRetentionRatio >= 0.45;

  const newVisitorLean =
    newVsRepeat.totalCurrent > 0 &&
    newVsRepeat.newCount / newVsRepeat.totalCurrent >= 0.35;

  /** @type {NextActionItem[]} */
  const nextActions = [];

  if (lowData) {
    nextActions.push({
      phase: '全体',
      line: '短い枠でも OK。「今日来てくれてありがとう」と一言だけ入れる',
      because: '記録がまだ少なくて細かい傾向が読みにくい時間帯',
      effect: 'コメントが増えやすい（安心の合図）'
    });
  } else {
    if (velocity.peakMinute != null && velocity.peakMinute <= 4) {
      nextActions.push({
        phase: '冒頭',
        line: '「初見さんも、一言だけでも挨拶だけ置いてってね」と軽く呼ぶ',
        because: '開始直後にコメントの山があり、流れが早い',
        effect: '参加の入口を広げる'
      });
    } else {
      nextActions.push({
        phase: '冒頭',
        line: '今日の目的を 10 秒で言い切ってから雑談に入る',
        because: 'はじめの分かりやすさが後半の会話量に効きやすい',
        effect: 'コメントが増えやすい'
      });
    }

    if (echoPropagation.length || echoSync.length) {
      nextActions.push({
        phase: '盛り上がり直後',
        line: 'さっき盛り上がったワードを次回の冒頭で一回だけ振る',
        because: '同じ言葉が短時間に続いた「みんなで乗った」時間がある',
        effect: '再訪・合言葉化しやすい'
      });
    }

    if (giftUsers.length) {
      nextActions.push({
        phase: 'ギフト直後',
        line: '『（名前）さん、ありがとう』＋今日のできたことひと言',
        because: 'ギフト参加が記録に残っている',
        effect: 'ギフト・投げのお礼が伝わる（催し付けに見えにくい）'
      });
    } else {
      nextActions.push({
        phase: '中盤',
        line: '「ここだけ答えて」で二択クイズを一問だけ挟む',
        because: 'ギフトが少ない回でも、会話のきっかけを作れる',
        effect: 'コメントが増えやすい'
      });
    }

    if (departedHeavySilence >= 1) {
      nextActions.push({
        phase: '沈黙が長く感じたら',
        line: '答えやすい二択（A か B）を出してから話を続ける',
        because: '「静かになったあと」が離脱向きに読める区間がある',
        effect: '離脱防止（空気が重くなりにくい）'
      });
    } else if (talentPeaks.length) {
      nextActions.push({
        phase: '盛り上がり直後',
        line: '「ここ良かったね」と自分でも一言だけまとめる',
        because: '間が空いたあと反応が返ってきた時間がある',
        effect: 'リスナーの気持ちが続きやすい'
      });
    }

    nextActions.push({
      phase: '終盤',
      line: '終わり 5 分前に「次回いつ／なにするか」を一言だけ予告',
      because: endRetentionOk ? '終盤まで反応が残りやすかった' : '次回につなげると残りやすい',
      effect: '再訪しやすい'
    });
  }

  while (nextActions.length > 5) nextActions.pop();
  while (nextActions.length < 3 && !lowData) {
    nextActions.push({
      phase: '全体',
      line: '『コメントは読むけど打つのが苦手な人もいいねだけで OK』と伝える',
      because: '参加のハードルを下げると後から増えやすい',
      effect: 'コメントが増えやすい'
    });
    if (nextActions.length >= 3) break;
  }

  /** @type {SupportWindowItem[]} */
  const supportWindows = [];

  const vb = velocity.buckets || [];
  let bestV = -1;
  let bestVm = -1;
  for (const b of vb) {
    if (b.count > bestV) {
      bestV = b.count;
      bestVm = b.minute;
    }
  }
  if (bestVm >= 0 && bestV > 0) {
    const at = streamStart ? streamStart + bestVm * 60_000 : 0;
    supportWindows.push({
      label: 'みんなが乗っていた時間',
      timeHint: streamStart ? formatOffsetClock(at, streamStart) : '記録の前半〜中盤',
      because: 'このあたりでコメントの勢いが強かった'
    });
  }

  const lb = laughter.buckets || [];
  let bestL = -1;
  let bestLm = -1;
  for (const b of lb) {
    const c = b.count ?? 0;
    if (c > bestL) {
      bestL = c;
      bestLm = b.minute;
    }
  }
  if (bestLm >= 0 && bestL > 0) {
    const at = streamStart ? streamStart + bestLm * 30_000 : 0;
    supportWindows.push({
      label: '笑いやリアクションが集まった時間',
      timeHint: streamStart ? formatOffsetClock(at, streamStart) : '中盤付近',
      because: '笑い系の反応がここでまとまって見える'
    });
  }

  if (positiveLean && sentimentCurve.buckets.length >= 2) {
    let bestIdx = 0;
    let bestScore = -1;
    sentimentCurve.buckets.forEach((bu, i) => {
      const s = bu.positive + bu.surprise - (bu.negative + bu.confusion) * 0.5;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    });
    const bu = sentimentCurve.buckets[bestIdx];
    if (bu && bestScore > 0) {
      supportWindows.push({
        label: 'お願いしても空気が重くなりにくい時間',
        timeHint: streamStart ? formatOffsetClock(bu.atStart, streamStart) : '中盤',
        because: 'この付近は前向きな言い回しが目立ちやすかった'
      });
    }
  }

  if (echoSync.length) {
    const b0 = echoSync[0];
    const at = (b0.firstAt + b0.lastAt) / 2;
    if (Number.isFinite(at)) {
      supportWindows.push({
        label: 'みんなが同じ言葉で盛り上がった瞬間',
        timeHint: streamStart ? formatOffsetClock(at, streamStart) : '—',
        because: '短時間に同じ反応が重なった'
      });
    }
  }

  /** @type {GiftFlowItem[]} */
  const giftFlow = [];
  const WIN = 3 * 60_000;
  for (const g of giftUsers.slice(0, 8)) {
    const uid = String(g.userId || '').trim();
    const at = g.capturedAt;
    if (!uid || typeof at !== 'number' || !Number.isFinite(at)) continue;
    /** @type {Map<string, number>} */
    const beforeCounts = new Map();
    /** @type {Map<string, number>} */
    const afterCounts = new Map();
    let beforeN = 0;
    let afterN = 0;
    for (const c of comments) {
      const ca = c?.capturedAt;
      if (typeof ca !== 'number' || !Number.isFinite(ca)) continue;
      const text = String(c.text || '');
      if (ca < at && ca >= at - WIN) {
        beforeN += 1;
        for (const w of roughTokens(text)) {
          beforeCounts.set(w, (beforeCounts.get(w) || 0) + 1);
        }
      }
      if (ca > at && ca <= at + WIN) {
        afterN += 1;
        for (const w of roughTokens(text)) {
          afterCounts.set(w, (afterCounts.get(w) || 0) + 1);
        }
      }
    }
    const beforeWords = topKeys(beforeCounts, 4).join('、') || '（目立つ単語は少なめ）';
    const afterWords = topKeys(afterCounts, 4).join('、') || '（目立つ単語は少なめ）';
    const nick = safeNick(g.nickname, mask);
    giftFlow.push({
      headline: `${nick} さんのギフト前後（記録は初回検知時刻ベース）`,
      beforeHint: `その前後 3 分のコメント数: 前 ${beforeN} / 後 ${afterN}。前に出やすかった言葉: ${beforeWords}`,
      afterHint: `後に出やすかった言葉: ${afterWords}`,
      thankTimingHint:
        afterN >= beforeN
          ? 'お礼の一言はギフト直後が自然（反応が続きやすい）'
          : '短くお礼を挟んでから、話題を戻すと流れが滑らか'
    });
  }

  /** @type {OnboardingInsight} */
  const onboarding = {
    summaryLine: '',
    voiceExamples: [
      '「初見さんも、好きな食べ物だけ置いてってね」',
      '「今来た人向けに 10 秒で説明すると…」',
      '「打つのが苦手な人は 888 だけでも大丈夫」'
    ]
  };
  if (newVsRepeat.totalCurrent > 0) {
    const ratio = newVsRepeat.newCount / newVsRepeat.totalCurrent;
    if (ratio >= 0.4) {
      onboarding.summaryLine =
        '初めての反応が目立つ回に見える（「初見さんが入りやすい回」になりやすい）';
    } else if (ratio <= 0.15) {
      onboarding.summaryLine =
        'いつものメンバーが中心になりやすい回に見える（深い会話向き）';
    } else {
      onboarding.summaryLine = '初見さんと常連さんが混ざりやすいバランスに見える';
    }
  } else {
    onboarding.summaryLine = 'ユーザー層の比率は十分な記録がないため省略';
  }

  const fsTotal = firstSecondLatency.totalUsers || 0;
  const fsQuick =
    (firstSecondLatency.distribution?.['<10s'] || 0) +
    (firstSecondLatency.distribution?.['10-30s'] || 0);
  if (fsTotal > 0 && fsQuick / fsTotal >= 0.35) {
    onboarding.voiceExamples.push(
      '「2 コメ目までが早い人が多いので、短く拾ってあげると続きやすいかも」'
    );
  }

  /** @type {ClipMomentItem[]} */
  const clippingMoments = [];

  for (const tp of talentPeaks.slice(0, 2)) {
    const mid = (tp.silenceEndAt + tp.silenceStartAt) / 2;
    let sample = '';
    for (const c of comments) {
      const ca = c?.capturedAt;
      if (typeof ca !== 'number') continue;
      if (ca >= tp.silenceEndAt && ca <= tp.silenceEndAt + 25_000) {
        sample = safeCommentSnippet(String(c.text || ''), mask);
        break;
      }
    }
    clippingMoments.push({
      atLabel: streamStart ? formatOffsetClock(mid, streamStart) : '—',
      reason: '間が空いたあと反応が返ってきた時間（話の転換点になりやすい）',
      sampleLine: sample || '（代表コメントはこの近くを見る）',
      promoHint: '短く切り抜くなら「間→盛り上がり」の流れが伝わるカット',
      kind: 'talk'
    });
  }

  for (const b of laughter.buckets || []) {
    if ((b.count || 0) < 2) continue;
    const at = b.atStart;
    let sample = '';
    for (const c of comments) {
      const ca = c?.capturedAt;
      if (typeof ca !== 'number') continue;
      if (ca >= at && ca < at + 30_000) {
        const tx = String(c.text || '');
        if (/[wｗ草笑ワロタ8888]/i.test(tx)) {
          sample = safeCommentSnippet(tx, mask);
          break;
        }
      }
    }
    clippingMoments.push({
      atLabel: streamStart ? formatOffsetClock(at + 15_000, streamStart) : '—',
      reason: 'ここは笑いやリアクションが集中',
      sampleLine: sample || '（笑い系のコメントがまとまって見える）',
      promoHint: 'SNS なら「この瞬間だけでも見てほしい」系の一言が合いやすい',
      kind: 'laugh'
    });
    if (clippingMoments.length >= 5) break;
  }

  for (const eb of echoSync.slice(0, 2)) {
    const at = (eb.firstAt + eb.lastAt) / 2;
    if (!Number.isFinite(at)) continue;
    clippingMoments.push({
      atLabel: streamStart ? formatOffsetClock(at, streamStart) : '—',
      reason: 'みんなが同じ言葉で重なった瞬間（内輪っぽさが強いことも）',
      sampleLine: eb.text ? safeCommentSnippet(eb.text, mask) : '（被りワード周辺）',
      promoHint: '常連向けの「その日の合言葉」として使えることがある',
      kind: 'echo'
    });
  }

  /** @type {ListenerRewardItem[]} */
  const listenerRewards = [];
  listenerRewards.push({ line: 'よく書いてくれた人の話題を、次回の最初に軽く触れる' });
  if (giftUsers.length) {
    listenerRewards.push({ line: 'ギフトが出たら短く名前を呼んで一言お礼（長く説明しない）' });
  }
  listenerRewards.push({ line: '初コメっぽい短文には「ありがとう」だけでも返すと続きやすい' });
  listenerRewards.push({
    line: 'よく出た言葉を「次回の合言葉」として一回だけ使うと参加しやすい'
  });

  /** @type {AskTimingInsight} */
  const askTiming = { good: [], bad: [] };
  if (positiveLean) {
    askTiming.good.push('前向きなコメントが目立つ時間は、お礼や軽い案内が自然');
  }
  if (bestV > 2) {
    askTiming.good.push('コメントの勢いがある時間は、短いお願いも空気が軽い');
  }
  if (giftUsers.length && endRetentionOk) {
    askTiming.good.push('終盤まで反応が残りやすい回は、締めのお礼が効きやすい');
  }
  if (departedHeavySilence >= 2) {
    askTiming.bad.push('静かな時間が「離脱向き」と読める区間では、お願いより雑談に戻す');
  }
  if (!positiveLean && neg > pos) {
    askTiming.bad.push('不安や迷いの言い回しが目立つときは、支援の話より安心の話を先に');
  }
  if (newVisitorLean && fsTotal > 0 && fsQuick / fsTotal < 0.2) {
    askTiming.bad.push('初見さんが多いのに 2 コメ目が伸びにくいときは、長いお願いより短い呼びかけを先に');
  }

  /** @type {string[]} */
  const caution = [];
  if (!giftUsers.length && total > 30) {
    caution.push('ギフト記録が無い回でも失敗ではないのだ。コメントの山や笑いの時間をまず探すのだ。');
  }
  if (giftUsers.length && total < 5) {
    caution.push('ギフト記録はあるがコメント記録が少ない。結合の精度は参考程度に留めるのだ。');
  }

  const adviceSlice = {
    hasGiftSignals: giftUsers.length > 0,
    lowData,
    departedSilenceHeavy: departedHeavySilence >= 2,
    positiveLean,
    giftFlowRows: giftFlow.length,
    newVisitorLean,
    endRetentionOk: Boolean(endRetentionOk)
  };

  return {
    nextActions: nextActions.slice(0, 5),
    supportWindows: supportWindows.slice(0, 6),
    giftFlow,
    onboarding,
    clippingMoments: clippingMoments.slice(0, 8),
    listenerRewards,
    askTiming,
    caution,
    adviceSlice,
    meta: {
      streamStartAt: streamStart || null,
      giftNote:
        'ギフトはストレージ上 userId ごとに 1 行で、時刻は初回検知に近い場合があるのだ。'
    }
  };
}

/**
 * marketingDynamicAdvice.js の AdviceMetrics に載せるフラグ群。
 * @param {SupportGrowthAdviceSlice} slice
 * @returns {Record<string, boolean|number>}
 */
export function supportGrowthMetricsForAdvice(slice) {
  const s = /** @type {SupportGrowthAdviceSlice} */ (slice || {});
  return {
    sgHasGifts: Boolean(s.hasGiftSignals),
    sgLowData: Boolean(s.lowData),
    sgDepartedSilenceHeavy: Boolean(s.departedSilenceHeavy),
    sgPositiveLean: Boolean(s.positiveLean),
    sgGiftFlowRows: Number(s.giftFlowRows) || 0,
    sgNewVisitorLean: Boolean(s.newVisitorLean),
    sgEndRetentionOk: Boolean(s.endRetentionOk)
  };
}

/**
 * HTML レポート向けの軽量メモ（構造化データ）
 * @param {Parameters<typeof buildSupportGrowthInsights>[0]} opts
 */
export function buildReportMemoPayload(opts) {
  const full = buildSupportGrowthInsights(opts);
  return {
    nextMemos: full.nextActions.slice(0, 3).map((a) => `${a.phase}: ${a.line}`),
    highlights: full.clippingMoments.slice(0, 3).map((c) => ({
      atLabel: c.atLabel,
      reason: c.reason,
      sampleLine: c.sampleLine
    })),
    thanksPoints: [
      full.adviceSlice.hasGiftSignals ? 'ギフト・投げに反応があった' : null,
      full.supportWindows.length ? '盛り上がりの時間帯が読み取れた' : null,
      full.onboarding.summaryLine ? '初見さんの入り方の傾向メモ' : null
    ].filter(Boolean),
    templates: full.onboarding.voiceExamples.slice(0, 4),
    caution: full.caution
  };
}
