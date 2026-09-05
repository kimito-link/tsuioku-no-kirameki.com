import { durationMsOf, WRITER_BOOT_GRACE_MS } from './timeAuthority.js';

/**
 * popup 固有診断が「popup 起動から何秒後の値か」を明示する注記を作る純関数(v0.1.1211)。
 *
 * 2026-08-01 に開発者(Claude)自身が読み違えた事故の再発防止。
 * 速報は「約22秒前にpopupで取得」と出すが、これは【速報の生成時刻から見た経過】であって
 * 【popup 起動からの経過】ではない。実際には起動 362ms 後のスナップショットだったのに
 * 「22秒経っても鏡が空＝取りこぼし」と誤読し、正常な起動直後の姿を不具合として報告しかけた。
 *
 * 起動直後は多くの計器が構造的にゼロになる:
 *   - 鏡の flush は publish の 400ms 後(popup-entry.js の trailing-edge タイマー)
 *   - 初期ローディングの幕は最低 800ms 表示する設計なので shadeDone:false が正常
 *   - アイコングリッドは一度も作り直していなければ「未観測」
 * これらを「不具合」と読まないために、値の"齢"を人間が読む行に出す。
 *
 * @param {number|null|undefined} shadeAgeMs popup 起動からの経過ミリ秒
 *   (popupDiag.popup.loadShadeProbe.shadeAgeMs)
 *   ★これは performance.now() 基準の【経過時間】であり、capturedAt(epoch の時点)とは
 *     別の量。混ぜてはいけない([[venue-seats-lastupdate-clock-mismatch-v1044]])。
 * @returns {string} 注記(判定不能なら空文字)
 */
export function buildPopupDiagUptimeNote(shadeAgeMs) {
  /*
   * ★v0.1.1304: null/空文字ガードは timeAuthority.durationMsOf が正本。
   *   Number(null)===0 / Number('')===0 なので、これが無いと
   *   「値が取れなかった」を「起動0.0秒」と偽って報告してしまう。
   */
  const ms = durationMsOf(shadeAgeMs);
  if (ms == null) return '';
  const sec = ms / 1000;
  const shown = sec < 10 ? sec.toFixed(1) : String(Math.round(sec));
  const base = `popup 起動から ${shown} 秒後の値`;
  /*
   * 起動直後は、ゼロの計器を「不具合」と読まないよう明示的に警告する。
   * ★v0.1.1304: 閾値は timeAuthority.WRITER_BOOT_GRACE_MS が正本。
   *   ここにリテラル 3000 を書くと、diagnosticsTrust 側の定数と【同じ値が2箇所】になり、
   *   片方だけ変えたときに判定がずれる(7版事件の構造そのもの)。
   */
  if (ms < WRITER_BOOT_GRACE_MS) {
    return (
      `${base} ⚠ 起動直後のため、鏡・グリッド等がゼロや「未観測」でも正常です` +
      `（鏡の書き出しは publish の 400ms 後・幕は 800ms 最低表示）。` +
      `これらを判定するには popup を開いたまま数十秒おいて取り直してください。`
    );
  }
  return base;
}
