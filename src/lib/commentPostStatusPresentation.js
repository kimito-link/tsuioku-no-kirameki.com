/**
 * コメント送信 UI の「最終ステータス表示」と aria-describedby を決める純関数群。
 *
 * popup-entry.js の paintCommentComposeUi から「DOM 非依存の表示判断」だけを
 * 抽出したもの（pure refactor、挙動不変）。状態の保持（COMMENT_POST_UI_STATE）と
 * DOM 適用（placeholder/disabled/textContent/setAttribute）は popup に残す。
 *
 * deriveCommentPostUiState（commentPostUi.js）が既に baseState を導出するので、
 * ここはその上に「notice をかぶせるか」「警告時の describedby」を足すだけ。
 */

/**
 * base の statusMessage/statusKind に、一時 notice をかぶせるか決める。
 *
 * notice はユーザー操作起因の一時メッセージ（送信成功/失敗/言い換え促し等）。
 * ただし「watch 未接続 / liveId 未取得 / 送信中」の base メッセージは notice より
 * 優先する（従来 baseOverridesNotice 条件）。
 *
 * @param {{ statusMessage?: string, statusKind?: ('idle'|'error'|'success'), mode?: string }} baseState
 * @param {({ message?: string, kind?: ('idle'|'error'|'success') }|null|undefined)} notice
 * @returns {{ message: string, kind: ('idle'|'error'|'success') }}
 */
export function resolveCommentPostStatus(baseState, notice) {
  const base = baseState && typeof baseState === 'object' ? baseState : {};
  let message = String(base.statusMessage ?? '');
  let kind = /** @type {'idle'|'error'|'success'} */ (base.statusKind || 'idle');

  const baseOverridesNotice =
    base.mode === 'no_watch' || base.mode === 'no_live_id' || base.mode === 'submitting';

  const n = notice && typeof notice === 'object' ? notice : null;
  if (n && n.message && !baseOverridesNotice) {
    message = String(n.message);
    kind = /** @type {'idle'|'error'|'success'} */ (n.kind || 'idle');
  }
  return { message, kind };
}

/**
 * やさしさ警告の有無に応じた aria-describedby 文字列を返す。
 *
 * @param {'input'|'button'} target どちらの要素向けか（input は exportToolbarHint を含む）
 * @param {boolean} hasKindnessWarning
 * @returns {string}
 */
export function commentComposeAriaDescribedBy(target, hasKindnessWarning) {
  if (target === 'input') {
    return hasKindnessWarning
      ? 'commentKindnessBody commentKindnessConfirm postStatus exportToolbarHint'
      : 'postStatus exportToolbarHint';
  }
  // button
  return hasKindnessWarning
    ? 'commentKindnessBody commentKindnessConfirm postStatus'
    : 'postStatus';
}
