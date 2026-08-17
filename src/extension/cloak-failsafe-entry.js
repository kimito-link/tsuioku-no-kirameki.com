// cloak-failsafe-entry.js — 幕(cloak)を外す【最速の保険】だけを担う極小エントリ。
//
// ★役割は1つ: 起動から CLOAK_CSS_FAILSAFE_MS 後に cloak 属性を必ず外す。
//   描画・状態・storage には一切触れない(失敗しても本体を止めない)。
//
// ■ なぜ popup-entry.js の保険では足りないのか(2026-08-12 実機で確定)
//     幕(cloak) ✅ t+922ms で解除 ★CSS自動解除(400ms)より後=JS解除が遅い
//     ★この間パネルは黒く見えていた=660ms(人が気づく長さ)
//   popup-entry.js の保険は末尾(22118行目)にあり、dist/popup.js は **2.3MB**。
//   ダウンロード+パース+実行が終わるまでその行に到達しないので、
//   ★「400ms後に外す」ではなく「バンドルを読み終えてから400ms後に外す」になっていた。
//   計器の 922ms − CSS の 400ms ≒ その到達遅れ。
//   → バンドルに依存しない極小ファイルを popup.js より前に読ませて起点を t≈0 にする。
//
// ■ なぜインライン <script> ではないのか(★v0.1.1353 の実機エラー)
//   拡張の CSP は `script-src 'self'` で、インライン実行はブロックされる:
//     Executing inline script violates the following Content Security Policy directive
//   v1353 でインラインに書いてしまい、保険は**一度も実行されなかった**。
//   ★拡張ページに足すスクリプトは必ず別ファイル(=self)にすること。
//   検査: src/lib/extensionCspInlineScript.test.js が全 HTML のインライン script を禁じる。

// ■ なぜ「外した」という印を残すのか(★v0.1.1381・会議 Q2)
//   この保険は幕を外すが、本体(popup-entry.js)はそれを知らない。
//   本体の ensurePopupPrimaryCloakedBeforeFirstReveal() は
//   `popupPrimaryRevealDone` という【自分が外したか】のフラグしか見ないので、
//   保険が外した後の refresh で幕を**付け直してしまう**。
//   ＝知識(コメント)を共有しても誤読は止まらない。止まるのは【判定を共有したとき】だけ。
//     [[shared-knowledge-is-not-shared-judgment-2026-08-10]]
//   window に印を置くのは、この極小ファイルと本体バンドルが別スクリプト＝
//   モジュール変数を共有できないため(両者が確実に見られる唯一の場所)。

import { CLOAK_CSS_FAILSAFE_MS } from '../lib/sidepanelCloakDuration.js';
import { CLOAK_FAILSAFE_FIRED_FLAG } from '../lib/cloakFailsafeMarker.js';
import { shouldUseCloak } from '../lib/cloakNotForSidePanel.js';

/*
 * ★v0.1.1420: サイドパネルでは幕を【待たずに即座に】外す。
 *
 * ■ ユーザー証言が出発点(2026-08-17)
 *   「サイドパネルをはじめていれた時はでなかったっていってるのわすれた？」
 *   git log で裏付け: 導入時(795c41b3)は幕が無く黒くない。
 *   v0.1.1279(997f07f1)で `data-nl-popup-primary-cloak="1"` を静的に足した
 *   ★その版から「真っ黒」が始まっている。以後12版、黒を消す工夫を足し続けたが消えず。
 *   ＝**黒を作っている当人を外す**のが筋。足すのをやめる。
 *
 * ■ なぜサイドパネルだけ外してよいか
 *   幕の目的は白フラッシュ防止。しかしサイドパネルの白0.2秒は
 *   Chromium issue 40190899 で拡張からは直せないと結論済み
 *   ([[sidepanel-white-flash-is-unfixable-2026-08-10]])。
 *   ＝防げない白のために、防げる黒(実機で t+917ms 中身が隠れる)を作っていた。
 *
 * ■ なぜここに置くか
 *   このファイルは popup.js(2.3MB)より前に読まれる極小ファイル＝起点が t≈0。
 *   本体バンドルの中で判定すると、到達までの数百msだけ幕が残る(それが今の症状)。
 *
 * ★埋め込み(watch 重ね)は従来どおり幕を使う=挙動不変。
 */
try {
  if (!shouldUseCloak(typeof window !== 'undefined' ? window.location.search : '')) {
    document.documentElement.removeAttribute('data-nl-popup-primary-cloak');
    // 本体(popup-entry.js)が幕を付け直さないよう、外した印を残す
    // ([[shared-knowledge-is-not-shared-judgment-2026-08-10]]=判定を共有する)。
    /** @type {{[k: string]: unknown}} */ (/** @type {unknown} */ (window))[
      CLOAK_FAILSAFE_FIRED_FLAG
    ] = true;
  }
} catch {
  /* no-op: 失敗しても下の従来保険(400ms)が効く */
}

try {
  setTimeout(() => {
    try {
      document.documentElement.removeAttribute('data-nl-popup-primary-cloak');
      // ★印は removeAttribute の【後】に立てる(先に立てると、removeAttribute が
      //   throw した場合に「外した」と嘘をつく=本体が幕を外れたものとして扱う)。
      /** @type {{[k: string]: unknown}} */ (/** @type {unknown} */ (window))[
        CLOAK_FAILSAFE_FIRED_FLAG
      ] = true;
    } catch {
      /* no-op: 保険の失敗は本体を止めない */
    }
  }, CLOAK_CSS_FAILSAFE_MS);
} catch {
  /* no-op */
}
