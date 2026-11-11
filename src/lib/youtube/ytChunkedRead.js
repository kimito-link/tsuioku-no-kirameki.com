/**
 * 配信の記録を「少しずつ」読む(v0.1.1977)。
 *
 * ★経緯(PC 実測 0.1.1976・Kick 8万1千行・CPU を4倍遅くした条件): 横の欄は開いた直後に記録を IndexedDB の
 *   getAll 1回で全部取り出していた。取り出した行の復元はブラウザの中で一気に走るので、その間(約48秒)は
 *   画面が一切返事をしなかった(70秒のうち52.7秒が JS の外)。
 *   → 記録時刻(recordedAt)の順に少しずつ取り出し、合間に一度手を放す。読む行と順番は今までと同じ。
 *     ★v0.1.2050: 1回を 5,000行のままだと、CPU を6倍遅くした条件で 1回の取り出しが約1秒画面を止めた
 *     (8,000行を2回に分けても各回が1秒)。1回を 200行にして、その止まりを 100ms より短くする。
 *
 * 同じ記録時刻の行が区切りをまたぐことがあるので、次の回は「最後の記録時刻から(その時刻を含む)」読み、
 * すでに受け取った行(pk)を捨てる。1回分がまるごと同じ時刻で進めないときは、残りを1回で読む(取りこぼさない)。
 */

/** 1回に取り出す行数。6倍遅くした条件で 5,000行が約1秒だったので、200行(その約1/25)にする。 */
export const YT_READ_CHUNK_ROWS = 200;

/**
 * @param {{
 *   readChunk: (lowerRecordedAt: number, count: number | undefined) => Promise<any[]>,
 *   chunk?: number,
 *   startAt?: number,
 *   pause?: () => Promise<void>
 * }} deps readChunk は recordedAt >= lower の行を recordedAt の昇順で最大 count 行返す(count 省略=残り全部)
 * @returns {Promise<any[]>}
 */
export async function readYtRowsInChunks(deps) {
  const chunk = Math.max(1, Math.floor(Number(deps.chunk) || YT_READ_CHUNK_ROWS));
  const pause = deps.pause || (() => new Promise((r) => setTimeout(r, 0)));
  /** @type {any[]} */
  const out = [];
  const startAt = Number(deps.startAt);
  let lower = Number.isFinite(startAt) && startAt > 0 ? startAt : 0;
  /** @type {Set<string>} 最後の記録時刻に並ぶ、受け取り済みの行 */
  let edgePks = new Set();
  for (;;) {
    const rows = await deps.readChunk(lower, chunk);
    const list = Array.isArray(rows) ? rows : [];
    const fresh = edgePks.size ? list.filter((r) => !edgePks.has(String(r?.pk ?? ''))) : list;
    if (list.length < chunk) {
      for (const r of fresh) out.push(r);
      return out;
    }
    const lastAt = Number(list[list.length - 1]?.recordedAt);
    if (!fresh.length || !Number.isFinite(lastAt)) {
      // 進めない(1回分がまるごと同じ時刻): 残りを1回で読む
      const rest = await deps.readChunk(lower, undefined);
      for (const r of Array.isArray(rest) ? rest : []) {
        if (!edgePks.has(String(r?.pk ?? ''))) out.push(r);
      }
      return out;
    }
    for (const r of fresh) out.push(r);
    if (lastAt === lower) {
      for (const r of fresh) edgePks.add(String(r?.pk ?? ''));
    } else {
      edgePks = new Set();
      for (let i = list.length - 1; i >= 0 && Number(list[i]?.recordedAt) === lastAt; i -= 1) edgePks.add(String(list[i]?.pk ?? ''));
      lower = lastAt;
    }
    await pause();
  }
}
