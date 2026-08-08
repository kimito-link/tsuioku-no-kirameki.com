/**
 * サイドパネル自己診断の storage キー。
 *
 * サイドパネル(sidepanel.html)が自分の3層の塗り状態を書き、status(状態速報)が読む。
 * ★書き手は sidepanel-entry.js の1箇所のみ / 読み手は status-entry.js のみ。
 */
export const KEY_SIDEPANEL_SELF_DIAG = 'nls_sidepanel_self_diag_v1';
