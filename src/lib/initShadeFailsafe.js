/**
 * 初回ロード幕(.nl-init-shade)の CSS フェイルセーフとクラスの乖離を断つ純関数。
 *
 * ★council/loading-overlay-stuck-SYNTHESIS.md(v0.1.964):
 *   .nl-init-shade は popup.html の CSS で 15 秒後に nl-init-shade-css-failsafe アニメで【視覚的に】
 *   opacity:0/visibility:hidden になるが、JS の dismissInitialLoadShade が呼ばれない最悪系では
 *   nl-init-shade--done クラスが付かない。すると診断の shadeActive(クラス判定)が永続 true になり、
 *   状態速報が「描画済みなのにローディング継続」を【誤検知】し続ける。
 *   → CSS アニメ終了(animationend)で、まだ --done が無ければ付ける、の判定をここに純化してテスト可能にする。
 *
 * chrome/DOM 非依存(animationName 文字列と「既に done か」の boolean だけで判定)。
 *
 * @module initShadeFailsafe
 */

/** popup.html の CSS フェイルセーフアニメ名(これ以外の animationend では付与しない)。 */
export const INIT_SHADE_FAILSAFE_ANIMATION_NAME = 'nl-init-shade-css-failsafe';

/**
 * animationend を受けたとき、幕に nl-init-shade--done を付けるべきかを判定する。
 *   - フェイルセーフアニメの終了であること(他アニメの誤爆を防ぐ)
 *   - まだ --done が付いていないこと(二重付与しない=通常系で既に付いていれば何もしない)
 *
 * @param {string} animationName 終了したアニメ名(AnimationEvent.animationName)
 * @param {boolean} alreadyDone 既に nl-init-shade--done が付いているか
 * @returns {boolean} --done を付けるべきなら true
 */
export function shouldMarkInitShadeDoneOnAnimationEnd(animationName, alreadyDone) {
  return String(animationName || '') === INIT_SHADE_FAILSAFE_ANIMATION_NAME && !alreadyDone;
}
