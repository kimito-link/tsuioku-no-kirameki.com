/**
 * コメビュ側: 読み上げ中だけ watch タブへ port を開き、新着コメントを storage を待たずに受け取る(P5b・2026-10-29)。
 *
 * - 繋がらない・切れた(タブの再読込・別配信へ移動)ときは少し待って繋ぎ直す。繋がらなくても
 *   読み上げは今までどおり storage 経由で動く(この経路は早く読むための近道だけ)。
 * - 判定(タブの選び方・メッセージの検証)は src/lib/comeviewLivePush.js。
 */
import {
  COMEVIEW_LIVE_PORT_NAME,
  parseComeviewLiveMessage,
  pickWatchTabIdForLive
} from '../lib/comeviewLivePush.js';

/** 繋がらないとき・切れたときに繋ぎ直すまでの待ち(ms)。 */
export const COMEVIEW_LIVE_RECONNECT_MS = 5000;

const WATCH_TAB_URLS = ['https://live.nicovideo.jp/watch/*', 'https://live2.nicovideo.jp/watch/*'];

/**
 * @param {{
 *   isActive: () => boolean,
 *   getLiveId: () => string,
 *   onRows: (liveId: string, rows: Record<string, unknown>[]) => void
 * }} deps
 */
export function createComeviewLivePushClient(deps) {
  /** @type {chrome.runtime.Port | null} */
  let port = null;
  let portLiveId = '';
  /** @type {ReturnType<typeof setTimeout> | null} */
  let retryTimer = null;
  let connecting = false;

  function scheduleRetry() {
    if (retryTimer || !deps.isActive()) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void ensure();
    }, COMEVIEW_LIVE_RECONNECT_MS);
  }

  function close() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    const p = port;
    port = null;
    portLiveId = '';
    try { p?.disconnect(); } catch { /* no-op */ }
  }

  /** 読み上げ ON・配信が決まっていれば繋ぐ。もう同じ配信に繋がっていれば何もしない。 */
  async function ensure() {
    const liveId = String(deps.getLiveId() || '');
    if (!deps.isActive() || !liveId) { close(); return; }
    if (port && portLiveId === liveId) return;
    if (connecting) return;
    if (port) close();
    connecting = true;
    try {
      const tabs = await chrome.tabs.query({ url: WATCH_TAB_URLS });
      const tabId = pickWatchTabIdForLive(tabs, liveId);
      if (tabId == null || !deps.isActive() || deps.getLiveId() !== liveId) { scheduleRetry(); return; }
      const p = chrome.tabs.connect(tabId, { name: COMEVIEW_LIVE_PORT_NAME });
      port = p;
      portLiveId = liveId;
      p.onMessage.addListener((msg) => {
        const parsed = parseComeviewLiveMessage(msg);
        if (!parsed || parsed.liveId !== deps.getLiveId()) return;
        try { deps.onRows(parsed.liveId, parsed.rows); } catch { /* no-op: storage 経由が後で届く */ }
      });
      p.onDisconnect.addListener(() => {
        void chrome.runtime.lastError; // 受け手がまだ居ない(新着が来る前)ときの警告を読み捨てる
        if (port === p) { port = null; portLiveId = ''; }
        scheduleRetry();
      });
    } catch {
      scheduleRetry();
    } finally {
      connecting = false;
    }
  }

  return { ensure, close };
}
