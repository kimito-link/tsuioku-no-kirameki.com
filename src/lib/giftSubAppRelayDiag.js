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
 *   iframeRelayMessagesReceivedTotal: number,
 *   iframeRelayMessagesByFrameUrl: Record<string, number>,
 *   iframeRelayLastReceivedAt: number,
 *   scanCrossOriginThrows: number,
 *   scanSameOriginAccess: number
 * }} GiftSubAppRelayDiagState
 */

/**
 * @typedef {{
 *   messagesReceivedTotal: number,
 *   messagesByFrameUrl: Record<string, number>,
 *   lastReceivedAgoMs: number|null,
 *   crossOriginThrows: number,
 *   sameOriginAccess: number,
 *   hasReceivedAny: boolean
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
    crossOriginThrows: 0,
    sameOriginAccess: 0,
    hasReceivedAny: false
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
  return {
    messagesReceivedTotal: total,
    messagesByFrameUrl: byFrame,
    lastReceivedAgoMs: lastAt > 0 ? Math.max(0, now - lastAt) : null,
    crossOriginThrows: numberOrZero(state.scanCrossOriginThrows),
    sameOriginAccess: numberOrZero(state.scanSameOriginAccess),
    hasReceivedAny: total > 0
  };
}

/**
 * relay snapshot から popup「詳しい状況」用の 1 行短文を生成する。
 * 例:
 *   - relay 受信 0 件 / cross-origin throw 6 → "iframe relay 未受信（cross-origin で 6 回弾かれ）"
 *   - relay 受信 12 件（audition×6 / koken×6） → "iframe relay 受信 12 件（2 frame）"
 * @param {GiftSubAppRelayDiagSnapshot|null|undefined} snap
 * @returns {string}
 */
export function formatRelayDiagOneLine(snap) {
  if (!snap || typeof snap !== 'object') return 'iframe relay 状態 不明';
  const total = Number(snap.messagesReceivedTotal) || 0;
  const throws = Number(snap.crossOriginThrows) || 0;
  const sameOrigin = Number(snap.sameOriginAccess) || 0;
  if (total === 0) {
    if (throws > 0) {
      return `iframe relay 未受信（cross-origin で ${throws} 回弾かれ、same-origin ${sameOrigin}）`;
    }
    return 'iframe relay 未受信（hidden iframe inject 未動作の疑い）';
  }
  const frames = Object.keys(snap.messagesByFrameUrl || {}).length;
  const lastAgo = snap.lastReceivedAgoMs;
  const ago =
    typeof lastAgo === 'number' && Number.isFinite(lastAgo)
      ? `、最終 ${Math.round(lastAgo / 1000)}s 前`
      : '';
  return `iframe relay 受信 ${total} 件（${frames} frame${ago}、cross-origin throw ${throws}）`;
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
