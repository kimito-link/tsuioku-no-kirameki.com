/**
 * 「発言がありません」のときに、代わりに何を伝えるかを決める唯一の正本。
 *
 * ★なぜ要るか（2026-10-18・ユーザー報告）
 *   ギフトを投げた人のカードを開くと「この配信の記録にはまだ発言がありません」
 *   としか出ず、
 *     ・不具合で出ていないのか
 *     ・そもそもコメントしていないのか
 *   を利用者が区別できなかった。実際は後者で、表示は設計どおり正しかった。
 *
 * ★この設計は崩さない（speechEvidence.js の正本宣言）
 *   「発言の証拠が無ければ『発言』を一切出さない」。
 *   以前は広告/ギフトだけの人に「発言1・たった今」と【捏造】していたのを直した経緯がある。
 *   ⟹ ここでも発言を作らない。**発言以外の事実（ギフト・広告）だけ**を添える。
 *
 * ★新しいデータは取りに行かない
 *   すでに手元にある row.text（ギフト経路では「ギフト名（◯◯pt）」が入る）だけを使う。
 *   取得経路を増やすと、この画面の表示が遅れる・失敗しうる。
 */

/** 「発言はまだ無い」ことだけを伝える既定文（事実が何も無いとき）。 */
export const NO_SPEECH_PLAIN = 'この配信の記録にはまだ発言がありません';

/**
 * row.text が「ギフト（pt付き）」の形かを見る。
 * actionDataForTimelineRow は gift のとき `${itemName}（${point}pt）` を入れる。
 *
 * @param {unknown} text
 * @returns {string} pt 付きギフト表記ならそのまま、違えば空文字
 */
function giftTextOf(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  // 全角括弧 + 「pt」で終わる形だけを採る（コメント本文を誤って拾わないため）
  return /（[\d,]+pt）$/.test(t) ? t : '';
}

/**
 * 発言が0件のときに出す一行を組み立てる。
 *
 * ★戻り値は必ず「発言が無い」ことを含む。事実があればそれを添えるだけ。
 *
 * @param {{ text?: string }|null|undefined} row 開いている人の行
 * @returns {string} 画面にそのまま出す文
 */
export function buildNoSpeechNote(row) {
  const gift = giftTextOf(row?.text);
  if (gift) {
    // 例: 「コメントはまだありません（ギフト ひま侍（4,000pt） を贈っています）」
    return `コメントはまだありません。この配信では ${gift} を贈っています`;
  }
  return NO_SPEECH_PLAIN;
}
