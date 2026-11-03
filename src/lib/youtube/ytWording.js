/**
 * ytWording.js — ニコ生版の画面をそのまま使う YouTube 版で、画面に出る「ニコニコの言葉」を YouTube の言葉に直す。
 *
 * 画面とプログラムはニコ生版の写し(ニコ生版のソースは変えない)。描き上がった画面の文字だけを、
 * ytNicoShim の画面の直し(数字ID・リンクを直しているのと同じ所)でこの表の通りに置き換える。
 * コメント本文を誤って書き換えないよう、決まった文言だけを置き換える(「ニコ生」を一律に置き換えない)。
 */

/** @type {Array<[string | RegExp, string]>} 上から順に置き換える */
const RULES = [
  [
    'ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。',
    'YouTube のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。',
  ],
  ['公式の貢献度ランキング（niconico の表示に準拠）', 'YouTube 公式のトップファン（XP の順位）'],
  ['ギフト貢献度', 'トップファン'],
  // 数字のあとの単位「貢」→ XP(例: 410貢 → 410 XP)
  [/(\d[\d,]*)\s*貢(?![献])/g, '$1 XP'],
  ['ニコ生の応援コメントを、このPCで見える化', 'YouTube の応援コメントを、このPCで見える化'],
  ['ニコニコ生放送 トップ', 'YouTube トップ'],
  ['ニコ生の視聴ページの右下に', 'YouTube の視聴ページの右下に'],
  ['ニコ生の画面改修でパネルが', 'YouTube の画面改修でパネルが'],
  ['ニコ生公式の表示は変わりません', 'YouTube 公式の表示は変わりません'],
];

/** 置き換えが起こりうる文字か(速く素通しするため) */
const QUICK = /貢|ニコ/;

/**
 * @param {string} text
 * @returns {string}
 */
export function ytWording(text) {
  const v = String(text ?? '');
  if (!QUICK.test(v)) return v;
  let out = v;
  for (const [from, to] of RULES) {
    out = typeof from === 'string' ? out.split(from).join(to) : out.replace(from, to);
  }
  return out;
}
