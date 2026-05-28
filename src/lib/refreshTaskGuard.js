/**
 * v0.1.437: popup の `refresh()` で chrome API が永久 pending になっても全カード「—」固定にしない
 *   ための薄いガード。
 *
 * 背景（実機 v0.1.434/435 で再発の真因）:
 *   v0.1.337 (chrome.storage.local.get) と v0.1.398 (tabs/scripting/sendMessage) で多タブ
 *   stall を `withTimeout` 有界化したが、refresh() 内には **まだ裸 await が残っていた**
 *   （storage.local.set / requestInterceptCacheFromOpenTab / sendMessageToWatchTabs 等）。
 *   これらが永久 pending になると refresh() の続きに進めず、上段カードが全部「—」のまま
 *   固定される（コメント取り込みは別パスなので進行する＝実機の指紋と一致）。
 *
 * 設計:
 *   - 単機能の薄いラッパ。`withTimeout(promise, ms, taskCode).catch(() => fallback)` 等価。
 *   - 違いは「タイムアウトしたタスク名」を診断面（console.warn + window.__nlsLastTimedOutTask）に
 *     残すこと。次の実機検証で「何が止まったか」をユーザーから引き出せる。
 *   - **描画パスには触らない**（v0.1.422 でパネル消失リグレッションを起こした教訓）。
 *     描画は呼び出し側の責務。本関数は値の解決/フォールバックだけを返す。
 *   - 拒否されたら（タイムアウト or 元の reject）fallback を返して呑む。refresh は best-effort
 *     で次に進めるのが正しい挙動。
 *
 * @template T
 * @param {Promise<T>} promise 監視対象の Promise（呼出側で生成して渡す）。
 * @param {number} ms タイムアウトまでのミリ秒。
 * @param {string} taskCode タイムアウト時の識別文字列（例: 'refresh_storage_set_timeout'）。
 *   診断用に warn と window グローバルに残す。配信解析の手掛かりになるよう一意な名前を。
 * @param {T} fallback タイムアウト/失敗時に返す値。
 * @returns {Promise<T>} 解決値（成功）または fallback（失敗・タイムアウト）。
 */
export async function refreshTaskGuarded(promise, ms, taskCode, fallback) {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  try {
    /** @type {Promise<T>} */
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(taskCode)), ms);
    });
    const v = await Promise.race([promise, timeout]);
    return v;
  } catch (e) {
    // タイムアウト発火（message===taskCode）なら診断面に残す。
    // 元の promise が別理由で reject した場合は静かに fallback を返す（refresh 続行優先）。
    const msg = e && typeof e === 'object' && 'message' in e ? String(/** @type {Error} */ (e).message || '') : '';
    if (msg === taskCode) {
      try {
        if (typeof globalThis !== 'undefined' && globalThis) {
          /** @type {{ __nlsLastTimedOutTask?: string }} */ (globalThis).__nlsLastTimedOutTask = taskCode;
        }
      } catch {
        /* no-op (test/Node 環境で window 無し等) */
      }
      try {
        if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
          console.warn(`[nl-refresh-timeout] ${taskCode}`);
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
