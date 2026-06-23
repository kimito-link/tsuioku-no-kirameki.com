/**
 * popup.html の URL クエリから「どのモードで開かれた popup か」を判定する純関数。
 *
 * popup-entry.js は同じ window.location.search を 5 回別々の IIFE で読んでいた（INLINE_MODE /
 *   TOOLBAR_POPUP / INLINE_EMBED_WATCH / INLINE_SIDE_PANEL / INLINE_PASSIVE）。同型の URLSearchParams
 *   読みをこの 1 か所に集約し、popup-entry.js は destructuring で受けるだけにする（max-lines ラチェット内に
 *   収め、status-entry.js も同じ判定を import で再利用できる）。chrome 非依存＝unit test で固定。
 *
 * モードの意味:
 *   - inline      : `?inline=1`（watch ページ内 iframe / サイドパネル / status 埋め込みの総称）
 *   - toolbar     : `?toolbar=1`（ツールバー default_popup の短命 popup）
 *   - embedWatch  : inline かつ dock!=='sidepanel'（watch ページ埋め込み・自タブ lv を `&lv=` で受ける）
 *   - sidePanel   : inline かつ dock==='sidepanel'
 *   - passive     : inline かつ dock∈{'status','liveview'}（埋め込みの受動ビュー＝書かない・注入しない・fetch しない）
 *   - embedLiveView : inline かつ dock==='liveview'（応援ライブビュー専用タブに popup を全面 iframe 埋め込み）
 *
 * 2026-06-23（応援ライブビュー そっくりコピー・案B2）: live-view.html は本物の popup.html を iframe で全面に
 *   埋めて「そっくりそのまま」出す。status 埋め込み(dock=status)と同じ受動ビュー(passive=書かない/注入しない/
 *   fetch しない)を継承しつつ、将来 live-view 専用の全画面 CSS 等を当てられるよう embedLiveView を別に立てる。
 *   lv は status と同じく embedWatch 経路(`&lv=`)で受ける（dock!=='sidepanel' なので embedWatch は true）。
 *
 * @typedef {{ inline: boolean, toolbar: boolean, embedWatch: boolean, sidePanel: boolean, passive: boolean, embedLiveView: boolean }} InlineModeFlags
 */

/**
 * @param {string} [search] window.location.search（省略時は空＝全 false）。`?` 付き/無しどちらも可。
 * @returns {InlineModeFlags}
 */
export function readInlineModeFlags(search) {
  let dock = '';
  let inline = false;
  let toolbar = false;
  try {
    const params = new URLSearchParams(String(search || ''));
    inline = params.get('inline') === '1';
    toolbar = params.get('toolbar') === '1';
    dock = String(params.get('dock') || '');
  } catch {
    return {
      inline: false, toolbar: false, embedWatch: false,
      sidePanel: false, passive: false, embedLiveView: false
    };
  }
  return {
    inline,
    toolbar,
    // embedWatch は inline 時のみ意味を持つ。dock!=='sidepanel'（status/liveview/embed/未指定）で true。
    //   = `&lv=` の自タブ liveId 経路を共有する（liveview も status と同じく lv をこの経路で受ける）。
    embedWatch: inline && dock !== 'sidepanel',
    sidePanel: inline && dock === 'sidepanel',
    // passive（受動ビュー＝書かない/注入しない/fetch しない）は status と liveview で共有。
    passive: inline && (dock === 'status' || dock === 'liveview'),
    // liveview 専用フラグ（将来の全画面 CSS 等のフック用。挙動は passive に集約）。
    embedLiveView: inline && dock === 'liveview'
  };
}
