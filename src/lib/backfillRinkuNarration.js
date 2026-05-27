/**
 * v0.1.410: 過去ログ取り込み（backfill）の進捗に合わせた「りんくのセリフ」を返す純関数。
 *
 * 進捗は content が KEY_BACKFILL_PROGRESS に書く `{ seg, rows, done }`。popup/インライン
 * パネルが onChanged で読み、この関数でフェーズ別セリフ（さかのぼる→集めた→届いた）に
 * 変換して表示する。文言・件数表示はここに集約（UI から分離してテスト可能にする）。
 *
 * tkjp 哲学「想いが強いほど届く」に寄せ、「集める／届く」+「さかのぼる」の温かいトーン。
 *
 * @module backfillRinkuNarration
 */

/**
 * @typedef {(
 *   'idle' | 'fetching' | 'progress' | 'done' | 'done_empty'
 * )} BackfillNarrationPhase
 */

/**
 * 進捗からフェーズを判定する。
 * @param {{ started?: boolean, rows?: number, done?: number|boolean }} p
 * @returns {BackfillNarrationPhase}
 */
export function backfillNarrationPhase(p) {
  const started = !!(p && p.started);
  const rows = Number(p && p.rows) || 0;
  const done = !!(p && (p.done === 1 || p.done === true));
  if (!started) return 'idle';
  if (done) return rows > 0 ? 'done' : 'done_empty';
  return rows > 0 ? 'progress' : 'fetching';
}

/**
 * フェーズと件数から、りんくのセリフ（lead）と進捗の有無を返す。
 * @param {{ started?: boolean, rows?: number, done?: number|boolean }} progress
 * @returns {{ phase: BackfillNarrationPhase, lead: string, animating: boolean, count: number }}
 *   lead = りんくのセリフ。animating = 取り込み中アニメを動かすか。count = 取り込み件数。
 */
export function backfillRinkuNarration(progress) {
  const phase = backfillNarrationPhase(progress);
  const count = Number(progress && progress.rows) || 0;
  const n = count.toLocaleString('ja-JP');
  switch (phase) {
    case 'fetching':
      return {
        phase,
        lead: 'むかしのコメントまで、さかのぼってるよ…！',
        animating: true,
        count
      };
    case 'progress':
      return {
        phase,
        lead: `いま ${n}件 あつめたよ！まだまだ遡るね`,
        animating: true,
        count
      };
    case 'done':
      // ⚠️ 完了時は「正確な件数」を出さない。公式件数は配信中も増え続け、匿名/削除/
      //   システム메ッセージ差で数件ずれるため、ぴったり一致しない＝「数が合わない」と
      //   気にさせてしまう（ユーザー指摘 2026-05-27）。達成感だけを伝える。
      return {
        phase,
        lead: '配信のはじめまで、ぜんぶ届いたよ！応援を集めきったよ✨',
        animating: false,
        count
      };
    case 'done_empty':
      return {
        phase,
        lead: 'いまは新しく遡れる分は無かったみたい。また後でさかのぼるね',
        animating: false,
        count
      };
    case 'idle':
    default:
      return {
        phase: 'idle',
        lead: 'ここから前の応援も、ぜんぶ拾ってくるね！',
        animating: false,
        count
      };
  }
}
