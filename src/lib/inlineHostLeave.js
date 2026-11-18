import { shouldHideAfterWatchLeave } from './inlineHostRecoveryGate.js';

/**
 * 視聴ページを離れた時刻と、欄を閉じる操作。
 * 後始末は最初の1回だけ、閉じる操作は開き直されるたびにやり直す。
 *
 * @param {{
 *   waitMs: number,
 *   isKeepLocation: () => boolean,
 *   onFirstCommit: () => void,
 *   hide: (reason: 'not_watch_url' | 'left_watch_page') => void
 * }} deps
 */
export function createInlineHostLeaveClock(deps) {
  let ticks = 0;
  let since = 0;
  let committed = false;
  const waitMs = Math.max(0, Number(deps.waitMs) || 0);

  function clear() {
    ticks = 0;
    since = 0;
    committed = false;
  }

  /** @param {number} [now] */
  function due(now = Date.now()) {
    if (!since) since = now;
    return shouldHideAfterWatchLeave({ sinceMs: since, nowMs: now, waitMs }).hide;
  }

  /** @param {'not_watch_url' | 'left_watch_page'} reason */
  function commit(reason) {
    if (!committed) {
      committed = true;
      deps.onFirstCommit();
    }
    deps.hide(reason);
  }

  return {
    clear,
    get tickCount() {
      return ticks;
    },
    bump() {
      ticks += 1;
      if (!since) since = Date.now();
      return ticks;
    },
    due,
    commit,
    /**
     * 視聴ページの外では配置の再描画で欄を開かない。
     * 待ち時間を過ぎていれば閉じる。
     * @returns {boolean} true ならこの先で見せてはいけない
     */
    blockShow() {
      if (deps.isKeepLocation()) return false;
      if (due()) commit('not_watch_url');
      return true;
    }
  };
}
