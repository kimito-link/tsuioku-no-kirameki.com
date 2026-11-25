// srSendConfirm.js — SHOWROOM の送信確認で「今の公式の欄」を読む。
// @layer L1 — 欄の value を読むだけ

/**
 * 書き込んだ欄が DOM から外れても、今見えている公式の欄を優先する。
 * 外れた欄に文字が残っていて、今の欄が空なら「送ったあと欄が差し替わった」と読む。
 *
 * @param {{ isConnected?: boolean, value?: string } | null | undefined} written
 * @param {{ value?: string } | null | undefined} live
 * @returns {string}
 */
export function readSrCommentConfirmText(written, live) {
  const el = live || written;
  return String(el?.value || '').trim();
}
