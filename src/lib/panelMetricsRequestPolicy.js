/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】popup が content へ「数字カード(記録/同接/来場)の要求」を送ってよいかの判定
 * 【この箱に入らないもの】storage / メッセージ送信 / タイマー / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】popup→content の数字カード要求の頻度の判定(初回・配信切替・鮮度切れ)はこのファイルのみ
 *
 * panelMetricsRequestPolicy.js — 読み手が書き手を起こす閉ループの遮断(2026-10-08)。
 *
 * ■ なぜ要るか(実機 census・設計 docs/handoff/stable-update-model-DESIGN.md §C-1)
 *   popup の refresh()(と3秒 poll)は毎回 content へ NLS_EXPORT_PANEL_METRICS を送り、content の応答処理が
 *   nls_panel_summary_<lv> を【強制書込】していた(2秒ゲートは force=true で無効)。panel_summary は popup の高頻度キーなので、
 *   書込が onChanged→450ms 合流→refresh→また要求、と閉じたループになり、popup 文書の数に比例して書込が増えた
 *   (35分で各画面に約7,200回)。要求を「初回・配信切替・15秒の鮮度切れ」だけにして、読み手が書き手を起こさないようにする。
 *
 * ■ 守ること
 *   1. 判定できないとき(値が無い・壊れた・時計の巻き戻り)は【要求する】側に倒す(初回の描画を遅らせない)。
 *   2. 無音の配信でも 15 秒に1回は要求する=同接・来場の数字が最大でも約15秒古い程度で、panel_summary の心拍も15秒以内。
 *      (以前は popup が約3秒ごとに強制書込させていた。60秒にすると無音配信の同接が最大60秒古く見える=
 *       独立検証の指摘で15秒に。watchUrlFreshness の生存判定(3分)は十分割らない)
 *   3. コメントが流れている間は content の tickMonitor(10秒周期・記録件数が変わったとき)が panel_summary を書くので、
 *      要求を省いても storage から読める。それ以外の鮮度は 15 秒の要求が受け持つ。
 *
 * @module panelMetricsRequestPolicy
 */

/** 同じ配信で要求を省ける最長の間隔[ms]。 */
export const PANEL_METRICS_STALE_MS = 15_000;

/**
 * @param {{ lv?: unknown, appliedLv?: unknown, lastAppliedUpdatedAt?: unknown, nowMs?: unknown, staleMs?: unknown }} [args]
 *   lv: いま表示する配信 / appliedLv: 最後に content の応答を適用した配信 /
 *   lastAppliedUpdatedAt: その応答の updatedAt(epoch ms) / nowMs: 現在時刻。
 * @returns {boolean} true=要求してよい
 */
export function shouldRequestPanelMetrics(args) {
  const a = args && typeof args === 'object' ? args : {};
  const lv = String(a.lv == null ? '' : a.lv).trim().toLowerCase();
  const applied = String(a.appliedLv == null ? '' : a.appliedLv).trim().toLowerCase();
  if (!lv || lv !== applied) return true; // 初回・配信切替
  const now = Number(a.nowMs);
  const last = Number(a.lastAppliedUpdatedAt);
  if (!Number.isFinite(now) || !Number.isFinite(last) || last <= 0) return true; // 判定不能
  if (now < last) return true; // 時計の巻き戻り
  const rawStale = Number(a.staleMs);
  const stale = Number.isFinite(rawStale) && rawStale > 0 ? rawStale : PANEL_METRICS_STALE_MS;
  return now - last >= stale;
}
