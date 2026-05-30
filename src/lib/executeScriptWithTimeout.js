/**
 * v0.1.441: `chrome.scripting.executeScript` を timeout 付きで実行する純関数ラッパ。
 *
 * 背景（実機 chrome://extensions エラー画面で確定した真因）:
 *   `chrome.scripting.executeScript` は Chrome API に timeout パラメータを持たない。
 *   多タブ stall・タブ suspension・content-script 注入競合等で **永久 pending** になり得る。
 *   これが `listWatchFramesWithInnerText` を経由して `requestInterceptCacheFromOpenTab` の
 *   background async タスクを永久停止させ、v0.1.437 の `refreshTaskGuarded(12s)` が
 *   `refresh_intercept_export_timeout` を発火させる本丸の真因。上位は best-effort で
 *   次に進めるが、executeScript 自身は宙に浮いたリソースとしてメモリに残り、次の refresh
 *   でも同じ事象が再発する（リソースリーク）。
 *
 * 設計:
 *   - 既存の `refreshTaskGuard` と同パターン（Promise.race + clearTimeout + 診断面記録）。
 *   - **executor を関数で受ける**（`Promise<T>` ではなく `() => Promise<T>`）ことで、
 *     テスト時の呼出回数検証や mock 差替えが容易。これが `refreshTaskGuard` との設計差。
 *   - fallback は呼出側が決める（reject せず値返し=既存 `catch { return []; }` 経路と互換）。
 *   - 通常パスでは何も実行されない（timeout 発火時のみ console.debug + 診断面更新）。
 *
 * @template T
 * @param {() => Promise<T>} executor 実行する非同期関数（例: () => chrome.scripting.executeScript({...})）。
 * @param {number} ms タイムアウト ms。
 * @param {string} taskCode 診断面に残す識別文字列（例: 'list_watch_frames_executescript_timeout'）。
 * @param {T} fallback タイムアウト/失敗時の戻り値。
 * @returns {Promise<T>} 解決値（成功）または fallback（失敗・タイムアウト）。
 */
export async function executeScriptWithTimeout(executor, ms, taskCode, fallback) {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  try {
    /** @type {Promise<T>} */
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(taskCode)), ms);
    });
    const v = await Promise.race([executor(), timeout]);
    return v;
  } catch (e) {
    // タイムアウト発火（message===taskCode）なら診断面に残す。
    // 元の Promise が別理由で reject した場合は静かに fallback を返す。
    const msg = e && typeof e === 'object' && 'message' in e
      ? String(/** @type {Error} */ (e).message || '')
      : '';
    if (msg === taskCode) {
      try {
        if (typeof globalThis !== 'undefined' && globalThis) {
          /** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask = taskCode;
        }
      } catch {
        /* no-op */
      }
      try {
        // console.debug にする（console.warn だと chrome://extensions のエラー欄に
        // 赤く並んで「壊れた」と誤認させるため）。診断は __nlsLastTimedOutTask に残る。
        if (typeof console !== 'undefined' && console && typeof console.debug === 'function') {
          console.debug(`[nl-refresh-timeout] ${taskCode}`);
        }
      } catch {
        /* no-op */
      }
    }
    return fallback;
  } finally {
    if (timer != null) {
      try {
        clearTimeout(timer);
      } catch {
        /* no-op */
      }
    }
  }
}
