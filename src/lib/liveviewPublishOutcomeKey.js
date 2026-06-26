/**
 * 純Web公開送信(POST /api/status)結果の【ページ横断】記録キー（council/diagnostics-completeness-root-SYNTHESIS.md 第3段）。
 *
 * 根2「ページまたぎ非対称」の根治: 従来 liveviewPublishOutcome.js は globalThis に記録していたが、
 *   globalThis はページごと別物のため、拡張内 応援ライブビュー(live-view-entry.js)の公開ボタンで送信しても
 *   status ページの globalThis には残らず「押したのに未送信」と誤報していた。
 *   → storage に1件だけ記録すれば、どのページ(status / live-view)から送信しても status が読める。
 *
 * ★MEMORY 鉄則: storage write は best-effort + min-gap で多タブ競合を吸収(鏡 publish と同方式)。
 *   記録は副作用のみ・判定は純関数。値は成否/HTTP/時刻/liveId のみ(個人情報なし)。
 *
 * @module liveviewPublishOutcomeKey
 */

export const KEY_LIVEVIEW_PUBLISH_OUTCOME = 'nls_liveview_publish_outcome_v1';

/**
 * 送信結果レコードを組む純関数。
 * @param {{ ok?: boolean, httpStatus?: number|null, error?: string, liveId?: string, at?: number }} outcome
 * @returns {{ ok: boolean, httpStatus: number|null, error: string, liveId: string, at: number }}
 */
export function buildLiveviewPublishOutcomeRecord(outcome) {
  const o = outcome && typeof outcome === 'object' ? outcome : {};
  const at = Number(o.at);
  const hs = Number(o.httpStatus);
  return {
    ok: o.ok === true,
    httpStatus: Number.isFinite(hs) && hs > 0 ? hs : null,
    error: String(o.error || '').slice(0, 200),
    liveId: String(o.liveId || '').trim().toLowerCase(),
    at: Number.isFinite(at) && at > 0 ? at : 0
  };
}

/**
 * storage レコードを status が読む要約に変換する純関数（globalThis 版 summarize と同形）。
 * @param {{ ok?: boolean, httpStatus?: number|null, error?: string, liveId?: string, at?: number }|null|undefined} rec
 * @param {number} nowMs
 * @returns {{ everSent: boolean, lastOk: boolean|null, lastHttpStatus: number|null, lastError: string, liveId: string, ageSec: number|null }}
 */
export function summarizeLiveviewPublishOutcomeRecord(rec, nowMs) {
  const r = rec && typeof rec === 'object' ? rec : null;
  const at = r ? Number(r.at) : 0;
  const now = Number(nowMs) || 0;
  const ageSec = at > 0 && now > 0 ? Math.max(0, Math.round((now - at) / 1000)) : null;
  return {
    everSent: at > 0,
    lastOk: r ? (r.ok === true ? true : r.ok === false ? false : null) : null,
    lastHttpStatus: r && Number.isFinite(Number(r.httpStatus)) ? Number(r.httpStatus) : null,
    lastError: r ? String(r.error || '') : '',
    liveId: r ? String(r.liveId || '') : '',
    ageSec
  };
}
