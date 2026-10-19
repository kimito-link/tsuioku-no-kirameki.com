/**
 * AI共有用の診断(fastDiag)の【全文】を、storage へ書くかどうかの判定(純関数・I/O禁止)。v0.1.1694
 *
 * ■ なぜ要るか(2026-10-19・実機の census)
 *   nls_ai_share_fast_diag_v1(全文・約16〜40KB)は、可視タブで 1.5 秒ごとに書かれ、2分間に72回=約1.1MB が、
 *   拡張の全ページへ旧値+新値で配られていた(全ページが1本の主スレッドを共有=サイドパネルの最初の描画を遅らせる根本原因の1つ)。
 *   読み手は AI共有のコピーボタン(押した時だけ)と開発モニタ表示だけ(status は軽量版 lite を読む)=普段は誰も使わない。
 *
 * ■ 守ること
 *   - 軽量版(lite)は従来の頻度のまま(status が2秒ごとに読む)。間引くのは全文だけ。
 *   - 読み手が最新を求めた時(AI共有のコピー=NLS_AI_SHARE_PAGE_DIAGNOSTICS)は、必ず全文を書く(forceFull)。
 *   - 全文の古さは、読み手が cacheAgeMs / cacheStale(180秒)で判定している=30秒までなら表示に影響しない。
 * @module fastDiagFullGate
 */

/** 全文を書く最小間隔(ms)。 */
export const AI_SHARE_FAST_DIAG_FULL_MIN_INTERVAL_MS = 30_000;

/**
 * @param {{ now: number, lastFullAt: number, forceFull?: boolean, minMs?: number }} s
 * @returns {boolean} true=全文も書く
 */
export function shouldWriteFastDiagFull(s) {
  const a = s && typeof s === 'object' ? s : /** @type {any} */ ({});
  if (a.forceFull === true) return true;
  const now = Number(a.now);
  const last = Number(a.lastFullAt);
  const minMs = Number.isFinite(Number(a.minMs)) ? Number(a.minMs) : AI_SHARE_FAST_DIAG_FULL_MIN_INTERVAL_MS;
  if (!Number.isFinite(now)) return true; // 時計が読めない=従来どおり書く(安全側)
  if (!Number.isFinite(last) || last <= 0) return true; // まだ一度も書いていない
  if (now < last) return true; // 時計が戻った
  return now - last >= minMs;
}
