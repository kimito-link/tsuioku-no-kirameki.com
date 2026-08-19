/**
 * initShadeDismissPolicy.js — 初回ロードの幕(シェード)を【いつ畳むか】を決める純関数。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-19・状態速報の実測で確定)
 *   状態速報:
 *     「初回シェード t+801ms まで中身を覆っていた(観測10点)
 *       ★中身が見えなかった合計=801ms 主因=初回シェード(人が気づく長さ)」
 *     loadShadeProbe: shadeAgeMs=490 / shadeDone=false / ★dismissCalls=0
 *     laneTickProbe : ★docHidden=1
 *
 *   ＝幕を畳む処理が【一度も呼ばれていない】。
 *
 * ■ ★なぜ呼ばれないのか(コードで確認)
 *   popup-entry.js:armInlineShadeDeadlineOnFirstVisible は
 *   `document.visibilityState === 'visible'` でなければ
 *   visibilitychange を待つ設計。prewarm(画面外先読み)対策として正しい。
 *   ★しかしサイドパネルは docHidden=1 と観測される場面があり、
 *     その間ずっと締切が始まらない。
 *     幕を畳む係が動かないので、頼りは CSS の5秒アニメだけ。
 *     その最初の 18%(=0.9秒)は opacity:1 の完全不透明 = 黒く見える。
 *
 * ■ ★この module の役割
 *   「見えていなくても、中身が出来ているなら畳んでよいか」を判定する。
 *   [[js-rescue-cannot-run-when-loop-stalls-2026-08-19]] の教訓どおり
 *   JS だけに頼らない設計は CSS 側で別途担保する(ここは JS が生きている場合の改善)。
 *
 * 掟: DOM も chrome API も触らない(呼び出し側が観測値を渡す)。
 *
 * @module initShadeDismissPolicy
 */

/**
 * 見えていない画面で、幕を畳むまで待つ上限(ms)。
 * ★prewarm 対策(画面外で畳むと表示時に空白)は活かしつつ、
 *   「永久に畳まれない」状態を作らないための天井。
 */
export const HIDDEN_DISMISS_CAP_MS = 900;

/**
 * @typedef {{
 *   visible?: boolean,
 *   hasRealData?: boolean,
 *   sinceShadeShownMs?: number,
 *   capMs?: number
 * }} ShadeDismissInput
 */

/**
 * 幕を畳んでよいか。★構造で返す(文字列に閉じない)。
 *
 * @param {ShadeDismissInput} input
 * @returns {{ dismiss: boolean, reason: 'visible-data'|'visible-timeout'|'hidden-data'|'hidden-timeout'|'wait' }}
 */
export function shouldDismissInitShade(input) {
  const i = input && typeof input === 'object' ? input : {};
  const visible = i.visible === true;
  const hasData = i.hasRealData === true;
  const since = Number.isFinite(Number(i.sinceShadeShownMs)) ? Number(i.sinceShadeShownMs) : 0;
  const cap = Number.isFinite(Number(i.capMs)) ? Number(i.capMs) : HIDDEN_DISMISS_CAP_MS;

  if (visible) {
    // 見えている: 中身が出来たら即畳む。出来ていなくても上限で畳む(黒いまま待たせない)。
    if (hasData) return { dismiss: true, reason: 'visible-data' };
    if (since >= cap) return { dismiss: true, reason: 'visible-timeout' };
    return { dismiss: false, reason: 'wait' };
  }

  /*
   * ★見えていない場合(ここが今回の穴)
   *   従来は visibilitychange を待つだけで、締切が一切始まらなかった。
   *   ＝ dismissCalls=0 のまま幕が残り、CSS の 0.9秒不透明がそのまま黒に見えた。
   *   → 見えていなくても【中身が出来ていれば畳む】。
   *     畳んでおけば、表示された瞬間には既に中身が見えている状態になる。
   *   ★prewarm で「空白が見える」のを避ける主旨は hasRealData で担保される
   *     (中身が無いうちは畳まない)。
   */
  if (hasData) return { dismiss: true, reason: 'hidden-data' };
  if (since >= cap) return { dismiss: true, reason: 'hidden-timeout' };
  return { dismiss: false, reason: 'wait' };
}
