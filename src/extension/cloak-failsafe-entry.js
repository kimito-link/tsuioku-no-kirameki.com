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

import { CLOAK_CSS_FAILSAFE_MS } from '../lib/sidepanelCloakDuration.js';

try {
  setTimeout(() => {
    try {
      document.documentElement.removeAttribute('data-nl-popup-primary-cloak');
    } catch {
      /* no-op: 保険の失敗は本体を止めない */
    }
  }, CLOAK_CSS_FAILSAFE_MS);
} catch {
  /* no-op */
}
