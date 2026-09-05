/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】AI共有テキストを「書き換える必要があるか」の判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*(import も禁止)
 * 【書けるstorageキー】なし
 * 【正本宣言】共有テキストの更新要否の判定はこのファイルのみ
 *
 * aiShareTextChanged.js — 本文の【中身が変わったか】だけを見る(時刻は無視する)。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何が起きていたか(2026-08-19 ユーザー報告「コピーがスムーズにとれないときもありますね」)
 *
 *   status-entry.js: `if (ta && ta.value !== fullText) ta.value = fullText;`
 *   aiShareFullText.js: `lines.push(`生成: ${new Date().toISOString()}`)`
 *
 *   ＝本文の1行目に**生成時刻**が入っているので `ta.value !== fullText` が**常に true**。
 *   **数十KBの textarea を2秒ごとに丸ごと書き換えていた。**
 *   textarea の value を代入すると**選択(selection)が解除される**ので、
 *   ユーザーが本文を選ぼうとすると **2秒ごとに選択が飛ぶ**。
 *
 * ■ ★このリポが5回目に踏んだ罠
 *   「判定・保存値に時刻を混ぜて毎回別物になる」:
 *     v0.1.1320(elapsedSec) / v0.1.1409(セル本文) / v0.1.1412(samples,lastAt)
 *     / v0.1.1445(マインドマップ署名) / **今回(共有テキスト)**
 *   手本は v0.1.1445 と同じ:**表示は従来どおり・判定は時刻を抜いた形で比べる**。
 *
 * ■ なぜ「時刻を出すのをやめる」ではないか
 *   生成時刻は**いつの速報かを示す重要な情報**(古い速報を新しいものと誤読させない)。
 *   消すと [[cumulative-value-shown-as-current-state-2026-08-12]] の逆をやることになる。
 *   ＝**出すのはそのまま・比べるときだけ無視する**。
 * ───────────────────────────────────────────────────────────────────────────
 *
 * @module aiShareTextChanged
 */

/**
 * 時刻だけの行(比較から除く行)。
 * ★`生成: 2026-08-19T06:50:13.416Z` の形。
 *   ★行頭から固定する(本文中に同じ語が出ても巻き込まない)。
 */
const GENERATED_AT_LINE_RE = /^生成: .*$/m;

/**
 * 比較用に「時刻を抜いた形」へ正規化する。
 *
 * ★正規化するのは**生成時刻の行だけ**。他の「◯秒前」等はあえて残す:
 *   それらが動いたなら**中身が本当に変わっている**(取り込みが進んだ等)ので、
 *   書き換えて良い。ここで消しすぎると「本当の変化」まで見落とす。
 *
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeAiShareTextForCompare(text) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  return s.replace(GENERATED_AT_LINE_RE, '生成: -');
}

/**
 * textarea を書き換えるべきかを判定する。
 *
 * ★`selecting` は「ユーザーがいま選択中か」。**中身が本当に変わっていても、
 *   選択中なら書き換えない**。textarea の value 代入は選択を必ず解除するので、
 *   コピーしようとしている最中に奪うと**操作そのものが成立しない**。
 *   ＝鮮度より**進行中の操作**を優先する(次のtickで書けばよい)。
 *
 * ★これは「ガードを足す」ではなく**所有権の話**:
 *   選択中の textarea は【ユーザーのもの】で、画面の持ち物ではない。
 *
 * @param {unknown} currentValue いま textarea に入っている文字列
 * @param {unknown} nextText 新しく組み立てた本文
 * @param {{ selecting?: boolean }} [opts]
 * @returns {boolean} true なら書き換える
 */
export function shouldUpdateAiShareText(currentValue, nextText, opts = {}) {
  const cur = typeof currentValue === 'string' ? currentValue : '';
  const next = typeof nextText === 'string' ? nextText : String(nextText ?? '');
  // 空 → 中身あり は必ず書く(初回に何も出ないのを防ぐ)。
  //   ★選択中でも空なら書く(空の textarea を選択していても失うものが無い)。
  if (cur === '') return next !== '';
  // ★選択中は書かない(コピー操作を奪わない)。
  if (opts?.selecting === true) return false;
  return normalizeAiShareTextForCompare(cur) !== normalizeAiShareTextForCompare(next);
}
