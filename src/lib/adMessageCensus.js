/**
 * adMessageCensus.js — 「広告/ギフトの生データに【メッセージ】が入っているか」を数えるだけの計器。
 *
 * ■ なぜ要るか(2026-08-18 ユーザー確定)
 *   ユーザー:「広告はメッセージが送れるという価値があるので、そのメッセージも記録したい」
 *   実機スクショの広告設定完了画面に【広告メッセージ】欄があり、実際に本文が入っていた。
 *   ところが現行実装は advertiserName / point / contributionRank は記録するのに
 *   【メッセージはどこにも取り込んでいない】。
 *
 * ■ ★この計器の役割(挙動は1バイトも変えない)
 *   「画面(DOM)から読む」実装に進む前に、**いま既に届いている生データに message が
 *   含まれているか**を実機で確定する。含まれていれば DOM を読む必要はなく、
 *   壊れにくい経路(生データ)で記録できる。
 *   ★[[code-can-confirm-without-field-data]] の逆で、ここは【現物が来るまで分からない】
 *     ので観測する。ただし「観測して満足」で終わらせない=次版で必ず記録に進む
 *     ([[counting-is-not-fixing-2026-08-13]])。
 *
 * ■ 掟
 *   - 数えるだけ。DOM もデータも触らない。
 *   - ★本文そのものは既定で保存しない(PIIを増やさない)。長さと有無だけを数える。
 *     ただし「本当に広告メッセージか」を人が確かめられるよう、**先頭の数文字だけ**を
 *     1件だけ標本として持つ(sample)。
 *   - 0 のときも「観測した上での0」と「そもそも観測していない」を区別できるようにする
 *     ([[unobserved-must-not-hide-the-cell]])。
 *
 * @module adMessageCensus
 */

/** 標本として残す本文の最大長(PIIを増やしすぎない)。 */
export const AD_MESSAGE_SAMPLE_MAX = 24;

/**
 * 生データが message として持ち得るキー。
 * ★どれで来るか不明なので候補を並べる。どのキーで来たかを数えて【実際の名前】を確定する。
 */
export const AD_MESSAGE_KEYS = Object.freeze([
  'message',
  'adMessage',
  'advertiserMessage',
  'comment',
  'body',
  'text'
]);

/** @returns {{ seen: number, withMessage: number, byKey: Record<string, number>, maxLen: number, sample: string }} */
export function createAdMessageCensusState() {
  return { seen: 0, withMessage: 0, byKey: {}, maxLen: 0, sample: '' };
}

/**
 * 生の広告/ギフト1件を観測する(数えるだけ)。
 *
 * @param {ReturnType<typeof createAdMessageCensusState>} state
 * @param {Record<string, unknown> | null | undefined} raw 生データ1件(decode 直後)
 */
export function observeAdMessage(state, raw) {
  if (!state || typeof state !== 'object') return;
  if (!raw || typeof raw !== 'object') return;
  state.seen = (Number(state.seen) || 0) + 1;
  let found = '';
  let foundKey = '';
  for (const k of AD_MESSAGE_KEYS) {
    const v = raw[k];
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s) continue;
    found = s;
    foundKey = k;
    break; // 最初に見つかった1つで足りる(どのキーで来たかを知りたい)
  }
  if (!found) return;
  state.withMessage = (Number(state.withMessage) || 0) + 1;
  state.byKey[foundKey] = (Number(state.byKey[foundKey]) || 0) + 1;
  if (found.length > (Number(state.maxLen) || 0)) state.maxLen = found.length;
  // 標本は最初の1件だけ(上書きしない=後の✅が先の証拠を消さない)
  if (!state.sample) state.sample = found.slice(0, AD_MESSAGE_SAMPLE_MAX);
}

/**
 * 状態速報に出す1行を組み立てる。
 * ★0でも行を出す(条件未達と故障を区別できるようにする)。
 *
 * @param {ReturnType<typeof createAdMessageCensusState> | null | undefined} state
 * @returns {string}
 */
export function formatAdMessageCensusLine(state) {
  const s = state && typeof state === 'object' ? state : null;
  const seen = Math.max(0, Math.floor(Number(s?.seen) || 0));
  const withMsg = Math.max(0, Math.floor(Number(s?.withMessage) || 0));
  if (seen === 0) {
    return '広告メッセージ ⚪ まだ広告/ギフトが1件も届いていません(広告が入ると数え始めます)';
  }
  if (withMsg === 0) {
    return (
      `広告メッセージ 🔴 生データ${seen}件すべてに本文が【入っていません】` +
      '\n  → 生データからは記録できません。画面(広告ページ)から読む方式に切り替える必要があります'
    );
  }
  const keys = Object.entries(s?.byKey || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(' / ');
  const sample = String(s?.sample || '');
  return (
    `広告メッセージ ✅ 生データ${seen}件中${withMsg}件に本文あり(最大${Math.floor(Number(s?.maxLen) || 0)}文字)` +
    `\n  → フィールド名: ${keys}` +
    (sample ? `\n  → 例: 「${sample}…」` : '') +
    '\n  → ★この経路で記録できます(画面を読む必要なし)'
  );
}
