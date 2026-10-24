/**
 * v0.1.1757: PC 側の「スマホへ新着をすぐ届ける係」。status.html?publisher=1 の送信の返事が
 *   realtime:true(サーバーに Ably のキーがある)かつ viewerActive(スマホが見ている)の間だけ動く。
 *   視聴ページが書く小さな TAIL(直近20件)から新しい行だけを拾い、3秒ごとに1回まとめて送る。
 *   送信(post)は差し込み(テストで本物を使わない)。判定は liveEventBatch.js、形は liveEvents.js。
 *
 *   ★最初の1回と配信が変わったときは「今ある行は送らない」(=過去のコメントを一気に流さない)。
 *     配信が変わったときは liveChanged を1件だけ送り、スマホは画面を取り直す。
 *   ★送れなかった回は捨てる(取りこぼしはスマホの約5秒のポーリングが埋める=二重の仕組み)。
 *
 * @module liveEventSender
 */
import { planLiveEventBatch, shouldFlushLiveEvents } from './liveEventBatch.js';
import { liveRowKey, mirrorRowToLiveEvent } from './liveEvents.js';

/** 送った行の目印を覚えておく数(TAIL は20件なので十分)。 */
const SENT_KEYS_MAX = 400;
/** ためておく上限(送れない間に膨らまないように)。 */
const PENDING_MAX = 200;

/**
 * @param {{
 *   post: (body: { liveId: string, sendId: string, events: any[], dropped: number }) => Promise<{ ok: boolean, realtime?: boolean }>,
 *   newSendId: () => string
 * }} deps
 */
export function createLiveEventSender(deps) {
  /** @type {string} */
  let liveId = '';
  /** @type {string[]} */
  let sentOrder = [];
  /** @type {Set<string>} */
  let sent = new Set();
  /** @type {any[]} */
  let pending = [];
  let lastFlushAt = 0;
  let inFlight = false;
  /** サーバーが realtime:false を返したら、次に有効化されるまで送らない。 */
  let serverOff = false;
  const stats = { sends: 0, events: 0, dropped: 0, failed: 0 };

  /** @param {string} k */
  function remember(k) {
    if (sent.has(k)) return;
    sent.add(k);
    sentOrder.push(k);
    if (sentOrder.length > SENT_KEYS_MAX) sent.delete(/** @type {string} */ (sentOrder.shift()));
  }

  function reset() {
    liveId = '';
    sentOrder = [];
    sent = new Set();
    pending = [];
    serverOff = false;
  }

  /**
   * 視聴ページの TAIL を受け取る。
   * @param {{ liveId?: string, rows?: any[] } | null | undefined} tail
   */
  function ingest(tail) {
    const lid = String(tail?.liveId || '').toLowerCase();
    const rows = Array.isArray(tail?.rows) ? tail.rows : [];
    if (!/^lv\d{1,15}$/.test(lid)) return;
    if (lid !== liveId) {
      const wasLive = liveId;
      sentOrder = [];
      sent = new Set();
      pending = wasLive ? [{ type: 'liveChanged', liveId: lid }] : [];
      liveId = lid;
      for (const r of rows) remember(liveRowKey(r));
      return;
    }
    for (const r of rows) {
      const k = liveRowKey(r);
      if (sent.has(k)) continue;
      remember(k);
      const ev = mirrorRowToLiveEvent(r);
      if (ev) pending.push(ev);
    }
    if (pending.length > PENDING_MAX) {
      stats.dropped += pending.length - PENDING_MAX;
      pending = pending.slice(-PENDING_MAX);
    }
  }

  /**
   * 1秒ごとに呼ぶ。enabled=false の間はためたものを捨て、次に有効になったら今ある行から数え直す。
   * @param {{ enabled: boolean, nowMs: number }} a
   */
  async function tick(a) {
    if (!a.enabled) {
      if (liveId || pending.length) reset();
      return;
    }
    if (serverOff || inFlight) return;
    if (!shouldFlushLiveEvents({ pendingCount: pending.length, lastFlushAt, nowMs: a.nowMs })) return;
    const plan = planLiveEventBatch({ pending });
    pending = plan.carry;
    lastFlushAt = a.nowMs;
    if (!plan.send.length) return;
    inFlight = true;
    try {
      const r = await deps.post({ liveId, sendId: deps.newSendId(), events: plan.send, dropped: plan.dropped });
      if (r && r.ok) {
        stats.sends += 1;
        stats.events += plan.send.length;
        stats.dropped += plan.dropped;
        if (r.realtime === false) serverOff = true;
      } else stats.failed += 1;
    } catch {
      stats.failed += 1;
    } finally {
      inFlight = false;
    }
  }

  return {
    ingest,
    tick,
    /** 状態速報に載せる数(診断用)。 */
    stats: () => ({ ...stats, pending: pending.length, liveId })
  };
}
