/**
 * 公式値レーン(Koken 貢献度 / Nicoad 広告)の「取得結果」を、純関数の state 判定が
 * 3状態(成功 / 該当無し0件 / 本物の失敗)を分けられる形へ正規化する小さなヘルパ。
 *
 * 背景(council/adlane-fetcherror-SYNTHESIS・2026-06-21): 従来は state 判定に
 * `rows 配列(成功時のみ非null)`だけを渡していたため、「通信成功だが0件(該当無し)」と
 * 「未取得/失敗」が両方 null に潰れ、0件まで `fetch_error`(取得エラー=赤)と誤称していた。
 * content 側には `lastOk`(true/false/null)・`lastStatus`(200/null) が別途あるので、
 * それらを {ok,status,rows} の小さな結果オブジェクトに束ねて渡せば、純関数が
 *   ok===true && rows空  → 該当無し(no_ranking_data)
 *   ok===false           → 本物の失敗(fetch_error)
 *   ok==null(未送信/未応答) → 未取得(not_yet 相当)
 * を正直に分けられる。記録/取得には一切触れない純関数。
 *
 * @param {{ ok?: unknown, status?: unknown, rows?: unknown }} [input]
 * @returns {{ ok: boolean|null, status: number|null, rows: any[]|null }}
 */
export function makeLaneResult(input = {}) {
  const rawOk = input?.ok;
  /** @type {boolean|null} */
  const ok = rawOk === true ? true : rawOk === false ? false : null;
  const rawStatus = input?.status;
  const numStatus = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus);
  const status = rawStatus != null && Number.isFinite(numStatus) ? numStatus : null;
  const rows = Array.isArray(input?.rows) ? input.rows : null;
  return { ok, status, rows };
}

/**
 * 取得結果オブジェクトから「成功して取れた行数>0 か」「成功したが0件(該当無し)か」
 * 「本物の失敗か」「まだ未取得か」を表す分類を返す純関数。
 * northStarLaneReason の adRanking/contributionRanking 分岐がフォールバック時に使う。
 *
 * @param {{ ok: boolean|null, status: number|null, rows: any[]|null }|null|undefined} result
 * @returns {'has_rows'|'empty_ok'|'failed'|'pending'|'unknown'}
 *   has_rows=成功&&rows>0 / empty_ok=成功&&0件(該当無し) / failed=本物の失敗(ok===false) /
 *   pending=未取得(ok==null) / unknown=result 無し(旧経路へフォールバック)
 */
export function classifyLaneResult(result) {
  if (!result || typeof result !== 'object') return 'unknown';
  const { ok, rows } = result;
  if (ok === true) {
    return Array.isArray(rows) && rows.length > 0 ? 'has_rows' : 'empty_ok';
  }
  if (ok === false) return 'failed';
  return 'pending'; // ok == null = まだ叩いていない/応答前。
}
