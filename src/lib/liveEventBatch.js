/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】スマホのリアルタイム化(イベント配信)で「3秒分をまとめて1回送る」ときの、送る・回す・落とすの判定
 * 【この箱に入らないもの】送信(fetch)・タイマー・Ably への publish(送信担当とサーバーが持つ)
 *
 * ★なぜ(v0.1.1756・設計書 /mnt/project-files/smartphone/design-3-realtime.md 6章):
 *   1件ごとに送るとサーバーの呼び出しと Redis の書き込みが増え、1人あたりの費用が月500円の手取りを上回る。
 *   変化があるときだけ3秒ごとに1回まとめて送り、1回を Ably の課金単位(5KiB)以下・最大50件に収める。
 *   - ギフト・広告は演出の主役なので落とさない。入りきらない分は次の回へ回す(遅らせるだけ)。
 *   - コメントは新しいものを優先し、入りきらない古いコメントは落として、その件数を `dropped` で正直に載せる。
 * @module liveEventBatch
 */

/** まとめて送る間隔(ms)。 */
export const LIVE_EVENT_FLUSH_MS = 3000;
/** 1回に送る最大件数。 */
export const LIVE_EVENT_MAX_ITEMS = 50;
/** 1回の大きさの上限(バイト)。Ably は 5KiB ごとに1件として数える。 */
export const LIVE_EVENT_MAX_BYTES = 5 * 1024;

const KEEP_TYPES = new Set(['gift', 'ad', 'liveChanged']);

/** @param {unknown} v @returns {number} UTF-8 のバイト数 */
function byteLength(v) {
  const s = JSON.stringify(v) ?? '';
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/**
 * 今まとめて送ってよいか。ためているものが無ければ送らない(費用)。
 * @param {{ pendingCount: number, lastFlushAt: number, nowMs: number, intervalMs?: number }} a
 * @returns {boolean}
 */
export function shouldFlushLiveEvents(a) {
  const pending = Number(a?.pendingCount) || 0;
  if (pending <= 0) return false;
  const interval = Number(a?.intervalMs) > 0 ? Number(a.intervalMs) : LIVE_EVENT_FLUSH_MS;
  const last = Number(a?.lastFlushAt) || 0;
  return Number(a?.nowMs) - last >= interval;
}

/**
 * ためたイベントから、今回送る分・次へ回す分・落とした件数を決める。並びは元の順(古い→新しい)を保つ。
 * @param {{ pending: Array<{ type?: string }>, maxItems?: number, maxBytes?: number }} a
 * @returns {{ send: any[], carry: any[], dropped: number }}
 */
export function planLiveEventBatch(a) {
  const pending = Array.isArray(a?.pending) ? a.pending.filter((e) => e && typeof e === 'object') : [];
  const maxItems = Number(a?.maxItems) > 0 ? Number(a.maxItems) : LIVE_EVENT_MAX_ITEMS;
  const maxBytes = Number(a?.maxBytes) > 0 ? Number(a.maxBytes) : LIVE_EVENT_MAX_BYTES;
  /** 送ると決めた添え字 */
  const chosen = new Set();
  let count = 0;
  let bytes = 2; // 配列の [] の分
  const fits = (/** @type {unknown} */ e) => count + 1 <= maxItems && bytes + byteLength(e) + 1 <= maxBytes;
  const take = (/** @type {number} */ i) => { chosen.add(i); count += 1; bytes += byteLength(pending[i]) + 1; };
  // 1) 落とさない種類(ギフト・広告・配信切り替え)を古い順に。入りきらない分は次へ回す。
  /** @type {any[]} */
  const carry = [];
  pending.forEach((e, i) => {
    if (!KEEP_TYPES.has(String(e.type))) return;
    if (fits(e)) take(i);
    else carry.push(e);
  });
  // 2) コメントなどは新しい順に詰め、入りきらない古いものは落とす。
  let dropped = 0;
  for (let i = pending.length - 1; i >= 0; i--) {
    const e = pending[i];
    if (KEEP_TYPES.has(String(e.type))) continue;
    if (fits(e)) take(i);
    else dropped += 1;
  }
  const send = pending.filter((_, i) => chosen.has(i));
  return { send, carry, dropped };
}
