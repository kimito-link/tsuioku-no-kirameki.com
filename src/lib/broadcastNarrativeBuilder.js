/**
 * コメント本文だけから「配信内容の流れ」を再構成する純粋関数。
 *
 * 目的:
 *   - 録画や画面キャプチャではなく、既にローカル保存されたコメントだけを使う。
 *   - 冒頭 / 中盤 / 終盤ごとに、話題語・代表コメント・次回ヒントを出す。
 *   - Gemini Nano へ渡せる prompt も純関数で作る（AI 呼び出しはしない）。
 */

/**
 * @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport
 */

/**
 * @typedef {{
 *   capturedAt?: number|string|null,
 *   text?: string|null,
 *   userId?: string|null,
 *   selfPosted?: any
 * }} BroadcastNarrativeComment
 *
 * @typedef {'opening'|'middle'|'ending'|'whole'} BroadcastNarrativePhase
 *
 * @typedef {{
 *   phase: BroadcastNarrativePhase,
 *   label: string,
 *   startMinute: number,
 *   endMinute: number,
 *   commentCount: number,
 *   uniqueUsers: number,
 *   keywords: string[],
 *   sampleComments: string[]
 * }} BroadcastNarrativeSegment
 *
 * @typedef {{
 *   liveId: string,
 *   totalComments: number,
 *   durationMinutes: number,
 *   lowData: boolean,
 *   peakSegmentLabel: string,
 *   summaryLine: string,
 *   segments: BroadcastNarrativeSegment[],
 *   improvementHints: string[]
 * }} BroadcastNarrative
 */

const PHASE_LABELS = /** @type {const} */ ({
  opening: '冒頭',
  middle: '中盤',
  ending: '終盤',
  whole: '全体'
});

const REACTION_TOKENS = [
  '888',
  '8888',
  '草',
  'ｗ',
  'ww',
  'www',
  '笑',
  'わこつ',
  '初見',
  'ありがとう',
  'ありがと',
  'おめ',
  'おつ',
  'ナイス',
  'いいね',
  '楽しい',
  '最高',
  'かわいい',
  '可愛い',
  'すごい',
  '好き',
  'がんば',
  'えらい'
];

const STOPWORDS = new Set([
  'これ',
  'それ',
  'あれ',
  'ここ',
  'そこ',
  'これで',
  'そう',
  'ですね',
  'です',
  'ます',
  'した',
  'する',
  'いる',
  'ある',
  'ない',
  'この',
  'その',
  'ため',
  'さん',
  'ちゃん',
  'くん',
  'コメント',
  'ニコ生'
]);

/** @param {unknown} value */
function toFiniteTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** @param {unknown} value */
function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeComment(text) {
  const src = cleanText(text).replace(/https?:\/\/\S+/gi, ' ');
  if (!src) return [];

  /** @type {string[]} */
  const out = [];
  const lower = src.toLowerCase();
  for (const token of REACTION_TOKENS) {
    if (lower.includes(token.toLowerCase())) out.push(token);
  }

  const chunks = src.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9ー]{2,24}/gu) || [];
  for (const raw of chunks) {
    const token = raw.trim();
    if (!token || STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    out.push(token);
  }
  return out;
}

/**
 * @param {BroadcastNarrativeComment[]} comments
 * @param {string} broadcasterUserId
 */
function normalizeComments(comments, broadcasterUserId) {
  const broadcaster = String(broadcasterUserId || '').trim();
  return (Array.isArray(comments) ? comments : [])
    .map((c) => ({
      at: toFiniteTimestamp(c?.capturedAt),
      text: cleanText(c?.text),
      userId: c?.userId == null ? '' : String(c.userId).trim()
    }))
    .filter(
      (c) =>
        c.at != null &&
        c.text &&
        !(broadcaster && c.userId && c.userId === broadcaster)
    )
    .sort((a, b) => /** @type {number} */ (a.at) - /** @type {number} */ (b.at));
}

/**
 * @param {{ text: string }[]} rows
 * @param {number} limit
 */
function topKeywords(rows, limit) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const row of rows) {
    for (const token of tokenizeComment(row.text)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, limit)
    .map(([token]) => token);
}

/**
 * @param {{ text: string }[]} rows
 * @param {string[]} keywords
 * @param {number} limit
 */
function pickSamples(rows, keywords, limit) {
  /** @type {{ text: string, score: number, index: number }[]} */
  const scored = [];
  rows.forEach((row, index) => {
    const text = cleanText(row.text);
    if (text.length < 2) return;
    let score = Math.min(text.length, 80) / 80;
    for (const kw of keywords) {
      if (kw && text.includes(kw)) score += 1;
    }
    if (/https?:\/\//i.test(text)) score -= 1;
    scored.push({ text: text.length > 64 ? `${text.slice(0, 63)}…` : text, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  /** @type {string[]} */
  const out = [];
  for (const item of scored) {
    if (!out.includes(item.text)) out.push(item.text);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * @param {BroadcastNarrativeSegment[]} segments
 * @param {number} total
 */
function pickPeakSegment(segments, total) {
  if (!segments.length || total <= 0) return null;
  return segments.reduce((best, seg) =>
    seg.commentCount > best.commentCount ? seg : best
  );
}

/**
 * @param {{
 *   segments: BroadcastNarrativeSegment[],
 *   totalComments: number,
 *   peak: BroadcastNarrativeSegment|null
 * }} input
 */
function buildImprovementHints(input) {
  const segments = input.segments;
  const total = Math.max(1, input.totalComments);
  const peak = input.peak;
  /** @type {string[]} */
  const hints = [];

  if (input.totalComments < 8) {
    hints.push('記録が少ない回なので、まずは冒頭と終盤の一言メモだけ残す');
    hints.push('次回は開始直後から拡張を開き、コメントの流れを長めに残す');
    return hints;
  }

  const opening = segments.find((s) => s.phase === 'opening');
  const ending = segments.find((s) => s.phase === 'ending');
  if (opening && opening.commentCount / total < 0.2) {
    hints.push('冒頭 5〜10 分に、答えやすい質問か今日の目的を短く置く');
  }
  if (ending && ending.commentCount / total < 0.2) {
    hints.push('終盤 5 分前に、次回予定と今日の見どころを一言で戻す');
  }
  if (peak?.phase === 'opening') {
    hints.push('冒頭の掴みが効いた回なので、同じ導入パターンを次回も再利用する');
  } else if (peak?.phase === 'middle') {
    hints.push('中盤の話題が山になった回なので、そのテーマを次回の柱にする');
  } else if (peak?.phase === 'ending') {
    hints.push('終盤に伸びた回なので、締めの前に小さな山場を用意する');
  }

  const allKeywords = segments.flatMap((s) => s.keywords);
  if (allKeywords.some((kw) => /888|ｗ|ww|草|笑|楽しい|最高/.test(kw))) {
    hints.push('笑い・拍手系の語が出た時間を、切り抜きや告知候補として控える');
  }
  if (allKeywords.some((kw) => /初見|わこつ/.test(kw))) {
    hints.push('初見・来場あいさつが見えるので、冒頭の自己紹介を短く固定化する');
  }

  return hints.slice(0, 4);
}

/**
 * @param {{
 *   report?: Partial<MarketingReport>|null,
 *   comments?: BroadcastNarrativeComment[],
 *   broadcasterUserId?: string,
 *   includeSamples?: boolean,
 *   maxKeywordsPerSegment?: number,
 *   maxSamplesPerSegment?: number
 * }} [input]
 * @returns {BroadcastNarrative}
 */
export function buildBroadcastNarrative(input = {}) {
  const report = input?.report || {};
  const rows = normalizeComments(input?.comments || [], input?.broadcasterUserId || '');
  const liveId = String(report.liveId || '').trim();
  const includeSamples = input?.includeSamples !== false;
  const maxKeywords =
    typeof input?.maxKeywordsPerSegment === 'number' && input.maxKeywordsPerSegment > 0
      ? Math.floor(input.maxKeywordsPerSegment)
      : 5;
  const maxSamples =
    typeof input?.maxSamplesPerSegment === 'number' && input.maxSamplesPerSegment > 0
      ? Math.floor(input.maxSamplesPerSegment)
      : 2;

  if (!rows.length) {
    return {
      liveId,
      totalComments: 0,
      durationMinutes: 0,
      lowData: true,
      peakSegmentLabel: '',
      summaryLine: 'コメント本文の時系列がないため、配信内容の流れはまだ描写できません。',
      segments: [],
      improvementHints: ['次回はコメント記録が始まっている状態で配信を見届ける'],
    };
  }

  const first = /** @type {number} */ (rows[0].at);
  const last = /** @type {number} */ (rows[rows.length - 1].at);
  const durationMinutes = Math.max(1, Math.ceil((last - first) / 60_000));
  const boundaries =
    rows.length < 6 || durationMinutes < 3
      ? [{ phase: /** @type {BroadcastNarrativePhase} */ ('whole'), start: 0, end: durationMinutes }]
      : [
          { phase: /** @type {BroadcastNarrativePhase} */ ('opening'), start: 0, end: Math.ceil(durationMinutes / 3) },
          { phase: /** @type {BroadcastNarrativePhase} */ ('middle'), start: Math.ceil(durationMinutes / 3), end: Math.ceil((durationMinutes * 2) / 3) },
          { phase: /** @type {BroadcastNarrativePhase} */ ('ending'), start: Math.ceil((durationMinutes * 2) / 3), end: durationMinutes }
        ];

  /** @type {BroadcastNarrativeSegment[]} */
  const segments = boundaries.map((b, index) => {
    const bucketRows = rows.filter((row) => {
      const minute = Math.floor((/** @type {number} */ (row.at) - first) / 60_000);
      const isLast = index === boundaries.length - 1;
      return minute >= b.start && (isLast ? minute <= b.end : minute < b.end);
    });
    const uids = new Set(bucketRows.map((row) => row.userId).filter(Boolean));
    const keywords = topKeywords(bucketRows, maxKeywords);
    return {
      phase: b.phase,
      label: PHASE_LABELS[b.phase],
      startMinute: b.start,
      endMinute: b.end,
      commentCount: bucketRows.length,
      uniqueUsers: uids.size,
      keywords,
      sampleComments: includeSamples ? pickSamples(bucketRows, keywords, maxSamples) : []
    };
  });

  const peak = pickPeakSegment(segments, rows.length);
  const peakSegmentLabel = peak?.label || '';
  const summaryLine =
    rows.length < 8
      ? 'コメント量が少なめなので、代表コメントと時間帯の傾向だけを控えめに見ます。'
      : `${peakSegmentLabel || '全体'}にコメントが最も集まり、${peak?.keywords.slice(0, 3).join('・') || '反応語'}が目立ちました。`;

  return {
    liveId,
    totalComments: rows.length,
    durationMinutes,
    lowData: rows.length < 8,
    peakSegmentLabel,
    summaryLine,
    segments,
    improvementHints: buildImprovementHints({
      segments,
      totalComments: rows.length,
      peak
    })
  };
}

/**
 * @param {BroadcastNarrative} narrative
 * @returns {{ system: string, user: string }}
 */
export function buildBroadcastNarrativePrompt(narrative) {
  const n = narrative || buildBroadcastNarrative();
  const segmentLines = (Array.isArray(n.segments) ? n.segments : [])
    .map((seg) => {
      const keywords = seg.keywords.length ? seg.keywords.join('、') : '目立つ語なし';
      const samples = seg.sampleComments.length
        ? ` 代表コメント: ${seg.sampleComments.join(' / ')}`
        : '';
      return `- ${seg.label}（${seg.startMinute}-${seg.endMinute}分）: ${seg.commentCount}件 / ${seg.uniqueUsers}人 / 話題語: ${keywords}${samples}`;
    })
    .join('\n');
  const hints = n.improvementHints.length ? n.improvementHints.join('\n- ') : 'なし';
  const user = [
    `配信ID: ${n.liveId || '未取得'}`,
    `全体: ${n.totalComments}件 / 約${n.durationMinutes}分`,
    `要約: ${n.summaryLine}`,
    '時間帯別:',
    segmentLines || '- 時系列データなし',
    '次回ヒント:',
    `- ${hints}`,
    '上のコメント集計だけを根拠に、配信者が次回に活かせる振り返りを3〜5行で書いてください。断定しすぎず、未記録の出来事は補完しないでください。'
  ].join('\n');
  return {
    system:
      'あなたはniconico生放送のコメント分析レポートを書くアシスタントです。録画や外部データではなく、保存済みコメントの集計だけに基づいて、配信者が次回に活かせる短い振り返りを書きます。',
    user: user.length > 1800 ? `${user.slice(0, 1799)}…` : user
  };
}
