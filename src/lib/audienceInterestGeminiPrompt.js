/**
 * 記録済みコメント本文から「視聴者の客層・興味」を推定する Gemini プロンプトを
 * 組み立てる純関数。AI 呼び出しは geminiNanoBridge.runBuiltinAiPrompt 側で行う。
 *
 * 重要な前提:
 *   - 入力はコメント「本文」だけ。userId / nickname / avatar 等の PII は一切渡さない。
 *   - 出力はあくまで「推定」。断定的な属性（性別・年齢・地域など個人特定に繋がる断定）は
 *     生成させない。ニコニコ公開 API では客層デモグラは取得できないため、本文からの
 *     ゆるい傾向推定であることを system / user の双方で明示する。
 */

/** サンプルに含めるコメントの最大件数（プロンプト肥大化と精度のバランス）。 */
export const AUDIENCE_INTEREST_SAMPLE_MAX = 80;
/** 1 コメントあたりの最大文字数（trim 後）。 */
export const AUDIENCE_INTEREST_COMMENT_MAX_CHARS = 60;
/** サンプルに採用する最小文字数（「w」「8888」等のノイズを軽く除外）。 */
const SAMPLE_MIN_CHARS = 2;

const SYSTEM_PROMPT = [
  'あなたは niconico 生放送のコメント本文だけを手がかりに、視聴者の客層・興味の傾向を推定するアナリストです。',
  '出力は必ず「推定」であることを前提にし、断定しないでください。',
  '性別・年齢・住んでいる地域・職業など、個人を特定したり決めつけたりする属性は出力しないでください（本文から確信を持って言えないため）。',
  '代わりに「どんな話題で盛り上がる客層か」を、3〜6 個の短い興味タグ（例: ゲーム好き / 雑談・癒し系 / 音楽 / アニメ・声優 / 実況ネタ など）で表してください。',
  '各タグは 12 文字以内の日本語。誹謗中傷・差別・センシティブな決めつけは禁止です。',
  '与えられたコメント以外の知識で補完しすぎず、本文から読み取れる範囲にとどめてください。',
  '出力フォーマットは次の 2 行だけ:',
  'タグ: <タグ1>, <タグ2>, <タグ3>（最大6個・読点区切り）',
  '客層メモ: <この配信の客層を1文で。末尾に「（推定）」を付ける>'
].join('\n');

/** @param {string} value @param {number} max */
function trimText(value, max) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * StoredComment 風の配列から、客層推定プロンプト用のコメント本文サンプルを選ぶ。
 *   - 空・極端に短い本文を除外
 *   - 完全重複（同一本文）を 1 件に圧縮（連投スパムでサンプルが埋まるのを防ぐ）
 *   - 最大件数で打ち切り
 * PII（userId / nickname 等）は一切含めない。
 *
 * @param {Array<{ text?: string }>} comments
 * @param {{ max?: number, minChars?: number, maxCharsPerComment?: number }} [opts]
 * @returns {string[]}
 */
export function selectAudienceInterestSampleComments(comments, opts = {}) {
  const max = Number.isFinite(opts.max) && opts.max > 0 ? Math.floor(opts.max) : AUDIENCE_INTEREST_SAMPLE_MAX;
  const minChars =
    Number.isFinite(opts.minChars) && opts.minChars >= 0 ? Math.floor(opts.minChars) : SAMPLE_MIN_CHARS;
  const maxCharsPerComment =
    Number.isFinite(opts.maxCharsPerComment) && opts.maxCharsPerComment > 0
      ? Math.floor(opts.maxCharsPerComment)
      : AUDIENCE_INTEREST_COMMENT_MAX_CHARS;

  const rows = Array.isArray(comments) ? comments : [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const c of rows) {
    const raw = trimText(c && c.text, maxCharsPerComment);
    if (!raw || raw.length < minChars) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {{
 *   liveId?: string,
 *   sampleComments?: string[],
 *   totalComments?: number,
 *   uniqueUsers?: number
 * }} input
 * @returns {{ system: string, user: string }}
 */
export function buildAudienceInterestGeminiPrompt(input = {}) {
  const liveId = trimText(input.liveId || '未取得', 40);
  const samples = Array.isArray(input.sampleComments) ? input.sampleComments : [];
  const total =
    Number.isFinite(input.totalComments) && input.totalComments > 0
      ? Math.floor(input.totalComments)
      : null;
  const unique =
    Number.isFinite(input.uniqueUsers) && input.uniqueUsers > 0
      ? Math.floor(input.uniqueUsers)
      : null;

  const header = [
    `配信ID: ${liveId}`,
    `記録コメント数: ${total == null ? '未取得' : total.toLocaleString('ja-JP')} 件`,
    `ユニークコメント者: ${unique == null ? '未取得' : unique.toLocaleString('ja-JP')} 人`,
    samples.length
      ? `以下は記録されたコメント本文のサンプル（${samples.length} 件・本文のみ・個人情報なし）です。`
      : 'コメント本文のサンプルは取得できていません。'
  ].join('\n');

  const body = samples.length
    ? samples.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '(サンプルなし)';

  const instruction = samples.length
    ? 'これらのコメント本文だけを根拠に、この配信の客層・興味の傾向を推定し、指定フォーマットの2行だけで出力してください。'
    : 'サンプルが無いため、無理に推定せず「タグ: 推定不可」「客層メモ: コメント本文が不足しています（推定）」とだけ出力してください。';

  return {
    system: SYSTEM_PROMPT,
    user: `${header}\n\n${body}\n\n${instruction}`
  };
}

/**
 * Gemini の出力テキスト（「タグ: ...」「客層メモ: ...」2行）を構造化する純関数。
 * フォーマット逸脱にも寛容にベストエフォートで拾う。
 *
 * @param {string} text
 * @returns {{ tags: string[], note: string }}
 */
export function parseAudienceInterestResult(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { tags: [], note: '' };
  let tagsLine = '';
  let noteLine = '';
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const tagM = line.match(/^(?:タグ|tags?)\s*[:：]\s*(.+)$/i);
    if (tagM && !tagsLine) {
      tagsLine = tagM[1];
      continue;
    }
    const noteM = line.match(/^(?:客層メモ|客層|メモ|note)\s*[:：]\s*(.+)$/i);
    if (noteM && !noteLine) {
      noteLine = noteM[1];
      continue;
    }
  }
  const tags = tagsLine
    .split(/[,、，]/)
    .map((t) => trimText(t, 24))
    .filter((t) => t && !/^推定不可$/.test(t))
    .slice(0, 6);
  return { tags, note: trimText(noteLine, 120) };
}
