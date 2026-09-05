// @ts-nocheck — popup-entry.js から切り出し。DOM/Chrome API が広く any 相当(移設元と同方針)。
/**
 * renderAcquisitionDashboard — 開発者モニタの「データ取得率」ダッシュボードを描く。
 *
 * ★Phase 2(巨大entryの分割)の最初の実抽出。
 *   popup-entry.js は 22,332行あり、変更のたびに「その場で1個足す」誘因になっていた
 *   (同じ概念に9つの名前が生まれた原因)。機能単位で切り出していく。
 *
 * ★なぜこの関数から始めたか(棚卸しの結果):
 *   - popup-entry 内の他関数への依存が【ゼロ】
 *     (第一候補だった submitComment は 16個の依存があり、162行を動かすために
 *      16関数を ctx で渡すことになる=追加行が削除行を上回るので見送った)
 *   - 数値計算は既に純関数(acquisitionDashboardChart.js)へ委譲済み
 *   - 呼び出し元は1箇所だけ
 *   → ctx を太らせずに動かせる。棚卸し結果は
 *     docs/handoff/giant-entry-split-PHASE2-INVENTORY-2026-08-10.md
 *
 * ★DOM を触るので純関数ではない。要素取得器は呼び手から注入する
 *   (popup-entry のローカル関数に直接依存させない=テストで差し替えられる)。
 *
 * @module popup/renderAcquisitionDashboard
 */

import {
  ACQUISITION_RADAR_GEOMETRY,
  computeAcquisitionPercents,
  computeAcquisitionPieGradient,
  computeRadarPolygonPoints
} from '../../lib/acquisitionDashboardChart.js';
import { escapeHtml } from '../../lib/htmlEscape.js';
import { appendTrendPoint, persistTrendPointChrome } from '../../lib/devMonitorTrendSession.js';

/**
 * @param {any} p 描画パラメータ(popup-entry が組む)
 * @param {{ getEl: (id: string) => HTMLElement|null }} deps 要素取得器を注入する
 */
export function renderAcquisitionDashboard(p, deps) {
  const getEl = deps.getEl;
  const host = getEl('devMonitorAcquisition');
  if (!host) return;

  const liveId = String(p.liveId || '').trim();
  if (!liveId) {
    host.innerHTML =
      '<section class="nl-acquisition nl-acquisition--empty" aria-label="データ取得率">' +
      '<p class="nl-acquisition__empty">ニコ生 watch を開いた状態でポップアップを開くと、取得率チャートが表示されます（記録0件でも表示）。</p>' +
      '</section>';
    return;
  }

  // DOM 非依存の数値計算は純関数 acquisitionDashboardChart.js に委譲（pure refactor）。
  const avs = p.avatarStats;
  const { thumb, idPct, nick, commentPct, total: t } = computeAcquisitionPercents({
    avatarStats: avs,
    snapshot: p.snapshot,
    displayCount: p.displayCount
  });
  const radarComment = commentPct != null ? commentPct : 0;

  const { polyPts, ringPts, midPts, axisLines } = computeRadarPolygonPoints(
    [thumb, idPct, nick, radarComment],
    ACQUISITION_RADAR_GEOMETRY
  );

  const fmt = (/** @type {number} */ n) => `${n.toFixed(1)}%`;
  const commentBar = commentPct != null ? fmt(commentPct) : '—';

  const pieDiskBackground = computeAcquisitionPieGradient({ thumb, idPct, nick, commentPct });

  const footExtra =
    t <= 0
      ? '記録0件のためサムネ・ID・名前は0%。ログイン不要で表示します。'
      : '';
  const footMain =
    commentPct != null
      ? 'コメント＝記録の表示件数÷公式コメント数（上限100%）。'
      : 'コメント率は公式件数が無いとき「—」（レーダー・円のコメント分は0扱い）。';
  const footThumb =
    t > 0
      ? ' サムネ＝応援レーンと同じく「表示に使える http(s) アイコン」まで解決できた割合（数字IDの既定CDN合成を含む。匿名形式はページ側の追加情報が無いと上がりにくい）。'
      : '';
  const foot = escapeHtml(
    footExtra ? `${footMain}${footThumb} ${footExtra}` : `${footMain}${footThumb}`
  );

  host.innerHTML =
    '<section class="nl-acquisition" aria-label="データ取得率">' +
    '<h3 class="nl-acquisition__title">現在のデータ取得率</h3>' +
    '<div class="nl-acquisition__charts">' +
    '<div class="nl-acquisition__radar">' +
    '<svg viewBox="0 0 120 120" aria-hidden="true">' +
    axisLines +
    `<polygon fill="none" stroke="#94a3b8" stroke-width="0.55" opacity="0.45" points="${ringPts}" />` +
    `<polygon fill="none" stroke="#94a3b8" stroke-width="0.45" opacity="0.32" points="${midPts}" />` +
    `<polygon fill="rgb(15 143 216 / 22%)" stroke="#0f8fd8" stroke-width="1.2" points="${polyPts}" />` +
    '</svg>' +
    '<span class="nl-acquisition__cap">4項目バランス（レーダー）</span>' +
    '</div>' +
    '<div class="nl-acquisition__bars">' +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">サムネ</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--thumb" style="width:${Math.min(
      100,
      thumb
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(thumb)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">ID</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--id" style="width:${Math.min(
      100,
      idPct
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(idPct)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">名前</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--nick" style="width:${Math.min(
      100,
      nick
    )}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      fmt(nick)
    )}</p></div>` +
    `<div class="nl-acquisition__bar-row"><p class="nl-acquisition__bar-label">コメ</p><div class="nl-acquisition__bar-track"><div class="nl-acquisition__bar-fill nl-acquisition__bar-fill--comment" style="width:${commentPct != null ? Math.min(100, commentPct) : 0}%"></div></div><p class="nl-acquisition__bar-pct">${escapeHtml(
      commentBar
    )}</p></div>` +
    '</div>' +
    '<div class="nl-acquisition__pie">' +
    '<div class="nl-acquisition__pie-disk"></div>' +
    '<span class="nl-acquisition__cap">構成比（円）</span>' +
    '</div>' +
    '</div>' +
    '<ul class="nl-acquisition__legend">' +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--thumb" aria-hidden="true"></span>アイコン（表示解決・応援レーンと同じ基準）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--id" aria-hidden="true"></span>ユーザーID（取れている割合）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--nick" aria-hidden="true"></span>表示名・ニックネーム（付いている割合）</li>` +
    `<li><span class="nl-acquisition__dot nl-acquisition__dot--comment" aria-hidden="true"></span>コメント（記録÷公式）</li>` +
    '</ul>' +
    `<p class="nl-acquisition__footnote">${foot}</p>` +
    '</section>';

  const disk = host.querySelector('.nl-acquisition__pie-disk');
  if (disk instanceof HTMLElement) {
    disk.style.background = pieDiskBackground;
  }

  const win = typeof globalThis !== 'undefined' ? globalThis : window;
  appendTrendPoint(win, liveId, {
    thumb,
    idPct,
    nick,
    commentPct,
    displayCount: p.displayCount,
    storageCount: p.storageCount
  });
  void persistTrendPointChrome(liveId, {
    thumb,
    idPct,
    nick,
    commentPct,
    displayCount: p.displayCount,
    storageCount: p.storageCount
  });
}