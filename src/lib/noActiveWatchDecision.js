/**
 * 「実質アクティブな watch が無い」＝画面を空にするか、を決める純関数(v0.1.1313)。
 *
 * ★なぜ切り出すか（2026-08-10・サイドパネルで実害が出た）
 *   この判定は「watchページが見つかりません」を出すだけでなく、
 *   件数を「（この配信は未取得）」に戻し・ティッカーを空にし・書き出し/撮影を無効化し・
 *   レーンを reset する【画面を丸ごと空にする】判定でもある(popup-entry.js の
 *   `treatAsNoActiveWatch` ブロック)。判定を1つ間違えると視聴中の画面が消える。
 *
 * ■ 元の判定が壊れていた理由（構造の取り違え）
 *   旧: `!INLINE_EMBED_WATCH && treatAsNoActiveWatch`
 *   ツールバーの popup は「開いた瞬間だけ」存在するので、
 *   `activeTab` が watch でない＝ユーザーはニコ生を見ていない、と見なせた。
 *   ★しかしサイドパネルは【タブを切り替えても開いたまま】居続ける面である。
 *   ユーザーが X や YouTube へタブを移した瞬間 `activeTab` は watch でなくなり、
 *   `dataBacked`/`storage` 経由に落ちる。旧判定はこれを「watch 無し」と見なすため、
 *   【記録は動いているのにサイドパネルだけ空になる】。
 *
 * ■ 直し方
 *   常時開いている面(INLINE_EMBED_WATCH / INLINE_SIDE_PANEL)では、
 *   `activeTab` 以外の経路で watch URL が取れているなら「watch はある」と扱う。
 *   ★watch URL が【1つも】取れないときは、面の種類によらず従来どおり空にする
 *     (でないと配信を閉じた後も古い画面が残り続ける)。
 *
 * @typedef {'inlineParam'|'activeTab'|'dataBacked'|'lastFocusedNormal'|'storage'|'none'} WatchUrlSource
 */

/**
 * `activeTab` を伴わなくても watch を保持してよい「常駐する面」か。
 * @param {{ embedWatch?: boolean, sidePanel?: boolean }} surface
 * @returns {boolean}
 */
export function isPersistentWatchSurface(surface) {
  if (!surface || typeof surface !== 'object') return false;
  return Boolean(surface.embedWatch) || Boolean(surface.sidePanel);
}

/**
 * 画面を空にするか（＝「watchページが見つかりません」を出すか）を決める。
 *
 * @param {{
 *   isWatchUrl?: boolean,
 *   source?: WatchUrlSource|string,
 *   embedWatch?: boolean,
 *   sidePanel?: boolean
 * }} input
 * @returns {{ treatAsNoActiveWatch: boolean, showNoWatchHint: boolean, reason: string }}
 */
export function decideNoActiveWatch(input) {
  const inp = input && typeof input === 'object' ? input : {};
  const isWatchUrl = Boolean(inp.isWatchUrl);
  const source = String(inp.source || 'none');
  const embedWatch = Boolean(inp.embedWatch);
  const sidePanel = Boolean(inp.sidePanel);

  // watch URL がそもそも取れていない＝どの面でも空にする(配信を閉じた後など)。
  if (!isWatchUrl || source === 'none') {
    return {
      treatAsNoActiveWatch: true,
      // ★watch 埋め込み(INLINE_EMBED_WATCH)は視聴中の watch ページ内にいるので、
      //   そこに「watchページが見つかりません」と出すのは常に誤り(従来どおり出さない)。
      showNoWatchHint: !embedWatch,
      reason: 'no-watch-url'
    };
  }

  // `activeTab`(いま前面) と `inlineParam`(自タブ lv) は、面の種類によらず確実に watch。
  if (source === 'activeTab' || source === 'inlineParam') {
    return { treatAsNoActiveWatch: false, showNoWatchHint: false, reason: 'active' };
  }

  // ここから先は activeTab 以外(dataBacked / lastFocusedNormal / storage)。
  // ★常駐する面(サイドパネル・watch埋め込み)は、タブを切り替えても開いたままなので
  //   「前面が watch でない」ことは「見ていない」を意味しない＝保持する。
  if (isPersistentWatchSurface({ embedWatch, sidePanel })) {
    return {
      treatAsNoActiveWatch: false,
      showNoWatchHint: false,
      reason: 'persistent-surface-keeps-watch'
    };
  }

  // ツールバーの popup(開いた瞬間だけ存在する面)は従来どおり。
  // lastFocusedNormal は「直前に前面だった通常タブ」＝実質アクティブとして扱う。
  if (source === 'lastFocusedNormal') {
    return { treatAsNoActiveWatch: false, showNoWatchHint: false, reason: 'last-focused' };
  }

  /*
   * storage / dataBacked は「いま見ている」根拠が弱いので、前回配信レビュー扱いで空にする。
   *
   * ★v0.1.424 の判断(popup-entry から集約・実機 2026-05-27):
   *   dataBacked(v0.1.414「記録のある配信タブを優先」ソース)も storage と同じく
   *   「実質アクティブ watch ではない」扱いにする。さもないと、ニコ生以外のページ(X 等)で
   *   standalone POP を開いたとき、別の watch タブの記録(応援○件＋アイコングリッド)が
   *   フルのアクティブ表示として出る誤情報になる。dataBacked は foreground の watch ではなく
   *   「データのある直近の配信」なので、前回配信レビュー(empty-state)として軽く出すのが正しい。
   *   ★この判断は【ツールバー popup に限って】維持する。常駐面は上で先に返している
   *     (サイドパネルは開きっぱなしなので「別タブに移った＝見ていない」が成り立たないため)。
   */
  return { treatAsNoActiveWatch: true, showNoWatchHint: true, reason: `weak-source:${source}` };
}
