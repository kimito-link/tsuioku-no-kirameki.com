/**
 * PR1-b/PR2（feat/multitab-scale-ultraC）: 同一 origin の複数タブのうち「1タブだけ」が
 * 共有できる重い仕事（外部API fetch・backfill・DOM scrape）をやるためのリーダー機構。
 *
 * 設計（[[reference_multitab_scale_ultraC_leader_election]]）:
 *   Web Locks API（navigator.locks）を使う。全タブが同じ名前のロックを ifAvailable で
 *   保持しようとし、取れた1タブだけが「リーダー」。リーダーのタブが閉じる/クラッシュすると
 *   Chrome がロックを自動解放し、別タブが次に取れる（ハートビート不要・stale leader バグなし）。
 *
 *   ⭐fail-open 原則: navigator.locks が無い環境（古い Chrome 等）や例外時は「自分はリーダー」
 *   として扱う（= 従来の per-tab 動作にフォールバック）。これにより、リーダー機構が壊れても
 *   「誰も仕事をしない」谷を作らない（パネル/記録が止まらない）。
 *
 *   content script は page origin を共有するので navigator.locks でタブ間調整できる。
 *   ⚠️ content↔SW 間は origin が違うので Web Locks では橋渡しできない（タブ間専用）。
 *
 * @module tabLeaderLock
 */

/**
 * Web Locks が使えるか（テスト/古い環境で false）。
 * @param {{ locks?: { request?: unknown } }} [nav]
 * @returns {boolean}
 */
export function isWebLocksAvailable(nav) {
  const n =
    nav ||
    (typeof navigator !== 'undefined' ? /** @type {any} */ (navigator) : null);
  return !!(n && n.locks && typeof n.locks.request === 'function');
}

/**
 * 指定名のロックを「いま」取れるなら取って fn を実行する（ifAvailable）。取れなければ
 * fn を実行しない（このタブはフォロワー）。fn の実行中だけロックを保持し、戻ったら解放する。
 *
 * - fn が同期/非同期どちらでも待つ。
 * - Web Locks 不可/例外時は fail-open: fn を必ず実行する（従来動作）。
 *
 * @param {string} name ロック名（例: 'nls-extfetch-' + liveId）
 * @param {() => void | Promise<void>} fn リーダーだけが実行する処理
 * @param {{ navigatorOverride?: any }} [opts] テスト用に navigator を差し替え
 * @returns {Promise<{ ran: boolean }>} ran=true ならこのタブがリーダーとして実行した
 */
export async function runIfTabLeader(name, fn, opts = {}) {
  const lockName = String(name || '').trim();
  const nav =
    opts.navigatorOverride ||
    (typeof navigator !== 'undefined' ? /** @type {any} */ (navigator) : null);

  if (!lockName || typeof fn !== 'function') return { ran: false };

  // fail-open: Web Locks 非対応なら従来どおり実行（全タブ実行＝現状維持）。
  if (!isWebLocksAvailable(nav)) {
    await fn();
    return { ran: true };
  }

  let ran = false;
  try {
    await nav.locks.request(
      lockName,
      { ifAvailable: true },
      /** @param {unknown} lock */ async (lock) => {
        // lock=null は「いま取れなかった」＝別タブがリーダー。何もしない（フォロワー）。
        if (!lock) return;
        ran = true;
        await fn();
      }
    );
  } catch {
    // 例外（権限/未対応の実装差等）も fail-open: 実行しておく（取りこぼし防止）。
    if (!ran) {
      try {
        await fn();
        ran = true;
      } catch {
        /* fn 自体の失敗は呼び出し側責務 */
      }
    }
  }
  return { ran };
}
