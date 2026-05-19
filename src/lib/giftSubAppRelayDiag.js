/**
 * v0.1.226: ギフトサイドバー cross-origin iframe relay 経路の生存確認用 純関数。
 *
 * 背景: 公式の貢献度ランキング・イベント累計・ギフト履歴は cross-origin iframe
 * (audition / koken / nicoad) 内にあり、親 frame からは contentDocument にアクセス
 * できない（JS sandbox 仕様）。設計では iframe 内 content script が DOM scrape →
 * window.top.postMessage(NLS_GIFT_HISTORY_FROM_IFRAME) で親に送信、親が storage 保存
 * する relay 経路（v0.1.216-218）になっているが、実機で機能している証拠がない。
 *
 * 本 lib は relay 経路の各 step counter を snapshot 化して、AI 共有診断 JSON と
 * popup「詳しい状況」に出すためのもの。挙動変更ゼロ、観測専用。
 *
 * 副作用なし。
 */

/**
 * @typedef {{
 *   count: number,
 *   lastAt: number,
 *   lastScrapeAttempts: number,
 *   lastItemsCount: number,
 *   lastContribCount: number,
 *   lastEventBannerPresent: boolean,
 *   lastDomShape?: Record<string, unknown>|null,
 *   lastKokenContribShape?: Record<string, unknown>|null
 * }} GiftSubAppRelayHeartbeatEntryRaw
 */

/**
 * @typedef {{
 *   iframeRelayMessagesReceivedTotal: number,
 *   iframeRelayMessagesByFrameUrl: Record<string, number>,
 *   iframeRelayLastReceivedAt: number,
 *   iframeRelayHeartbeatsByFrameUrl?: Record<string, GiftSubAppRelayHeartbeatEntryRaw>,
 *   scanCrossOriginThrows: number,
 *   scanSameOriginAccess: number
 * }} GiftSubAppRelayDiagState
 */

/**
 * v0.1.227: heartbeat snapshot 1 件分。frame 別の生存状況を popup / 診断 JSON に出す。
 * @typedef {{
 *   count: number,
 *   lastAgoMs: number|null,
 *   lastScrapeAttempts: number,
 *   lastItemsCount: number,
 *   lastContribCount: number,
 *   lastEventBannerPresent: boolean,
 *   lastDomShape?: Record<string, unknown>|null,
 *   lastKokenContribShape?: Record<string, unknown>|null
 * }} GiftSubAppRelayHeartbeatEntry
 */

/**
 * @typedef {{
 *   messagesReceivedTotal: number,
 *   messagesByFrameUrl: Record<string, number>,
 *   lastReceivedAgoMs: number|null,
 *   heartbeatsByFrameUrl: Record<string, GiftSubAppRelayHeartbeatEntry>,
 *   heartbeatFrameCount: number,
 *   crossOriginThrows: number,
 *   sameOriginAccess: number,
 *   hasReceivedAny: boolean,
 *   hasHeartbeatAny: boolean
 * }} GiftSubAppRelayDiagSnapshot
 */

/**
 * relay 経路の生存状態を AI 共有診断 JSON 用 snapshot に変換する。
 * @param {GiftSubAppRelayDiagState|null|undefined} state
 * @param {number} [nowMs]  Date.now() の override（テスト用）
 * @returns {GiftSubAppRelayDiagSnapshot}
 */
export function snapshotIframeRelayDiag(state, nowMs) {
  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
  /** @type {GiftSubAppRelayDiagSnapshot} */
  const empty = {
    messagesReceivedTotal: 0,
    messagesByFrameUrl: {},
    lastReceivedAgoMs: null,
    heartbeatsByFrameUrl: {},
    heartbeatFrameCount: 0,
    crossOriginThrows: 0,
    sameOriginAccess: 0,
    hasReceivedAny: false,
    hasHeartbeatAny: false
  };
  if (!state || typeof state !== 'object') return empty;

  const total = numberOrZero(state.iframeRelayMessagesReceivedTotal);
  const lastAt = numberOrZero(state.iframeRelayLastReceivedAt);
  /** @type {Record<string, number>} */
  const byFrame = {};
  if (state.iframeRelayMessagesByFrameUrl && typeof state.iframeRelayMessagesByFrameUrl === 'object') {
    for (const key of Object.keys(state.iframeRelayMessagesByFrameUrl)) {
      const v = numberOrZero(state.iframeRelayMessagesByFrameUrl[key]);
      if (v > 0) byFrame[String(key).slice(0, 200)] = v;
    }
  }

  // v0.1.227: heartbeat 集計
  /** @type {Record<string, GiftSubAppRelayHeartbeatEntry>} */
  const heartbeats = {};
  let heartbeatFrameCount = 0;
  const hbRaw = state.iframeRelayHeartbeatsByFrameUrl;
  if (hbRaw && typeof hbRaw === 'object') {
    for (const key of Object.keys(hbRaw)) {
      const e = hbRaw[key];
      if (!e || typeof e !== 'object') continue;
      const count = numberOrZero(e.count);
      if (count <= 0) continue;
      const lastAtHb = numberOrZero(e.lastAt);
      heartbeats[String(key).slice(0, 200)] = {
        count,
        lastAgoMs: lastAtHb > 0 ? Math.max(0, now - lastAtHb) : null,
        lastScrapeAttempts: numberOrZero(e.lastScrapeAttempts),
        lastItemsCount: numberOrZero(e.lastItemsCount),
        lastContribCount: numberOrZero(e.lastContribCount),
        lastEventBannerPresent: e.lastEventBannerPresent === true,
        // v0.1.282: scrape 空時の iframe DOM 概形（観測専用・bounded）。
        // Scope B（公式イベント上位ランキング鏡）安全修正の前提エビデンス。
        lastDomShape:
          e.lastDomShape &&
          typeof e.lastDomShape === 'object' &&
          !Array.isArray(e.lastDomShape)
            ? e.lastDomShape
            : null,
        // 会議室(2026-05-19) Q1: koken 別ドメイン supporter iframe が gift 履歴
        // (items>0) を持つと送信側 scrapeEmptyForProbe が false になり domShapeProbe
        // が出ず、貢献度ランキングの DOM 概形が永久に観測できない狭い穴を、koken
        // 限定 one-shot で埋めた観測専用 shape（bounded・PII 非収集・既存
        // lastDomShape 経路は不変）。将来の安全な専用 selector 設計の前提エビデンス。
        lastKokenContribShape:
          e.lastKokenContribShape &&
          typeof e.lastKokenContribShape === 'object' &&
          !Array.isArray(e.lastKokenContribShape)
            ? e.lastKokenContribShape
            : null
      };
      heartbeatFrameCount += 1;
    }
  }

  return {
    messagesReceivedTotal: total,
    messagesByFrameUrl: byFrame,
    lastReceivedAgoMs: lastAt > 0 ? Math.max(0, now - lastAt) : null,
    heartbeatsByFrameUrl: heartbeats,
    heartbeatFrameCount,
    crossOriginThrows: numberOrZero(state.scanCrossOriginThrows),
    sameOriginAccess: numberOrZero(state.scanSameOriginAccess),
    hasReceivedAny: total > 0,
    hasHeartbeatAny: heartbeatFrameCount > 0
  };
}

/**
 * relay snapshot から popup「詳しい状況」用の 1 行短文を生成する。
 *
 * v0.1.227: heartbeat counter を加味して 3 シナリオを切り分ける。
 *   1. heartbeat 0 + relay 0 → child script 自体が動いてない（または iframe 不在）
 *   2. heartbeat あり + relay 0 → child script は動いてるが scrape 0 件
 *   3. relay 受信あり → relay 経路は OK、heartbeat 数も合わせて出す
 *
 * @param {GiftSubAppRelayDiagSnapshot|null|undefined} snap
 * @returns {string}
 */
export function formatRelayDiagOneLine(snap) {
  if (!snap || typeof snap !== 'object') return 'iframe relay 状態 不明';
  const total = Number(snap.messagesReceivedTotal) || 0;
  const throws = Number(snap.crossOriginThrows) || 0;
  const heartbeatFrameCount = Number(snap.heartbeatFrameCount) || 0;
  if (total === 0) {
    if (heartbeatFrameCount === 0) {
      // heartbeat も 0 → child content script 自体が起動していない
      if (throws > 0) {
        return `iframe relay 起動なし（cross-origin で ${throws} 回弾かれ、heartbeat 0）`;
      }
      return 'iframe relay 起動なし（child content script 未起動 or iframe 不在）';
    }
    // heartbeat あり + relay 0 → child は動いてるが scrape 0
    return `iframe relay 起動 ${heartbeatFrameCount} frame、scrape 0 件（DOM 空 or selector 不一致）`;
  }
  const frames = Object.keys(snap.messagesByFrameUrl || {}).length;
  const lastAgo = snap.lastReceivedAgoMs;
  const ago =
    typeof lastAgo === 'number' && Number.isFinite(lastAgo)
      ? `、最終 ${Math.round(lastAgo / 1000)}s 前`
      : '';
  return `iframe relay 受信 ${total} 件（${frames} frame${ago}、heartbeat ${heartbeatFrameCount} frame）`;
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
