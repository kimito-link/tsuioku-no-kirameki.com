/**
 * v0.1.433: 別ウィンドウ POP（standalone popup window）を「配信に飛ばしたら閉じる」判定（純ロジック）。
 *
 * 背景（ユーザー要望 2026-05-28）:
 *   別ウィンドウ POP（chrome.windows.create({type:'popup'}) で開く独立ウィンドウ）は、配信を
 *   見ていない状態（新規タブ等を掴んだ状態）で立ち上がると「配信なし」表示のまま居座る。
 *   その居座った POP が前面にあると、その後 watch ページを開いても getLastFocused がこの POP/
 *   新規タブを拾って混信し、プレイヤー下の横付きパネルが出ない（実機で確認）。
 *
 *   ユーザーの整理:「POP は最初に（配信へ）飛ぶときだけ出せばいい。飛んだら配信をずっと見るので
 *   POP に表示は要らない」。＝POP から配信タブを開いたら POP ウィンドウは自分で閉じる。
 *   これで居座り・混信が根本から消える。
 *
 * ⚠️ 閉じてよいのは「自分が standalone popup window のとき」だけ。プレイヤー下のインライン
 *   パネル（iframe・INLINE_MODE）やサイドパネルは絶対に閉じない（ページ内 UI を壊す）。
 *   判定は呼び出し側が inlineMode / windowType を渡し、ここで純粋に決める。
 *
 * @module standalonePopupClose
 */

/**
 * 「配信タブを開いたあと、この POP ウィンドウを閉じてよいか」を判定する。
 *
 * @param {object} args
 * @param {boolean} args.inlineMode この popup.html が iframe 埋め込み（インライン/サイドパネル）か。
 *   true なら絶対に閉じない（ページ内 UI のため）。
 * @param {string|undefined|null} args.windowType chrome.windows.getCurrent() の type
 *   （'popup' のときだけ閉じる。'normal' 等は通常タブに表示されているので閉じない）。
 * @param {boolean} [args.openedStreamTab] 実際に配信タブを開けたか（開けていないなら閉じない）。
 * @returns {boolean} true なら現在のウィンドウを閉じてよい。
 */
export function shouldCloseStandalonePopupAfterNavigate(args) {
  if (!args || typeof args !== 'object') return false;
  if (args.inlineMode) return false; // インライン/サイドパネルは閉じない
  if (args.openedStreamTab === false) return false; // タブを開けていないなら閉じない
  return String(args.windowType || '') === 'popup';
}
