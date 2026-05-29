/**
 * L6 / L10 / L11 / L14 / L15 — 文化分析系の純粋関数を 1 ファイルに集約。
 *
 * 設計（0.1.25 Z: マーケ分析有料 / 文化分析）:
 *   - L6 buildCommenterFirstSecondLatency … 1 コメ → 2 コメ目までの間隔分布
 *   - L10 detectTalentPeakMoments         … 沈黙→即反応 = 配信者の話芸が効いた瞬間
 *   - L11 scoreSentimentTimeline          … ポジ/ネガ/驚き/困惑 語彙の時系列スコア
 *   - L14 suggestUniqueWords              … 全コメ頻出だが自コメ未使用の語 TOP
 *   - L15 computeReachCoefficient         … 同接 / 5 分内ユニーク = "リーチ係数"
 */

/**
 * @typedef {{ capturedAt?: any, userId?: any, text?: any, selfPosted?: any }} CulturalCommentInput
 */

/**
 * @param {CulturalCommentInput[]} comments
 * @returns {{ at: number, uid: string, text: string }[]}
 */
function collectValid(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const at = c.capturedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    const uid = c.userId == null ? '' : String(c.userId).trim();
    const text = c.text == null ? '' : String(c.text);
    out.push({ at, uid, text });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/* ═══ L6: 初コメ → 2 コメ目 latency ═══ */

/**
 * @param {CulturalCommentInput[] | null | undefined} comments
 * @returns {{
 *   distribution: Record<string, number>,
 *   totalUsers: number
 * }}
 */
export function buildCommenterFirstSecondLatency(comments) {
  const valid = collectValid(comments || []);
  /** @type {Map<string, number[]>} */
  const userTimes = new Map();
  for (const v of valid) {
    if (!v.uid) continue;
    let list = userTimes.get(v.uid);
    if (!list) {
      list = [];
      userTimes.set(v.uid, list);
    }
    list.push(v.at);
  }
  /** @type {Record<string, number>} */
  const distribution = {
    '<10s': 0,
    '10-30s': 0,
    '30-60s': 0,
    '1-2m': 0,
    '2-5m': 0,
    '5-10m': 0,
    '10m+': 0
  };
  let totalUsers = 0;
  for (const ats of userTimes.values()) {
    if (ats.length < 2) continue;
    totalUsers += 1;
    const dt = ats[1] - ats[0];
    if (dt < 10_000) distribution['<10s'] += 1;
    else if (dt < 30_000) distribution['10-30s'] += 1;
    else if (dt < 60_000) distribution['30-60s'] += 1;
    else if (dt < 120_000) distribution['1-2m'] += 1;
    else if (dt < 300_000) distribution['2-5m'] += 1;
    else if (dt < 600_000) distribution['5-10m'] += 1;
    else distribution['10m+'] += 1;
  }
  return { distribution, totalUsers };
}

/* ═══ L10: 配信者の話芸ピーク ═══ */

/**
 * @typedef {{ silenceStartAt: number, silenceEndAt: number, silenceMs: number, afterCount: number }} TalentPeakMoment
 */

/**
 * @param {CulturalCommentInput[] | null | undefined} comments
 * @param {{ silenceMinMs?: number, afterWindowMs?: number, minAfterCount?: number } | undefined} [opts]
 * @returns {TalentPeakMoment[]}
 */
export function detectTalentPeakMoments(comments, opts = {}) {
  const silenceMin =
    typeof opts?.silenceMinMs === 'number' && opts.silenceMinMs > 0
      ? opts.silenceMinMs
      : 60_000;
  const after =
    typeof opts?.afterWindowMs === 'number' && opts.afterWindowMs > 0
      ? opts.afterWindowMs
      : 30_000;
  const minAfter =
    typeof opts?.minAfterCount === 'number' && opts.minAfterCount > 0
      ? opts.minAfterCount
      : 5;
  const valid = collectValid(comments || []);
  /** @type {TalentPeakMoment[]} */
  const out = [];
  for (let i = 1; i < valid.length; i++) {
    const gap = valid[i].at - valid[i - 1].at;
    if (gap < silenceMin) continue;
    const windowEnd = valid[i].at + after;
    let cnt = 0;
    for (let j = i; j < valid.length; j++) {
      if (valid[j].at > windowEnd) break;
      cnt += 1;
    }
    if (cnt >= minAfter) {
      out.push({
        silenceStartAt: valid[i - 1].at,
        silenceEndAt: valid[i].at,
        silenceMs: gap,
        afterCount: cnt
      });
    }
  }
  return out;
}

/* ═══ L11: 感情曲線（簡易辞書） ═══ */

const SENTIMENT_LEXICON = {
  positive: [
    /楽し[いさみ]/, /嬉し[いさ]/, /うれし/, /ありがと/, /すご[いき]/, /神回/,
    /最高/, /好[きく]/, /素敵/, /可愛/, /かわい/, /やった/, /応援/, /ほっこり/,
    /幸[せ]/
  ],
  negative: [
    /つら[いさ]/, /辛[いさ]/, /悲し/, /やばい/, /ひどい/, /酷い/, /疲れ/,
    /嫌[いだ]/, /きら[いだ]/, /怖[いさ]/, /こわい/, /無理/, /もう無理/,
    /お先真っ暗/
  ],
  surprise: [
    /マジ/, /まじ/, /えっ/, /うそ/, /ウソ/, /ホント/, /まさか/, /びっくり/,
    /びっくし/, /おお[ぉー]/
  ],
  confusion: [
    /うーん/, /ううむ/, /わからん/, /分から[なな]/, /謎/, /なんで/, /どうゆう/,
    /どういう/, /混乱/
  ]
};

/**
 * @typedef {{
 *   minute: number,
 *   atStart: number,
 *   total: number,
 *   positive: number,
 *   negative: number,
 *   surprise: number,
 *   confusion: number
 * }} SentimentBucket
 */

/**
 * @param {CulturalCommentInput[] | null | undefined} comments
 * @param {{ bucketMs?: number } | undefined} [opts]
 * @returns {{
 *   buckets: SentimentBucket[],
 *   totals: { positive: number, negative: number, surprise: number, confusion: number }
 * }}
 */
export function scoreSentimentTimeline(comments, opts = {}) {
  const bucketMs =
    typeof opts?.bucketMs === 'number' && opts.bucketMs > 0 ? opts.bucketMs : 60_000;
  const valid = collectValid(comments || []);
  const totals = { positive: 0, negative: 0, surprise: 0, confusion: 0 };
  if (!valid.length) return { buckets: [], totals };
  const first = valid[0].at;
  const last = valid[valid.length - 1].at;
  const total = Math.max(1, Math.floor((last - first) / bucketMs) + 1);
  /** @type {SentimentBucket[]} */
  const buckets = Array.from({ length: total }, (_, m) => ({
    minute: m,
    atStart: first + m * bucketMs,
    total: 0,
    positive: 0,
    negative: 0,
    surprise: 0,
    confusion: 0
  }));
  for (const v of valid) {
    const idx = Math.floor((v.at - first) / bucketMs);
    if (idx < 0 || idx >= buckets.length) continue;
    const bucket = buckets[idx];
    bucket.total += 1;
    for (const [k, regs] of Object.entries(SENTIMENT_LEXICON)) {
      for (const r of regs) {
        if (r.test(v.text)) {
          bucket[/** @type {'positive'|'negative'|'surprise'|'confusion'} */ (k)] += 1;
          totals[/** @type {'positive'|'negative'|'surprise'|'confusion'} */ (k)] += 1;
          break;
        }
      }
    }
  }
  return { buckets, totals };
}

/* ═══ L14: 視聴者発の人気語 TOP ═══ */

const STOP_WORDS = new Set([
  'です', 'ます', 'する', 'いる', 'ある', 'なる', 'こと', 'もの', 'よう',
  'って', 'けど', 'けれど', 'でも', 'これ', 'それ', 'あれ', 'どれ',
  'てる', 'たい', 'ない', 'ます', 'まし', 'みたい'
]);

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeSimple(text) {
  // ASCII / 漢字・ひらがな・カタカナ単位の超簡易トークナイザ
  // "草" "おつ" "8888" などのコメ頻出語は短い token として扱う
  const s = String(text || '').replace(/[\s!?！？。、,．]+/g, ' ').trim();
  if (!s) return [];
  /** @type {string[]} */
  const tokens = [];
  // 連続する hira/kata/kanji/letters/digits を 1 token にする
  const re = /([ぁ-んー]+|[ァ-ヴー]+|[一-龥]+|[a-zA-Z0-9ｗＷ]+)/gu;
  let m;
  while ((m = re.exec(s)) !== null) {
    const t = m[1];
    if (t.length < 2) continue;
    if (STOP_WORDS.has(t)) continue;
    tokens.push(t.toLowerCase());
  }
  return tokens;
}

/**
 * @param {{
 *   allComments?: { text?: any }[],
 *   selfComments?: { text?: any }[],
 *   topN?: number,
 *   minOccurrence?: number
 * } | null | undefined} input
 * @returns {{ word: string, count: number }[]}
 */
export function suggestUniqueWords(input) {
  if (!input || typeof input !== 'object') return [];
  const allList = Array.isArray(input.allComments) ? input.allComments : [];
  const selfList = Array.isArray(input.selfComments) ? input.selfComments : [];
  const topN =
    typeof input.topN === 'number' && input.topN > 0 ? Math.floor(input.topN) : 10;
  const minOccurrence =
    typeof input.minOccurrence === 'number' && input.minOccurrence > 0
      ? input.minOccurrence
      : 3;
  /** @type {Set<string>} */
  const selfTokens = new Set();
  for (const c of selfList) {
    for (const t of tokenizeSimple(c?.text)) selfTokens.add(t);
  }
  /** @type {Map<string, number>} */
  const allCount = new Map();
  for (const c of allList) {
    /** @type {Set<string>} */
    const local = new Set(tokenizeSimple(c?.text));
    for (const t of local) {
      allCount.set(t, (allCount.get(t) || 0) + 1);
    }
  }
  const out = [];
  for (const [t, n] of allCount) {
    if (n < minOccurrence) continue;
    if (selfTokens.has(t)) continue;
    out.push({ word: t, count: n });
  }
  out.sort((a, b) => b.count - a.count);
  return out.slice(0, topN);
}

/* ═══ L15: 同接 / コメンター比 = リーチ係数 ═══ */

/**
 * @param {{ currentConcurrent?: any, uniqueCommentersInWindow?: any } | null | undefined} input
 * @returns {{ coefficient: number|null }}
 */
export function computeReachCoefficient(input) {
  if (!input || typeof input !== 'object') return { coefficient: null };
  const c =
    typeof input.currentConcurrent === 'number' && Number.isFinite(input.currentConcurrent)
      ? input.currentConcurrent
      : NaN;
  const u =
    typeof input.uniqueCommentersInWindow === 'number' &&
    Number.isFinite(input.uniqueCommentersInWindow)
      ? input.uniqueCommentersInWindow
      : NaN;
  if (!Number.isFinite(c) || c < 0 || !Number.isFinite(u) || u <= 0) {
    return { coefficient: null };
  }
  return { coefficient: Math.round((c / u) * 100) / 100 };
}
