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

/**
 * 2026-07-14 診断ページ608秒固まり根治: runStorageOpWithTimeout は timeout しても opFn 自体を
 *   止められず(chrome.storage に abort API が無い)、しかも負けた側の promise を呼び出し側が
 *   観測できない=幽霊 read の settle を誰も収穫できなかった。本関数は race(有界化された結果)と
 *   op(生の opFn promise)を両方返し、「timeout で見切る」と「遅延 settle を後から収穫する」を両立する。
 * @template T
 * @param {() => Promise<T>} opFn
 * @param {number} timeoutMs 0以下/非有限なら無制限(race===op)
 * @param {symbol} [sentinel]
 * @returns {{ race: Promise<T>, op: Promise<T> }}
 */
export function startStorageOpWithTimeout(opFn, timeoutMs, sentinel = STORAGE_OP_TIMED_OUT) {
  const op = Promise.resolve().then(() => opFn());
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return { race: op, op };
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  const race = Promise.race([
    op,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(sentinel), ms);
    })
  ]).finally(() => {
    if (timer != null) clearTimeout(timer);
  });
  return { race, op };
}
