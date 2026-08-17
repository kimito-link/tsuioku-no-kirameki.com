/**
 * cloakNotForSidePanel.js — 「この画面で幕(cloak)を使うべきか」を言う純関数。
 *
 * ■ ユーザーの証言が出発点(2026-08-17)
 *   「サイドパネルをはじめていれた時はでなかったっていってるのわすれた？」
 *   ＝**導入時は黒くなかった**。後から入れた何かが黒を作っている、という指摘。
 *
 * ■ 履歴が裏付けた(git log で確認)
 *     795c41b3 サイドパネル導入   : <html lang="ja" data-nl-usage-terms-ack="1">
 *                                   sidepanel.html は23行・スタイル4行だけ → **黒くない**
 *     997f07f1 v0.1.1279         : <html ... data-nl-popup-primary-cloak="1" ...> を追加
 *                                   → ★ここから「真っ黒」が始まる
 *   以後 v1279→1283→1285→1294→1299→1310→1312→1316→1369→1414→1418 と
 *   **12版**「黒を消す工夫」を足し続けたが、実機ではまだ黒い。
 *
 * ■ なぜ幕が黒を作るのか
 *   幕は `.nl-popup-primary { opacity: 0 }` で**中身を隠す**規則(popup.html:1726)。
 *   属性は popup.html の1行目に【静的に】書かれており、JS が走る前から効く。
 *   解除は JS(revealPopupPrimaryOnce)か CSS の自動 reveal(400ms)だが、
 *   実機では JS の到達が遅れて **t+917ms** まで隠れていた(状態速報で実測)。
 *   ＝その間パネルは「中身が無い」＝暗く見える。
 *
 * ■ なぜサイドパネルでは幕が要らないのか(撤去の根拠)
 *   幕の目的は【白フラッシュ防止】。ところがサイドパネルの白0.2秒は
 *   Chromium issue 40190899 で**拡張からは直せない**と結論済み
 *   ([[sidepanel-white-flash-is-unfixable-2026-08-10]])。
 *   ＝**防げない白を防ごうとして、防げる黒を作っている**。
 *   さらに v0.1.1285 で「透明背景」の部分は既に撤去済みで、
 *   いま残っているのは「中身を隠す」効果だけ＝サイドパネルには害しかない。
 *
 * ★埋め込み(watch ページ重ね)では引き続き幕を使う。
 *   あちらは親ホストの上に重なるので、段階描画のちらつき隠しに意味がある。
 *
 * 掟: DOM も location も触らない(呼び出し側が渡す=テスト可能)。
 *
 * @module cloakNotForSidePanel
 */

/**
 * この URL の画面で幕を使うべきか。
 *
 * @param {string} search location.search（`?` 付き/無しどちらも可）
 * @returns {boolean} true=幕を使う（従来どおり） / false=使わない（サイドパネル）
 */
export function shouldUseCloak(search) {
  try {
    const params = new URLSearchParams(String(search || ''));
    // サイドパネルは inline=1 かつ dock=sidepanel（readInlineModeFlags と同じ規約）。
    const isSidePanel =
      params.get('inline') === '1' && String(params.get('dock') || '') === 'sidepanel';
    return !isSidePanel;
  } catch {
    // 判定できないときは【従来どおり幕を使う】=安全側(挙動を変えない)。
    return true;
  }
}
