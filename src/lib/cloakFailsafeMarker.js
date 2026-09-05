/**
 * cloakFailsafeMarker.js — 外部保険(cloak-failsafe-entry.js)と本体(popup-entry.js)が
 * 「幕をもう外した」という**判定**を共有するための唯一の鍵。
 *
 * ★なぜ要るか(2026-08-12・黒画面の会議 Q2 で確定)
 *   幕(cloak)を外す経路は2つある:
 *     ① 外部保険 cloak-failsafe-entry.js … バンドルより前に読まれる極小ファイル。
 *        `CLOAK_CSS_FAILSAFE_MS`(400ms)後に属性を外す。
 *     ② 本体 popup-entry.js の revealPopupPrimaryOnce() … `popupPrimaryRevealDone` を立てる。
 *
 *   ところが ① は ② のフラグを立てないので、① が外した後に refresh が走ると
 *   ensurePopupPrimaryCloakedBeforeFirstReveal() が「まだ誰も見せていない」と誤認して
 *   幕を**付け直す**。ユーザーには「一度見えたのにまた隠れる」形で出る。
 *
 * ★知識ではなく【判定】を共有する
 *   同じことをコメントで両方に書いても誤読は止まらない。止まるのは、
 *   ②が①の結果を**読んで同じ結論に倒れる**ときだけ。
 *   [[shared-knowledge-is-not-shared-judgment-2026-08-10]]
 *
 * ★これは「黒が消える」対策ではない(過大申告しない)
 *   イベントループが止まる凍結型では ① の setTimeout 自体が走らないので、この印も立たない。
 *   効くのは【JS が生きているのに幕が再付与される】経路だけ(実測 1〜2秒相当)。
 *   真因(メインスレッド停止)は別物＝ [[stalled-event-loop-masquerades-as-paint-bug-2026-08-12]]。
 *
 * 掟: 定数だけを持つ・DOM を触らない・window への代入は各エントリ側で行う。
 *
 * @module cloakFailsafeMarker
 */

/**
 * 外部保険が幕を外したときに `window` へ立てる印の名前。
 *
 * ★文字列を両側に直書きすると、片方の綴りを変えた瞬間に**黙って**共有が切れる
 *   (テストも通り、症状だけが戻る)。正本をここ1つにして両者から import する。
 */
export const CLOAK_FAILSAFE_FIRED_FLAG = '__nlPopupCloakFailsafeFired';

/**
 * 外部保険が既に幕を外したか。
 *
 * @param {typeof globalThis|{[k: string]: unknown}|null|undefined} win 判定対象(通常は window)
 * @returns {boolean} 外部保険が発火済みなら true
 */
export function hasCloakFailsafeFired(win) {
  try {
    if (!win) return false;
    return Boolean(/** @type {{[k: string]: unknown}} */ (win)[CLOAK_FAILSAFE_FIRED_FLAG]);
  } catch {
    // window に触れない環境(テスト/隔離)は「まだ外していない」と読む=従来動作へ倒す。
    return false;
  }
}
