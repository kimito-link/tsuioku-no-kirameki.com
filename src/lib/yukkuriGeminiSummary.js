/**
 * MarketingReport を Gemini Nano / Built-in AI に渡すための
 * ゆっくり解説 prompt に変換する純関数。
 *
 * AI 呼び出しは Claude 領域の geminiNanoBridge.runBuiltinAiPrompt 側で行う。
 */

/**
 * @typedef {{
 *   userId?: string,
 *   nickname?: string,
 *   name?: string,
 *   count?: number,
 *   commentCount?: number,
 *   contribution?: number
 * }} YukkuriPromptTopUser
 *
 * @typedef {{
 *   liveId?: string,
 *   commentCount?: number,
 *   totalComments?: number,
 *   recordedCommentCount?: number,
 *   peakConcurrent?: number,
 *   peakMinute?: number,
 *   peakMinuteCount?: number,
 *   uniqueUsers?: number,
 *   durationMinutes?: number,
 *   durationMin?: number,
 *   commentsPerMinute?: number,
 *   giftPoints?: number,
 *   totalGiftPoints?: number,
 *   programGiftPoints?: number,
 *   topUsers?: YukkuriPromptTopUser[]
 * }} YukkuriPromptMarketingReport
 */

const SYSTEM_PROMPT = [
  'あなたは「霊夢と魔理沙」の対話形式で niconico 生放送の配信データを解説するアシスタントです。',
  '視聴者ファンが楽しめるよう、要点を 3〜5 つ取り上げて、1 件あたり 2〜3 行、合計 200〜400 字程度にまとめてください。',
  '霊夢の語尾は「〜よ」「〜だわ」、魔理沙の語尾は「〜だぜ」「〜だな」にしてください。',
  '特徴的な数字（コメント数 / ピーク / ギフト pt / 上位応援者）は具体的に挙げてください。',
  '出力は「霊夢: ...」「魔理沙: ...」の会話だけにし、外部送信や未記録データがあるような表現は避けてください。'
].join('\n');

const USER_MIN_CHARS = 200;
const USER_MAX_CHARS = 400;

/** @param {unknown} value */
function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * @param {object | null | undefined} source
 * @param {string[]} keys
 */
function pickNumber(source, keys) {
  const record = /** @type {Record<string, unknown>} */ (source || {});
  for (const key of keys) {
    const n = toFiniteNumber(record[key]);
    if (n != null) return n;
  }
  return null;
}

/** @param {number | null} value */
function formatNumber(value) {
  if (value == null) return '未取得';
  return value.toLocaleString('ja-JP');
}

/** @param {number | null} value */
function formatDecimal(value) {
  if (value == null) return '未取得';
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
}

/**
 * @param {string} value
 * @param {number} max
 */
function trimText(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** @param {YukkuriPromptTopUser[]} topUsers */
function formatTopUsers(topUsers) {
  if (!Array.isArray(topUsers) || topUsers.length === 0) {
    return '上位コメント者データは未取得';
  }
  const parts = topUsers.slice(0, 3).map((user, index) => {
    const label = trimText(user?.nickname || user?.name || `ユーザー${index + 1}`, 24);
    const count = pickNumber(user, ['count', 'commentCount', 'contribution']);
    return count == null ? label : `${label}（${formatNumber(count)} 件）`;
  });
  return `上位コメント者は ${parts.join('、')}`;
}

/** @param {string} text */
function fitUserPromptLength(text) {
  let out = text;
  const supplement =
    ' 取得できた数値だけを根拠にし、未取得の項目は無理に補完せず、盛り上がりの山と次回に活かせる観察点を自然に語ってください。';
  while (out.length < USER_MIN_CHARS) {
    out += supplement;
  }
  if (out.length > USER_MAX_CHARS) {
    return `${out.slice(0, USER_MAX_CHARS - 1)}…`;
  }
  return out;
}

/**
 * @param {YukkuriPromptMarketingReport} report
 * @returns {{ system: string, user: string }}
 */
export function buildYukkuriGeminiPrompt(report = {}) {
  const liveId = trimText(report?.liveId || '未取得', 40);
  const commentCount = pickNumber(report, [
    'commentCount',
    'totalComments',
    'recordedCommentCount'
  ]);
  const peakConcurrent = pickNumber(report, ['peakConcurrent']);
  const peakMinute = pickNumber(report, ['peakMinute']);
  const peakMinuteCount = pickNumber(report, ['peakMinuteCount']);
  const uniqueUsers = pickNumber(report, ['uniqueUsers']);
  const durationMinutes = pickNumber(report, ['durationMinutes', 'durationMin']);
  const commentsPerMinute = pickNumber(report, ['commentsPerMinute']);
  const giftPoints = pickNumber(report, ['giftPoints', 'totalGiftPoints', 'programGiftPoints']);

  const peakParts = [`ピーク同時接続は ${formatNumber(peakConcurrent)} 人`];
  if (peakMinute != null || peakMinuteCount != null) {
    peakParts.push(
      `ピークコメントは ${formatNumber(peakMinute)} 分目に ${formatNumber(peakMinuteCount)} 件`
    );
  }

  const summary = [
    `配信IDは ${liveId}。`,
    `記録コメントは ${formatNumber(commentCount)} 件、ユニークコメント者は ${formatNumber(uniqueUsers)} 人、コメント密度は ${formatDecimal(commentsPerMinute)} 件/分です。`,
    `${peakParts.join('、')}。`,
    `配信時間は ${formatNumber(durationMinutes)} 分、ギフト pt は ${formatNumber(giftPoints)}。`,
    `${formatTopUsers(report?.topUsers || [])}。`,
    'この数値をもとに、霊夢と魔理沙の軽い掛け合いで、ファンが読んで楽しい配信レポート解説に変換してください。'
  ].join('');

  return {
    system: SYSTEM_PROMPT,
    user: fitUserPromptLength(summary)
  };
}
