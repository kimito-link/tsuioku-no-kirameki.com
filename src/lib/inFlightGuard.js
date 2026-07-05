// inFlightGuard.js
// 状態速報「重さ根治 P3」: runStorageOpWithTimeout(storageOpTimeout.js)は Promise.race で
//   タイムアウトを有界化するが、タイムアウト後も opFn(実 IDB/chrome.storage 操作)自体は
//   裏で生き続ける。次 tick が同じ opFn を再発行すると、前回の「幽霊 read」と多重に競合し、
//   混雑をさらに悪化させる(readHeavyFromStore の heavyReadActive と同じ構造の問題)。
//
// popup-entry.js の heavyReadActive(v0.1.1037)は「実呼びする時だけ true を立て、次 poll が
//   それを見て短絡する」in-flight ガードの前例。本モジュールはそれを汎用の純関数として切り出し、
//   status-entry.js の loadCustomSoundDiagSafe(IndexedDB open+count+fetch を伴う唯一の重い
//   extras 処理・P1 で count() 化済みだが依然重い)に適用する。
//
// 設計:
//   - createInFlightGuard(opFn, { ceilingMs, now }) は { run(fallback), isInFlight() } を返す。
//   - run(fallback) 呼び出し時、前回発行した opFn() がまだ未解決なら【新規発行せず】fallback を返す。
//   - ただし前回発行から ceilingMs を超えていたら「固着」とみなし、無条件で再発行を許可する
//     (opFn 自体が永久に pending のまま壊れているケースの保険。ceilingMs 自体は解放をトリガーする
//     だけで、古い Promise を破棄するわけではない=多重 await にはなるが「読み取りを増やさない」
//     という本ガードの目的は達成される)。
//   - now は呼び出し側から注入できる(テスト容易化。既定 Date.now)。

/**
 * @template T
 * @param {() => Promise<T>} opFn 実行する非同期処理(呼ぶたびに新しい Promise を返すこと)
 * @param {{ ceilingMs?: number, now?: () => number }} [options]
 * @returns {{ run: (fallback: T) => Promise<T>, isInFlight: () => boolean }}
 */
export function createInFlightGuard(opFn, options = {}) {
  const ceilingMs = Number.isFinite(options.ceilingMs) ? Number(options.ceilingMs) : 15000;
  const now = typeof options.now === 'function' ? options.now : Date.now;

  let inFlight = false;
  let startedAt = 0;

  const isInFlight = () => inFlight;

  /**
   * @param {T} fallback in-flight 中に返す既定値(直近キャッシュ等を呼び出し側が用意する)
   * @returns {Promise<T>}
   */
  const run = async (fallback) => {
    if (inFlight) {
      const elapsed = now() - startedAt;
      if (elapsed < ceilingMs) {
        // 前回発行分がまだ解決していない= 新規発行せず fallback を返す(幽霊 read の多重化を防ぐ)。
        return fallback;
      }
      // ceilingMs 超過=固着とみなし、再発行を許可する(前回分の解決は妨げない)。
    }
    inFlight = true;
    startedAt = now();
    try {
      const result = await opFn();
      return result;
    } finally {
      inFlight = false;
    }
  };

  return { run, isInFlight };
}
