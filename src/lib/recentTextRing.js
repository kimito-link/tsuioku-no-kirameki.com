/**
 * 「その人の直近N件の発言」を保持する固定長リングの純関数(v0.1.1218)。
 *
 * ユーザー要望(2026-08-01): 会場モードでアイコンにマウスを乗せたとき、
 * その人の発言を数件まとめて読めるようにしたい。
 *
 * ★storage を読まないことが設計の核心。
 *   会場のクリックパネル(venueBar.js:3545)は「クリックした瞬間だけ storage を読む」方式で、
 *   `★storage read はこの関数の中だけ=常時readを増やさない` と明記されている。
 *   ホバーで同じことをすると**マウスを乗せるたびに read が走る**=会場が重くなる。
 *   そこで在席の記録(RosterEntry)に直近数件を持たせ、追加の取得をゼロにする。
 *
 * ★上限を固定長にする理由: 4時間・1万件の配信でも、1人あたりのメモリが
 *   「N件 × 本文」で頭打ちになる。無制限に貯めると長時間配信で膨らむ。
 *
 * @module recentTextRing
 */

/** ホバーカードに出す既定の保持件数(会場の席を覆わない大きさに収まる)。 */
export const RECENT_TEXT_KEEP = 5;

/**
 * 直近リストへ1件足す。新しいものが先頭。
 *
 * - 空文字は足さない(発言していないのに枠を消費しない)
 * - 直前とまったく同じ本文は足さない(連投の重複で枠が埋まるのを防ぐ)
 * - 上限を超えたら古いものから落とす
 *
 * @param {ReadonlyArray<string>|null|undefined} list 現在の直近リスト(新しい順)
 * @param {unknown} text 追加する本文
 * @param {number} [keep] 保持件数(既定=RECENT_TEXT_KEEP)
 * @returns {string[]} 新しい配列(入力は破壊しない)
 */
export function pushRecentText(list, text, keep) {
  const cap = Math.max(1, Math.floor(Number(keep) || RECENT_TEXT_KEEP));
  const prev = Array.isArray(list) ? list.filter((v) => typeof v === 'string' && v) : [];
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return prev.slice(0, cap);
  // 直前と同一なら足さない(「同じことを2回言った」より枠を新しい発言に使う)。
  if (prev[0] === t) return prev.slice(0, cap);
  return [t, ...prev].slice(0, cap);
}

/**
 * ホバーカード表示用に整形する。長文はカードが伸びて会場を覆うので切る。
 *
 * @param {ReadonlyArray<string>|null|undefined} list 直近リスト(新しい順)
 * @param {{ max?: number, maxChars?: number }} [opts]
 *   max: 出す件数 / maxChars: 1件あたりの最大文字数(超えたら省略記号)
 * @returns {string[]} 表示用の配列(新しい順)
 */
export function formatRecentTexts(list, opts = {}) {
  const max = Math.max(0, Math.floor(Number(opts.max) || RECENT_TEXT_KEEP));
  const maxChars = Math.max(1, Math.floor(Number(opts.maxChars) || 60));
  const src = Array.isArray(list) ? list : [];
  const out = [];
  for (const raw of src) {
    if (out.length >= max) break;
    const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    out.push(t.length > maxChars ? `${t.slice(0, maxChars)}…` : t);
  }
  return out;
}
