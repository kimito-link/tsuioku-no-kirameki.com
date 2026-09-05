// commentWriteModeDiagKey.js
// コメント記録の【書き込みモード】(チャンク追記 or 巨大配列の丸ごと書き戻し)を
//   content-entry.js(書き手)が書き、status / サイドパネルが読む storage キー。
//   channelSwitchDiagKey.js と同じ方式(純観測値を書く→速報が行に再表示)。
//
// ★なぜ要るか(2026-08-12 会議で「真犯人が計器の死角にいる」と確定)
//   `chunkMode`(content-entry.js:12151)が false になると、畳み込みのたびに
//   巨大配列を丸ごと書き戻す(実測: 停止410ms vs チャンク63ms = 6.8倍)。
//   ところが **chunkMode が今どちらなのかを速報に出す計器が1つも無かった**。
//   ＝パネルが固まっている当人にも、私にも、原因が見えない構造だった。

/** コメント書き込みモード診断の storage キー(local only・件数とモード名だけ=PIIを含めない)。 */
export const KEY_COMMENT_WRITE_MODE_DIAG = 'nls_comment_write_mode_diag_v1';
