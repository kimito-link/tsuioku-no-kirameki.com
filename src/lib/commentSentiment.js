// commentSentiment.js — コメントの文字だけで「前向き / ふつう / 気になる点」を決める(純関数)。
// v0.1.2270(TNKC-50): 会場モードの動画の吹き出しの枠の色に使う。
//   ★外の AI にも通信にも出さない。決まった言葉と絵文字を数えるだけ。分からなければ「ふつう」。
//   前向きと気になる点の両方があるときも「ふつう」(どちらかに決めつけない)。

/** 前向きを打ち消す言い方(「悪くない」は前向き、「よくない」は気になる点)。先に取り除いてから数える。 */
const POSITIVE_PHRASES = [
  /悪くな[いかく]/g,
  /わるくな[いかく]/g,
];
const NEGATIVE_PHRASES = [
  /(良|よ|い)くな[いかく]/g,
  /好きじゃな/g,
  /面白くな|おもしろくな/g,
];

const POSITIVE = [
  /ありがと/, /感謝/, /最高/, /大好き/, /好き/, /すご[いく]|すげ[えー]|凄/, /面白|おもしろ/, /楽し/, /感動/, /神回|神動画|神すぎ/,
  /良[いかき]|よかった|よき|いいね|いいです|いい動画|いい話/, /かわい|可愛/, /かっこい|格好い|カッコい/, /応援/, /助か/,
  /分かりやす|わかりやす/, /参考にな/, /勉強にな/, /癒さ|いやさ/, /素敵|すてき/, /素晴|すばらし/, /嬉し|うれし/,
  /おめでと/, /笑った|笑える|爆笑/, /ナイス|いい感じ|上手い|うまい/, /草$|草草|^草/, /天才/, /泣け|泣いた/,
  /\b(love|great|awesome|thanks|thank you|nice|amazing|best|cool|lol|wow)\b/i,
  /[😊😍🥰👍👏🙏🎉✨💕💖😂🤣😆❤♥]/u,
];

const NEGATIVE = [
  /残念/, /微妙/, /聞き(取)?りにく|聞こえにく|聞こえな/, /見にく|見づら/, /分かりにく|わかりにく|分かりづら|わかりづら/,
  /音が?(小さ|大き|割れ)/, /うるさ/, /長すぎ|長い|ながい/, /つまらな|つまんな/, /退屈/, /嫌い|きらい/, /嫌だ|いやだ/,
  /悲し/, /ひど[いく]|酷い/, /最悪/, /間違|まちがい/, /誤字/, /気にな[るり]/, /不満/, /遅[いく]|おそい/, /重[いく]/, /下手|へた/,
  /がっかり/, /やめて/, /いらな/, /早口/, /ズレ|ずれて/, /もったいな/,
  /\b(bad|boring|worst|hate|disappointed|too long|cannot hear|can't hear)\b/i,
  /[😢😭😞👎💢😡😠😩]/u,
];

/**
 * @param {string} s
 * @param {readonly RegExp[]} list
 * @returns {number}
 */
function countHits(s, list) {
  let n = 0;
  for (const re of list) if (re.test(s)) n += 1;
  return n;
}

/**
 * @typedef {'positive' | 'neutral' | 'negative'} CommentSentiment
 */

/**
 * コメントの文字から、枠の色の種類を決める。空・分からない・両方ある → 'neutral'。
 * @param {unknown} text
 * @returns {CommentSentiment}
 */
export function commentSentiment(text) {
  let s = String(text ?? '').normalize('NFKC').trim();
  if (!s) return 'neutral';
  let pos = 0;
  let neg = 0;
  for (const re of POSITIVE_PHRASES) {
    const before = s;
    s = s.replace(re, ' ');
    if (s !== before) pos += 1;
  }
  for (const re of NEGATIVE_PHRASES) {
    const before = s;
    s = s.replace(re, ' ');
    if (s !== before) neg += 1;
  }
  pos += countHits(s, POSITIVE);
  neg += countHits(s, NEGATIVE);
  if (pos > 0 && neg === 0) return 'positive';
  if (neg > 0 && pos === 0) return 'negative';
  return 'neutral';
}
