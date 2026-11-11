// ABEMA のコメント欄は、開いているときだけ本文の取得が始まる。閉じたままでは件数だけが来る。
// 放送ページでは吹き出しボタンを一度だけ押す。利用者が閉じたら、同じページでは押し直さない。

export const AB_COMMENT_AREA_SEL = '.com-tv-CommentArea';
export const AB_COMMENT_BUTTON_SEL = '.com-tv-LinearFooterCommentButton button';
export const AB_PANEL_POLL_MS = 2000;
export const AB_PANEL_WAIT_MS = 30_000;
/** 未設定はオン。false のときだけ自動で開かない */
export const AB_OPEN_COMMENT_KEY = 'yt_ab_open_comment';
export const AB_PANEL_NOTE = 'ABEMAのコメント欄（画面右下の吹き出しボタン）を開くと記録が始まります';

/** @param {unknown} stored */
export function abOpenCommentEnabled(stored) {
  return stored !== false;
}

export function createAbPanelController() {
  let clicked = false;
  let sawArea = false;
  let startedAt = 0;
  return {
    reset() {
      clicked = false;
      sawArea = false;
      startedAt = 0;
    },
    status() {
      return { clicked, sawArea, startedAt };
    },
    /**
     * @param {{ area: boolean, button: boolean, enabled: boolean, now: number }} s
     * @returns {{ click: boolean, userClosed: boolean }}
     */
    tick(s) {
      const now = Number(s.now) || 0;
      if (!startedAt) startedAt = now;
      if (s.area) {
        sawArea = true;
        return { click: false, userClosed: false };
      }
      if (sawArea) return { click: false, userClosed: true };
      const waiting = now - startedAt <= AB_PANEL_WAIT_MS;
      const click = !!(s.enabled && s.button && !clicked && waiting);
      if (click) clicked = true;
      return { click, userClosed: false };
    },
  };
}

/**
 * 放送ページの DOM を見て、条件が揃っていれば吹き出しボタンを一度だけ押す。
 * @param {ReturnType<typeof createAbPanelController>} ctrl
 * @param {{ querySelector: (sel: string) => { click?: () => void } | null }} doc
 * @param {{ enabled?: boolean, now: number }} opts
 */
export function stepAbCommentPanel(ctrl, doc, opts) {
  const area = !!doc.querySelector(AB_COMMENT_AREA_SEL);
  const button = doc.querySelector(AB_COMMENT_BUTTON_SEL);
  const action = ctrl.tick({
    area,
    button: !!button,
    enabled: opts.enabled !== false,
    now: opts.now,
  });
  if (action.click && button && typeof button.click === 'function') button.click();
  return action;
}
