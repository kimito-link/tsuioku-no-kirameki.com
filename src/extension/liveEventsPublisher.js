/**
 * v0.1.1757: status.html?publisher=1 の「スマホへ新着をすぐ届ける係」の配線(chrome.storage・fetch・タイマー)。
 *   判定と順番は src/lib/liveEventSender.js。ここは部品を差し込むだけ。
 *   ★サーバーにキーが無い(realtime:false)・スマホが見ていない間は、期限のキーを置かず何も送らない
 *     =視聴ページも TAIL を書かない(今までと同じ動き)。
 */
import { createLiveEventSender } from '../lib/liveEventSender.js';
import { KEY_LIVE_EVENTS_TAIL, KEY_LIVE_EVENTS_WANTED } from '../lib/liveEvents.js';

const TICK_MS = 1000;
/** 期限のキーを書き直すのは、前に書いた値から30秒以上ずれたときだけ(全画面に配られる書き込みを減らす)。 */
const WANTED_REWRITE_MS = 30_000;

function newSendId() {
  const u8 = new Uint8Array(12);
  crypto.getRandomValues(u8);
  return btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {() => { creds: { mode: string, viewToken: string, headers: Record<string, string> }, ingestUrl: string }|null} getTarget
 */
export function createPcLiveEvents(getTarget) {
  let wantedUntilMs = 0;
  let writtenUntilMs = 0;
  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null;
  const sender = createLiveEventSender({
    newSendId,
    post: async (body) => {
      const t = getTarget();
      if (!t) return { ok: false };
      const payload = t.creds.mode === 'shared' ? { ...body, v: t.creds.viewToken } : body;
      const res = await fetch(`${t.ingestUrl}?action=events`, { method: 'POST', headers: t.creds.headers, body: JSON.stringify(payload) });
      /** @type {any} */
      let j = null;
      try { j = await res.json(); } catch { j = null; }
      return { ok: res.ok, realtime: j?.realtime === true };
    }
  });

  function start() {
    if (timer) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY_LIVE_EVENTS_TAIL]) sender.ingest(changes[KEY_LIVE_EVENTS_TAIL].newValue);
    });
    timer = setInterval(() => { void sender.tick({ enabled: Date.now() < wantedUntilMs, nowMs: Date.now() }); }, TICK_MS);
  }

  /**
   * 状態の送信の返事を受け取るたびに呼ぶ。
   * @param {{ realtime: boolean, viewingUntilMs: number }} ack
   */
  function onAck(ack) {
    const until = ack.realtime ? ack.viewingUntilMs : 0;
    wantedUntilMs = until;
    if (until) start();
    if (Math.abs(until - writtenUntilMs) < WANTED_REWRITE_MS && (until > 0) === (writtenUntilMs > 0)) return;
    writtenUntilMs = until;
    try {
      void chrome.storage.local.set({ [KEY_LIVE_EVENTS_WANTED]: until }).catch(() => {});
    } catch {
      /* 書けなくても状態の送信は続ける */
    }
  }

  return { onAck, stats: () => sender.stats() };
}
