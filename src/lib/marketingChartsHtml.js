/**
 * @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport
 * @typedef {import('./marketingAggregate.js').UserCommentProfile} UserCommentProfile
 */

import { escapeHtml } from './htmlEscape.js';
import { maskLabelForShare } from './privacyDisplay.js';
import { MKT_ADVISOR_AVATAR_DATA_URI } from './marketingHtmlAdvisorAvatars.js';

/**
 * @param {'tanu' | 'rink' | 'konta'} role
 * @param {string} displayName 「たぬ姉」など（未エスケープ）
 * @param {string[]} lines 本文（未エスケープ・1行ずつ <p>）
 */
function adviceCard(role, displayName, lines) {
  const ps = lines
    .filter((s) => s && String(s).trim())
    .map((line) => `<p class="mkt-advice__p">${escapeHtml(line)}</p>`)
    .join('');
  const avatarSrc = MKT_ADVISOR_AVATAR_DATA_URI[role];
  const alt =
    role === 'rink' ? 'りんく' : role === 'konta' ? 'こん太' : 'たぬ姉';
  return `<article class="mkt-advice-row mkt-advice--${role}" role="note">
<div class="mkt-advice__avatar-wrap">
<img class="mkt-advice__avatar" src="${avatarSrc}" alt="${escapeHtml(alt)}" width="56" height="56" loading="lazy" decoding="async">
</div>
<div class="mkt-advice__bubble">
<div class="mkt-advice__name">${escapeHtml(displayName)}</div>
${ps}
</div>
</article>`;
}

/** ページ冒頭：機能一覧とスタンス（配信スタイルを否定しない） */
function sectionFeaturesOverview() {
  return `<section class="mkt-section mkt-section--features" aria-label="この分析ページの機能">
<h2>このページでできること</h2>
<p class="mkt-lead">拡張が手元に残したコメントを集計し、次のような<strong>グラフと表</strong>が並びます。あわせて、各ブロックの<strong>前後にりんく・こん太・たぬ姉からの短い分析メモ</strong>（アドバイス）が挟まり、数字の読み方や注意点を補います。</p>
<ul class="mkt-feature-list">
<li><strong>KPI サマリ</strong> — 総コメント数、ユニーク人数、コメント/分、平均・中央値、配信時間、ピーク分などを一覧</li>
<li><strong>コメントタイムライン</strong> — 分ごとの盛り上がりと、その分のユニーク人数の推移</li>
<li><strong>ユーザーセグメント</strong> — コメント回数の層（ヘビー〜一見）の割合</li>
<li><strong>トップコメンター</strong> — 多めに書いてくれた人の並び（順位＝価値の上下ではない旨もメモで触れます）</li>
<li><strong>時間帯ヒートマップ</strong> — コメントが集中した時間帯の傾向</li>
</ul>
<p class="mkt-values-note"><strong>どんな配信も否定しません。</strong>静かな雑談も、わいわい型も、ゲーム特化も、歌枠も、それぞれに合ったスタイルがあります。<strong>そのスタイルに数字やメモで縛られる必要もありません。</strong>気になったところだけ眺めて、ひとつの視点・振り返りの補助として使ってください。</p>
</section>`;
}

/** ページ冒頭：この画面の限界と三人の登場（3人それぞれ吹き出し） */
function sectionAdviceIntro() {
  const cards = [
    adviceCard('rink', 'りんく', [
      'このページは、配信している側から見ても「手元の記録で枠を振り返る」ためのメモに近いのだ。',
      '下のグラフのあいだに、俺・こん太・たぬ姉から短いメモが挟まるのだ。数字ひとつで配信の価値が決まるわけじゃないから、肩の力は抜いて読んでほしいのだ。',
    ]),
    adviceCard('konta', 'こん太', [
      'ファン側からすると、コメントの出方や層は「みんなの入り方の違い」が見えるだけのことが多いのだ。',
      '順位や割合で誰かを責めたり、応援の熱さを上下しないでほしいのだ。気持ちの補助として使ってくれればいいのだ。',
    ]),
    adviceCard('tanu', 'たぬ姉', [
      '集計の正体はシンプルで、このページは拡張が記録した応援コメントだけを数にしているのだ。公式の同接数や売上とは一致しないから、あくまで手元の振り返り用として読んでほしいのだ。',
    ])
  ].join('');
  const hint = `<p class="mkt-advice__roles-hint">${escapeHtml('役割の目安：りんく＝配信する側の目線 / こん太＝ファン側の肌感 / たぬ姉＝指標の整理と注意書き、なのだ。')}</p>`;
  return `<section class="mkt-section mkt-section--advice" aria-label="キャラクターからの案内">
<h2>りんく・こん太・たぬ姉から</h2>
<div class="mkt-advice-stack mkt-advice-stack--intro">${cards}${hint}</div>
</section>`;
}

/** KPI の直後
 * @param {MarketingReport} r */
function sectionAdviceAfterKpi(r) {
  const rinkLines = [
    'ピークの分やコメント／分は、枠のどこで盛り上がったかの目安になるのだ。全部のコメントに返せない日でも、波を知っておくと心の置きどころにはなるのだ。',
  ];
  if (r.peakMinuteCount >= 3 && r.durationMinutes >= 5) {
    rinkLines.push(
      'ピークがはっきりしていれば、次の枠で企画を畳むタイミングの参考にするくらいの軽さで十分なのだ。'
    );
  }
  const cards = [adviceCard('rink', 'りんく', rinkLines)];

  const med = r.medianCommentsPerUser;
  const avg = r.avgCommentsPerUser;
  if (r.uniqueUsers >= 5 && med > 0 && avg > med * 1.75) {
    cards.push(
      adviceCard('tanu', 'たぬ姉', [
        '平均コメント数と中央値が離れているのだ。少数のヘビーさんが平均を押し上げている可能性があるのだ。「ふつうの1人」の姿には中央値の方が近いことが多いのだ。',
      ])
    );
  }

  return `<div class="mkt-advice-after">${cards.join('')}</div>`;
}

/** タイムライン直後（チャートがあるときだけ）
 * @param {MarketingReport} r */
function sectionAdviceAfterTimeline(r) {
  if (r.timeline.length < 2) return '';
  return `<div class="mkt-advice-after">${adviceCard('rink', 'りんく', [
    '青（コメント数）とオレンジ（その分のユニーク人数）のズレは、「同じ人が続けて話していた」「新しい顔が増えた」などの肌感のヒントになることがあるのだ。断定はできないから、眺めの補助として使ってほしいのだ。',
  ])}</div>`;
}

/** セグメント直後
 * @param {MarketingReport} r */
function sectionAdviceAfterSegment(r) {
  const u = r.uniqueUsers;
  const once = r.segmentPcts.once;
  const heavyMid = r.segmentPcts.heavy + r.segmentPcts.mid;
  /** @type {string[]} */
  const konta = [];
  /** @type {string[]} */
  const tanu = [];

  if (u >= 10 && once > 45) {
    konta.push(
      '一見さんの割合が多い枠も、悪いことばかりじゃないのだ。ちらっと顔を出してくれた人も、空気を一段明るくしてくれているのだ。'
    );
    tanu.push(
      '層の厚みは配信の雰囲気や話題で変わるのだ。この円グラフを、誰かを責める材料にしないでほしいのだ。'
    );
  } else if (u >= 8 && heavyMid > 55) {
    konta.push(
      '何度も声をかけてくれる人が土台になっている感じ、に見えるのだ。推しのりんくにとっても支えになりやすいのだ。'
    );
    tanu.push(
      'ヘビーやミドルが目立っても、ライトや一見さんの応援が薄いわけじゃないのだ。入り方は人それぞれなのだ。'
    );
  } else {
    konta.push(
      'ヘビーから一見まで、応援の入り方は人それぞれなのだ。「回数が少ない＝冷たい」にはならないのだ。'
    );
    tanu.push(
      'ここでの分類は、良いファン・悪いファンを決めるラベルじゃないのだ。並びや割合を整理するための目安に近いのだ。'
    );
  }

  const cards = [adviceCard('konta', 'こん太', konta), adviceCard('tanu', 'たぬ姉', tanu)];
  return `<div class="mkt-advice-after">${cards.join('')}</div>`;
}

/** ランキング直後
 * @param {MarketingReport} r */
function sectionAdviceAfterRank(r) {
  if (r.topUsers.length === 0) return '';
  return `<div class="mkt-advice-after">${adviceCard('tanu', 'たぬ姉', [
    'ランキングは表示順のためで、下の人ほど価値が低いという話にはならないのだ。拾えた記録の範囲での並びなのだ。',
  ])}</div>`;
}

/**
 * @param {MarketingReport} r
 * @param {{ maskShareLabels?: boolean }} [opts]
 * @returns {string}
 */
export function buildMarketingDashboardHtml(r, opts = {}) {
  const maskShare = opts.maskShareLabels === true;
  const subSuffix = maskShare ? ' · 共有向けに表示名を伏せた出力' : '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配信マーケ分析 — ${escapeHtml(r.liveId)}</title>
<style>${CSS_BODY}</style>
</head>
<body>
<header class="mkt-header">
<h1 class="mkt-header__title">📊 配信マーケティング分析</h1>
<p class="mkt-header__sub">${escapeHtml(r.liveId)} — ${new Date().toLocaleString('ja-JP')} 出力${escapeHtml(subSuffix)}</p>
</header>
<main class="mkt-main">
${sectionFeaturesOverview()}
${sectionAdviceIntro()}
${sectionKpi(r)}
${sectionAdviceAfterKpi(r)}
${sectionTimeline(r)}
${sectionAdviceAfterTimeline(r)}
${sectionSegment(r)}
${sectionAdviceAfterSegment(r)}
${sectionTopUsers(r, maskShare)}
${sectionAdviceAfterRank(r)}
${sectionHourHeatmap(r)}
</main>
<footer class="mkt-footer">追憶のきらめき · マーケ分析（手元用） — ${new Date().toISOString()}</footer>
</body></html>`;
}

/** @param {MarketingReport} r */
function sectionKpi(r) {
  const cards = [
    { label: '総コメント数', value: r.totalComments.toLocaleString(), icon: '💬' },
    { label: 'ユニークユーザー', value: r.uniqueUsers.toLocaleString(), icon: '👥' },
    { label: 'コメント/分', value: String(r.commentsPerMinute), icon: '⚡' },
    { label: '平均コメント/人', value: String(r.avgCommentsPerUser), icon: '📈' },
    { label: '中央値/人', value: String(r.medianCommentsPerUser), icon: '📊' },
    { label: '配信時間', value: `${r.durationMinutes} 分`, icon: '⏱️' },
    { label: 'ピーク分', value: `${r.peakMinute} 分目（${r.peakMinuteCount} コメ）`, icon: '🔥' }
  ];
  const inner = cards
    .map(
      (c) =>
        `<div class="mkt-kpi"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    )
    .join('');
  return `<section class="mkt-section"><h2>KPI サマリ</h2><div class="mkt-kpi-grid">${inner}</div></section>`;
}

/** @param {MarketingReport} r */
function sectionTimeline(r) {
  const tl = r.timeline;
  if (tl.length < 2) return '';
  const maxC = Math.max(1, ...tl.map((b) => b.count));
  const maxU = Math.max(1, ...tl.map((b) => b.uniqueUsers));
  const W = 900;
  const H = 220;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = tl.length;

  const barW = Math.max(1, Math.min(8, innerW / n - 1));
  const bars = tl
    .map((b, i) => {
      const x = pad + (innerW * i) / n;
      const h = (b.count / maxC) * innerH;
      return `<rect x="${x.toFixed(1)}" y="${(pad + innerH - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="#3b82f6" opacity="0.6"><title>${b.minute}分: ${b.count}コメ / ${b.uniqueUsers}人</title></rect>`;
    })
    .join('');

  const linePts = tl
    .map((b, i) => {
      const x = pad + (innerW * i) / n + barW / 2;
      const y = pad + innerH - (b.uniqueUsers / maxU) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const yLabelsC = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round((maxC * (4 - i)) / 4);
    const y = pad + (innerH * i) / 4;
    return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis">${v}</text>`;
  }).join('');

  const xLabels = tl
    .filter((_, i) => i % Math.max(1, Math.floor(n / 10)) === 0)
    .map((b) => {
      const x = pad + (innerW * b.minute) / n + barW / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${b.minute}m</text>`;
    })
    .join('');

  return `<section class="mkt-section">
<h2>コメントタイムライン</h2>
<p class="mkt-note">青バー＝コメント数/分 / オレンジ線＝ユニークユーザー数/分</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabelsC}${xLabels}${bars}
<polyline points="${linePts}" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
</svg>
</div></section>`;
}

/** @param {MarketingReport} r */
function sectionSegment(r) {
  const s = r.segmentCounts;
  const total = Math.max(1, s.heavy + s.mid + s.light + s.once);
  const segs = [
    { label: 'ヘビー（10+）', count: s.heavy, color: '#ef4444' },
    { label: 'ミドル（4-9）', count: s.mid, color: '#f97316' },
    { label: 'ライト（2-3）', count: s.light, color: '#3b82f6' },
    { label: '一見（1）', count: s.once, color: '#94a3b8' }
  ];

  const R = 80;
  const cx = 100;
  const cy = 100;
  let cumAngle = -Math.PI / 2;
  const paths = segs
    .map((sg) => {
      const pct = sg.count / total;
      if (pct <= 0) return '';
      const angle = pct * 2 * Math.PI;
      const x1 = cx + R * Math.cos(cumAngle);
      const y1 = cy + R * Math.sin(cumAngle);
      cumAngle += angle;
      const x2 = cx + R * Math.cos(cumAngle);
      const y2 = cy + R * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      return `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${sg.color}"><title>${sg.label}: ${sg.count}人 (${(pct * 100).toFixed(1)}%)</title></path>`;
    })
    .join('');

  const legend = segs
    .map(
      (sg) =>
        `<span class="mkt-leg"><span class="mkt-leg__dot" style="background:${sg.color}"></span>${escapeHtml(sg.label)} ${sg.count}人</span>`
    )
    .join('');

  return `<section class="mkt-section">
<h2>ユーザーセグメント</h2>
<p class="mkt-note">コメント回数でユーザーを4層に分類</p>
<div class="mkt-seg-wrap">
<svg viewBox="0 0 200 200" class="mkt-pie">${paths}</svg>
<div class="mkt-seg-legend">${legend}</div>
</div></section>`;
}

/**
 * @param {MarketingReport} r
 * @param {boolean} [maskShare] 共有向けに表示名を伏せ、サムネ URL を出さない
 */
function sectionTopUsers(r, maskShare = false) {
  if (r.topUsers.length === 0) return '';
  const maxCount = r.topUsers[0].count;
  const rows = r.topUsers.slice(0, 20)
    .map((u, i) => {
      const pct = (u.count / Math.max(1, maxCount)) * 100;
      const avImg =
        maskShare || !u.avatarUrl
          ? '<span class="mkt-rank-av mkt-rank-av--empty"></span>'
          : `<img src="${escapeHtml(u.avatarUrl)}" class="mkt-rank-av" alt="" loading="lazy">`;
      const rawName = u.nickname || u.userId || '—';
      const name = maskShare ? maskLabelForShare(rawName) : rawName;
      return `<tr>
<td class="mkt-rank-n">${i + 1}</td>
<td>${avImg}</td>
<td class="mkt-rank-name">${escapeHtml(name)}</td>
<td class="mkt-rank-bar"><div class="mkt-rank-bar__fill" style="width:${pct.toFixed(1)}%"></div><span class="mkt-rank-bar__label">${u.count}</span></td>
</tr>`;
    })
    .join('');

  const note = maskShare
    ? '<p class="mkt-note">共有向け: 表示名は伏せ字です。件数バーはそのままです（特定用途では件数もマスク検討ください）。</p>'
    : '';
  return `<section class="mkt-section">
<h2>トップコメンター TOP 20</h2>
${note}
<table class="mkt-rank-table"><tbody>${rows}</tbody></table>
</section>`;
}

/** @param {MarketingReport} r */
function sectionHourHeatmap(r) {
  const max = Math.max(1, ...r.hourDistribution);
  const cells = r.hourDistribution
    .map((v, h) => {
      const intensity = v / max;
      const alpha = Math.max(0.08, intensity);
      return `<div class="mkt-hour" style="background:rgba(59,130,246,${alpha.toFixed(2)})" title="${h}時: ${v}件"><span class="mkt-hour__label">${h}</span><span class="mkt-hour__val">${v}</span></div>`;
    })
    .join('');
  return `<section class="mkt-section">
<h2>時間帯ヒートマップ</h2>
<p class="mkt-note">コメントが多い時間帯ほど濃い青</p>
<div class="mkt-hour-grid">${cells}</div>
</section>`;
}

const CSS_BODY = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:'Segoe UI','Hiragino Sans',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6}
.mkt-header{padding:2rem 1.5rem 1rem;background:linear-gradient(135deg,#1e293b,#0f172a);border-bottom:1px solid #334155}
.mkt-header__title{margin:0;font-size:1.6rem;font-weight:700}
.mkt-header__sub{margin:.3rem 0 0;font-size:.85rem;color:#94a3b8}
.mkt-main{max-width:960px;margin:0 auto;padding:1.5rem 1rem}
.mkt-section{background:#1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;border:1px solid #334155}
.mkt-section h2{margin:0 0 .8rem;font-size:1.1rem;color:#f8fafc;border-left:4px solid #3b82f6;padding-left:.6rem}
.mkt-note{font-size:.78rem;color:#94a3b8;margin:0 0 .6rem}
.mkt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.8rem}
.mkt-kpi{background:#0f172a;border-radius:10px;padding:.8rem;text-align:center;border:1px solid #334155}
.mkt-kpi__icon{font-size:1.4rem;display:block}
.mkt-kpi__val{font-size:1.3rem;font-weight:700;display:block;color:#f8fafc}
.mkt-kpi__label{font-size:.72rem;color:#94a3b8}
.mkt-chart-wrap{overflow-x:auto}
.mkt-svg{width:100%;height:auto;max-height:260px}
.mkt-axis{font-size:10px;fill:#94a3b8}
.mkt-seg-wrap{display:flex;align-items:center;gap:2rem;flex-wrap:wrap}
.mkt-pie{width:180px;height:180px;flex-shrink:0}
.mkt-seg-legend{display:flex;flex-direction:column;gap:.5rem}
.mkt-leg{display:flex;align-items:center;gap:.4rem;font-size:.85rem}
.mkt-leg__dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}
.mkt-rank-table{width:100%;border-collapse:collapse}
.mkt-rank-table td{padding:.35rem .4rem;border-bottom:1px solid #1e293b}
.mkt-rank-n{width:2rem;color:#64748b;text-align:right;font-size:.8rem}
.mkt-rank-av{width:28px;height:28px;border-radius:50%;object-fit:cover;display:block}
.mkt-rank-av--empty{background:#334155}
.mkt-rank-name{font-size:.85rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkt-rank-bar{position:relative;height:22px;background:#0f172a;border-radius:4px;overflow:hidden}
.mkt-rank-bar__fill{height:100%;background:linear-gradient(90deg,#3b82f6,#6366f1);border-radius:4px}
.mkt-rank-bar__label{position:absolute;right:6px;top:2px;font-size:.75rem;color:#f8fafc;font-weight:600}
.mkt-hour-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:4px}
.mkt-hour{border-radius:6px;text-align:center;padding:.5rem .2rem;min-height:52px;display:flex;flex-direction:column;justify-content:center;border:1px solid #334155}
.mkt-hour__label{font-size:.7rem;color:#94a3b8}
.mkt-hour__val{font-size:.9rem;font-weight:600}
.mkt-footer{text-align:center;padding:1.5rem;font-size:.72rem;color:#475569}
.mkt-section--features h2{border-left-color:#34d399}
.mkt-lead{margin:0 0 .85rem;font-size:.88rem;color:#e2e8f0;line-height:1.65}
.mkt-feature-list{margin:.4rem 0 0;padding-left:1.15rem;color:#cbd5e1;font-size:.82rem;line-height:1.65}
.mkt-feature-list li{margin:.45rem 0 0}
.mkt-feature-list li:first-child{margin-top:0}
.mkt-values-note{margin:.95rem 0 0;padding-top:.85rem;border-top:1px solid #334155;font-size:.82rem;color:#94a3b8;line-height:1.65}
.mkt-section--advice h2{border-left-color:#a78bfa}
.mkt-advice-stack{display:flex;flex-direction:column;gap:clamp(.85rem,3vw,1.35rem)}
.mkt-advice-stack--intro{gap:clamp(1rem,3.5vw,1.5rem)}
.mkt-advice-after{display:flex;flex-direction:column;gap:clamp(.75rem,2.5vw,1rem);margin:.85rem 0 0}
.mkt-advice-row{display:flex;flex-direction:row;align-items:flex-start;gap:clamp(.65rem,2.5vw,.95rem);max-width:100%}
.mkt-advice__avatar-wrap{flex-shrink:0;width:clamp(48px,12vw,56px)}
.mkt-advice__avatar{width:clamp(48px,12vw,56px);height:clamp(48px,12vw,56px);object-fit:contain;display:block;border-radius:12px;background:#0f172a;border:1px solid #334155;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.mkt-advice__bubble{flex:1;min-width:0;position:relative;background:#0f172a;border:1px solid #334155;border-radius:14px;padding:clamp(.8rem,2.8vw,1.05rem) clamp(.85rem,3vw,1.15rem);box-shadow:0 2px 10px rgba(0,0,0,.12);overflow-wrap:break-word;word-wrap:break-word}
.mkt-advice__bubble::before{content:"";position:absolute;left:-7px;top:18px;width:12px;height:12px;background:#0f172a;border-left:1px solid #334155;border-bottom:1px solid #334155;transform:rotate(45deg)}
.mkt-advice--tanu .mkt-advice__bubble{border-top:1px solid rgba(196,181,253,.35)}
.mkt-advice--rink .mkt-advice__bubble{border-top:1px solid rgba(56,189,248,.35)}
.mkt-advice--konta .mkt-advice__bubble{border-top:1px solid rgba(251,146,60,.35)}
.mkt-advice--tanu .mkt-advice__bubble{border-left:3px solid #c4b5fd}
.mkt-advice--rink .mkt-advice__bubble{border-left:3px solid #38bdf8}
.mkt-advice--konta .mkt-advice__bubble{border-left:3px solid #fb923c}
.mkt-advice__name{font-size:clamp(.78rem,2.2vw,.85rem);font-weight:700;color:#f8fafc;margin:0 0 .5rem;letter-spacing:.02em;line-height:1.45}
.mkt-advice__p{margin:.55rem 0 0;font-size:clamp(.8rem,2.3vw,.875rem);color:#cbd5e1;line-height:1.8}
.mkt-advice__p:first-of-type{margin-top:0}
.mkt-advice__roles-hint{margin:clamp(.35rem,2vw,.25rem) 0 0;padding:clamp(.65rem,2.5vw,.85rem) clamp(.75rem,3vw,1rem);font-size:clamp(.74rem,2.1vw,.8rem);color:#94a3b8;line-height:1.75;background:#0f172a;border-radius:10px;border:1px dashed #475569}
@media(max-width:640px){
  .mkt-main{padding:1.1rem .75rem}
  .mkt-section{padding:1rem 1rem}
  .mkt-advice-row{gap:.7rem}
  .mkt-advice__bubble::before{top:14px}
}
@media(max-width:480px){
  .mkt-advice-row{flex-direction:column;align-items:stretch;gap:.5rem}
  .mkt-advice__bubble::before{display:none}
  .mkt-advice__avatar-wrap{align-self:flex-start;width:52px}
  .mkt-advice__avatar{width:52px;height:52px}
  .mkt-advice__bubble{padding:.85rem 1rem}
}
@media(max-width:640px){
  .mkt-kpi-grid{grid-template-columns:repeat(2,1fr)}
  .mkt-hour-grid{grid-template-columns:repeat(6,1fr)}
  .mkt-seg-wrap{flex-direction:column;align-items:flex-start}
}
`;
