/**
 * v0.1.502: 単発の非同期処理（主に chrome.storage.local の get/set/remove）を
 *   Promise.race で有界化する純関数。
 *
 * 背景: 同一オリジンの複数 watch タブは Chrome が同一レンダラープロセス＝同一メイン
 *   スレッドにまとめる。裏タブが巨大コメント配列を read-merge-write すると、共有
 *   chrome.storage.local（単一 LevelDB）が stall し、書き込みの await が settle せず
 *   永久 pending になり得る。これが persistCommentRowsChain / persistThrottle の flushMutex
 *   といった「直列チェーン」を永久ブロックし、記録が「最終取り込み ◯秒前」のまま
 *   止まる退行を生む。読み取り側（readStorageBagWithRetryMeta）は既に Promise.race で
 *   有界化済みだが、書き込み側が同じ保護を欠いていた非対称が原因。
 *
 *   timeoutMs を超えたら sentinel で reject する。呼び出し側は sentinel を捕捉して
 *   「未永続 rows の再エンキュー」「best-effort 処理の破棄」等で回復し、チェーンを解放する。
 */

/** 既定の timeout sentinel（reject 値）。 */
export const STORAGE_OP_TIMED_OUT = Symbol('storage_op_timeout');

/**
 * @template T
 * @param {() => Promise<T>} opFn 実行する非同期処理（呼ぶたびに新しい Promise を返すこと）
 * @param {number} timeoutMs 有界化する上限ミリ秒。0 以下 / 非有限なら無制限（opFn をそのまま await）
 * @param {symbol} [sentinel] timeout 時に reject する値（既定 STORAGE_OP_TIMED_OUT）
 * @returns {Promise<T>}
 */
export async function runStorageOpWithTimeout(
  opFn,
  timeoutMs,
  sentinel = STORAGE_OP_TIMED_OUT
) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    return opFn();
  }
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  try {
    const result = await Promise.race([
      opFn(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(sentinel), ms);
      })
    ]);
    return /** @type {T} */ (result);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
