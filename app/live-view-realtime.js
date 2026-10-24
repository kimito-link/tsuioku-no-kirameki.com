/**
 * v0.1.1758: スマホの WEB版で、PC が3秒ごとに送る新着コメントを Ably の SSE で受け取る。
 *
 * ■ 流れ
 *   /api/status?action=realtime&v= で「このチャンネルの購読だけ」の許可(1時間)と接続先をもらい、EventSource でつなぐ。
 *   届いたまとめは onRows(liveId, 鏡の行) で画面へ渡す。配信が変わった知らせは onLiveChanged で画面を取り直す。
 * ■ 二重の仕組み
 *   約5秒のポーリングはそのまま残す。サーバーにキーが無い(realtime:false)・つながらない・切れたときは
 *   何もせず(ポーリングだけで今までどおり)、間をあけてつなぎ直す。
 * ■ 費用
 *   画面が裏にある間は切る(Ably は届けた件数も数える)。表に戻ったらつなぎ直す。
 *
 * @module live-view-realtime
 */
import { liveEventToMirrorRow, parseLiveEventsMessage } from '../src/lib/liveEvents.js';

/** つながらなかったときの待ち(ms)。失敗が続くほど延ばす。 */
const RETRY_MS = [15_000, 60_000, 5 * 60_000];
/** サーバーにキーが無いとき、次に確かめるまでの間(ms)。後からキーを入れても拾えるように。 */
const DISABLED_RECHECK_MS = 10 * 60_000;
/** 許可が切れる少し前につなぎ直す(ms)。 */
const RENEW_BEFORE_MS = 60_000;

/**
 * @param {{
 *   token: string,
 *   onRows: (liveId: string, rows: any[]) => void,
 *   onLiveChanged: (liveId: string) => void,
 *   fetchImpl?: typeof fetch,
 *   EventSourceImpl?: any,
 *   setTimeoutImpl?: typeof setTimeout,
 *   clearTimeoutImpl?: typeof clearTimeout,
 *   now?: () => number,
 *   isHidden?: () => boolean
 * }} a
 */
export function createPhoneRealtime(a) {
  const fetchImpl = a.fetchImpl || ((u, i) => fetch(u, i));
  const ES = a.EventSourceImpl || globalThis.EventSource;
  const later = a.setTimeoutImpl || setTimeout;
  const cancel = a.clearTimeoutImpl || clearTimeout;
  const now = a.now || (() => Date.now());
  const isHidden = a.isHidden || (() => typeof document !== 'undefined' && document.hidden);
  /** @type {any} */
  let es = null;
  /** @type {any} */
  let timer = null;
  let fails = 0;
  let connecting = false;
  const stats = { state: 'idle', messages: 0, events: 0, errors: 0 };

  function close() {
    if (es) {
      try { es.close(); } catch { /* 閉じられなくても次へ */ }
      es = null;
    }
  }
  /** 次の時刻につなぎ直す(許可の取り直しも同じ=今の接続を切ってから)。 @param {number} ms */
  function schedule(ms) {
    if (timer) cancel(timer);
    timer = later(() => { timer = null; close(); void connect(); }, ms);
  }
  function fail() {
    close();
    stats.errors += 1;
    stats.state = 'retry';
    schedule(RETRY_MS[Math.min(fails, RETRY_MS.length - 1)]);
    fails += 1;
  }

  /** @param {any} ev */
  function onMessage(ev) {
    const m = parseLiveEventsMessage(ev && ev.data);
    if (!m) return;
    stats.messages += 1;
    fails = 0;
    const rows = [];
    for (const e of m.events) {
      if (e.type === 'liveChanged') {
        try { a.onLiveChanged(String(e.liveId || m.liveId)); } catch { /* 画面の都合で止めない */ }
        continue;
      }
      const r = liveEventToMirrorRow(e);
      if (r) rows.push(r);
    }
    stats.events += rows.length;
    if (rows.length) {
      try { a.onRows(m.liveId, rows); } catch { /* 画面の都合で止めない */ }
    }
  }

  async function connect() {
    if (connecting || es || !ES || isHidden()) return;
    connecting = true;
    try {
      const res = await fetchImpl(`/api/status?action=realtime&v=${encodeURIComponent(a.token)}`, { cache: 'no-store' });
      /** @type {any} */
      let j = null;
      try { j = await res.json(); } catch { j = null; }
      if (!res.ok) { fail(); return; }
      if (!j || j.realtime !== true || typeof j.sseUrl !== 'string' || !/^https:\/\//.test(j.sseUrl)) {
        stats.state = 'off';
        schedule(DISABLED_RECHECK_MS);
        return;
      }
      if (isHidden()) return;
      es = new ES(j.sseUrl);
      stats.state = 'open';
      es.addEventListener('message', onMessage);
      // Ably は許可切れ等を 'error' の知らせで送る。接続の失敗も同じ口に来る。どちらも切ってつなぎ直す。
      es.addEventListener('error', () => fail());
      const expires = Number(j.expires) || 0;
      if (expires) schedule(Math.max(30_000, expires - now() - RENEW_BEFORE_MS));
    } catch {
      fail();
    } finally {
      connecting = false;
    }
  }

  return {
    start() {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (isHidden()) {
            close();
            if (timer) { cancel(timer); timer = null; }
            stats.state = 'hidden';
          } else void connect();
        });
      }
      void connect();
    },
    stats: () => ({ ...stats })
  };
}
