/**
 * 長いコメントを「要点を残して」読み上げ用に短くする(v0.1.1912・2026-11-06 りんく「読み上げ式の放送では長くなりがち」)。
 *
 * 前は本文上限(既定60字・混雑時30〜50字)で文字の途中から切っていた=質問コメントの一番大事な結び
 * 「〜はどう思いますか」がまるごと消え、「〜時代になっているの」のように言いかけで終わっていた。
 * 長さの上限そのものは変えない(読む時間は増やさない)。切り方だけ変える:
 *   1. 意味の変わらない言い回しを詰める(「のではないかと思います」→「と思います」など)。
 *   2. 最後の文が質問なら、その質問と、その直前の言い分(読点・句点の区切り)を残し、前置きを省く。
 *   3. 質問でなければ、先頭から区切りのよいところまで読む。
 *   4. 区切りが見つからない・残りが短すぎるときは、これまでどおり上限で切る(読む量を減らしすぎない)。
 */

/** 意味を変えずに短くできる言い回し(上限を超えたときだけ使う)。 */
const COMPRESS_RULES = /** @type {const} */ ([
  [/のではないかと思います/g, 'と思います'],
  [/ではないかと思います/g, 'と思います'],
  [/のではないかと思う/g, 'と思う'],
  [/ではないかと思う/g, 'と思う'],
  [/することができ/g, 'でき'],
  [/することが出来/g, '出来'],
  [/、{2,}/g, '、'],
  [/。{2,}/g, '。']
]);

/** 文の終わり(句点・感嘆符・疑問符・改行のあとの区切り)。 */
const SENTENCE_RE = /[^。！？!?\n]+[。！？!?\n]*/g;
/** 読点などの区切り。 */
const CLAUSE_RE = /[^、。，,！？!?\n]+[、。，,！？!?\n]*/g;
/** 質問で終わる文。 */
const QUESTION_RE = /([？?]|(?:か|かな|かね|かも|ますか|ですか|でしょうか|ません?か))[！!。…\s]*$/;

/** @param {string} s */
const len = (s) => Array.from(s).length;
/** @param {string} s @param {number} n */
const head = (s, n) => Array.from(s).slice(0, n).join('');

/** @param {string} text */
export function compressVoicePhrases(text) {
  let out = String(text || '');
  for (const [re, to] of COMPRESS_RULES) out = out.replace(re, to);
  return out;
}

/**
 * @param {string} s
 * @param {RegExp} re
 * @returns {string[]}
 */
function splitBy(s, re) {
  return (s.match(re) || []).map((x) => x.trim()).filter(Boolean);
}

/** 末尾の読点・句点を落とす(つなぎ直す前)。 @param {string} s */
const stripTail = (s) => s.replace(/[、，,。\s]+$/, '');

/**
 * @param {string} text normalizeVoiceReadingBody 済みの本文
 * @param {number} limit 文字数の上限(1以上)
 * @returns {string} 上限以内の文字列
 */
export function shortenLongCommentForVoice(text, limit) {
  const src = String(text || '').trim();
  const max = Number.isFinite(Number(limit)) && Number(limit) >= 1 ? Math.floor(Number(limit)) : 60;
  if (len(src) <= max) return src;

  const compact = compressVoicePhrases(src).trim();
  if (len(compact) <= max) return compact;

  const fallback = head(compact, max);
  const sentences = splitBy(compact, SENTENCE_RE);
  const last = sentences[sentences.length - 1] || '';

  // 質問で終わる: 質問 + 直前の言い分(後ろから区切りごとに足せるだけ)。
  if (sentences.length >= 2 && QUESTION_RE.test(last) && len(last) <= Math.floor(max * 0.7)) {
    const budget = max - len(last) - 1; // つなぎの「、」の分
    const clauses = splitBy(sentences.slice(0, -1).join(''), CLAUSE_RE);
    /** @type {string[]} */
    const picked = [];
    let used = 0;
    for (let i = clauses.length - 1; i >= 0; i--) {
      const c = stripTail(clauses[i]);
      const add = len(c) + (picked.length ? 1 : 0);
      if (!c || used + add > budget) break;
      picked.unshift(c);
      used += add;
    }
    if (picked.length) return `${picked.join('、')}、${last}`;
    return last;
  }

  // 質問でない: 先頭から区切りのよいところまで。
  const clauses = splitBy(compact, CLAUSE_RE);
  let out = '';
  for (const c of clauses) {
    if (len(out) + len(c) > max) break;
    out += c;
  }
  out = stripTail(out);
  // 区切りで切ると半分も読めないなら、これまでどおり上限で切る。
  if (len(out) < Math.ceil(max * 0.5)) return fallback;
  return out;
}
