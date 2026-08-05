/**
 * 「パネルを出してよいか / 消してよいか」を決める純関数。
 *
 * ★v0.1.1262 の動機(2026-08-05・会議で方針転換):
 *   ちらつきを3日追い、計器を5つ足したが直らなかった。
 *   会議(4体・全員一致)の裁定:
 *     「計器を増やすアプローチは根本解決にならない。
 *       疑わしい処理を止めて挙動を見よ(内部原因か外部原因かを二分せよ)」
 *
 * ■ 実測が示していた矛盾(ここを突く)
 *   パネルは【表示されている】のに、
 *   「パネルを消した理由: autoshow_off 4回(100%)・0.4秒ちょうどの周期」。
 *
 *   autoshow_off の成立条件は3つ全部 false のとき:
 *     !autoshowEnabled && !toolbarPressed && !activatedThisSession
 *   表示中なら activatedThisSession は true のはずで、この分岐に入れない。
 *   なのに4回入っている = ★「表示中なのに"まだ一度も表示していない"判定が成立する瞬間がある」。
 *
 *   周期が 0.4秒ちょうど = タイマー由来。起動直後にフラグが立つ前の窓が疑わしい。
 *
 * ■ この関数の役目
 *   「一度でも表示したことがあるなら消さない」を足す。
 *   ★これは推測での修正ではなく、実測の矛盾を潰す変更。
 *   ちらつきが止まれば内部原因で確定。止まらなければ外部原因と分かる(=二分)。
 *
 * ■ 壊さないこと
 *   初回は従来どおり出さない(「こん太を押すまで出さない」は維持)。
 *   緩めるのは「一度出したあと」だけ。
 */

/**
 * パネルを非表示にすべきか。
 *
 * @param {object} args
 * @param {boolean} [args.autoshowEnabled] 設定で自動表示が ON か。
 * @param {boolean} [args.toolbarPressed] このタブでツールバーを押したか。
 * @param {boolean} [args.activatedThisSession] このセッションで一度でも表示したか。
 * @param {boolean} [args.everShown] 実際に画面へ出したことがあるか(実測ベース)。
 * @returns {{ hide: boolean, reason: 'autoshow-off'|'shown-before'|'allowed' }}
 */
export function shouldHideInlinePanelByAutoshow(args) {
  const autoshowEnabled = args?.autoshowEnabled === true;
  const toolbarPressed = args?.toolbarPressed === true;
  const activatedThisSession = args?.activatedThisSession === true;
  const everShown = args?.everShown === true;

  // 従来どおり: どれか1つでも立っていれば表示してよい。
  if (autoshowEnabled || toolbarPressed || activatedThisSession) {
    return { hide: false, reason: 'allowed' };
  }

  /*
   * ★v0.1.1262 の追加条件:
   *   「一度でも画面に出したことがある」なら消さない。
   *   実測で「表示中なのに autoshow_off で消される」が 0.4秒周期で起きていた。
   *   フラグ(activatedThisSession)が立つ前の窓や、フラグが巻き戻る経路があっても、
   *   実際に出した事実は覆らないので、これを最後の砦にする。
   *
   *   ★初回(まだ一度も出していない)は従来どおり消す=「こん太を押すまで出さない」は維持。
   */
  if (everShown) {
    return { hide: false, reason: 'shown-before' };
  }

  return { hide: true, reason: 'autoshow-off' };
}
