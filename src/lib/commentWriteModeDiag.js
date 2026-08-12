/**
 * commentWriteModeDiag.js — コメント記録の「書き込みモード」を1行に要約する純関数。
 *
 * ★なぜ要るか(2026-08-12・黒画面9版目の会議で確定)
 *   パネルが黒く、診断ページも開かない症状の真犯人候補は
 *   【巨大配列の丸ごと書き戻し】だと実測で分かった:
 *
 *     丸ごと書き戻し ×5 = 2,522ms / イベントループ停止 410ms
 *     末尾チャンクだけ×5 =   371ms / イベントループ停止  63ms   ＝6.8倍
 *
 *   拡張の全ページは同一メインスレッドを共有するので、記録エンジンの重い write は
 *   そのままパネル/診断ページの凍結として現れる
 *   ([[stalled-event-loop-masquerades-as-paint-bug-2026-08-12]])。
 *
 *   ★ところが「いま chunkMode がどちらか」を出す計器が【1つも無かった】。
 *     ＝真犯人が構造的に観測できない＝速報を何回もらっても永久に分からない
 *     ([[zero-count-may-mean-unmeasured-2026-08-04]] と同型)。
 *
 * ■ この計器の価値は「次の一手を分岐させる」こと
 *   [[instrument-value-is-measured-by-fixes-2026-08-12]]:
 *     - chunk  … 書き込みは軽い。凍結が残るなら**別の犯人**(status経路/初期化処理)へ
 *     - whole  … この配信は毎回 O(N) 書き戻し。**ここを直せば効く**
 *   ＝読んで直せる。読み手に引き算をさせない。
 *
 * 掟: 数えるだけ・DOM を触らない・時刻は呼び出し側が渡す(テスト可能性)。
 *
 * @module commentWriteModeDiag
 */

/**
 * 丸ごと書き戻し(whole)が起きていたら異常と呼ぶ件数の下限。
 * ★1回でも whole があれば、その配信は記録が伸びるほど重くなるので即座に名指しする。
 */
export const WHOLE_WRITE_ALERT_COUNT = 1;

/**
 * @typedef {{
 *   mode?: string,
 *   liveId?: string,
 *   rows?: number,
 *   wholeWrites?: number,
 *   chunkWrites?: number,
 *   fallbackReason?: string,
 *   at?: number
 * }} CommentWriteModeDiag
 */

/**
 * 書き込みモード診断を速報の1行に整形する。
 *
 * @param {CommentWriteModeDiag|null|undefined} diag 観測値
 * @param {number} nowMs 現在時刻(ms)
 * @returns {{ ok: boolean, line: string, mode: string, wholeWrites: number }}
 */
export function buildCommentWriteModeDiagLine(diag, nowMs) {
  if (!diag || typeof diag !== 'object') {
    // ★未観測を「正常」と言わない(測っていないだけ)。
    return { ok: true, line: 'コメント書込モード ⚪ 未観測', mode: 'unknown', wholeWrites: 0 };
  }
  const mode = String(diag.mode || '').trim() || 'unknown';
  const rows = Math.max(0, Math.floor(Number(diag.rows) || 0));
  const whole = Math.max(0, Math.floor(Number(diag.wholeWrites) || 0));
  const chunk = Math.max(0, Math.floor(Number(diag.chunkWrites) || 0));
  const reason = String(diag.fallbackReason || '').trim();
  const at = Number(diag.at);
  const agoSec = Number.isFinite(at) && at > 0 ? Math.max(0, Math.round((nowMs - at) / 1000)) : null;
  const agoNote = agoSec == null ? '' : `・${agoSec}秒前`;

  const bad = whole >= WHOLE_WRITE_ALERT_COUNT;
  if (bad) {
    /*
     * ★原因と次の一手まで言う([[instrument-must-name-the-cause-2026-08-01]])。
     *   「whole」という語だけでは読み手(私)が何をすればいいか分からない。
     */
    return {
      ok: false,
      mode,
      wholeWrites: whole,
      line:
        `コメント書込モード 🔴丸ごと書き戻し(${whole}回・記録${rows}件${agoNote})` +
        (reason ? ` 理由=${reason}` : '') +
        ' ★記録が伸びるほど重くなり、同一スレッドのパネル/診断を巻き込んで固める' +
        '(チャンク追記なら6.8倍軽い)'
    };
  }
  return {
    ok: true,
    mode,
    wholeWrites: 0,
    line: `コメント書込モード ✅チャンク追記(${chunk}回・記録${rows}件${agoNote})`
  };
}
