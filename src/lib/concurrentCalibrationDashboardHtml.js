/**
 * 較正ダッシュボード（蓄積した較正サンプルを自己完結 HTML で可視化する純関数）。
 *
 * popup から呼び、Blob URL にして新規タブで開く。外部依存なし・インライン CSS・
 * レスポンシブ。チャートは div ベースのバー（SVG 不要・軽量）で描く。
 *
 * 表示:
 *   ・KPI（総サンプル / 配信数 / 期間 / 手動 vs 自動巡回 / プラットフォーム）
 *   ・自動較正の推奨係数（computeCalibrationFit の結果。現行 vs 推奨・信頼度）
 *   ・規模別バケツ（来場者数で小/中/大）
 *   ・推定値の分布（対数バケツ）
 *   ・直近サンプル表
 *
 * PII なし（数値・liveId・platform・ts・source のみ）。
 */

import { parseCalibrationLog } from './concurrentCalibrationLog.js';
import { computeCalibrationFit } from './concurrentCalibrationFit.js';

/** @param {unknown} s */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {number} n */
function jp(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('ja-JP') : '—';
}

/** @param {number} ts */
function isoMin(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const d = new Date(ts);
  const p = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * @param {{ label: string, count: number }[]} rows
 * @returns {string}
 */
function barListHtml(rows) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows
    .map((r) => {
      const pct = Math.max(2, Math.round((r.count / max) * 100));
      return `<div class="bar-row">
        <div class="bar-label">${esc(r.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-count">${jp(r.count)}</div>
      </div>`;
    })
    .join('');
}

/** @param {import('./concurrentCalibrationLog.js').CalibrationSample[]} items */
function sizeBuckets(items) {
  let small = 0;
  let mid = 0;
  let large = 0;
  let unknown = 0;
  for (const s of items) {
    const v = s.totalVisitors;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) unknown += 1;
    else if (v < 500) small += 1;
    else if (v < 5000) mid += 1;
    else large += 1;
  }
  return [
    { label: '小規模（来場 <500）', count: small },
    { label: '中規模（来場 500〜5,000）', count: mid },
    { label: '大規模（来場 >5,000）', count: large },
    { label: '来場不明', count: unknown }
  ];
}

/** @param {import('./concurrentCalibrationLog.js').CalibrationSample[]} items */
function estimateHistogram(items) {
  const buckets = [
    { label: '推定 1〜49', lo: 1, hi: 49 },
    { label: '推定 50〜199', lo: 50, hi: 199 },
    { label: '推定 200〜999', lo: 200, hi: 999 },
    { label: '推定 1,000〜4,999', lo: 1000, hi: 4999 },
    { label: '推定 5,000〜', lo: 5000, hi: Infinity }
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: items.filter(
      (s) => typeof s.estimated === 'number' && s.estimated >= b.lo && s.estimated <= b.hi
    ).length
  }));
}

/**
 * @param {unknown} parsedOrItems  KEY_CONCURRENT_CALIBRATION_RING_V1 の中身
 * @param {{ exportedAt?: string, recentMax?: number }} [opts]
 * @returns {string} 自己完結 HTML 文字列
 */
export function buildCalibrationDashboardHtml(parsedOrItems, opts = {}) {
  const parsed = parseCalibrationLog(parsedOrItems);
  const items = parsed.items;
  const recentMax = Math.max(10, Math.min(500, Math.floor(opts.recentMax ?? 80)));
  const exportedAt = opts.exportedAt || new Date().toISOString();

  const platforms = Array.from(new Set(items.map((s) => s.platform))).sort();
  const lives = new Set(items.map((s) => s.liveId));
  const manual = items.filter((s) => s.source === 'manual').length;
  const autopatrol = items.filter((s) => s.source === 'autopatrol').length;
  const tsList = items.map((s) => s.ts).filter((t) => Number.isFinite(t) && t > 0);
  const firstTs = tsList.length ? Math.min(...tsList) : 0;
  const lastTs = tsList.length ? Math.max(...tsList) : 0;

  const fitByPlatform = platforms.map((pf) => ({
    platform: pf,
    fit: computeCalibrationFit(parsed, { platform: pf })
  }));

  const kpiCards = [
    { label: '総サンプル', value: jp(items.length) },
    { label: '配信数', value: jp(lives.size) },
    { label: 'プラットフォーム', value: platforms.length ? esc(platforms.join(' / ')) : '—' },
    { label: '手動視聴', value: jp(manual) },
    { label: '自動巡回', value: jp(autopatrol) },
    { label: '期間', value: `${esc(isoMin(firstTs))} 〜 ${esc(isoMin(lastTs))}` }
  ]
    .map(
      (c) => `<div class="kpi"><div class="kpi-v">${c.value}</div><div class="kpi-l">${esc(
        c.label
      )}</div></div>`
    )
    .join('');

  const fitHtml = fitByPlatform
    .map(({ platform, fit }) => {
      const basisLabel =
        fit.basis === 'official'
          ? '公式同接ベース（真値フィット）'
          : fit.basis === 'cross-signal'
            ? 'クロスシグナル（自己整合）'
            : 'サンプル不足';
      const readyBadge = fit.ready
        ? '<span class="badge ok">推奨値あり</span>'
        : '<span class="badge wait">蓄積待ち</span>';
      const row = (/** @type {string} */ label, /** @type {string|number} */ cur, /** @type {string|number} */ sug) =>
        `<tr><td>${esc(label)}</td><td>${cur}</td><td class="sug">${sug}</td></tr>`;
      const fmt = (/** @type {number|null|undefined} */ v, /** @type {string} */ suffix = '') =>
        (v == null ? '—' : `${v}${suffix}`);
      return `<div class="fit-card">
        <h3>${esc(platform)} ${readyBadge}</h3>
        <p class="muted">${esc(basisLabel)} ／ 真値付き ${jp(fit.withTruthCount)} 件・クロス ${jp(
          fit.crossUsableCount
        )} 件</p>
        <table class="fit-table">
          <thead><tr><th>係数</th><th>現行</th><th>推奨</th></tr></thead>
          <tbody>
            ${row('平均滞在(分) avgSessionMin', fmt(fit.current.avgSessionMin), fmt(fit.suggested.avgSessionMin))}
            ${row(
              'コメ/分/人 perPersonCommentsPerMin',
              fmt(fit.current.perPersonCommentsPerMin),
              fmt(fit.suggested.perPersonCommentsPerMin)
            )}
            ${row(
              '倍率スケール multiplierScale',
              '×1.00',
              fit.suggested.multiplierScale == null ? '—' : `×${fit.suggested.multiplierScale}`
            )}
          </tbody>
        </table>
        <p class="muted">品質: blend誤差中央値 ${fmt(
          fit.quality.medianAbsBlendErrorPct,
          '%'
        )} ／ シグナル不一致中央値 ${fmt(fit.quality.medianSignalDispersionPct, '%')}</p>
        <ul class="notes">${fit.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>`;
    })
    .join('');

  const recent = items.slice(-recentMax).reverse();
  const recentRows = recent
    .map(
      (s) => `<tr>
      <td>${esc(isoMin(s.ts))}</td>
      <td>${esc(s.platform)}</td>
      <td>${esc(s.liveId)}</td>
      <td>${esc(s.source)}</td>
      <td class="num">${jp(s.estimated ?? NaN)}</td>
      <td class="num">${jp(s.blended ?? NaN)}</td>
      <td class="num">${s.signalA ?? '—'}/${s.signalB ?? '—'}/${s.signalC ?? '—'}/${s.signalD ?? '—'}</td>
      <td class="num">${jp(s.totalVisitors ?? NaN)}</td>
      <td class="num">${s.streamAgeMin ?? '—'}</td>
      <td class="num">${s.officialConcurrent != null ? jp(s.officialConcurrent) : '—'}</td>
    </tr>`
    )
    .join('');

  const empty = items.length === 0;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>同接推定 較正ダッシュボード</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif; color: #1f2937; background: #f8fafc; line-height: 1.5; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 64px; }
  h1 { font-size: clamp(20px, 4vw, 28px); margin: 0 0 4px; }
  .sub { color: #64748b; font-size: 13px; margin: 0 0 20px; }
  h2 { font-size: clamp(16px, 3vw, 20px); margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
  .kpi-v { font-size: clamp(15px, 2.4vw, 20px); font-weight: 700; }
  .kpi-l { color: #64748b; font-size: 12px; margin-top: 2px; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
  .card h3 { margin: 0 0 10px; font-size: 15px; }
  .bar-row { display: grid; grid-template-columns: minmax(120px, 40%) 1fr auto; gap: 8px; align-items: center; margin: 6px 0; }
  .bar-label { font-size: 12px; color: #475569; }
  .bar-track { background: #eef2f7; border-radius: 6px; height: 14px; overflow: hidden; }
  .bar-fill { background: linear-gradient(90deg,#6366f1,#8b5cf6); height: 100%; }
  .bar-count { font-variant-numeric: tabular-nums; font-size: 12px; color: #334155; min-width: 44px; text-align: right; }
  .fit-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
  .fit-card h3 { margin: 0 0 6px; font-size: 15px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; margin-left: 6px; vertical-align: middle; }
  .badge.ok { background: #dcfce7; color: #166534; }
  .badge.wait { background: #fef9c3; color: #854d0e; }
  .muted { color: #64748b; font-size: 12px; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .fit-table td, .fit-table th { padding: 5px 8px; border-bottom: 1px solid #eef2f7; text-align: left; }
  .fit-table .sug { font-weight: 700; color: #4338ca; }
  .notes { margin: 8px 0 0; padding-left: 18px; color: #475569; font-size: 12px; }
  .table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; }
  .rec { min-width: 720px; }
  .rec th, .rec td { padding: 6px 8px; border-bottom: 1px solid #eef2f7; white-space: nowrap; }
  .rec th { background: #f1f5f9; position: sticky; top: 0; }
  .rec .num { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { background: #fff; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 32px; text-align: center; color: #64748b; }
</style>
</head>
<body>
<div class="wrap">
  <h1>同接推定 較正ダッシュボード</h1>
  <p class="sub">出力: ${esc(exportedAt)} ／ コメント本文・名前などの個人情報は含みません（数値のみ）。</p>

  ${
    empty
      ? `<div class="empty">まだ較正サンプルがありません。<br>配信を開く（または自動巡回を ON にする）と、約30秒ごとに貯まります。</div>`
      : `
  <h2>サマリー</h2>
  <div class="kpis">${kpiCards}</div>

  <h2>自動較正の推奨係数</h2>
  <div class="grid2">${fitHtml}</div>

  <h2>分布</h2>
  <div class="grid2">
    <div class="card"><h3>規模別バケツ（来場者数）</h3>${barListHtml(sizeBuckets(items))}</div>
    <div class="card"><h3>推定値の分布</h3>${barListHtml(estimateHistogram(items))}</div>
  </div>

  <h2>直近サンプル（最新 ${jp(recent.length)} 件）</h2>
  <div class="table-wrap">
    <table class="rec">
      <thead><tr>
        <th>時刻</th><th>PF</th><th>liveId</th><th>source</th>
        <th>推定</th><th>blend</th><th>A/B/C/D</th><th>来場</th><th>経過分</th><th>公式同接</th>
      </tr></thead>
      <tbody>${recentRows}</tbody>
    </table>
  </div>
  `
  }
</div>
</body>
</html>`;
}
