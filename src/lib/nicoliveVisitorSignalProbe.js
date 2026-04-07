/**
 * フェーズ2: 入室・来場のリアルタイム信号（NDGR 等）をパースする拡張点。
 * 現状は安定ペイロード未確認のため常に null。
 * 観測: interceptVisitorProbeDebug.js（sessionStorage `nls_intercept_visitor_probe`=1 と data-nls-intercept-visitor-probe）。
 *
 * @param {unknown} _payload
 * @returns {null}
 */
export function parseVisitorJoinSignal(_payload) {
  void _payload;
  return null;
}

/**
 * B2（任意）: `chrome.runtime` メッセージ型・`chrome.storage` キーは契約確定後に設定する。
 * 未配線の間は null のまま（拡張の契約を壊さないための明示フラグ）。
 *
 * @type {{ messageType: string|null, storageKey: string|null }}
 */
export const VISITOR_JOIN_SIGNAL_WIRE = {
  messageType: null,
  storageKey: null
};
