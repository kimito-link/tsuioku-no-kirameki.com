/**
 * ニコ生の watch ページでコメント欄が「見えない／届かない」状態を検出し、
 * 安全に復旧できる場合だけ次に取るべきアクションを返す純粋モジュール。
 *
 * DOM / chrome API / timer に触らない。content script 側が DOM を観測して
 * このモジュールに数値化された状態を渡し、結果の `action` を受けて実際の
 * click / scrollIntoView を実行する。
 *
 * 現時点で扱う失敗モード:
 *   F1: リスト内スクロールが下端でない → 「最新コメントに戻る」ボタンを click
 *   F4: コメントパネルがページ viewport から外れている → パネルを scrollIntoView
 *
 * 優先度と誤爆対策:
 *   - 設定 OFF ならアクションしない（ユーザ意図尊重）
 *   - 前回アクションから `cooldownMs` 以内なら再発火しない（手動スクロールと喧嘩しない）
 *   - パネル自体が無ければここでは何もせず、既存の `no_comment_panel` 警告に任せる
 *   - 1 tick につき 1 アクションだけ。F4 と F1 両方が該当するときは F4 を先に返す
 *     （パネルを視界に入れてから次の tick で最新へ飛ぶ、という段階的復旧）
 */

/** 「最新コメントに戻る」ボタンの安定セレクタ（CSS Modules のハッシュ名は外して aria-label 基準）。 */
export const LATEST_COMMENT_BUTTON_SELECTOR =
  'button.indicator[aria-label="最新コメントに戻る"]';

/** 自動復旧の既定クールダウン（ms）。ユーザの手動スクロールと喧嘩しない間隔。 */
export const COMMENT_PANEL_RESTORE_COOLDOWN_MS = 10 * 1000;

/**
 * ユーザがホイール／タッチ／スクロール系キーを操作した直後の自動復旧ロックアウト（ms）。
 *
 * 既定クールダウンは「前回復旧アクション→次の復旧アクション」の間隔で、ユーザが自分で
 * 上にスクロールしている最中の 1 発目を抑えられない。5 秒あれば「ユーザがいま能動的に
 * スクロール中」と「もう動かしていない静止状態」を安全に分離できる。
 */
export const COMMENT_PANEL_USER_SCROLL_LOCKOUT_MS = 5 * 1000;

/**
 * scrollHost の下端との距離がこの値を超えたら「スクロールが古い位置にある」とみなす。
 * 数行分の余裕を持たせて、普通に最下部に張り付いているときに誤発火しない値。
 */
export const COMMENT_PANEL_SCROLLED_UP_THRESHOLD_PX = 200;

/**
 * viewport 高さに対してパネル top がこの比率を超えていたら「下に隠れている」と判定する。
 * 0.9 = viewport 下 10% より下にある場合。
 */
export const COMMENT_PANEL_OUT_OF_VIEWPORT_RATIO = 0.9;

/**
 * 設定 storage キー。既定 true（`raw !== false`）。
 */
export const KEY_COMMENT_PANEL_AUTO_RESTORE = 'nls_comment_panel_auto_restore_enabled';

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function normalizeCommentPanelAutoRestoreEnabled(raw) {
  return raw !== false;
}

/**
 * @typedef {Object} CommentPanelHealthInput
 * @property {boolean} enabled              ユーザ設定 ON/OFF
 * @property {number} now                   現在時刻 epoch ms
 * @property {number} lastActionAt          前回アクションした epoch ms（0 or 負 = なし）
 * @property {number} [cooldownMs]          クールダウン（既定 COMMENT_PANEL_RESTORE_COOLDOWN_MS）
 * @property {number} [lastUserScrollAt]    ユーザがホイール/タッチ/スクロールキーを触った epoch ms
 * @property {number} [userScrollLockoutMs] ユーザスクロール後のロックアウト（既定 5000）
 * @property {boolean} panelPresent         パネル要素が DOM にあるか
 * @property {{ top: number, height: number }|null} panelRect パネルの viewport 相対矩形
 * @property {number} viewportHeight        window.innerHeight（0 や負値は判定スキップ）
 * @property {{ scrollTop: number, scrollHeight: number, clientHeight: number }|null} scrollHost
 * @property {boolean} hasLatestButton      「最新コメントに戻る」ボタンが DOM にあるか
 */

/**
 * @typedef {Object} CommentPanelHealthDecision
 * @property {'none'|'scroll_panel_into_view'|'click_latest_button'} action
 * @property {string} reason  診断用の短い識別子（ログ／テストで使う）
 */

/**
 * @param {CommentPanelHealthInput} input
 * @returns {CommentPanelHealthDecision}
 */
export function decideCommentPanelRestoreAction(input) {
  const i = input || /** @type {CommentPanelHealthInput} */ ({});
  if (!i.enabled) return { action: 'none', reason: 'disabled' };

  const cooldownMs = Number.isFinite(i.cooldownMs)
    ? /** @type {number} */ (i.cooldownMs)
    : COMMENT_PANEL_RESTORE_COOLDOWN_MS;
  const lastAt = Number(i.lastActionAt) || 0;
  const now = Number(i.now) || 0;
  if (lastAt > 0 && now - lastAt < cooldownMs) {
    return { action: 'none', reason: 'cooldown' };
  }

  /*
   * ユーザが能動的にスクロール操作中ならアクションを 1 回も出さない。
   * cooldown は「前回復旧→次の復旧」の間隔なので、ユーザがいま上に押し上げている
   * 初回をブロックできない。wheel/touchmove/PageUp 等のイベントで更新された
   * lastUserScrollAt を参照して、直近 5 秒以内の操作があれば自動復旧を棚上げする。
   */
  const userScrollAt = Number(i.lastUserScrollAt) || 0;
  const userScrollLockoutMs = Number.isFinite(i.userScrollLockoutMs)
    ? /** @type {number} */ (i.userScrollLockoutMs)
    : COMMENT_PANEL_USER_SCROLL_LOCKOUT_MS;
  if (userScrollAt > 0 && now - userScrollAt < userScrollLockoutMs) {
    return { action: 'none', reason: 'user_scrolling' };
  }

  // パネルそのものが無い状態は既存の `no_comment_panel` 警告に任せる。
  if (!i.panelPresent) return { action: 'none', reason: 'panel_missing' };

  // 優先度 1: パネルが viewport に入っていなければ、まずは視界に入れる。
  // これを先に解決しておかないと、後段で scrollHost を触っても画面上は見えない。
  const vh = Number(i.viewportHeight) || 0;
  if (vh > 0 && i.panelRect && Number.isFinite(i.panelRect.top) && Number.isFinite(i.panelRect.height)) {
    const top = Number(i.panelRect.top);
    const height = Number(i.panelRect.height);
    const bottom = top + height;
    // viewport の下に隠れているか、完全に上に追いやられている
    if (top > vh * COMMENT_PANEL_OUT_OF_VIEWPORT_RATIO || bottom <= 0) {
      return { action: 'scroll_panel_into_view', reason: 'out_of_viewport' };
    }
  }

  // 優先度 2: ニコ生自身が「最新コメントに戻る」ボタンを出している＝
  // ニコ生側が「このユーザは今、古い位置にいる」と判定済み。押して戻してあげる。
  if (i.hasLatestButton) {
    return { action: 'click_latest_button', reason: 'scrolled_up_button' };
  }

  // 優先度 3: ボタンが取れない CSS Module バリアント等のフォールバック。
  // scrollHost の下端から十分離れているときは古い位置にいるとみなす。
  const host = i.scrollHost;
  if (host && Number.isFinite(host.scrollTop) && Number.isFinite(host.scrollHeight) && Number.isFinite(host.clientHeight)) {
    const scrollTop = Number(host.scrollTop);
    const scrollHeight = Number(host.scrollHeight);
    const clientHeight = Number(host.clientHeight);
    if (scrollHeight > clientHeight + 100) {
      const bottomGap = scrollHeight - clientHeight - scrollTop;
      if (bottomGap > COMMENT_PANEL_SCROLLED_UP_THRESHOLD_PX) {
        return { action: 'click_latest_button', reason: 'scrolled_up_gap' };
      }
    }
  }

  return { action: 'none', reason: 'healthy' };
}
