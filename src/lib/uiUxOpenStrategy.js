/**
 * ツールバーポップアップとページ内インラインの「どちらを前面にするか」の純粋な意思決定。
 * Chrome API には依存しない（background / popup から同じロジックを呼ぶ想定）。
 */

/** @typedef {'prefer_focus_inline' | 'always_open_popup'} ToolbarPopupPolicy */

/** @typedef {{ inlineHostVisible: boolean }} ToolbarPopupContext */

/** @typedef {'focus_inline_host' | 'open_toolbar_popup'} ToolbarPopupIntent */

/**
 * @param {ToolbarPopupPolicy} policy
 * @param {ToolbarPopupContext} context
 * @returns {ToolbarPopupIntent}
 */
export function resolveToolbarPopupIntent(policy, context) {
  const p = String(policy || '').trim();
  const inlineVisible = Boolean(context?.inlineHostVisible);

  if (p === 'always_open_popup') {
    return 'open_toolbar_popup';
  }
  if (p === 'prefer_focus_inline' && inlineVisible) {
    return 'focus_inline_host';
  }
  return 'open_toolbar_popup';
}
