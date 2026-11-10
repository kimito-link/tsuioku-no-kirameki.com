/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】配信サイトの読み取り(fetch)に付ける「時間切れ」の合図を作る
 * 【書けるstorageキー】なし
 *
 * ★v0.1.1963: Kick・Twitch・SHOWROOM・ミクチャ・TikTok の入口は、配信の情報(同時接続など)を
 *   1回ずつ読みに行き、読み終わるまで次を始めない(checking フラグ)。fetch には時間切れが無いので、
 *   返事が返らないまま止まると、それ以降ずっと配信の情報を読み直さなくなる。
 *   (2026-11-09 りんく報告: Kick で推定同時接続などの数字が止まる。原因の一つの候補として塞ぐ)
 *   時間切れの合図を付けて、返らないときは失敗として扱い、次の見回りで読み直せるようにする。
 */

export const PLATFORM_FETCH_TIMEOUT_MS = 15_000;

/**
 * fetch の signal に渡す時間切れの合図(使えない環境では undefined=従来どおり)。
 * @param {number} [ms]
 * @param {{ timeout?: (ms: number) => AbortSignal } | null | undefined} [abortSignalCtor]
 * @returns {AbortSignal | undefined}
 */
export function platformFetchTimeoutSignal(ms = PLATFORM_FETCH_TIMEOUT_MS, abortSignalCtor = globalThis.AbortSignal) {
  try {
    if (abortSignalCtor && typeof abortSignalCtor.timeout === 'function') return abortSignalCtor.timeout(ms);
  } catch {
    /* 古い環境 */
  }
  return undefined;
}
