// voiceReadingNormalize.js — 読み上げる本文を「耳で聞いて自然」に整える純関数(会場・コメビュ・スマホ共通)。
//
// 背景(2026-10-28・質の改善):
//   今までは URL を「URL省略」にするだけだったので、ニコ生でよく出る書き方をそのまま VOICEVOX に渡していた。
//   - 「かわいいwww」→「ダブリューダブリューダブリュー」と読まれる(笑いの w)。
//   - 「88888」→「はちまんはっせんはっぴゃく…」と読まれる(拍手の 8)。
//   - 「ああああああああ」「ーーーーーー」「！！！！！！」→ 長く続いて、その間ほかのコメントが待たされる。
//   画面の表示は変えない(読み上げる文だけ)。本家の表示を置き換える話ではない(AGENTS.md §3.5)。
//
// 方針: 確実に「笑い/拍手/連打」と言える形だけを直す。読める文字が無いコメントは '' にする(呼び出し側が読まずに飛ばす)。英単語(wow・www.〜)や金額・数(8888円)には触らない。

/** 同じ文字がこれより多く続いたら、ここまでに縮める。 */
export const VOICE_REPEAT_KEEP = 4;

/** 笑いの w(半角・全角)。前後が英字でない 2 文字以上、または和文(かな・漢字・全角)の直後で文末の 1 文字。 */
const LAUGH_W_RE = /(?<![A-Za-zＡ-Ｚａ-ｚ])[wWｗＷ]{2,}(?![A-Za-zＡ-Ｚａ-ｚ])/g;
const LAUGH_W_TAIL_RE = /(?<=[\u3040-\u30ff\u3400-\u9fff\uff01-\uff9f])[wWｗＷ](?=[\s!！?？。、…]*$)/;

/** 拍手の 8(3 文字以上)。前後が数字・単位・小数点でないときだけ。 */
const CLAP_8_RE = /(?<![0-9０-９.,，．])[8８]{3,}(?![0-9０-９.,，．円万億人位点個回件年月日時分秒%％ptPT])/g;

/** スマホの読み上げ(live-view-native-voice.js)と同じ言い方: 3つ以上は「わらわら」・1〜2つは「わら」。 */
const laughWord = (/** @type {string} */ m) => (Array.from(m).length >= 3 ? 'わらわら' : 'わら');

/**
 * @param {unknown} text
 * @param {{ urlWord?: string }} [opts] URL の読み方(会場・コメビュは「URL省略」、スマホは「リンク」)
 * @returns {string}
 */
export function normalizeVoiceReadingBody(text, opts = {}) {
  let s = String(text ?? '');
  if (!s) return '';
  s = s.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, typeof opts.urlWord === 'string' ? opts.urlWord : 'URL省略');
  s = s.replace(LAUGH_W_RE, laughWord).replace(LAUGH_W_TAIL_RE, 'わら');
  // 2026-10-28: コメント全体が w 1文字なら笑い(VOICEVOX は全角「ｗ」を「ダブリュウ」と読む・PC 実測)。
  if (/^\s*[wWｗＷ]\s*$/.test(s)) s = 'わら';
  s = s.replace(CLAP_8_RE, 'パチパチ');
  // 同じ文字の連打を縮める(サロゲートペア・絵文字も1文字として数える)。
  s = s.replace(/(.)\1{4,}/gsu, (_m, ch) => ch.repeat(VOICE_REPEAT_KEEP));
  s = s.replace(/\s+/g, ' ').trim();
  // 2026-10-28: 文字も数字も無い(絵文字・記号・顔文字だけ)なら読まない。VOICEVOX は 0 モーラ=無音を返すだけで、
  //   その間ほかのコメントを待たせていた(PC 実測: 😂😂・👏・！？・…・♪♪・(^^) はすべて 0 モーラ)。
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}
