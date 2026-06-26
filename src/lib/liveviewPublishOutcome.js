/**
 * 純Web公開（応援ライブビューの /api/status への POST）の直近結果を記録・要約する。
 *
 * 狙い（council/status-self-diagnoses-SYNTHESIS.md）= 状態速報1枚で「純Webに送ってすらいない／失敗した
 *   ＝純Webが古い snapshot を見続けている」を検知できるようにする。今までは uploadStatusSnapshot の
 *   戻り値 {ok,error} はボタン押下時のローカル変数で消えていた（どこにも残らない）。
 *
 * ★MEMORY 鉄則「status に read を増やすな」を守るため、storage を一切使わず globalThis に集計する
 *   （commentSubmitDiag.js / storageIoDiag.js と同方式）。記録は副作用のみ・要約は読むだけ＝純関数寄り。
 *
 * @module liveviewPublishOutcome
 */

const STORE_KEY = '__nlsLiveviewPublishOutcome__';

/** @returns {{ lastAt: number, lastOk: boolean|null, lastHttpStatus: number|null, lastError: string, okCount: number, failCount: number }} */
function store() {
  const g = /** @type {any} */ (globalThis);
  if (!g[STORE_KEY] || typeof g[STORE_KEY] !== 'object') {
    g[STORE_KEY] = { lastAt: 0, lastOk: null, lastHttpStatus: null, lastError: '', okCount: 0, failCount: 0 };
  }
  return g[STORE_KEY];
}

/**
 * 公開送信の結果を1件記録する（uploadStatusSnapshot の成功/失敗の両分岐から呼ぶ）。
 * @param {{ ok?: boolean, httpStatus?: number|null, error?: string, at?: number }} outcome
 */
export function recordLiveviewPublishOutcome(outcome) {
  const o = outcome && typeof outcome === 'object' ? outcome : {};
  const s = store();
  const at = Number(o.at);
  s.lastAt = Number.isFinite(at) && at > 0 ? at : s.lastAt;
  s.lastOk = o.ok === true;
  const hs = Number(o.httpStatus);
  s.lastHttpStatus = Number.isFinite(hs) && hs > 0 ? hs : null;
  s.lastError = String(o.error || '');
  if (o.ok === true) s.okCount += 1;
  else s.failCount += 1;
}

/**
 * 直近の公開送信の要約を返す（状態速報が読む）。read 副作用なし。
 * @param {number} [nowMs] 経過秒の基準（テスト用に注入可）
 * @returns {{ everSent: boolean, lastOk: boolean|null, lastHttpStatus: number|null, lastError: string, ageSec: number|null, okCount: number, failCount: number }}
 */
export function summarizeLiveviewPublishOutcome(nowMs) {
  const s = store();
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const ageSec = s.lastAt > 0 && now > 0 ? Math.max(0, Math.round((now - s.lastAt) / 1000)) : null;
  return {
    everSent: s.lastAt > 0,
    lastOk: s.lastOk,
    lastHttpStatus: s.lastHttpStatus,
    lastError: s.lastError,
    ageSec,
    okCount: s.okCount,
    failCount: s.failCount
  };
}

/** テスト用: 集計をクリアする。 */
export function __resetLiveviewPublishOutcomeForTest() {
  const g = /** @type {any} */ (globalThis);
  delete g[STORE_KEY];
}
