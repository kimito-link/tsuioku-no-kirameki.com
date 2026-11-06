/**
 * 放送ページ(content script の一番外側)で、拡張の入れ替え後に古い版のまま止まったページを自分で読み込み直す見回りを始める。
 * 判定と待ち方は src/lib/orphanTabAutoReload.js(純関数)。ここは window / document / sessionStorage をつなぐだけ。
 */
import {
  startOrphanTabAutoReload,
  isTypingInPage,
  ORPHAN_RELOAD_SESSION_KEY
} from '../lib/orphanTabAutoReload.js';

/**
 * 見回りを始める。sessionStorage に自分で読み込み直した時刻を残す。
 * @param {() => boolean} hasContext
 * @returns {() => void}
 */
export function startOrphanTabAutoReloadInPage(hasContext) {
  return startOrphanTabAutoReload({
    hasContext,
    isTyping: () => isTypingInPage(document),
    reload: () => window.location.reload(),
    readLastReloadAt: () => {
      try {
        return Number(window.sessionStorage.getItem(ORPHAN_RELOAD_SESSION_KEY)) || 0;
      } catch {
        return 0;
      }
    },
    writeLastReloadAt: (at) => {
      try {
        window.sessionStorage.setItem(ORPHAN_RELOAD_SESSION_KEY, String(at));
      } catch {
        /* sessionStorage が使えなくても読み込み直す */
      }
    }
  });
}
