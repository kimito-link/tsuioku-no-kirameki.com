// commentKindnessNudge.js — 送信前コメントの攻撃的表現を検知し「やさしく一言」確認を促す純ロジック。
import { normalizeCommentText } from './commentRecord.js';

const COMMENT_KINDNESS_CONFIRM_JA =
  'そのまま送るなら、もう一度「コメント送信」を押してね。';

/** @type {ReadonlyArray<{ id: string; level: 'strong' | 'mild'; pattern: RegExp; ignore?: RegExp; body: string }>} */
const COMMENT_KINDNESS_RULES = [
  {
    id: 'direct-harm',
    level: 'strong',
    pattern: /(死ね|しね|氏ね|消えろ|失せろ|くたばれ|ぶっころす|ぶっ殺す|殺してやる|ころしてやる)/i,
    ignore: /(死ねない|死ねる|消えろ線|消えろくん)/i,
    body: 'そのことばは、相手を強く傷つけるかも。やわらかい言い方にしてみよう？'
  },
  {
    id: 'harsh-insult',
    level: 'mild',
    pattern: /(きもい|キモい|きしょ|キショ|ばか|バカ|あほ|アホ|うざい|ウザい|カス|かす|クズ|くず|ゴミ|ごみ|ブス|ぶす|黙れ)/,
    ignore: /(バカ売れ|アホ毛|ゴミ箱|ごみ箱)/,
    body: 'その言い方、きつく見えるかも。少しだけやわらかくしてみよう？'
  }
];

/**
 * @param {string} rawText
 * @returns {{
 *   id: string;
 *   level: 'mild' | 'strong';
 *   matchedText: string;
 *   title: string;
 *   body: string;
 *   confirm: string;
 * } | null}
 */
export function detectCommentKindnessNudge(rawText) {
  const normalized = normalizeCommentText(rawText);
  if (!normalized) return null;
  for (const rule of COMMENT_KINDNESS_RULES) {
    if (rule.ignore && rule.ignore.test(normalized)) continue;
    const matched = normalized.match(rule.pattern);
    if (!matched) continue;
    return {
      id: rule.id,
      level: rule.level,
      matchedText: String(matched[0] || '').trim(),
      title: 'りんくから、ひとこと',
      body: rule.body,
      confirm: COMMENT_KINDNESS_CONFIRM_JA
    };
  }
  return null;
}
