/**
 * @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport
 * @typedef {import('./marketingAggregate.js').UserCommentProfile} UserCommentProfile
 * @typedef {import('./eventRankingReportModel.js').EventRankingReportModel} EventRankingReportModel
 */

import { escapeAttr, escapeHtml } from './htmlEscape.js';
import { maskLabelForShare } from './privacyDisplay.js';
import { MKT_ADVISOR_AVATAR_DATA_URI } from './marketingHtmlAdvisorAvatars.js';
import { yukkuriBroadcastSummaryEmbeddedCss } from './yukkuriBroadcastSummary.js';
import {
  buildMangaBroadcastPanels,
  renderMangaBroadcastPanelsHtml,
  mangaBroadcastSummaryEmbeddedCss
} from './mangaBroadcastSummary.js';
import { buildMarketingEmbedScriptInnerText } from './marketingReportEmbed.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';
import { displayUserLabel, UNKNOWN_USER_KEY } from './userRooms.js';
import { resolveReportUserThumbSrc } from './reportUserThumb.js';
import { categorizeUsersForThumbGrid } from './userThumbGrid.js';
import { NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS } from './supportGrowthTileSrc.js';
import { buildConcurrentTimelineSeries } from './concurrentTimelineSeries.js';
import { analyzeConcurrentPeak } from './concurrentPeakAnalysis.js';
import { detectCommentSilenceZones } from './commentSilenceZones.js';
import {
  buildCommentVelocityTimeline,
  buildLaughterDensityTimeline
} from './commentVelocityTimeline.js';
import {
  classifyCommentersAgainstHistory,
  findDepartedHeavyCommenters,
  buildCommenterAttendanceMatrix
} from './commenterHistoricalAnalytics.js';
import { buildCommenterSurvivalCurve } from './commenterSurvivalCurve.js';
import { diagnoseKeyboardTypes } from './keyboardTypeDiagnostic.js';
import {
  buildRecentBroadcastComparison,
  buildWeekdayHourHeatmap,
  computeBroadcastGrowthScore
} from './broadcastCrossCompare.js';
import { buildBroadcastNarrative } from './broadcastNarrativeBuilder.js';
import { buildOpeningFiveMinutePoints } from './openingFiveMinuteCorrelation.js';
import {
  buildBroadcastWaveformFingerprint,
  findSimilarBroadcasts
} from './broadcastWaveformFingerprint.js';
import {
  detectCommentPropagation,
  detectCommentSyncBursts
} from './commentEchoDetector.js';
import {
  buildCommenterFirstSecondLatency,
  detectTalentPeakMoments,
  scoreSentimentTimeline,
  suggestUniqueWords,
  computeReachCoefficient
} from './commenterCulturalAnalytics.js';
import { pickAdvicesFor } from './marketingDynamicAdvice.js';
import {
  buildSupportGrowthInsights,
  supportGrowthMetricsForAdvice
} from './supportGrowthInsights.js';
import { analyzeGiftMomentum } from './giftMomentumAnalytics.js';
import { analyzeAudienceEngagementGap } from './audienceEngagementGap.js';
import { buildSupporterChikuranRows } from './supporterChikuranScore.js';

const DEFAULT_USERICON_ONERROR_ATTR = `onerror="this.onerror=null;this.src='${escapeHtml(NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS)}'"`;

/**
 * @param {'tanu' | 'link' | 'konta'} role
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
    role === 'link' ? 'りんく' : role === 'konta' ? 'こん太' : 'たぬ姉';
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
<li><strong>本文・属性の傾向</strong> — 文字数の平均・中央値、URL/絵文字の含有、自分投稿・184 の割合、コメント間の最長インターバル</li>
<li><strong>累積と5分窓</strong> — 経過に沿った累積コメント数と、直近5分の件数の推移（盛り上がりの補助線）</li>
<li><strong>再生位置の三分割（vpos）</strong> — 記録に vpos が十分あるときだけ、早・中・遅の件数比</li>
<li><strong>冒頭・終盤の四分位</strong> — 時間幅の最初・最後の四分の一に現れた人数と、「両方にいた」人数の目安</li>
<li><strong>ページ末尾の JSON 埋め込み</strong> — 同じ .html 内に集計のコピーを入れてあり、表計算やツール連携に使えます（共有伏せ字時は JSON もマスク）</li>
</ul>
<p class="mkt-values-note"><strong>どんな配信も否定しません。</strong>静かな雑談も、わいわい型も、ゲーム特化も、歌枠も、それぞれに合ったスタイルがあります。<strong>そのスタイルに数字やメモで縛られる必要もありません。</strong>気になったところだけ眺めて、ひとつの視点・振り返りの補助として使ってください。</p>
</section>`;
}

/** ページ冒頭：この画面の限界と三人の登場（3人それぞれ吹き出し） */
function sectionAdviceIntro() {
  const cards = [
    adviceCard('link', 'りんく', [
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
  const linkLines = [
    'ピークの分やコメント／分は、枠のどこで盛り上がったかの目安になるのだ。全部のコメントに返せない日でも、波を知っておくと心の置きどころにはなるのだ。',
  ];
  if (r.peakMinuteCount >= 3 && r.durationMinutes >= 5) {
    linkLines.push(
      'ピークがはっきりしていれば、次の枠で企画を畳むタイミングの参考にするくらいの軽さで十分なのだ。'
    );
  }
  const cards = [adviceCard('link', 'りんく', linkLines)];

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

/** @param {number} ms */
function formatSilenceMs(ms) {
  if (ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}分${rem}秒` : `${m}分`;
}

/** @param {MarketingReport} r */
function sectionContentShape(r) {
  if (r.totalComments <= 0) return '';
  const ts = r.textStats;
  const i = r.is184;
  const silence = formatSilenceGapLabel(r.maxSilenceGapMs);
  const cards = [
    {
      label: '平均文字数（trim）',
      value: String(ts.avgChars),
      icon: '📝'
    },
    {
      label: '中央値文字数',
      value: String(ts.medianChars),
      icon: '📏'
    },
    {
      label: 'URL を含む割合',
      value: `${ts.pctWithUrl}%（${ts.withUrlCount}件）`,
      icon: '🔗'
    },
    {
      label: '絵文字を含む割合',
      value: `${ts.pctWithEmoji}%（${ts.withEmojiCount}件）`,
      icon: '😀'
    },
    {
      label: '自分投稿（selfPosted）',
      value: `${r.selfPostedPct}%（${r.selfPostedCount}件）`,
      icon: '🙋'
    },
    {
      label: '184（既知のみ）',
      value:
        i.knownCount > 0
          ? `${i.pctOfKnown}%（${i.count184}/${i.knownCount}件）`
          : 'データなし',
      icon: '🎭'
    },
    {
      label: '最長のコメント間隔',
      value: silence,
      icon: '⏸️'
    }
  ];
  const inner = cards
    .map(
      (c) =>
        `<div class="mkt-kpi mkt-kpi--compact"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    )
    .join('');
  return `<section class="mkt-section"><h2>コメント本文・属性の傾向</h2>
<p class="mkt-note">記録された本文のみを対象。184 は <code>is184</code> が付いている行だけで割合を計算します。</p>
<div class="mkt-kpi-grid">${inner}</div></section>`;
}

/**
 * @param {import('./broadcastNarrativeBuilder.js').BroadcastNarrative} narrative
 * @param {boolean} maskShare
 */
function sectionBroadcastNarrative(narrative, maskShare) {
  if (!narrative || !Array.isArray(narrative.segments) || narrative.segments.length === 0) {
    return '';
  }
  const segmentHtml = narrative.segments
    .map((seg) => {
      const keywords = maskShare
        ? '<span class="mkt-narrative-muted">共有向けでは話題語を省略</span>'
        : seg.keywords.length
        ? seg.keywords
            .map((word) => `<span class="mkt-narrative-keyword">${escapeHtml(word)}</span>`)
            .join('')
        : '<span class="mkt-narrative-muted">目立つ語は少なめ</span>';
      const samples =
        !maskShare && seg.sampleComments.length
          ? `<ul class="mkt-narrative-samples">${seg.sampleComments.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
          : '';
      return `<article class="mkt-narrative-card">
<div class="mkt-narrative-card__head">
<strong>${escapeHtml(seg.label)}</strong>
<span>${seg.startMinute}〜${seg.endMinute}分 / ${seg.commentCount}件 / ${seg.uniqueUsers}人</span>
</div>
<div class="mkt-narrative-keywords">${keywords}</div>
${samples}
</article>`;
    })
    .join('');
  const hints = narrative.improvementHints.length
    ? `<ul class="mkt-narrative-hints">${narrative.improvementHints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
    : '';
  const sampleNote = maskShare
    ? '<p class="mkt-note">共有向け出力では話題語と代表コメント本文を省略しています。</p>'
    : '';
  const summaryLine = maskShare
    ? `${narrative.peakSegmentLabel || '全体'}にコメントが最も集まりました。`
    : narrative.summaryLine;
  return `<section class="mkt-section mkt-section--narrative">
<h2>配信内容の流れ</h2>
<p class="mkt-lead">${escapeHtml(summaryLine)}</p>
${sampleNote}
<div class="mkt-narrative-grid">${segmentHtml}</div>
${hints ? `<h3 class="mkt-narrative-subhead">次回に活かすなら</h3>${hints}` : ''}
</section>`;
}

/** @param {number} ms */
function formatSilenceGapLabel(ms) {
  if (ms <= 0) return '—（1件以下または時刻なし）';
  return `${formatSilenceMs(ms)}（連続する2コメント間の最大）`;
}

/** @param {MarketingReport} r */
function sectionAdviceAfterContentShape(r) {
  if (r.totalComments <= 0) return '';
  const lines = [
    '文字数や URL の多さは「話題がリンクを伴いやすい」「短文連打」などの雑なヒントになることがあるのだ。数字だけで良し悪しは決めないでほしいのだ。',
  ];
  if (r.textStats.pctWithEmoji >= 25 && r.uniqueUsers >= 8) {
    lines.push('絵文字の比率が目立つときは、空気が柔らかい・リアクション中心の時間帯だった可能性があるのだ。');
  }
  return `<div class="mkt-advice-after">${adviceCard('tanu', 'たぬ姉', lines)}</div>`;
}

/** @param {MarketingReport} r */
function sectionQuarterEngagement(r) {
  if (r.totalComments <= 0 || !r.quarterEngagement) return '';
  const q = r.quarterEngagement;
  if (q.skippedShortSpan) {
    return `<section class="mkt-section"><h2>冒頭・終盤（四分位）</h2>
<p class="mkt-note">記録の時間幅が1分未満のため、最初・最後の四分の一に現れた人数の比較は出していません。長めの枠ほど指標が意味を持ちやすいです。</p></section>`;
  }
  const cards = [
    {
      label: '最初の1/4の時間帯にいた人',
      value: String(q.uniqueCommentersFirstQuarter),
      icon: '🌅'
    },
    {
      label: '最後の1/4の時間帯にいた人',
      value: String(q.uniqueCommentersLastQuarter),
      icon: '🌙'
    },
    {
      label: '冒頭にも終盤にもコメントした人',
      value: String(q.uniqueCommentersBothQuarters),
      icon: '🔁'
    }
  ];
  const inner = cards
    .map(
      (c) =>
        `<div class="mkt-kpi mkt-kpi--compact"><span class="mkt-kpi__icon">${c.icon}</span><span class="mkt-kpi__val">${escapeHtml(c.value)}</span><span class="mkt-kpi__label">${escapeHtml(c.label)}</span></div>`
    )
    .join('');
  return `<section class="mkt-section"><h2>冒頭・終盤（四分位）</h2>
<p class="mkt-note">記録の先頭から末尾までの<strong>実時間幅</strong>を4等分し、最初・最後の区間にコメントした<strong>ユニーク人数</strong>と、両方に現れた人数です（離脱や再訪の目安程度）。</p>
<div class="mkt-kpi-grid">${inner}</div></section>`;
}

/** @param {MarketingReport} r */
function sectionAdviceAfterQuarterEngagement(r) {
  if (r.totalComments <= 0 || !r.quarterEngagement || r.quarterEngagement.skippedShortSpan) {
    return '';
  }
  return `<div class="mkt-advice-after">${adviceCard('konta', 'こん太', [
    '「冒頭にも終盤にもいる」は、長く居てくれた可能性のヒントに過ぎないのだ。タブを開いたまま放置、など別の理由もありうるのだ。',
    '数字でファンの熱さを上下しないでほしいのだ。あくまで記録の出方を眺める補助だと思ってほしいのだ。',
  ])}</div>`;
}

/** @param {MarketingReport} r */
function sectionDerivedTimeline(r) {
  const tl = r.timeline;
  const cum = r.timelineCumulative;
  const roll = r.timelineRolling5Min;
  if (tl.length < 2 || cum.length !== tl.length || roll.length !== tl.length) return '';
  const maxC = Math.max(1, ...cum);
  const maxR = Math.max(1, ...roll);
  const W = 900;
  const H = 220;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = tl.length;

  const cumPts = cum
    .map((v, i) => {
      const x = pad + (innerW * (i + 0.5)) / n;
      const y = pad + innerH - (v / maxC) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const rollPts = roll
    .map((v, i) => {
      const x = pad + (innerW * (i + 0.5)) / n;
      const y = pad + innerH - (v / maxR) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const yLabelsL = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round((maxC * (4 - i)) / 4);
    const y = pad + (innerH * i) / 4;
    return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis mkt-axis--cum">${v}</text>`;
  }).join('');
  const yLabelsR = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round((maxR * (4 - i)) / 4);
    const y = pad + (innerH * i) / 4;
    return `<text x="${W - pad + 4}" y="${y + 4}" text-anchor="start" class="mkt-axis mkt-axis--roll">${v}</text>`;
  }).join('');

  const xLabels = tl
    .filter((_, i) => i % Math.max(1, Math.floor(n / 10)) === 0)
    .map((b) => {
      const x = pad + (innerW * (b.minute + 0.5)) / n;
      return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${b.minute}m</text>`;
    })
    .join('');

  return `<section class="mkt-section">
<h2>累積コメント数と5分窓</h2>
<p class="mkt-note">緑線＝累積件数 / 紫線＝その分を含む直近5分の合計（分単位の桶に対応）</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg" aria-label="累積と5分窓の折れ線">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabelsL}${yLabelsR}${xLabels}
<polyline points="${cumPts}" fill="none" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round"/>
<polyline points="${rollPts}" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 3"/>
</svg>
</div>
<p class="mkt-note mkt-note--legend"><span class="mkt-leg-inline" style="color:#22c55e">■</span> 累積 <span class="mkt-leg-inline" style="color:#a855f7">■</span> 5分窓（破線）</p>
</section>`;
}

/** @param {MarketingReport} r */
function sectionAdviceAfterDerivedTimeline(r) {
  if (r.timeline.length < 2) return '';
  return `<div class="mkt-advice-after">${adviceCard('link', 'りんく', [
    '紫の5分窓は「直近で一気に増えたか」の目安になるのだ。累積（緑）は単調に増えるから、波を読むなら紫の方が分かりやすいことが多いのだ。',
  ])}</div>`;
}

/** @param {MarketingReport} r */
function sectionVposThirds(r) {
  const v = r.vposThirds;
  if (!v || r.totalComments <= 0) return '';
  const total = v.early + v.mid + v.late;
  if (total <= 0) return '';
  const max = Math.max(1, v.early, v.mid, v.late);
  const W = 320;
  const H = 140;
  const pad = 28;
  const bw = 56;
  const gap = 40;
  const baseY = H - pad;
  const bars = [
    { label: '早い帯', n: v.early, x: pad },
    { label: '中間帯', n: v.mid, x: pad + bw + gap },
    { label: '遅い帯', n: v.late, x: pad + (bw + gap) * 2 }
  ]
    .map((b) => {
      const h = (b.n / max) * (H - pad * 2);
      const y = baseY - h;
      return `<rect x="${b.x}" y="${y}" width="${bw}" height="${h}" fill="#38bdf8" opacity="0.75" rx="4"><title>${b.label}: ${b.n}件</title></rect>
<text x="${b.x + bw / 2}" y="${baseY + 16}" text-anchor="middle" class="mkt-axis">${escapeHtml(b.label)}</text>
<text x="${b.x + bw / 2}" y="${y - 4}" text-anchor="middle" class="mkt-axis">${b.n}</text>`;
    })
    .join('');
  return `<section class="mkt-section">
<h2>再生位置（vpos）の三分割</h2>
<p class="mkt-note">vpos が付いたコメントが5件以上あるときだけ表示。最大 vpos を3等分して早・中・遅に振り分けています（アーカイブ視聴の目安）。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg mkt-svg--vpos" aria-label="vpos 三分割">${bars}</svg>
</div>
<p class="mkt-note">合計 ${total} 件（該当コメントのみ）</p>
</section>`;
}

/** タイムライン直後（チャートがあるときだけ）
 * @param {MarketingReport} r */
function sectionAdviceAfterTimeline(r) {
  if (r.timeline.length < 2) return '';
  return `<div class="mkt-advice-after">${adviceCard('link', 'りんく', [
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

/* ═══ 0.1.27 (AB): PRO 各セクションのキャラ解説（このデータで何がわかるか） ═══ */

/** @param {string} html */
function adviceWrap(html) {
  return html ? `<div class="mkt-advice-after">${html}</div>` : '';
}

/**
 * 0.1.49 (AE): marketingDynamicAdvice.js の rule registry に対し metrics を
 *   渡して「内容に応じて変わる」アドバイスを動的に描画する。固定アドバイス
 *   （adviceAfter*）の後ろに追加して、より具体的な助言を出す。
 *
 *   ルールが何もマッチしない場合は空文字を返すので、固定アドバイスだけが
 *   表示される（後方互換）。
 *
 * @param {string} section
 * @param {import('./marketingDynamicAdvice.js').AdviceMetrics} metrics
 * @returns {string}
 */
function dynamicAdviceCardsHtml(section, metrics) {
  /** @type {{character: 'link'|'konta'|'tanu', lines: string[]}[]} */
  let advices = [];
  try {
    advices = pickAdvicesFor(section, metrics);
  } catch {
    return '';
  }
  if (!advices.length) return '';
  const cards = advices
    .map((a) => {
      const displayName =
        a.character === 'link' ? 'りんく' : a.character === 'konta' ? 'こん太' : 'たぬ姉';
      return adviceCard(a.character, displayName, a.lines);
    })
    .join('');
  return adviceWrap(cards);
}

/**
 * 動的アドバイス用 metrics を集約データから組み立てる。
 * @param {{
 *   r: import('./marketingAggregate.js').MarketingReport,
 *   concurrentPeak: any,
 *   laughterDensity: any,
 *   silenceZones: any[],
 *   newVsRepeat: any,
 *   sentimentCurve: any,
 *   reach: any,
 *   growth: any,
 *   firstSecondLatency: any,
 *   survivalCurve: any,
 *   talentPeaks: any[],
 *   echoPropagation: any,
 *   echoSync: any,
 *   recentComparison: any,
 *   uniqueWords: any,
 *   similarBroadcasts: any[],
 *   keyboardTypes: any
 * }} opts
 * @returns {import('./marketingDynamicAdvice.js').AdviceMetrics}
 */
function buildDynamicAdviceMetrics(opts) {
  return {
    r: opts.r,
    peak: opts.concurrentPeak,
    laughter: opts.laughterDensity,
    silenceCount: Array.isArray(opts.silenceZones) ? opts.silenceZones.length : 0,
    silenceQualityCounts: (() => {
      /** @type {{engaged:number,departed:number,neutral:number,unknown:number}} */
      const counts = { engaged: 0, departed: 0, neutral: 0, unknown: 0 };
      const list = Array.isArray(opts.silenceZones) ? opts.silenceZones : [];
      for (const z of list) {
        const q = String(z?.quality || 'unknown');
        if (q === 'engaged') counts.engaged += 1;
        else if (q === 'departed') counts.departed += 1;
        else if (q === 'neutral') counts.neutral += 1;
        else counts.unknown += 1;
      }
      return counts;
    })(),
    newVsRepeat: opts.newVsRepeat
      ? {
          newRatio: Number(opts.newVsRepeat.newRatio) || 0,
          repeatRatio: Number(opts.newVsRepeat.repeatRatio) || 0,
          heavyRatio: Number(opts.newVsRepeat.heavyRatio) || 0,
          totalCurrent: Number(opts.newVsRepeat.totalCurrent) || 0
        }
      : null,
    sentimentTotals: opts.sentimentCurve?.totals
      ? {
          positive: Number(opts.sentimentCurve.totals.positive) || 0,
          negative: Number(opts.sentimentCurve.totals.negative) || 0,
          surprise: Number(opts.sentimentCurve.totals.surprise) || 0,
          confusion: Number(opts.sentimentCurve.totals.confusion) || 0
        }
      : null,
    reach: opts.reach
      ? { coefficient: Number(opts.reach.coefficient) || null }
      : null,
    growth: opts.growth
      ? {
          deltaPct: Number.isFinite(opts.growth.deltaPct) ? opts.growth.deltaPct : null,
          zScore: Number.isFinite(opts.growth.zScore) ? opts.growth.zScore : null,
          average: Number.isFinite(opts.growth.average) ? opts.growth.average : null
        }
      : null,
    firstSecondTotal:
      Number(opts.firstSecondLatency?.totalUsers) ||
      Number(opts.firstSecondLatency?.users?.length) ||
      0,
    survivalEndPct: (() => {
      const segs = opts.survivalCurve?.segments;
      if (!Array.isArray(segs) || segs.length === 0) return null;
      const last = segs[segs.length - 1];
      const v = Number(last?.survivalPct);
      return Number.isFinite(v) ? v : null;
    })(),
    talentPeakCount: Array.isArray(opts.talentPeaks) ? opts.talentPeaks.length : 0,
    echoBurstCount: (() => {
      const ep = opts.echoPropagation;
      const es = opts.echoSync;
      const a = Array.isArray(ep) ? ep.length : Array.isArray(ep?.bursts) ? ep.bursts.length : 0;
      const b = Array.isArray(es) ? es.length : Array.isArray(es?.bursts) ? es.bursts.length : 0;
      return a + b;
    })(),
    recentCmpCount: Array.isArray(opts.recentComparison?.bars) ? opts.recentComparison.bars.length : 0,
    uniqueWordsCount: Array.isArray(opts.uniqueWords?.suggestions) ? opts.uniqueWords.suggestions.length : 0,
    waveformSimilarCount: Array.isArray(opts.similarBroadcasts) ? opts.similarBroadcasts.length : 0,
    keyboardCounts: opts.keyboardTypes?.counts
      ? {
          emoji: Number(opts.keyboardTypes.counts.emoji) || 0,
          short: Number(opts.keyboardTypes.counts.short) || 0,
          long: Number(opts.keyboardTypes.counts.long) || 0,
          quiet: Number(opts.keyboardTypes.counts.quiet) || 0,
          balanced: Number(opts.keyboardTypes.counts.balanced) || 0
        }
      : null
  };
}

function adviceAfterCommentVelocity() {
  return adviceWrap(adviceCard('link', 'りんく', [
    'コメ速度カーブは「1分ごとに何コメ来たか」と「直近5分の平均」を重ねて見るカーブなのだ。',
    'ピークが出た分の前後を見直すと、「何のトピックで盛り上がったか」が手繰れるのだ。',
  ]));
}

function adviceAfterConcurrent() {
  return adviceWrap(adviceCard('link', 'りんく', [
    '同接推移カーブは、視聴維持の代わりになる指標なのだ。ピーク到達分・半減点・終了時保持率の 3 つを見るのだ。',
    '終了時保持率が高い枠は「最後まで残ってもらえた」枠で、半減点が早い枠は「序盤で抜けられた」可能性なのだ。',
  ]));
}

function adviceAfterSilence() {
  return adviceWrap(adviceCard('tanu', 'たぬ姉', [
    '沈黙＝悪ではないのだ。沈黙の質が "ガン見系" なら集中、"離脱系" なら盛り下がりの可能性なのだ。',
    '長い沈黙の前後コメを見直すと、配信の「曲がり角」が分かるのだ。',
  ]));
}

function adviceAfterLaughter() {
  return adviceWrap(adviceCard('konta', 'こん太', [
    '「笑い密度」は w / 草 / 8888 / 笑 等の出現を 30 秒粒度で見たやつなのだ。',
    '笑いが集中した瞬間がそのまま「ハイライト候補」になるから、配信の切り抜きヒントに使えるのだ。',
  ]));
}

function adviceAfterNewVsRepeat() {
  return adviceWrap(adviceCard('link', 'りんく', [
    '新規が多い枠＝集客がうまく回った枠、リピーターが多い枠＝コミュニティが厚い枠、なのだ。',
    '両方ある枠が理想だけど、どちらかに偏っても配信スタイルとして全然 OK なのだ。',
  ]));
}

function adviceAfterSurvival() {
  return adviceWrap(adviceCard('link', 'りんく', [
    'コメ参加維持率は「最初の区間にコメくれた人が、後半もコメしていたか」の割合なのだ。',
    '50% を切ったタイミングで何があったか、コメタイムラインと突き合わせると気づきがあるのだ。',
  ]));
}

function adviceAfterDeparted() {
  return adviceWrap(adviceCard('konta', 'こん太', [
    'ヘビーだった人が今回いない＝「離反」とは限らないのだ。タイミングが合わなかっただけかもしれないのだ。',
    '同じ人が 2 〜 3 回連続で出てきたら、X とかで一言挨拶してもいいタイミングなのだ。',
  ]));
}

function adviceAfterAttendance() {
  return adviceWrap(adviceCard('tanu', 'たぬ姉', [
    '出席カレンダーは「常連層が枠を選んでいるか／毎回いるか」が見えるのだ。',
    '横一列で●が並ぶ常連は、コミュニティの背骨なのだ。大事にしてほしいのだ。',
  ]));
}

function adviceAfterKeyboard() {
  return adviceWrap(adviceCard('tanu', 'たぬ姉', [
    'キーボード型は「ファン層の語り方」のざっくり傾向なのだ。短文派が多い枠は反応速度型、ロング派が多い枠は熟読型なのだ。',
    '無口観戦派は配信を見てるけどコメは控えめな層で、これも貴重なファンなのだ。',
  ]));
}

function adviceAfterRecentCmp() {
  return adviceWrap(adviceCard('link', 'りんく', [
    '直近 5 配信の比較バーは、自分の "調子のグラデーション" を一目で見るやつなのだ。',
    '高い／低いに一喜一憂しなくていいのだ。配信ジャンル・曜日・時間で振れるのが普通なのだ。',
  ]));
}

function adviceAfterWeekdayHeat() {
  return adviceWrap(adviceCard('konta', 'こん太', [
    '曜日 × 時間帯ヒートは「ファン層の活動時間」を浮き彫りにするのだ。濃い時間帯に配信を寄せると拾われやすいのだ。',
    '逆に「自分の生活リズムに合う時間」を優先するのも全然アリなのだ。',
  ]));
}

function adviceAfterGrowthMeter() {
  return adviceWrap(adviceCard('link', 'りんく', [
    '成長メーターは「過去平均との偏差」なのだ。±10% くらいは普通の揺らぎ、+50% 超えなら何かが効いた枠なのだ。',
    '低い回も、悪いわけじゃないのだ。ジャンル違い・短時間枠なら下がるのが自然なのだ。',
  ]));
}

function adviceAfterOpeningFive() {
  return adviceWrap(adviceCard('link', 'りんく', [
    '冒頭 5 分の CPM が「全体ピーク」と相関するなら、開始の掴みが効いている証拠なのだ。',
    '相関が弱い枠は「中盤・終盤の伸びる仕掛け」が機能している、というポジティブな解釈もあるのだ。',
  ]));
}

function adviceAfterWaveform() {
  return adviceWrap(adviceCard('tanu', 'たぬ姉', [
    '"似てる配信" は CPM カーブの形だけで類似度を測るのだ。コメ件数の多い少ないは関係ないのだ。',
    '形が同じ過去枠を見れば、「あの神回ぽい流れ」「あの落ち着いた回ぽい流れ」が言語化できるのだ。',
  ]));
}

function adviceAfterEcho() {
  return adviceWrap(adviceCard('konta', 'こん太', [
    'コメ伝染と被り瞬間は、ファン同士の "歓声同期" を見るやつなのだ。ニコ生独特のコメ文化の数値化なのだ。',
    'リスト上位の語が、その配信を象徴するキャッチフレーズになりやすいのだ。',
  ]));
}

function adviceAfterFirstSecond() {
  return adviceWrap(adviceCard('konta', 'こん太', [
    '初コメ→2コメ目までが速い人は「乗ってきた派」、長い人は「様子見派」、というファンの肌感の数値化なのだ。',
    '配信スタイルによって理想分布は変わるから、絶対的な良い悪いはないのだ。',
  ]));
}

function adviceAfterTalentPeak() {
  return adviceWrap(adviceCard('link', 'りんく', [
    '話芸ピーク＝沈黙が続いた直後にどっと反応が来た瞬間、なのだ。配信者のリアクションやトークが効いた可能性大なのだ。',
    'その瞬間のトーク内容を後で見返すと、自分の「効く弾」が見つかるのだ。',
  ]));
}

function adviceAfterSentiment() {
  return adviceWrap(adviceCard('konta', 'こん太', [
    '感情曲線は語彙辞書ベースの「ざっくり感情」なのだ。皮肉や文脈は読まないので、傾向だけ参考に見るのだ。',
    'ポジ・ネガが入れ替わった瞬間が、配信の起伏ポイントなのだ。',
  ]));
}

function adviceAfterUniqueWords() {
  return adviceWrap(adviceCard('tanu', 'たぬ姉', [
    '「視聴者発の人気語」は、配信中に視聴者側から自然に出ていた言葉なのだ。',
    '次回のタイトル・話題振り・返しに少し混ぜると、場の言葉に寄せやすいのだ。',
  ]));
}

function adviceAfterReach() {
  return adviceWrap(adviceCard('konta', 'こん太', [
    'リーチ係数は "1 コメンターあたり何人が観てるか" の目安なのだ。係数が大きいほどサイレント観戦層が厚い枠なのだ。',
    'コメ少なめでも、係数が高いなら「観てる人は多い」枠だから自信を持っていいのだ。',
  ]));
}

/**
 * 0.1.22 (W): TOC（目次）。各セクションの id に飛ぶアンカーリンク。
 * @param {Array<{ id: string, label: string }>} items
 */
function sectionToc(items) {
  if (!items || !items.length) return '';
  const lis = items
    .map(
      (it) =>
        `<li><a href="#${escapeHtml(it.id)}" class="mkt-toc__link">${escapeHtml(it.label)}</a></li>`
    )
    .join('');
  return `<nav class="mkt-section mkt-section--toc" aria-label="目次">
<h2>目次</h2>
<p class="mkt-note">各セクションへ飛べます（PRO 印は将来有料）</p>
<ol class="mkt-toc">${lis}</ol>
</nav>`;
}

/**
 * 0.1.22 (W): 同接推移カーブ（PRO）。
 * `broadcastSessionSummary_v1` IDB から取得した sessionRows から SVG line chart を構築。
 * 視聴維持率の代替指標として、ピーク到達分・半減点・終了保持率も併記。
 *
 * @param {import('./concurrentTimelineSeries.js').ConcurrentTimelineSeries} series
 * @param {import('./concurrentPeakAnalysis.js').ConcurrentPeakAnalysis} peak
 */
function sectionConcurrentTimeline(series, peak) {
  if (!series || series.points.length < 2) {
    return `<section class="mkt-section" id="mkt-concurrent">
<h2>同接推移カーブ <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">配信中の同接サンプル（来場者数の時系列）が <strong>2 サンプル以上</strong> 取れていれば描画されます。今回は ${series ? series.points.length : 0} サンプルのみです。</p>
</section>`;
  }
  const W = 900;
  const H = 220;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = series.points.length;
  const maxV = Math.max(1, series.maxValue);
  const lastMin = series.points[n - 1].minute;
  /** @param {number} i */
  const xOf = (i) => pad + (innerW * i) / Math.max(1, n - 1);
  /** @param {number} v */
  const yOf = (v) => pad + innerH - (v / maxV) * innerH;
  const linePts = series.points
    .map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`)
    .join(' ');
  const dots = series.points
    .map(
      (p, i) =>
        `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(p.value).toFixed(1)}" r="2.5" fill="#22d3ee"><title>${p.minute}分: ${p.value.toLocaleString('ja-JP')}人</title></circle>`
    )
    .join('');
  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round((maxV * (4 - i)) / 4);
    const y = pad + (innerH * i) / 4;
    return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis">${v.toLocaleString('ja-JP')}</text>`;
  }).join('');
  const xLabels = (() => {
    const step = Math.max(1, Math.floor(n / 8));
    return series.points
      .filter((_, i) => i % step === 0 || i === n - 1)
      .map((p, _idx) => {
        const i = series.points.indexOf(p);
        return `<text x="${xOf(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${p.minute}m</text>`;
      })
      .join('');
  })();
  const peakMarker =
    peak && typeof peak.peakMinute === 'number'
      ? (() => {
          const idx = series.points.findIndex((p) => p.minute === peak.peakMinute);
          if (idx < 0) return '';
          const x = xOf(idx);
          const y = yOf(peak.peakValue);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none" stroke="#fbbf24" stroke-width="2"><title>ピーク: ${peak.peakMinute}分目 / ${peak.peakValue.toLocaleString('ja-JP')}人</title></circle>`;
        })()
      : '';
  const halfDecayMarker =
    peak && typeof peak.halfDecayMinute === 'number'
      ? (() => {
          const idx = series.points.findIndex((p) => p.minute === peak.halfDecayMinute);
          if (idx < 0) return '';
          const x = xOf(idx);
          const y = yOf(series.points[idx].value);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="none" stroke="#f87171" stroke-width="2"><title>半減点: ${peak.halfDecayMinute}分目（ピークの 50% を割った）</title></circle>`;
        })()
      : '';
  // 0.1.47 (AC): hybrid モード（official+estimated 混在）でも適切に表示
  const sourceLabel =
    series.source === 'official'
      ? '公式来場者数'
      : series.source === 'mixed'
        ? '公式来場者数 + 同接推定値（取れた方を採用）'
        : '同接推定値';
  const peakSummary = peak && peak.peakMinute != null
    ? `<ul class="mkt-mini-stats">
<li><strong>ピーク到達:</strong> ${peak.peakMinute}分目 / ${peak.peakValue.toLocaleString('ja-JP')}人</li>
<li><strong>開始時:</strong> ${peak.startValue.toLocaleString('ja-JP')}人</li>
<li><strong>終了時:</strong> ${peak.endValue.toLocaleString('ja-JP')}人</li>
<li><strong>終了時保持率:</strong> ${peak.endRetentionRatio != null ? `${(peak.endRetentionRatio * 100).toFixed(1)}%` : '-'}（終了時 / ピーク）</li>
<li><strong>半減点:</strong> ${peak.halfDecayMinute != null ? `${peak.halfDecayMinute}分目` : '到達なし'}（ピークの 50% を割った最初の分）</li>
</ul>`
    : '';
  return `<section class="mkt-section" id="mkt-concurrent">
<h2>同接推移カーブ <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">${escapeHtml(sourceLabel)}を時系列で表示。黄丸＝ピーク / 赤丸＝半減点。${lastMin}分間で ${n} サンプル。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabels}${xLabels}
<polyline points="${linePts}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round"/>
${dots}${peakMarker}${halfDecayMarker}
</svg>
</div>
${peakSummary}
</section>`;
}

/**
 * 0.1.22 (W): コメ速度カーブ（CPM 1分粒度・5分 rolling）。
 * 既存 sectionTimeline はバーチャートで「コメ件数 + ユーザー数」を出すが、
 * こちらは滑らかな線グラフで CPM の変動を見やすく出す。
 * @param {import('./commentVelocityTimeline.js').CommentVelocityTimeline} series
 */
function sectionCommentVelocityCurve(series) {
  if (!series || series.buckets.length < 2) return '';
  const W = 900;
  const H = 200;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = series.buckets.length;
  const maxV = Math.max(1, series.peakValue);
  /** @param {number} i */
  const xOf = (i) => pad + (innerW * i) / Math.max(1, n - 1);
  /** @param {number} v */
  const yOfRaw = (v) => pad + innerH - (v / maxV) * innerH;
  const linePts = series.buckets
    .map((b, i) => `${xOf(i).toFixed(1)},${yOfRaw(b.count).toFixed(1)}`)
    .join(' ');
  const rollingPts = series.buckets
    .map((b, i) => `${xOf(i).toFixed(1)},${yOfRaw(b.rolling5).toFixed(1)}`)
    .join(' ');
  const yLabels = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round((maxV * (4 - i)) / 4);
    const y = pad + (innerH * i) / 4;
    return `<text x="${pad - 4}" y="${y + 4}" text-anchor="end" class="mkt-axis">${v}</text>`;
  }).join('');
  return `<section class="mkt-section" id="mkt-velocity">
<h2>コメ速度カーブ（CPM）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">水色＝1分ごとのコメ件数 / オレンジ点線＝5分移動平均。ピーク: ${series.peakMinute != null ? `${series.peakMinute}分目（${series.peakValue}件）` : '-'}</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabels}
<polyline points="${linePts}" fill="none" stroke="#38bdf8" stroke-width="1.6" stroke-linecap="round"/>
<polyline points="${rollingPts}" fill="none" stroke="#fb923c" stroke-width="2" stroke-dasharray="4 3"/>
</svg>
</div></section>`;
}

/**
 * 0.1.22 (W): 沈黙ゾーン（連続 60 秒以上のコメ無し区間）+ L2 沈黙の質判定。
 * @param {import('./commentSilenceZones.js').CommentSilenceZone[] | null | undefined} zones
 */
function sectionSilenceZones(zones) {
  if (!Array.isArray(zones) || zones.length === 0) return '';
  const sorted = [...zones].sort((a, b) => b.durationMs - a.durationMs);
  const top = sorted.slice(0, 10);
  /** @param {string} q */
  const qualityLabel = (q) =>
    q === 'engaged' ? 'ガン見系（皆ガン見・話芸ピーク候補）'
    : q === 'departed' ? '離脱系（盛り下がり）'
    : q === 'neutral' ? 'ふつう'
    : '判定なし';
  /** @param {string} q */
  const qualityColor = (q) =>
    q === 'engaged' ? '#22c55e'
    : q === 'departed' ? '#ef4444'
    : q === 'neutral' ? '#94a3b8'
    : '#64748b';
  const rows = top
    .map((z) => {
      const sec = Math.round(z.durationMs / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      const dur = m > 0 ? `${m}分${s}秒` : `${s}秒`;
      const color = qualityColor(z.quality);
      return `<tr>
<td>${escapeHtml(dur)}</td>
<td><span class="mkt-quality-pill" style="background:${color}">${escapeHtml(qualityLabel(z.quality))}</span></td>
<td>${z.afterCount}</td>
<td class="mkt-mono">${escapeHtml(z.beforeText)}</td>
<td class="mkt-mono">${escapeHtml(z.afterText)}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-silence">
<h2>沈黙ゾーン × 沈黙の質 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">60 秒以上コメが流れなかった区間 ${zones.length} 件のうち、長い順に最大 10 件。沈黙後 30 秒以内のコメ件数で「ガン見系（5+件）」「離脱系（0-1件）」「ふつう（2-4件）」に分類（ラテラル分析 L2）。</p>
<table class="mkt-rank">
<thead><tr><th>長さ</th><th>沈黙の質</th><th>直後30秒のコメ数</th><th>沈黙直前のコメ</th><th>沈黙明けのコメ</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.22 (W): L4 笑い密度（盛り上がり指標）。
 * 30 秒粒度の笑い系コメ件数とその比率を時系列で。
 * @param {import('./commentVelocityTimeline.js').LaughterDensityTimeline} laugh
 */
function sectionLaughterDensity(laugh) {
  if (!laugh || laugh.buckets.length < 2) return '';
  const W = 900;
  const H = 180;
  const pad = 36;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = laugh.buckets.length;
  const maxV = Math.max(1, laugh.peakValue);
  /** @param {number} i */
  const xOf = (i) => pad + (innerW * i) / Math.max(1, n - 1);
  const barW = Math.max(1, Math.min(8, innerW / n - 1));
  const bars = laugh.buckets
    .map((b, i) => {
      const x = xOf(i);
      const h = (b.count / maxV) * innerH;
      const halfMin = Math.floor(b.minute / 2);
      const halfSec = (b.minute % 2) * 30;
      return `<rect x="${x.toFixed(1)}" y="${(pad + innerH - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="#fbbf24" opacity="0.85"><title>${halfMin}分${halfSec}秒〜: 笑い ${b.count}件 / 総 ${b.total}件 (${(b.ratio * 100).toFixed(0)}%)</title></rect>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-laughter">
<h2>笑い密度（盛り上がり指標）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">w / 草 / 8888 / 笑 / 爆笑 / ワロタ 等の出現を 30 秒粒度で。全体の笑い比率 ${(laugh.overallRatio * 100).toFixed(1)}% / ピーク: ${laugh.peakBucket != null ? `${Math.floor(laugh.peakBucket / 2)}分${(laugh.peakBucket % 2) * 30}秒〜` : '-'}（${laugh.peakValue}件）（ラテラル分析 L4）</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${bars}
</svg>
</div></section>`;
}

/**
 * 0.1.23 (X): 新規 vs 常連分類セクション。
 * @param {ReturnType<typeof classifyCommentersAgainstHistory>} c
 */
function sectionNewVsRepeat(c) {
  if (!c || c.totalCurrent === 0) return '';
  /** @param {number} n */
  const pct = (n) => `${(n * 100).toFixed(1)}%`;
  return `<section class="mkt-section" id="mkt-new-vs-repeat">
<h2>新規 vs 常連 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">過去の記録した配信と突合して、今回のコメンターを 3 区分に分類（過去 5+ コメ実績ありが「ヘビー常連」）。${c.totalCurrent} 名中。</p>
<table class="mkt-rank">
<thead><tr><th>分類</th><th>人数</th><th>比率</th></tr></thead>
<tbody>
<tr><th>新規（このアカウントで初めて記録）</th><td>${c.newCount}</td><td>${pct(c.newRatio)}</td></tr>
<tr><th>リピーター（過去にも記録あり）</th><td>${c.repeatCount}</td><td>${pct(c.repeatRatio)}</td></tr>
<tr><th>うちヘビー常連（過去 5+ コメ）</th><td>${c.heavyCount}</td><td>${pct(c.heavyRatio)}</td></tr>
</tbody>
</table>
</section>`;
}

/**
 * 0.1.23 (X): コメンター生存曲線（B6）。
 * @param {ReturnType<typeof buildCommenterSurvivalCurve>} curve
 */
function sectionSurvivalCurve(curve) {
  if (!curve || curve.segments.length < 2) return '';
  const W = 900;
  const H = 200;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = curve.segments.length;
  /** @param {number} i */
  const xOf = (i) => pad + (innerW * i) / Math.max(1, n - 1);
  /** @param {number} pct */
  const yOf = (pct) => pad + innerH - (Math.min(100, pct) / 100) * innerH;
  const linePts = curve.segments
    .map((s, i) => `${xOf(i).toFixed(1)},${yOf(s.retentionPct).toFixed(1)}`)
    .join(' ');
  const dots = curve.segments
    .map(
      (s, i) =>
        `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(s.retentionPct).toFixed(1)}" r="3" fill="#a78bfa"><title>区間${i + 1} (${s.startMin}〜${s.endMin}分): ${s.retentionPct}% (${s.presentCount}名)</title></circle>`
    )
    .join('');
  const xLabels = curve.segments
    .map(
      (s, i) =>
        `<text x="${xOf(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${s.startMin}m</text>`
    )
    .join('');
  const yLabels = [0, 25, 50, 75, 100]
    .map(
      (v) =>
        `<text x="${pad - 4}" y="${yOf(v) + 4}" text-anchor="end" class="mkt-axis">${v}%</text>`
    )
    .join('');
  return `<section class="mkt-section" id="mkt-survival">
<h2>コメンター生存曲線 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">配信を ${n} 等分し、最初の区間に居た「base ${curve.baseUserCount} 名」のうち各区間にも居た % を表示。「コメント参加維持率」=コメ書く層の残存。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${yLabels}${xLabels}
<polyline points="${linePts}" fill="none" stroke="#a78bfa" stroke-width="2"/>
${dots}
</svg>
</div></section>`;
}

/**
 * 0.1.23 (X): 離反コメンター TOP（L8）。0.1.27 (AB) でサムネ列とユーザー ID 列を追加。
 * @param {ReturnType<typeof findDepartedHeavyCommenters>} departed
 * @param {boolean} maskShare
 * @param {((uid: string) => string) | undefined} identiconResolver
 */
function sectionDepartedHeavy(departed, maskShare, identiconResolver) {
  if (!Array.isArray(departed) || departed.length === 0) return '';
  if (maskShare) return ''; // 個人特定リストなので共有モードでは出さない
  const rows = departed
    .map((d, i) => {
      // 0.1.34 (AI): 過去配信から拾えた nickname を表示する
      const labelHtml = buildUserProfileLinkedLabelHtml(
        d.userId,
        displayUserLabel(d.userId, d.nickname || '')
      );
      // 0.1.27 (AB): 数値 ID なら CDN usericon、a:プレフィックスなら identicon
      // を出す。avatarUrl は離反者なので過去配信のものが来る保証がないため、
      // identicon / CDN URL のみで解決する。
      const thumbSrc = resolveReportUserThumbSrc({
        userId: d.userId,
        avatarUrl: '',
        identiconResolver
      });
      const thumbCell = thumbSrc
        ? `<img class="mkt-departed-thumb" src="${escapeHtml(thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>`
        : '<span class="mkt-departed-thumb mkt-departed-thumb--empty"></span>';
      return `<tr>
<td>${i + 1}</td>
<td>${thumbCell}</td>
<td>${labelHtml}</td>
<td class="mkt-mono">${escapeHtml(d.userId)}</td>
<td>${d.totalComments}</td>
<td>${d.broadcastCount}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-departed">
<h2>離反コメンター TOP <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">過去の配信で 5+ コメだったが、今回は記録に居ないユーザー（ラテラル分析 L8）。引き留め / 復帰アプローチの候補。</p>
<p class="mkt-spec-note">※ 表示名・サムネはコメ記録時点のもの（仕様）。配信者がハンドルを変えた場合、niconico 側の最新と異なることがあります。ID クリックで現在のユーザーページに移動します。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>サムネ</th><th>ユーザー</th><th>ID</th><th>過去累計コメ</th><th>過去参加放送数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.23 (X): 常連出席カレンダー（L9）。0.1.27 (AB) でサムネ列を追加。
 * @param {ReturnType<typeof buildCommenterAttendanceMatrix>} matrix
 * @param {boolean} maskShare
 * @param {((uid: string) => string) | undefined} identiconResolver
 */
function sectionAttendanceMatrix(matrix, maskShare, identiconResolver) {
  if (!matrix || matrix.users.length === 0 || matrix.broadcasts.length < 2) return '';
  if (maskShare) return '';
  const headCols = matrix.broadcasts
    .map((b, i) => `<th title="${escapeHtml(b.liveId)}">配信${i + 1}</th>`)
    .join('');
  const rows = matrix.users
    .map((u) => {
      // 0.1.34 (AI): 過去配信から拾えた nickname を表示する
      const labelHtml = buildUserProfileLinkedLabelHtml(
        u.userId,
        displayUserLabel(u.userId, u.nickname || '')
      );
      const thumbSrc = resolveReportUserThumbSrc({
        userId: u.userId,
        avatarUrl: '',
        identiconResolver
      });
      const thumbCell = thumbSrc
        ? `<img class="mkt-departed-thumb" src="${escapeHtml(thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}>`
        : '<span class="mkt-departed-thumb mkt-departed-thumb--empty"></span>';
      const cells = u.attendance
        .map(
          (v) =>
            v
              ? '<td class="mkt-att-cell mkt-att-cell--on" aria-label="出席">●</td>'
              : '<td class="mkt-att-cell mkt-att-cell--off" aria-label="不参加">·</td>'
        )
        .join('');
      return `<tr>
<td>${thumbCell}</td>
<td>${labelHtml}</td>
${cells}
<td>${u.totalComments}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-attendance">
<h2>常連出席カレンダー <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">直近 ${matrix.broadcasts.length} 配信 × TOP ${matrix.users.length} コメンター（ラテラル分析 L9）。● = 出席 / · = 不参加。各列の横軸は左→右が古→新。</p>
<p class="mkt-spec-note">※ 表示名・サムネはコメ記録時点のもの（仕様）。配信者がハンドルを変えた場合、niconico 側の最新と異なることがあります。</p>
<div class="mkt-chart-wrap">
<table class="mkt-rank mkt-attendance">
<thead><tr><th>サムネ</th><th>ユーザー</th>${headCols}<th>累計</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div></section>`;
}

/**
 * 0.1.23 (X): キーボード型診断（L12）。
 * @param {ReturnType<typeof diagnoseKeyboardTypes>} report
 */
function sectionKeyboardTypes(report) {
  if (!report) return '';
  const { counts } = report;
  const total =
    counts.emoji + counts.short + counts.long + counts.quiet + counts.balanced;
  if (total === 0) return '';
  /** @param {number} n */
  const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
  const labels = {
    emoji: '絵文字派（絵文字率 30%+）',
    short: '短文派（平均 5字未満）',
    long: 'ロング派（平均 25字以上）',
    quiet: '無口観戦派（1コメ以下）',
    balanced: 'バランス派'
  };
  const colors = {
    emoji: '#fb923c',
    short: '#22c55e',
    long: '#a78bfa',
    quiet: '#94a3b8',
    balanced: '#3b82f6'
  };
  const rows = /** @type {Array<keyof typeof labels>} */ (
    ['emoji', 'short', 'long', 'long', 'quiet', 'balanced']
  )
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .map((k) => {
      return `<tr>
<td><span class="mkt-leg__dot" style="background:${colors[k]}"></span> ${escapeHtml(labels[k])}</td>
<td>${counts[k]}</td>
<td>${pct(counts[k])}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-keyboard">
<h2>キーボード型診断 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">コメンター ${total} 名を 5 つの型に自動分類（ラテラル分析 L12）。配信スタイルとファン層の傾向把握用。</p>
<table class="mkt-rank">
<thead><tr><th>型</th><th>人数</th><th>比率</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.24 (Y): 直近 N 配信の比較バー。
 * @param {ReturnType<typeof buildRecentBroadcastComparison>} cmp
 */
function sectionRecentComparison(cmp) {
  if (!cmp || cmp.bars.length < 2) return '';
  const W = 900;
  const H = 220;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = cmp.bars.length;
  const maxC = Math.max(1, ...cmp.bars.map((b) => b.totalComments));
  const maxU = Math.max(1, ...cmp.bars.map((b) => b.uniqueUsers));
  const groupW = innerW / n;
  const barW = Math.max(2, groupW / 3 - 2);
  const bars = cmp.bars
    .map((b, i) => {
      const xBase = pad + groupW * i + (groupW - barW * 2 - 2) / 2;
      const hC = (b.totalComments / maxC) * innerH;
      const hU = (b.uniqueUsers / maxU) * innerH;
      const labelX = pad + groupW * i + groupW / 2;
      const liveLabel = b.liveId.length > 12 ? `${b.liveId.slice(0, 11)}…` : b.liveId;
      return `<rect x="${xBase.toFixed(1)}" y="${(pad + innerH - hC).toFixed(1)}" width="${barW}" height="${hC.toFixed(1)}" fill="#3b82f6" opacity="0.85"><title>${b.liveId}: ${b.totalComments}コメ / ${b.durationMin}分</title></rect>
<rect x="${(xBase + barW + 2).toFixed(1)}" y="${(pad + innerH - hU).toFixed(1)}" width="${barW}" height="${hU.toFixed(1)}" fill="#22c55e" opacity="0.85"><title>${b.liveId}: ${b.uniqueUsers}人</title></rect>
<text x="${labelX.toFixed(1)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">${escapeHtml(liveLabel)}</text>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-recent-cmp">
<h2>直近 ${n} 配信の比較 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">青＝総コメ数、緑＝ユニークコメンター数。古→新で左から並びます。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${bars}
</svg>
</div></section>`;
}

/**
 * 0.1.24 (Y): 曜日 × 時間帯 ヒートマップ（横断）。
 * @param {ReturnType<typeof buildWeekdayHourHeatmap>} heat
 */
function sectionWeekdayHourHeatmap(heat) {
  if (!heat || heat.maxValue === 0) return '';
  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  const cells = heat.matrix
    .map((row, dow) => {
      const tds = row
        .map((v, h) => {
          const intensity = heat.maxValue > 0 ? v / heat.maxValue : 0;
          const bg = `rgba(59, 130, 246, ${intensity.toFixed(2)})`;
          return `<td class="mkt-heat-cell" style="background:${bg}" title="${dayLabels[dow]}曜 ${h}時: ${v}件">${v > 0 ? v : ''}</td>`;
        })
        .join('');
      return `<tr><th>${dayLabels[dow]}</th>${tds}</tr>`;
    })
    .join('');
  const hourCols = Array.from({ length: 24 }, (_, h) => `<th>${h}</th>`).join('');
  return `<section class="mkt-section" id="mkt-weekday-heat">
<h2>曜日 × 時間帯 ヒートマップ <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">過去全配信を横断したコメ密度。最も濃い時間帯がアクティブな視聴者層の活動時間。</p>
<div class="mkt-chart-wrap">
<table class="mkt-rank mkt-heatmap">
<thead><tr><th></th>${hourCols}</tr></thead>
<tbody>${cells}</tbody>
</table>
</div></section>`;
}

/**
 * 0.1.24 (Y): 成長メーター（過去 N 配信平均との偏差）。
 * @param {ReturnType<typeof computeBroadcastGrowthScore>} growth
 * @param {string} label
 */
function sectionGrowthMeter(growth, label) {
  if (!growth || growth.average == null) return '';
  const deltaPct = growth.deltaPct != null ? `${(growth.deltaPct * 100).toFixed(1)}%` : '-';
  const z = growth.zScore != null ? growth.zScore.toFixed(2) : '-';
  const sign = growth.deltaPct != null && growth.deltaPct > 0 ? '＋' : '';
  return `<section class="mkt-section" id="mkt-growth-meter">
<h2>成長メーター <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">${escapeHtml(label)}：過去配信の平均（${growth.average}）と比べて<strong>${sign}${escapeHtml(deltaPct)}</strong>（z-score=${escapeHtml(z)}）。</p>
<table class="mkt-rank">
<thead><tr><th>指標</th><th>値</th></tr></thead>
<tbody>
<tr><th>過去平均</th><td>${growth.average}</td></tr>
<tr><th>標準偏差</th><td>${growth.stdDev}</td></tr>
<tr><th>偏差（%）</th><td>${escapeHtml(deltaPct)}</td></tr>
<tr><th>z-score</th><td>${escapeHtml(z)}</td></tr>
</tbody>
</table>
</section>`;
}

/**
 * 0.1.24 (Y): 冒頭 5 分の予兆 → ピーク CPM 散布図（ラテラル L13）。
 * @param {ReturnType<typeof buildOpeningFiveMinutePoints>} pts
 */
function sectionOpeningFivePrediction(pts) {
  if (!pts || pts.points.length < 2) return '';
  const W = 600;
  const H = 240;
  const pad = 40;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const maxX = Math.max(1, ...pts.points.map((p) => p.openingCpm));
  const maxY = Math.max(1, ...pts.points.map((p) => p.peakCpm));
  /** @param {number} v */
  const xOf = (v) => pad + (innerW * v) / maxX;
  /** @param {number} v */
  const yOf = (v) => pad + innerH - (innerH * v) / maxY;
  const dots = pts.points
    .map(
      (p) =>
        `<circle cx="${xOf(p.openingCpm).toFixed(1)}" cy="${yOf(p.peakCpm).toFixed(1)}" r="4" fill="#a855f7" opacity="0.7"><title>${p.liveId}: 冒頭 ${p.openingCpm} CPM → ピーク ${p.peakCpm} CPM</title></circle>`
    )
    .join('');
  const corrLabel =
    pts.correlation != null
      ? `相関係数 r=${pts.correlation.toFixed(2)}（${pts.correlation > 0.5 ? '強い正の相関' : pts.correlation > 0.2 ? '弱い正の相関' : '相関弱'}）`
      : '相関は要件不足';
  return `<section class="mkt-section" id="mkt-opening-five">
<h2>冒頭 5 分の予兆 → ピーク（ラテラル L13）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">横軸＝冒頭 5 分の CPM、縦軸＝全体ピーク CPM。${escapeHtml(corrLabel)}。配信開始 5 分の盛り上がりが結果に効くかの仮説検証。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
<text x="${(W / 2).toFixed(0)}" y="${H - 4}" text-anchor="middle" class="mkt-axis">冒頭 5 分の CPM</text>
<text x="12" y="${(H / 2).toFixed(0)}" text-anchor="middle" class="mkt-axis" transform="rotate(-90, 12, ${(H / 2).toFixed(0)})">ピーク CPM</text>
${dots}
</svg>
</div></section>`;
}

/**
 * 0.1.24 (Y): コメ波形フィンガープリント（ラテラル L3）。
 * @param {ReturnType<typeof findSimilarBroadcasts>} similar
 */
function sectionWaveformSimilarity(similar) {
  if (!Array.isArray(similar) || similar.length === 0) return '';
  const rows = similar
    .map(
      (s, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(s.liveId)}</td>
<td>${(s.similarity * 100).toFixed(1)}%</td>
<td>${s.totalCount}</td>
</tr>`
    )
    .join('');
  return `<section class="mkt-section" id="mkt-waveform">
<h2>似てる配信（コメ波形指紋）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">CPM カーブを 16 次元ベクトルにしてコサイン類似度で比較（ラテラル分析 L3）。盛り上がり方の "形" が今回と似ている過去配信。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>liveId</th><th>類似度</th><th>総コメ</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.25 (Z): コメ伝染（L1）+ コメ被り（L5）。
 * @param {ReturnType<typeof detectCommentPropagation>} propagation
 * @param {ReturnType<typeof detectCommentSyncBursts>} sync
 */
function sectionEchoBursts(propagation, sync) {
  if ((!propagation || propagation.length === 0) && (!sync || sync.length === 0)) return '';
  const propRows = (propagation || [])
    .slice(0, 10)
    .map(
      (b, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(b.text)}</td>
<td>${b.userCount}</td>
<td>${b.commentCount}</td>
<td>${Math.round((b.lastAt - b.firstAt) / 1000)}秒</td>
</tr>`
    )
    .join('');
  const syncRows = (sync || [])
    .slice(0, 10)
    .map(
      (b, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(b.text)}</td>
<td>${b.userCount}</td>
<td>${b.commentCount}</td>
</tr>`
    )
    .join('');
  return `<section class="mkt-section" id="mkt-echo">
<h2>コメ伝染 × コメ被り <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">短時間に同じ語が複数ユーザーから出る瞬間を 2 通りの粒度で検出（ラテラル分析 L1 / L5）。</p>
${propRows ? `<h3 style="font-size:.95rem;margin:.6rem 0 .4rem">伝染（30秒窓・3名以上、L1）</h3>
<table class="mkt-rank">
<thead><tr><th>#</th><th>語</th><th>ユーザー数</th><th>件数</th><th>持続</th></tr></thead>
<tbody>${propRows}</tbody>
</table>` : ''}
${syncRows ? `<h3 style="font-size:.95rem;margin:.8rem 0 .4rem">被り瞬間（5秒窓・3名以上、L5）</h3>
<table class="mkt-rank">
<thead><tr><th>#</th><th>語</th><th>ユーザー数</th><th>件数</th></tr></thead>
<tbody>${syncRows}</tbody>
</table>` : ''}
</section>`;
}

/**
 * 0.1.25 (Z): 初コメ → 2 コメ目 latency（L6）。
 * @param {ReturnType<typeof buildCommenterFirstSecondLatency>} latency
 */
function sectionFirstSecondLatency(latency) {
  if (!latency || latency.totalUsers === 0) return '';
  const max = Math.max(1, ...Object.values(latency.distribution));
  const labels = Object.keys(latency.distribution);
  const rows = labels
    .map((k) => {
      const v = latency.distribution[k];
      const w = Math.round((v / max) * 100);
      return `<tr>
<th>${escapeHtml(k)}</th>
<td><div class="mkt-bar"><span class="mkt-bar__fill" style="width:${w}%;background:#0ea5e9"></span></div></td>
<td>${v}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-first-second">
<h2>初コメ → 2 コメ目 latency <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">2 コメ目を打ったユーザー ${latency.totalUsers} 名の「最初のコメから 2 コメ目までの間隔」分布（ラテラル分析 L6）。短いほど "乗ってきた" 派、長いほど "様子見" 派。</p>
<table class="mkt-rank">
<thead><tr><th>区間</th><th>分布</th><th>件数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.25 (Z): 配信者の話芸ピーク（L10）。
 * @param {ReturnType<typeof detectTalentPeakMoments>} moments
 */
function sectionTalentPeak(moments) {
  if (!Array.isArray(moments) || moments.length === 0) return '';
  const rows = moments
    .slice(0, 10)
    .map(
      (m, i) => `<tr>
<td>${i + 1}</td>
<td>${Math.round(m.silenceMs / 1000)}秒</td>
<td>${m.afterCount}</td>
</tr>`
    )
    .join('');
  return `<section class="mkt-section" id="mkt-talent-peak">
<h2>配信者の話芸ピーク <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">沈黙（60秒以上）→ 30秒以内に 5+ コメ反応 = 配信者の話芸／リアクション要素が即効性を出した瞬間（ラテラル分析 L10）。${moments.length} 件検出。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>沈黙の長さ</th><th>沈黙明け 30秒の反応コメ数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.25 (Z): 感情曲線（L11）。
 * @param {ReturnType<typeof scoreSentimentTimeline>} sentiment
 */
function sectionSentimentCurve(sentiment) {
  if (!sentiment || sentiment.buckets.length < 2) return '';
  const W = 900;
  const H = 200;
  const pad = 36;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const n = sentiment.buckets.length;
  const maxV = Math.max(
    1,
    ...sentiment.buckets.flatMap((b) => [b.positive, b.negative, b.surprise, b.confusion])
  );
  /** @param {number} i */
  const xOf = (i) => pad + (innerW * i) / Math.max(1, n - 1);
  /** @param {number} v */
  const yOf = (v) => pad + innerH - (innerH * v) / maxV;
  /** @param {keyof Pick<typeof sentiment.buckets[number], 'positive' | 'negative' | 'surprise' | 'confusion'>} key
   *  @param {string} color */
  const lineFor = (key, color) => {
    const pts = sentiment.buckets.map((b, i) => `${xOf(i).toFixed(1)},${yOf(b[key]).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>`;
  };
  return `<section class="mkt-section" id="mkt-sentiment">
<h2>感情曲線 <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">語彙辞書ベースで「ポジ／ネガ／驚き／困惑」を 1 分粒度で時系列表示（ラテラル分析 L11）。総計：ポジ ${sentiment.totals.positive} / ネガ ${sentiment.totals.negative} / 驚き ${sentiment.totals.surprise} / 困惑 ${sentiment.totals.confusion}。</p>
<div class="mkt-chart-wrap">
<svg viewBox="0 0 ${W} ${H}" class="mkt-svg">
<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>
${lineFor('positive', '#22c55e')}
${lineFor('negative', '#ef4444')}
${lineFor('surprise', '#fbbf24')}
${lineFor('confusion', '#94a3b8')}
</svg>
</div>
<div class="mkt-seg-legend">
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#22c55e"></span>ポジティブ</span>
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#ef4444"></span>ネガティブ</span>
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#fbbf24"></span>驚き</span>
<span class="mkt-leg"><span class="mkt-leg__dot" style="background:#94a3b8"></span>困惑</span>
</div></section>`;
}

/**
 * 0.1.25 (Z): 視聴者発の人気語 TOP（L14）。
 * @param {ReturnType<typeof suggestUniqueWords>} suggestions
 */
function sectionUniqueWordSuggestions(suggestions) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return '';
  const rows = suggestions
    .map(
      (s, i) => `<tr>
<td>${i + 1}</td>
<td class="mkt-mono">${escapeHtml(s.word)}</td>
<td>${s.count}</td>
</tr>`
    )
    .join('');
  return `<section class="mkt-section" id="mkt-unique-words">
<h2>視聴者発の人気語 TOP <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">配信全体でよく使われ、あなたのコメントと重なっていない視聴者側の言葉（ラテラル分析 L14）。次回の話題づくりヒント。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>語</th><th>出現回数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.25 (Z): リーチ係数（L15）。
 * @param {ReturnType<typeof computeReachCoefficient>} reach
 */
function sectionReachCoefficient(reach) {
  if (!reach || reach.coefficient == null) return '';
  return `<section class="mkt-section" id="mkt-reach">
<h2>リーチ係数（同接 / コメンター比）<span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">「現在の同接 ÷ 直近 5 分のユニークコメンター数」= 1 コメンターあたりの観戦者比率（ラテラル分析 L15）。</p>
<div class="mkt-kpi-grid"><div class="mkt-kpi"><span class="mkt-kpi__icon">📡</span><span class="mkt-kpi__val">${reach.coefficient.toFixed(2)}</span><span class="mkt-kpi__label">リーチ係数</span></div></div>
</section>`;
}

/**
 * 次回行動メモ・応援チャンス等（KPI より前に出すブロック）
 * @param {ReturnType<typeof buildSupportGrowthInsights>} insights
 * @param {import('./marketingDynamicAdvice.js').AdviceMetrics} metricsFull
 */
function renderSupportGrowthSections(insights, metricsFull) {
  if (!insights) return '';
  const parts = [];
  const noteMeta = insights.meta?.giftNote
    ? `<p class="mkt-note">${escapeHtml(String(insights.meta.giftNote))}</p>`
    : '';

  if (insights.nextActions?.length) {
    const lis = insights.nextActions
      .map(
        (a) => `<li class="mkt-sg-next-item">
<span class="mkt-sg-phase">${escapeHtml(a.phase)}</span>
<p class="mkt-sg-line">${escapeHtml(a.line)}</p>
<p class="mkt-sg-meta">根拠: ${escapeHtml(a.because)}</p>
<p class="mkt-sg-meta">期待: ${escapeHtml(a.effect)}</p>
</li>`
      )
      .join('');
    const liveNote = 'この内容は今回の配信データから自動で組み立てています。配信内容によって毎回変わります。';
    const trioCards =
      `<div class="mkt-advice-stack mkt-advice-stack--next">` +
      adviceCard('link', 'りんく', [
        '次の配信で試しやすい順に並べたよ。気になる1つだけでも、まずはやってみよう。'
      ]) +
      adviceCard('konta', 'こん太', [
        'リスナー目線で「言いやすい・参加しやすい」流れを拾ってるよ。楽しい空気づくりに使ってね。'
      ]) +
      adviceCard('tanu', 'たぬ姉', [
        '数字は正解ではなく目安です。毎回の配信内容で変わるので、その回の色として読んでください。'
      ]) +
      `</div>`;
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-next-actions">
<h2>りんく・こん太・たぬ姉の作戦会議（最大5つ）</h2>
<p class="mkt-lead">まずは楽しく試せるアクションから。次の枠で使えるメモを先に置いたのだ。</p>
<p class="mkt-sg-live-note">${escapeHtml(liveNote)}</p>
${trioCards}
${noteMeta}
<ol class="mkt-sg-next-list">${lis}</ol>
${dynamicAdviceCardsHtml('nextActions', metricsFull)}
</section>`);
  }

  if (insights.supportWindows?.length) {
    const rows = insights.supportWindows
      .map(
        (w) =>
          `<li><strong>${escapeHtml(w.label)}</strong> <span class="mkt-sg-time">（${escapeHtml(w.timeHint)}）</span><br><span class="mkt-sg-meta">${escapeHtml(w.because)}</span></li>`
      )
      .join('');
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-support-chance">
<h2>応援が増えそうな時間</h2>
<ul class="mkt-sg-simple-list">${rows}</ul>
${dynamicAdviceCardsHtml('supportGrowth', metricsFull)}
</section>`);
  }

  if (insights.giftFlow?.length) {
    const blocks = insights.giftFlow
      .map(
        (g) => `<article class="mkt-sg-gift-block"><h3>${escapeHtml(g.headline)}</h3>
<p>${escapeHtml(g.beforeHint)}</p>
<p>${escapeHtml(g.afterHint)}</p>
<p class="mkt-sg-meta">${escapeHtml(g.thankTimingHint)}</p></article>`
      )
      .join('');
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-gift-flow">
<p class="mkt-sg-note">番組・イベントの<strong>ギフト累計</strong>は、ニコ生公式のギフト指標です（広告ptやコメント数とは別枠です）。</p>
<h2>ギフト・アイテムが飛びやすかった流れ</h2>
${blocks}
${dynamicAdviceCardsHtml('giftFlow', metricsFull)}
</section>`);
  }

  const sumLine = String(insights.onboarding?.summaryLine || '').trim();
  const voiceEx = Array.isArray(insights.onboarding?.voiceExamples)
    ? insights.onboarding.voiceExamples
    : [];
  if (sumLine || voiceEx.length) {
    const ex = voiceEx.map((v) => `<li>${escapeHtml(v)}</li>`).join('');
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-onboarding">
<h2>初見さんを迎え入れる手がかり</h2>
${sumLine ? `<p>${escapeHtml(sumLine)}</p>` : ''}
<p class="mkt-lead">そのまま使える声かけ例</p>
<ul class="mkt-sg-simple-list">${ex}</ul>
${dynamicAdviceCardsHtml('listenerOnboarding', metricsFull)}
</section>`);
  }

  if (insights.clippingMoments?.length) {
    const cm = insights.clippingMoments
      .map(
        (c) =>
          `<article class="mkt-sg-clip"><p class="mkt-sg-time">${escapeHtml(c.atLabel)} — ${escapeHtml(c.reason)}</p>
<p class="mkt-sg-sample">代表: ${escapeHtml(c.sampleLine)}</p>
<p class="mkt-sg-meta">${escapeHtml(c.promoHint)}</p></article>`
      )
      .join('');
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-clip-promo">
<h2>切り抜き・告知に使えそうな場面</h2>
${cm}
</section>`);
  }

  if (insights.listenerRewards?.length) {
    const lr = insights.listenerRewards.map((x) => `<li>${escapeHtml(x.line)}</li>`).join('');
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-listener-care">
<h2>リスナーが喜ぶお返し</h2>
<ul class="mkt-sg-simple-list">${lr}</ul>
${dynamicAdviceCardsHtml('listenerCare', metricsFull)}
</section>`);
  }

  const g = insights.askTiming?.good || [];
  const b = insights.askTiming?.bad || [];
  if (g.length || b.length) {
    const gHtml = g.length
      ? `<h3>お願いしても空気が軽くなりやすいとき</h3><ul class="mkt-sg-simple-list">${g.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
      : '';
    const bHtml = b.length
      ? `<h3>お願いは控えめがよさそうなとき</h3><ul class="mkt-sg-simple-list">${b.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
      : '';
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-ask-timing">
<h2>お願いの出しどころ（やさしめの目安）</h2>
${gHtml}${bHtml}
${dynamicAdviceCardsHtml('askTiming', metricsFull)}
</section>`);
  }

  if (insights.caution?.length) {
    parts.push(`<section class="mkt-section mkt-section--sg" id="mkt-sg-caution">
<h2>読み取りの注意</h2>
<ul class="mkt-sg-simple-list">${insights.caution.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
</section>`);
  }

  if (!parts.length) return '';
  return `<div class="mkt-sg-pack">${parts.join('\n')}</div>`;
}

/**
 * @param {import('./giftMomentumAnalytics.js').GiftMomentumAnalysis} analysis
 * @param {boolean} maskShare
 */
function sectionGiftMomentum(analysis, maskShare) {
  if (!analysis || analysis.hasSignals !== true) return '';
  const cards = [
    {
      label: '送り主',
      value: `${analysis.totals.senderCount}名`,
      hint: 'ギフト・履歴・ランキングから見えた人数'
    },
    {
      label: '代表pt',
      value:
        analysis.totals.totalPoints > 0
          ? `${formatEventRankingNumber(analysis.totals.totalPoints)}pt`
          : 'pt未取得',
      hint: '重複を避けるため送り主別の最大値を採用'
    },
    {
      label: '公式ギフト累計',
      value:
        analysis.totals.officialGiftPoints > 0
          ? `${formatEventRankingNumber(analysis.totals.officialGiftPoints)}pt`
          : '未取得',
      hint: '番組統計メニュー由来'
    },
    {
      label: '時刻つきギフト',
      value: `${analysis.totals.exactEventCount}件`,
      hint:
        analysis.totals.approxEventCount > 0
          ? `近似時刻 ${analysis.totals.approxEventCount}件も参照`
          : 'ライブ受信イベント由来'
    }
  ];
  const cardHtml = cards
    .map(
      (c) => `<div class="mkt-gift-card">
<span class="mkt-gift-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-gift-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-gift-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');

  const insightHtml = analysis.insightLines.length
    ? `<ul class="mkt-insight-list">${analysis.insightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : '<p class="mkt-note">ギフトの傾向はまだ薄めです。コメントの山や同接推移とあわせて見てください。</p>';

  const senderRows = analysis.senderRows
    .slice(0, 10)
    .map((row, i) => {
      const rawLabel = row.userId && /^\d+$/.test(row.userId)
        ? displayUserLabel(row.userId, row.label)
        : row.label;
      const nameHtml = maskShare
        ? escapeHtml(maskLabelForShare(rawLabel))
        : row.userId && /^\d+$/.test(row.userId)
          ? buildUserProfileLinkedLabelHtml(row.userId, rawLabel)
          : escapeHtml(rawLabel);
      const points = row.totalPoints > 0 ? `${formatEventRankingNumber(row.totalPoints)}pt` : '—';
      const rank = row.rank != null ? `<span class="mkt-gift-rank">貢献度${row.rank}位</span>` : '';
      return `<tr>
<td data-label="#">${i + 1}</td>
<td data-label="送り主" class="mkt-gift-sender">${nameHtml}${rank}</td>
<td data-label="タイプ"><span class="mkt-gift-type">${escapeHtml(row.typeLabel)}</span></td>
<td data-label="pt" class="mkt-num">${escapeHtml(points)}</td>
<td data-label="投げ">${row.throwCount || '—'}</td>
<td data-label="コメント">${row.commentCount}</td>
<td data-label="根拠" class="mkt-gift-evidence">${escapeHtml(row.evidence)}</td>
</tr>`;
    })
    .join('');
  const senderTable = senderRows
    ? `<div class="mkt-table-scroll"><table class="mkt-rank mkt-gift-table">
<thead><tr><th>#</th><th>送り主</th><th>タイプ</th><th>pt</th><th>投げ</th><th>コメント</th><th>根拠</th></tr></thead>
<tbody>${senderRows}</tbody>
</table></div>`
    : '<p class="mkt-note">送り主別の行はまだ作れません。</p>';

  const timingHtml = analysis.timingWindows.length
    ? `<div class="mkt-gift-window-grid">${analysis.timingWindows
        .map((w) => {
          const points =
            w.totalPoints > 0 ? `${formatEventRankingNumber(w.totalPoints)}pt` : 'pt未取得';
          const words = w.topWords.length
            ? w.topWords.map((word) => `<span class="mkt-gift-word">${escapeHtml(word)}</span>`).join('')
            : '<span class="mkt-gift-word mkt-gift-word--muted">目立つ語は少なめ</span>';
          const source =
            w.source === 'exact' ? '時刻: ライブ受信' : '時刻: 近似';
          return `<article class="mkt-gift-window">
<div class="mkt-gift-window__head">
<strong>${escapeHtml(w.label)}</strong>
<span>${escapeHtml(w.flowLabel)}</span>
</div>
<dl class="mkt-gift-window__stats">
<div><dt>ギフト</dt><dd>${w.giftCount}件 / ${escapeHtml(points)}</dd></div>
<div><dt>送り主</dt><dd>${w.senderCount}名</dd></div>
<div><dt>前後コメント</dt><dd>前 ${w.beforeCommentCount} / 後 ${w.afterCommentCount}</dd></div>
</dl>
<p class="mkt-gift-window__sample">代表: ${escapeHtml(w.sampleGiftLabel)}</p>
<div class="mkt-gift-words">${words}</div>
<p class="mkt-gift-window__source">${escapeHtml(source)}</p>
</article>`;
        })
        .join('')}</div>`
    : '<p class="mkt-note">時刻つきのギフトが少ないため、タイミング分析は省略しています。</p>';

  const notes = analysis.dataNotes.length
    ? `<ul class="mkt-gift-notes">${analysis.dataNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
    : '';

  return `<section class="mkt-section mkt-section--gift-deep" id="mkt-gift-deep">
<h2>ギフト深掘り（誰が・いつ・どんな流れで）</h2>
<p class="mkt-note">手元に残ったギフト・公式履歴・貢献度ランキングをまとめ、送り主のタイプとギフトが飛んだ前後のコメント量を見ます。</p>
<div class="mkt-gift-card-grid">${cardHtml}</div>
${insightHtml}
<h3 class="mkt-subhead">たくさんギフトが飛ぶ人の傾向</h3>
${senderTable}
<h3 class="mkt-subhead">ギフトが飛んだタイミング</h3>
${timingHtml}
${notes}
</section>`;
}

/** @param {number} ms */
function formatShortClock(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * @param {import('./audienceEngagementGap.js').AudienceEngagementGap} gap
 */
function sectionAudienceEngagementGap(gap) {
  if (!gap || (gap.level === 'unknown' && gap.totalVisitors <= 0)) return '';
  const levelLabel = {
    unknown: '判定不可',
    healthy: '反応あり',
    quiet: 'やや静か',
    'silent-crowd': '静かな観客が多い'
  }[gap.level] || '判定不可';
  const cards = [
    {
      label: '来場者数',
      value: gap.totalVisitors > 0 ? `${formatEventRankingNumber(gap.totalVisitors)}人` : '未取得',
      hint: '公式値またはサンプル最大値'
    },
    {
      label: 'コメント数',
      value: `${formatEventRankingNumber(gap.effectiveCommentCount)}件`,
      hint: `手元記録 ${formatEventRankingNumber(gap.recordedCommentCount)}件`
    },
    {
      label: '100人あたりコメント',
      value: `${gap.commentsPer100Visitors}件`,
      hint: '来場から発言への変換率'
    },
    {
      label: '100人あたり発言者',
      value: `${gap.uniqueCommentersPer100Visitors}人`,
      hint: '実際にコメントした人数'
    }
  ];
  const cardHtml = cards
    .map(
      (c) => `<div class="mkt-audience-card">
<span class="mkt-audience-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-audience-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-audience-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  const insights = gap.insightLines.length
    ? `<ul class="mkt-insight-list">${gap.insightLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : '';
  const windows = gap.quietAudienceWindows.length
    ? `<div class="mkt-table-scroll"><table class="mkt-rank mkt-audience-window-table">
<thead><tr><th>時間</th><th>来場増</th><th>コメント増</th><th>新規来場100人あたり</th></tr></thead>
<tbody>${gap.quietAudienceWindows.map((w) => `<tr>
<td data-label="時間">${escapeHtml(`${formatShortClock(w.startAt)}〜${formatShortClock(w.endAt)}`)}</td>
<td data-label="来場増" class="mkt-num">+${formatEventRankingNumber(w.visitorDelta)}</td>
<td data-label="コメント増" class="mkt-num">+${formatEventRankingNumber(w.commentDelta)}</td>
<td data-label="100人あたり" class="mkt-num">${w.commentsPer100NewVisitors}件</td>
</tr>`).join('')}</tbody>
</table></div>`
    : '<p class="mkt-note">来場が増えたのにコメントが伸びにくい時間帯は目立ちません。</p>';
  return `<section class="mkt-section mkt-section--audience-gap" id="mkt-audience-gap">
<h2>来場→コメント変換率</h2>
<p class="mkt-note">「来場者数は多いけどコメントが少ない」状態を、公式コメント数・手元コメント・発言者数から見ます。</p>
<p class="mkt-audience-level mkt-audience-level--${escapeAttr(gap.level)}">${escapeHtml(levelLabel)}</p>
<div class="mkt-audience-card-grid">${cardHtml}</div>
${insights}
<h3 class="mkt-subhead">来場が増えたのに静かだった時間</h3>
${windows}
</section>`;
}

/** @param {unknown} value */
function positiveMarketingNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {unknown} row
 * @returns {number}
 */
function pickMarketingPoint(row) {
  const r = /** @type {Record<string, unknown>} */ (row || {});
  return (
    positiveMarketingNumber(r.contribution) ||
    positiveMarketingNumber(r.totalContribution) ||
    positiveMarketingNumber(r.totalPoints) ||
    positiveMarketingNumber(r.point) ||
    positiveMarketingNumber(r.score)
  );
}

/**
 * @param {readonly unknown[]} rows
 * @returns {number}
 */
function sumMarketingPoints(rows) {
  return /** @type {number} */ (rows.reduce((sum, row) => /** @type {number} */ (sum) + pickMarketingPoint(row), 0));
}

/**
 * @param {unknown} value
 * @param {string} unit
 */
function marketingMetricLabel(value, unit = '') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '未取得';
  return `${formatEventRankingNumber(n)}${unit}`;
}

/** @param {unknown} value */
function marketingPctLabel(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : '—';
}

/**
 * @param {readonly unknown[]} rows
 * @param {readonly string[]} keys
 */
function maxMarketingField(rows, keys) {
  let max = 0;
  for (const raw of rows) {
    const row = /** @type {Record<string, unknown>} */ (raw || {});
    for (const key of keys) {
      const n = positiveMarketingNumber(row[key]);
      if (n > max) max = n;
    }
  }
  return max;
}

/**
 * @param {unknown} row
 * @returns {{ name: string, point: number }}
 */
function pickGiftItemForMarketing(row) {
  const r = /** @type {Record<string, unknown>} */ (row || {});
  const name = String(r.itemName ?? r.giftName ?? r.name ?? r.title ?? '').trim();
  return {
    name,
    point: positiveMarketingNumber(r.point ?? r.totalPoints ?? r.contribution)
  };
}

/**
 * @param {readonly unknown[]} giftEvents
 * @param {readonly unknown[]} officialGiftHistory
 */
function buildMarketingGiftItemRows(giftEvents, officialGiftHistory) {
  /** @type {Map<string, { name: string, count: number, points: number }>} */
  const map = new Map();
  for (const raw of [...giftEvents, ...officialGiftHistory]) {
    const picked = pickGiftItemForMarketing(raw);
    if (!picked.name) continue;
    const key = picked.name.toLowerCase();
    const cur = map.get(key) || { name: picked.name, count: 0, points: 0 };
    cur.count += 1;
    cur.points += picked.point;
    map.set(key, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.points - a.points || b.count - a.count || a.name.localeCompare(b.name, 'ja'))
    .slice(0, 5);
}

/**
 * @param {{
 *   report: MarketingReport,
 *   audienceGap: import('./audienceEngagementGap.js').AudienceEngagementGap,
 *   giftMomentum: import('./giftMomentumAnalytics.js').GiftMomentumAnalysis,
 *   supporterChikuran: ReturnType<typeof buildSupporterChikuranRows>,
 *   sessionSummaryRows: readonly unknown[],
 *   pastBroadcasts: readonly unknown[],
 *   giftUsers: readonly unknown[],
 *   giftEvents: readonly unknown[],
 *   giftHistoryThrows: readonly unknown[],
 *   officialGiftHistory: readonly unknown[],
 *   giftContributionRanking: readonly unknown[],
 *   adContributionRanking: readonly unknown[],
 *   programStats: Record<string, unknown> | null,
 *   eventRanking: EventRankingReportModel | null | undefined
 * }} input
 */
function buildMarketingDataSummary(input) {
  const r = input.report;
  const programStats = input.programStats || {};
  const maxSampleVisitors = maxMarketingField(input.sessionSummaryRows, [
    'viewerCountFromDom',
    'totalVisitors',
    'watchCount',
    'visitorCount'
  ]);
  const maxSampleComments = maxMarketingField(input.sessionSummaryRows, [
    'officialCommentCount',
    'commentCount',
    'comments'
  ]);
  const officialVisitors =
    positiveMarketingNumber(programStats.watchCount) ||
    positiveMarketingNumber(programStats.viewerCount) ||
    maxSampleVisitors;
  const officialComments =
    positiveMarketingNumber(programStats.commentCount) || maxSampleComments;
  const officialGiftPoints = positiveMarketingNumber(programStats.giftPoints);
  const adPointTotal = sumMarketingPoints(input.adContributionRanking);
  const giftContributionPointTotal = sumMarketingPoints(input.giftContributionRanking);
  const availableSourceCount = [
    r.totalComments > 0,
    input.sessionSummaryRows.length > 0,
    Object.keys(programStats).length > 0,
    input.giftUsers.length > 0,
    input.giftEvents.length > 0,
    input.giftHistoryThrows.length > 0 || input.officialGiftHistory.length > 0,
    input.giftContributionRanking.length > 0,
    input.adContributionRanking.length > 0,
    Boolean(input.eventRanking),
    input.pastBroadcasts.length > 0
  ].filter(Boolean).length;

  const sourceRows = [
    {
      source: 'コメント本文',
      status: r.totalComments > 0 ? 'あり' : 'なし',
      value: `${formatEventRankingNumber(r.totalComments)}件 / ${formatEventRankingNumber(r.uniqueUsers)}人`,
      detail: `CPM ${r.commentsPerMinute}、ピーク ${r.peakMinute}分 ${r.peakMinuteCount}件`
    },
    {
      source: '来場・公式コメント',
      status: officialVisitors > 0 || officialComments > 0 ? 'あり' : '未取得',
      value: `${marketingMetricLabel(officialVisitors, '人')} / ${marketingMetricLabel(officialComments, '件')}`,
      detail: `時系列サンプル ${input.sessionSummaryRows.length}点`
    },
    {
      source: '公式番組統計',
      status: Object.keys(programStats).length ? 'あり' : '未取得',
      value: `ギフト ${marketingMetricLabel(officialGiftPoints, 'pt')}`,
      detail: `watch/comment/gift 系の番組メニュー値`
    },
    {
      source: 'ギフト送信者・イベント',
      status: input.giftUsers.length || input.giftEvents.length ? 'あり' : '未取得',
      value: `${input.giftUsers.length}人 / ${input.giftEvents.length}件`,
      detail: `時刻つきギフト ${input.giftMomentum.totals.exactEventCount}件`
    },
    {
      source: 'ギフト履歴・貢献度',
      status:
        input.giftHistoryThrows.length ||
        input.officialGiftHistory.length ||
        input.giftContributionRanking.length
          ? 'あり'
          : '未取得',
      value: `${input.giftHistoryThrows.length}人 / ${input.giftContributionRanking.length}行`,
      detail: `代表pt ${marketingMetricLabel(Math.max(input.giftMomentum.totals.totalPoints, giftContributionPointTotal), 'pt')}`
    },
    {
      source: 'ニコニ広告',
      status: input.adContributionRanking.length ? 'あり' : '未取得',
      value: `${input.adContributionRanking.length}行 / ${marketingMetricLabel(adPointTotal, 'pt')}`,
      detail: '広告ランキングはギフトとは別の応援シグナル'
    },
    {
      source: '応援者ちくらんβ',
      status: input.supporterChikuran.rows.length ? 'あり' : '少なめ',
      value: `${input.supporterChikuran.totals.supporterCount}名`,
      detail: `匿名応援 ${input.supporterChikuran.totals.anonymousIncluded ? 'あり' : 'なし'}`
    },
    {
      source: '過去配信',
      status: input.pastBroadcasts.length ? 'あり' : '未取得',
      value: `${input.pastBroadcasts.length}枠`,
      detail: '常連・比較・成長メーターに利用'
    },
    {
      source: 'イベント順位',
      status: input.eventRanking ? 'あり' : '未取得',
      value: input.eventRanking?.rows?.length
        ? `${input.eventRanking.rows.length}行`
        : input.eventRanking?.self?.rank
          ? `${input.eventRanking.self.rank}位`
          : '未取得',
      detail: input.eventRanking?.eventName || 'イベント情報なし'
    }
  ];

  const matrixRows = [
    {
      area: '集客',
      main: `来場 ${marketingMetricLabel(input.audienceGap.totalVisitors || officialVisitors, '人')}`,
      sub: `100人あたりコメント ${input.audienceGap.commentsPer100Visitors}件`,
      reading: input.audienceGap.level === 'silent-crowd' ? '来場はあるが発言転換が弱い' : '来場から発言への流れを見る'
    },
    {
      area: '反応',
      main: `${formatEventRankingNumber(r.totalComments)}件 / ${formatEventRankingNumber(r.uniqueUsers)}人`,
      sub: `CPM ${r.commentsPerMinute}、最長間隔 ${formatSilenceMs(r.maxSilenceGapMs)}`,
      reading: `ピークは ${r.peakMinute}分目 ${r.peakMinuteCount}件`
    },
    {
      area: 'コミュニティ',
      main: `ヘビー ${r.segmentCounts.heavy}人 / 中間 ${r.segmentCounts.mid}人`,
      sub: `一見 ${r.segmentCounts.once}人、184 ${marketingPctLabel(r.is184.pctOfKnown)}`,
      reading: '常連・一見・匿名の混ざり具合'
    },
    {
      area: '継続',
      main: r.quarterEngagement?.skippedShortSpan
        ? '判定なし'
        : `冒頭 ${r.quarterEngagement.uniqueCommentersFirstQuarter}人 / 終盤 ${r.quarterEngagement.uniqueCommentersLastQuarter}人`,
      sub: r.quarterEngagement?.skippedShortSpan
        ? '記録時間が短め'
        : `両方にいた人 ${r.quarterEngagement.uniqueCommentersBothQuarters}人`,
      reading: '最後まで残った応援の厚み'
    },
    {
      area: '支援',
      main: `送り主 ${input.giftMomentum.totals.senderCount}名 / 応援者候補 ${input.supporterChikuran.totals.supporterCount}名`,
      sub: `ギフト ${marketingMetricLabel(input.giftMomentum.totals.totalPoints, 'pt')}、広告 ${marketingMetricLabel(adPointTotal, 'pt')}`,
      reading: 'コメント以外の応援量'
    },
    {
      area: '本文素材',
      main: `平均 ${r.textStats.avgChars}字 / 中央 ${r.textStats.medianChars}字`,
      sub: `URL ${marketingPctLabel(r.textStats.pctWithUrl)}、絵文字 ${marketingPctLabel(r.textStats.pctWithEmoji)}`,
      reading: '切り抜き・告知・話題抽出の素材感'
    },
    {
      area: 'データ厚み',
      main: `${availableSourceCount}/10 種類`,
      sub: `過去 ${input.pastBroadcasts.length}枠、サンプル ${input.sessionSummaryRows.length}点`,
      reading: '多いほど判断材料が増える'
    }
  ];

  const giftItemRows = buildMarketingGiftItemRows(
    input.giftEvents,
    input.officialGiftHistory
  );
  const cards = [
    {
      label: '観測ソース',
      value: `${availableSourceCount}/10`,
      hint: 'このHTMLに入ったデータ種類'
    },
    {
      label: '来場→発言',
      value: input.audienceGap.totalVisitors > 0
        ? `${input.audienceGap.commentsPer100Visitors}件/100人`
        : '未取得',
      hint: `発言者 ${input.audienceGap.uniqueCommentersPer100Visitors}人/100人`
    },
    {
      label: '応援者候補',
      value: `${input.supporterChikuran.totals.supporterCount}名`,
      hint: 'コメント・ギフト・広告の合算'
    },
    {
      label: 'ギフト代表pt',
      value: marketingMetricLabel(input.giftMomentum.totals.totalPoints, 'pt'),
      hint: `${input.giftMomentum.totals.senderCount}名 / ${input.giftMomentum.totals.throwCount}投`
    },
    {
      label: '広告pt',
      value: marketingMetricLabel(adPointTotal, 'pt'),
      hint: `${input.adContributionRanking.length}行`
    },
    {
      label: '過去比較素材',
      value: `${input.pastBroadcasts.length}枠`,
      hint: '常連・成長・波形比較'
    }
  ];

  return { cards, matrixRows, sourceRows, giftItemRows };
}

/** @param {ReturnType<typeof buildMarketingDataSummary>} summary */
function sectionMarketingDataSummary(summary) {
  const cardHtml = summary.cards
    .map(
      (c) => `<div class="mkt-data-card">
<span class="mkt-data-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-data-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-data-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  const matrixHtml = summary.matrixRows
    .map(
      (row) => `<tr>
<td data-label="領域">${escapeHtml(row.area)}</td>
<td data-label="主指標">${escapeHtml(row.main)}</td>
<td data-label="補助">${escapeHtml(row.sub)}</td>
<td data-label="読み方">${escapeHtml(row.reading)}</td>
</tr>`
    )
    .join('');
  const sourceHtml = summary.sourceRows
    .map(
      (row) => `<tr>
<td data-label="データ">${escapeHtml(row.source)}</td>
<td data-label="状態"><span class="mkt-data-status mkt-data-status--${escapeAttr(row.status)}">${escapeHtml(row.status)}</span></td>
<td data-label="値">${escapeHtml(row.value)}</td>
<td data-label="使い道">${escapeHtml(row.detail)}</td>
</tr>`
    )
    .join('');
  const giftItems = summary.giftItemRows.length
    ? `<div class="mkt-data-gift-items">${summary.giftItemRows
        .map(
          (row) => `<span class="mkt-data-gift-chip">${escapeHtml(row.name)} <b>${row.count}件</b>${row.points > 0 ? ` / ${escapeHtml(formatEventRankingNumber(row.points))}pt` : ''}</span>`
        )
        .join('')}</div>`
    : '<p class="mkt-note">ギフト名の素材はまだありません。</p>';
  return `<section class="mkt-section mkt-section--data-summary" id="mkt-data-summary">
<h2>マーケ総合サマリ（データ全部入り）</h2>
<p class="mkt-note">このHTMLに入ったコメント・来場・同接サンプル・ギフト・広告・過去配信を横断して、マーケ判断に使う数字を先にまとめます。</p>
<div class="mkt-data-card-grid">${cardHtml}</div>
<h3 class="mkt-subhead">横断指標</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-data-matrix">
<thead><tr><th>領域</th><th>主指標</th><th>補助</th><th>読み方</th></tr></thead>
<tbody>${matrixHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">取り込めたデータ</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-data-source-table">
<thead><tr><th>データ</th><th>状態</th><th>値</th><th>使い道</th></tr></thead>
<tbody>${sourceHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">ギフト素材 TOP</h3>
${giftItems}
</section>`;
}

/**
 * @param {number} numerator
 * @param {number} denominator
 */
function marketingPercentOf(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * @param {number|null} value
 * @param {string} suffix
 */
function marketingRatioDisplay(value, suffix = '%') {
  return value == null ? '未取得' : `${value}${suffix}`;
}

/** @param {number} n */
function marketingSignedDelta(n) {
  if (!Number.isFinite(n) || n === 0) return '±0';
  return n > 0 ? `+${formatEventRankingNumber(n)}` : `-${formatEventRankingNumber(Math.abs(n))}`;
}

/**
 * @param {import('./giftMomentumAnalytics.js').GiftMomentumTimingWindow[]} windows
 */
function pickBestGiftReactionWindow(windows) {
  let best = null;
  for (const w of Array.isArray(windows) ? windows : []) {
    if (!best || w.delta > best.delta || (w.delta === best.delta && w.giftCount > best.giftCount)) {
      best = w;
    }
  }
  return best;
}

/**
 * @param {{
 *   report: MarketingReport,
 *   audienceGap: import('./audienceEngagementGap.js').AudienceEngagementGap,
 *   giftMomentum: import('./giftMomentumAnalytics.js').GiftMomentumAnalysis,
 *   supporterChikuran: ReturnType<typeof buildSupporterChikuranRows>,
 *   sessionSummaryRows: readonly unknown[],
 *   pastBroadcasts: readonly unknown[],
 *   giftUsers: readonly unknown[],
 *   giftEvents: readonly unknown[],
 *   giftHistoryThrows: readonly unknown[],
 *   officialGiftHistory: readonly unknown[],
 *   giftContributionRanking: readonly unknown[],
 *   adContributionRanking: readonly unknown[],
 *   programStats: Record<string, unknown> | null,
 *   eventRanking: EventRankingReportModel | null | undefined
 * }} input
 */
function buildMarketingFunnelBoard(input) {
  const r = input.report;
  const programStats = input.programStats || {};
  const visitors =
    input.audienceGap.totalVisitors ||
    positiveMarketingNumber(programStats.watchCount) ||
    positiveMarketingNumber(programStats.viewerCount) ||
    maxMarketingField(input.sessionSummaryRows, [
      'viewerCountFromDom',
      'totalVisitors',
      'watchCount',
      'visitorCount'
    ]);
  const comments = Math.max(
    input.audienceGap.effectiveCommentCount,
    r.totalComments,
    positiveMarketingNumber(programStats.commentCount)
  );
  const uniqueCommenters = Math.max(input.audienceGap.uniqueCommenters, r.uniqueUsers);
  const supporterCount = input.supporterChikuran.totals.supporterCount;
  const giftSenderCount = input.giftMomentum.totals.senderCount;
  const adRowCount = input.adContributionRanking.length;
  const giftContributionRows = input.giftContributionRanking.length;
  const supportSignalRows = giftSenderCount + adRowCount + giftContributionRows;
  const commentsPerVisitor = marketingPercentOf(comments, visitors);
  const uniquePerVisitor = marketingPercentOf(uniqueCommenters, visitors);
  const supporterPerCommenter = marketingPercentOf(supporterCount, uniqueCommenters);
  const giftSenderPerSupporter = marketingPercentOf(giftSenderCount, supporterCount);
  const supportSignalPerSupporter = marketingPercentOf(supportSignalRows, supporterCount);
  const bestGiftWindow = pickBestGiftReactionWindow(input.giftMomentum.timingWindows);
  const giftReactionDelta = bestGiftWindow ? bestGiftWindow.delta : 0;
  const sourceCoverage = [
    r.totalComments > 0,
    visitors > 0,
    input.sessionSummaryRows.length > 0,
    Object.keys(programStats).length > 0,
    input.giftUsers.length > 0,
    input.giftEvents.length > 0,
    input.giftMomentum.hasSignals,
    input.adContributionRanking.length > 0,
    Boolean(input.eventRanking),
    input.pastBroadcasts.length > 0
  ].filter(Boolean).length;

  const funnelRows = [
    {
      stage: '来場',
      value: visitors > 0 ? `${formatEventRankingNumber(visitors)}人` : '未取得',
      fromPrevious: '起点',
      fromAudience: '100%',
      reading: '見に来た人の入口。公式値か時系列サンプル最大値を使います。'
    },
    {
      stage: 'コメント',
      value: `${formatEventRankingNumber(comments)}件`,
      fromPrevious: marketingRatioDisplay(commentsPerVisitor),
      fromAudience: marketingRatioDisplay(commentsPerVisitor),
      reading: '来場が発言に変わった量。多い来場に対して静かかどうかを見ます。'
    },
    {
      stage: '発言者',
      value: `${formatEventRankingNumber(uniqueCommenters)}人`,
      fromPrevious: marketingRatioDisplay(marketingPercentOf(uniqueCommenters, comments)),
      fromAudience: marketingRatioDisplay(uniquePerVisitor),
      reading: '何人が会話に入ったか。コメント件数だけでなく人数を分けます。'
    },
    {
      stage: '応援者候補',
      value: `${formatEventRankingNumber(supporterCount)}名`,
      fromPrevious: marketingRatioDisplay(supporterPerCommenter),
      fromAudience: marketingRatioDisplay(marketingPercentOf(supporterCount, visitors)),
      reading: 'コメント・ギフト・広告をまとめた、応援してくれた人の候補です。'
    },
    {
      stage: 'ギフト送り主',
      value: `${formatEventRankingNumber(giftSenderCount)}名`,
      fromPrevious: marketingRatioDisplay(giftSenderPerSupporter),
      fromAudience: marketingRatioDisplay(marketingPercentOf(giftSenderCount, visitors)),
      reading: '応援者候補のうち、ギフト行動まで見えた人です。'
    },
    {
      stage: '広告/貢献行',
      value: `${formatEventRankingNumber(supportSignalRows)}行`,
      fromPrevious: marketingRatioDisplay(supportSignalPerSupporter),
      fromAudience: marketingRatioDisplay(marketingPercentOf(supportSignalRows, visitors)),
      reading: 'ニコニ広告・貢献度ランキングなど、コメント以外の支援シグナルです。'
    }
  ];

  const cards = [
    {
      label: '来場→発言',
      value: marketingRatioDisplay(commentsPerVisitor),
      hint: `${formatEventRankingNumber(visitors)}人中 ${formatEventRankingNumber(comments)}件`
    },
    {
      label: '発言者→応援者',
      value: marketingRatioDisplay(supporterPerCommenter),
      hint: `${formatEventRankingNumber(uniqueCommenters)}人中 ${formatEventRankingNumber(supporterCount)}名`
    },
    {
      label: '応援者→ギフト',
      value: marketingRatioDisplay(giftSenderPerSupporter),
      hint: `${formatEventRankingNumber(supporterCount)}名中 ${formatEventRankingNumber(giftSenderCount)}名`
    },
    {
      label: 'ギフト後の反応',
      value: bestGiftWindow ? marketingSignedDelta(giftReactionDelta) : '未取得',
      hint: bestGiftWindow ? `${bestGiftWindow.label} の前後コメント差` : '時刻つきギフト待ち'
    },
    {
      label: '支援シグナル',
      value: `${formatEventRankingNumber(supportSignalRows)}行`,
      hint: `ギフト送り主 ${giftSenderCount} / 広告 ${adRowCount} / 貢献 ${giftContributionRows}`
    },
    {
      label: 'データ厚み',
      value: `${sourceCoverage}/10`,
      hint: '判断に使えるデータ種類'
    }
  ];

  /** @type {{ area: string, priority: '高' | '中' | '低', basis: string, next: string }[]} */
  const priorityRows = [];
  if (visitors > 0 && commentsPerVisitor != null && commentsPerVisitor < 20) {
    priorityRows.push({
      area: '来場から発言',
      priority: commentsPerVisitor < 8 ? '高' : '中',
      basis: `来場に対するコメント率 ${commentsPerVisitor}%`,
      next: '来場が増えた直後の問いかけ・選択肢・初見向け一言を増やす'
    });
  }
  if (uniqueCommenters > 0 && r.segmentCounts.once >= Math.max(3, uniqueCommenters * 0.45)) {
    priorityRows.push({
      area: '初見・一見の定着',
      priority: '中',
      basis: `一見コメント ${r.segmentCounts.once}人 / 発言者 ${uniqueCommenters}人`,
      next: '一度だけ発言した人が2回目を言いやすい返し方を探す'
    });
  }
  if (supporterCount > 0 && giftSenderPerSupporter != null && giftSenderPerSupporter < 12) {
    priorityRows.push({
      area: '応援からギフト',
      priority: input.giftMomentum.totals.totalPoints > 0 ? '中' : '低',
      basis: `応援者候補に対するギフト送り主 ${giftSenderPerSupporter}%`,
      next: 'ギフトが飛んだ場面の直前の会話・企画・お礼の流れを見る'
    });
  }
  if (input.giftMomentum.totals.topSenderSharePct >= 60) {
    priorityRows.push({
      area: '支援の偏り',
      priority: '中',
      basis: `トップ送り主の代表pt比率 ${input.giftMomentum.totals.topSenderSharePct}%`,
      next: '特定の人だけに寄せず、複数人が軽く参加できる応援導線にする'
    });
  }
  if (bestGiftWindow) {
    priorityRows.push({
      area: 'ギフト後の会話',
      priority: giftReactionDelta >= 0 ? '低' : '中',
      basis: `${bestGiftWindow.label} 前後コメント差 ${marketingSignedDelta(giftReactionDelta)}`,
      next: giftReactionDelta >= 0
        ? '反応が続いた言葉や企画を次回も使える形でメモする'
        : 'ギフト後に会話が止まった理由を、お礼の長さや話題転換から見る'
    });
  }
  if (input.pastBroadcasts.length < 3) {
    priorityRows.push({
      area: '過去比較',
      priority: '低',
      basis: `比較できる過去配信 ${input.pastBroadcasts.length}枠`,
      next: '数枠ためて、曜日・時間・企画ごとの違いを見る'
    });
  }
  if (input.sessionSummaryRows.length < 3) {
    priorityRows.push({
      area: '時系列サンプル',
      priority: '低',
      basis: `来場/コメントの時系列サンプル ${input.sessionSummaryRows.length}点`,
      next: '配信中のサンプルが増えるほど、静かな来場時間を細かく見られる'
    });
  }
  if (input.eventRanking?.self?.rank) {
    priorityRows.push({
      area: 'イベント順位',
      priority: '中',
      basis: `${input.eventRanking.self.rank}位 / 差分 ${marketingMetricLabel(input.eventRanking.self.diffToNext, 'pt')}`,
      next: '順位だけでなく、コメント・ギフト・広告のどれが動いた時間かを見る'
    });
  }

  const dataGapRows = [
    { label: '来場者数', ok: visitors > 0, effect: '来場→発言の変換率が出せる' },
    { label: '時系列サンプル', ok: input.sessionSummaryRows.length >= 2, effect: '静かな来場時間を見つけられる' },
    { label: '公式番組統計', ok: Object.keys(programStats).length > 0, effect: 'watch/comment/gift を公式値で補える' },
    { label: 'ギフト時刻', ok: input.giftMomentum.totals.exactEventCount > 0, effect: 'ギフト前後のコメント変化が読める' },
    { label: '広告ランキング', ok: adRowCount > 0, effect: '広告勢を応援者分析に足せる' },
    { label: '過去配信', ok: input.pastBroadcasts.length >= 3, effect: '常連化・成長比較が強くなる' }
  ];

  return { cards, funnelRows, priorityRows: priorityRows.slice(0, 8), dataGapRows };
}

/** @param {ReturnType<typeof buildMarketingFunnelBoard>} board */
function sectionMarketingFunnelBoard(board) {
  const cardHtml = board.cards
    .map(
      (c) => `<div class="mkt-funnel-card">
<span class="mkt-funnel-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-funnel-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-funnel-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  const funnelHtml = board.funnelRows
    .map(
      (row) => `<tr>
<td data-label="段階">${escapeHtml(row.stage)}</td>
<td data-label="数値" class="mkt-num">${escapeHtml(row.value)}</td>
<td data-label="前段比">${escapeHtml(row.fromPrevious)}</td>
<td data-label="来場比">${escapeHtml(row.fromAudience)}</td>
<td data-label="読み方">${escapeHtml(row.reading)}</td>
</tr>`
    )
    .join('');
  const priorityHtml = board.priorityRows.length
    ? board.priorityRows
        .map(
          (row) => `<tr>
<td data-label="見る場所">${escapeHtml(row.area)}</td>
<td data-label="優先度"><span class="mkt-funnel-priority mkt-funnel-priority--${escapeAttr(row.priority)}">${escapeHtml(row.priority)}</span></td>
<td data-label="根拠">${escapeHtml(row.basis)}</td>
<td data-label="次に見ること">${escapeHtml(row.next)}</td>
</tr>`
        )
        .join('')
    : `<tr><td data-label="見る場所" colspan="4">大きな優先課題は出ていません。気になる指標だけ見てください。</td></tr>`;
  const gapHtml = board.dataGapRows
    .map(
      (row) => `<span class="mkt-funnel-gap ${row.ok ? 'mkt-funnel-gap--ok' : 'mkt-funnel-gap--missing'}">
${escapeHtml(row.ok ? 'OK' : '未取得')} ${escapeHtml(row.label)}<small>${escapeHtml(row.effect)}</small>
</span>`
    )
    .join('');
  return `<section class="mkt-section mkt-section--funnel" id="mkt-marketing-funnel">
<h2>マーケファネル & 優先度ボード</h2>
<p class="mkt-note">来場からコメント、応援者候補、ギフト・広告までを段階で見ます。どこで細くなっているかを先に把握するための表です。</p>
<div class="mkt-funnel-card-grid">${cardHtml}</div>
<h3 class="mkt-subhead">来場から支援までの流れ</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-funnel-table">
<thead><tr><th>段階</th><th>数値</th><th>前段比</th><th>来場比</th><th>読み方</th></tr></thead>
<tbody>${funnelHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">優先度ボード</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-priority-table">
<thead><tr><th>見る場所</th><th>優先度</th><th>根拠</th><th>次に見ること</th></tr></thead>
<tbody>${priorityHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">データ診断</h3>
<div class="mkt-funnel-gap-list">${gapHtml}</div>
</section>`;
}

/** @param {number} count */
function marketingCommentSegmentKey(count) {
  if (count >= 10) return 'heavy';
  if (count >= 4) return 'mid';
  if (count >= 2) return 'light';
  return 'once';
}

/**
 * @param {{
 *   report: MarketingReport,
 *   giftMomentum: import('./giftMomentumAnalytics.js').GiftMomentumAnalysis,
 *   supporterChikuran: ReturnType<typeof buildSupporterChikuranRows>
 * }} input
 */
function buildMarketingSegmentActionBoard(input) {
  const r = input.report;
  const segmentTotal = Math.max(1, r.uniqueUsers);
  const giftSenderRows = input.giftMomentum.senderRows.filter((row) =>
    row.sources.some((source) => source.includes('gift') || source === 'official-history')
  );
  const giftCommenters = giftSenderRows.filter((row) => row.commentCount > 0).length;
  const giftSilentSenders = Math.max(0, giftSenderRows.length - giftCommenters);
  const supporterRows = input.supporterChikuran.rows || [];
  const multiSourceRows = supporterRows.filter((row) => Array.isArray(row.sources) && row.sources.length >= 2).length;
  const commentLedRows = supporterRows.filter(
    (row) => row.commentCount > 0 && row.giftPointTotal <= 0 && row.adPointTotal <= 0
  ).length;
  const giftLedRows = supporterRows.filter((row) => row.giftPointTotal > 0).length;
  const adLedRows = supporterRows.filter((row) => row.adPointTotal > 0).length;
  const segmentGiftCounts = { heavy: 0, mid: 0, light: 0, once: 0 };
  for (const row of giftSenderRows) {
    segmentGiftCounts[marketingCommentSegmentKey(row.commentCount)] += 1;
  }

  const cards = [
    {
      label: 'ヘビー・中間',
      value: `${r.segmentCounts.heavy + r.segmentCounts.mid}人`,
      hint: `発言者の ${marketingPctLabel(((r.segmentCounts.heavy + r.segmentCounts.mid) / segmentTotal) * 100)}`
    },
    {
      label: '一見・ライト',
      value: `${r.segmentCounts.once + r.segmentCounts.light}人`,
      hint: '入口と2回目の声かけを見る層'
    },
    {
      label: '匿名コメント',
      value: `${r.is184.count184}件`,
      hint: `既知コメントの ${marketingPctLabel(r.is184.pctOfKnown)}`
    },
    {
      label: 'ギフト行コメント率',
      value: giftSenderRows.length > 0
        ? marketingRatioDisplay(marketingPercentOf(giftCommenters, giftSenderRows.length))
        : '未取得',
      hint: `${giftCommenters}行がコメントあり / ${giftSilentSenders}行はコメント薄め`
    },
    {
      label: '複合応援',
      value: `${multiSourceRows}名`,
      hint: 'コメント・ギフト・広告が重なった候補'
    },
    {
      label: 'コメント主導',
      value: `${commentLedRows}名`,
      hint: '支援行動より会話で支える候補'
    }
  ];

  const segmentRows = [
    {
      layer: 'ヘビー',
      count: `${r.segmentCounts.heavy}人`,
      share: `${r.segmentPcts.heavy}%`,
      signal: `10件以上。ギフト行 ${segmentGiftCounts.heavy}行`,
      action: '常連ノリや内輪感が強くなりすぎないよう、初見にも見える形で話題を開く'
    },
    {
      layer: '中間',
      count: `${r.segmentCounts.mid}人`,
      share: `${r.segmentPcts.mid}%`,
      signal: `4〜9件。ギフト行 ${segmentGiftCounts.mid}行`,
      action: '企画参加・次枠告知・軽いお願いを受け取りやすい中心層として見る'
    },
    {
      layer: 'ライト',
      count: `${r.segmentCounts.light}人`,
      share: `${r.segmentPcts.light}%`,
      signal: `2〜3件。ギフト行 ${segmentGiftCounts.light}行`,
      action: '2回目のコメントが出た話題を拾い、次回も入りやすい入口にする'
    },
    {
      layer: '一見',
      count: `${r.segmentCounts.once}人`,
      share: `${r.segmentPcts.once}%`,
      signal: `1件だけ。ギフト行 ${segmentGiftCounts.once}行`,
      action: 'あいさつ、選択肢、短いリアクションなど、低負荷で参加できる導線を見る'
    },
    {
      layer: '184・匿名',
      count: `${r.is184.count184}件`,
      share: marketingPctLabel(r.is184.pctOfKnown),
      signal: `${r.is184.knownCount}件中の匿名コメント`,
      action: '名前を出さなくても参加しやすい空気があるか、匿名の反応語を素材として見る'
    }
  ];

  const overlapRows = [
    {
      type: 'コメント主導',
      count: `${commentLedRows}名`,
      basis: 'コメントはあるがギフト/広告ptは薄い',
      action: '会話の中心・拾いやすい話題・初見導線の参考にする'
    },
    {
      type: 'ギフト主導',
      count: `${giftLedRows}名`,
      basis: `ギフトptあり。うちコメントあり ${giftCommenters}行`,
      action: 'ギフト前後の会話、お礼後の反応、投げやすいタイミングを見る'
    },
    {
      type: '広告主導',
      count: `${adLedRows}名`,
      basis: 'ニコニ広告ptが見えた応援者候補',
      action: '広告とコメントの波が重なるか、告知やイベント順位と合わせて見る'
    },
    {
      type: '複合応援',
      count: `${multiSourceRows}名`,
      basis: '複数ソースに現れた応援者候補',
      action: '濃い支援者として扱いながら、順位で価値づけしない表現にする'
    }
  ];

  return { cards, segmentRows, overlapRows };
}

/** @param {ReturnType<typeof buildMarketingSegmentActionBoard>} board */
function sectionMarketingSegmentActionBoard(board) {
  const cardHtml = board.cards
    .map(
      (c) => `<div class="mkt-segment-action-card">
<span class="mkt-segment-action-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-segment-action-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-segment-action-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  const segmentHtml = board.segmentRows
    .map(
      (row) => `<tr>
<td data-label="層">${escapeHtml(row.layer)}</td>
<td data-label="人数/件数" class="mkt-num">${escapeHtml(row.count)}</td>
<td data-label="割合">${escapeHtml(row.share)}</td>
<td data-label="シグナル">${escapeHtml(row.signal)}</td>
<td data-label="使い方">${escapeHtml(row.action)}</td>
</tr>`
    )
    .join('');
  const overlapHtml = board.overlapRows
    .map(
      (row) => `<tr>
<td data-label="タイプ">${escapeHtml(row.type)}</td>
<td data-label="人数" class="mkt-num">${escapeHtml(row.count)}</td>
<td data-label="根拠">${escapeHtml(row.basis)}</td>
<td data-label="使い方">${escapeHtml(row.action)}</td>
</tr>`
    )
    .join('');
  return `<section class="mkt-section mkt-section--segment-action" id="mkt-segment-action">
<h2>層別マーケ診断</h2>
<p class="mkt-note">コメント量の層とギフト・広告の重なりを、個人名ではなく人数ベースで見ます。誰が上かではなく、どの入口が効いているかを見るための表です。</p>
<div class="mkt-segment-action-card-grid">${cardHtml}</div>
<h3 class="mkt-subhead">コメント層ごとの見方</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-segment-action-table">
<thead><tr><th>層</th><th>人数/件数</th><th>割合</th><th>シグナル</th><th>使い方</th></tr></thead>
<tbody>${segmentHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">応援の重なり</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-support-overlap-table">
<thead><tr><th>タイプ</th><th>人数</th><th>根拠</th><th>使い方</th></tr></thead>
<tbody>${overlapHtml}</tbody>
</table></div>
</section>`;
}

/**
 * @param {boolean} ready
 * @param {boolean} partial
 */
function marketingSkillStatus(ready, partial = false) {
  if (ready) return { label: 'ON', className: 'on' };
  if (partial) return { label: '一部', className: 'partial' };
  return { label: '待機', className: 'off' };
}

/**
 * @param {{
 *   report: MarketingReport,
 *   audienceGap: import('./audienceEngagementGap.js').AudienceEngagementGap,
 *   giftMomentum: import('./giftMomentumAnalytics.js').GiftMomentumAnalysis,
 *   supporterChikuran: ReturnType<typeof buildSupporterChikuranRows>,
 *   sessionSummaryRows: readonly unknown[],
 *   pastBroadcasts: readonly unknown[],
 *   adContributionRanking: readonly unknown[],
 *   eventRanking: EventRankingReportModel | null | undefined,
 *   uniqueWords: readonly unknown[],
 *   talentPeaks: readonly unknown[],
 *   silenceZones: readonly unknown[],
 *   recentComparison: { bars?: readonly unknown[] },
 *   maskShareLabels: boolean
 * }} input
 */
function buildAnalysisSkillBoard(input) {
  const r = input.report;
  const skills = [
    {
      name: 'コメントKPI',
      status: marketingSkillStatus(r.totalComments > 0),
      input: `${formatEventRankingNumber(r.totalComments)}件 / ${formatEventRankingNumber(r.uniqueUsers)}人`,
      output: 'KPI、速度、セグメント、本文傾向',
      next: '配信全体の温度を最初に読む'
    },
    {
      name: '来場→発言変換',
      status: marketingSkillStatus(input.audienceGap.totalVisitors > 0, input.sessionSummaryRows.length > 0),
      input: `${marketingMetricLabel(input.audienceGap.totalVisitors, '人')} / サンプル ${input.sessionSummaryRows.length}点`,
      output: '静かな観客、来場100人あたりコメント',
      next: '人は来たのに発言が少ない時間を探す'
    },
    {
      name: '応援者ちくらんβ',
      status: marketingSkillStatus(input.supporterChikuran.rows.length > 0),
      input: `${input.supporterChikuran.totals.supporterCount}名候補`,
      output: 'コメント・ギフト・広告を合算したローカル応援者',
      next: '応援する人を主役に見る'
    },
    {
      name: 'ギフト深掘り',
      status: marketingSkillStatus(input.giftMomentum.hasSignals, input.giftMomentum.totals.officialGiftPoints > 0),
      input: `${input.giftMomentum.totals.senderCount}名 / ${input.giftMomentum.totals.exactEventCount}時刻つき`,
      output: '送り主タイプ、ギフト前後の反応',
      next: 'ギフトが飛んだ理由とお礼後の流れを見る'
    },
    {
      name: '広告・イベント',
      status: marketingSkillStatus(input.adContributionRanking.length > 0 || Boolean(input.eventRanking)),
      input: `広告 ${input.adContributionRanking.length}行 / イベント ${input.eventRanking ? 'あり' : 'なし'}`,
      output: '広告勢、イベント順位、差分',
      next: '支援行動と順位変動を同じ時間軸で見る'
    },
    {
      name: '層別マーケ',
      status: marketingSkillStatus(r.uniqueUsers > 0),
      input: `ヘビー ${r.segmentCounts.heavy} / 中間 ${r.segmentCounts.mid} / 一見 ${r.segmentCounts.once}`,
      output: 'コメント層ごとの入口と打ち手',
      next: '初見・常連・匿名の入口を分ける'
    },
    {
      name: '過去比較',
      status: marketingSkillStatus(input.pastBroadcasts.length >= 2, input.pastBroadcasts.length > 0),
      input: `${input.pastBroadcasts.length}枠`,
      output: '常連化、成長、似てる配信、曜日時間',
      next: '今回だけのブレと継続傾向を分ける'
    },
    {
      name: '言葉・切り抜き',
      status: marketingSkillStatus(input.uniqueWords.length > 0 || input.talentPeaks.length > 0),
      input: `人気語 ${input.uniqueWords.length} / ピーク ${input.talentPeaks.length}`,
      output: '切り抜き候補、告知素材、視聴者発の言葉',
      next: '告知や次回タイトルに使える素材を探す'
    },
    {
      name: '沈黙・速度診断',
      status: marketingSkillStatus(input.silenceZones.length > 0 || r.timeline.length > 1),
      input: `沈黙 ${input.silenceZones.length} / timeline ${r.timeline.length}点`,
      output: 'コメント速度、沈黙の質、盛り上がりの山',
      next: '間が空いた理由と再点火のきっかけを見る'
    },
    {
      name: '共有/AI準備',
      status: marketingSkillStatus(true),
      input: input.maskShareLabels ? '共有伏せ字ON' : 'ローカル詳細',
      output: 'HTML内JSON、表計算、必要時だけAI共有',
      next: '外部AIや共有は明示操作した時だけ使う'
    }
  ];
  const activeCount = skills.filter((s) => s.status.className === 'on').length;
  const partialCount = skills.filter((s) => s.status.className === 'partial').length;
  const cards = [
    {
      label: 'オーケストレーター',
      value: 'Build→Run→Diagnose',
      hint: '記録を集め、分析を走らせ、次に見る場所を出す'
    },
    {
      label: 'ONスキル',
      value: `${activeCount}/${skills.length}`,
      hint: partialCount > 0 ? `一部 ${partialCount}件も利用` : '取得済みデータで起動'
    },
    {
      label: '必要時だけ',
      value: 'Opt-in',
      hint: '共有・AI連携は明示操作時だけ'
    },
    {
      label: '要点化',
      value: `${formatEventRankingNumber(r.totalComments)}件→${skills.length}系統`,
      hint: '大きなログを読める粒度に圧縮'
    }
  ];
  const loopRows = [
    { step: 'Build', label: '記録を束ねる', detail: 'コメント、来場、ギフト、広告、過去配信を同じHTMLに集める' },
    { step: 'Run', label: '必要なスキルだけ走る', detail: 'データがある分析はON、足りない分析は一部/待機で表示する' },
    { step: 'Diagnose', label: '詰まりを見つける', detail: '来場から発言、応援からギフト、ギフト後の反応を診断する' },
    { step: 'Render', label: '見える形にする', detail: 'PCでは表、スマホではカード、JSONでは再利用できる形に出す' }
  ];
  return { cards, skills, loopRows };
}

/** @param {ReturnType<typeof buildAnalysisSkillBoard>} board */
function sectionAnalysisSkillBoard(board) {
  const cardHtml = board.cards
    .map(
      (c) => `<div class="mkt-skill-card">
<span class="mkt-skill-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-skill-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-skill-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  const loopHtml = board.loopRows
    .map(
      (row) => `<article class="mkt-skill-loop-step">
<span class="mkt-skill-loop-step__step">${escapeHtml(row.step)}</span>
<strong>${escapeHtml(row.label)}</strong>
<p>${escapeHtml(row.detail)}</p>
</article>`
    )
    .join('');
  const skillHtml = board.skills
    .map(
      (row) => `<tr>
<td data-label="スキル">${escapeHtml(row.name)}</td>
<td data-label="状態"><span class="mkt-skill-status mkt-skill-status--${escapeAttr(row.status.className)}">${escapeHtml(row.status.label)}</span></td>
<td data-label="入力">${escapeHtml(row.input)}</td>
<td data-label="出力">${escapeHtml(row.output)}</td>
<td data-label="次に読む">${escapeHtml(row.next)}</td>
</tr>`
    )
    .join('');
  return `<section class="mkt-section mkt-section--analysis-skills" id="mkt-analysis-skills">
<h2>分析スキルボード</h2>
<p class="mkt-note">このHTML全体を、小さな分析スキルの集まりとして見ます。取得できたデータだけを使い、足りない部分は待機として見える化します。</p>
<div class="mkt-skill-card-grid">${cardHtml}</div>
<div class="mkt-skill-loop">${loopHtml}</div>
<h3 class="mkt-subhead">起動した分析スキル</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-skill-table">
<thead><tr><th>スキル</th><th>状態</th><th>入力</th><th>出力</th><th>次に読む</th></tr></thead>
<tbody>${skillHtml}</tbody>
</table></div>
</section>`;
}

/**
 * @param {{
 *   report: MarketingReport,
 *   audienceGap: import('./audienceEngagementGap.js').AudienceEngagementGap,
 *   giftMomentum: import('./giftMomentumAnalytics.js').GiftMomentumAnalysis,
 *   supporterChikuran: ReturnType<typeof buildSupporterChikuranRows>,
 *   analysisSkillBoard: ReturnType<typeof buildAnalysisSkillBoard>,
 *   sessionSummaryRows: readonly unknown[],
 *   pastBroadcasts: readonly unknown[],
 *   adContributionRanking: readonly unknown[],
 *   eventRanking: EventRankingReportModel | null | undefined,
 *   programStats: unknown,
 *   maskShareLabels: boolean
 * }} input
 */
function buildHarnessScalingBoard(input) {
  const r = input.report;
  const skillOn = input.analysisSkillBoard.skills.filter((s) => s.status.className === 'on').length;
  const skillPartial = input.analysisSkillBoard.skills.filter((s) => s.status.className === 'partial').length;
  const skillOff = input.analysisSkillBoard.skills.length - skillOn - skillPartial;
  const memorySignals = [
    r.totalComments > 0,
    input.audienceGap.totalVisitors > 0 || input.sessionSummaryRows.length > 0 || Boolean(input.programStats),
    input.giftMomentum.hasSignals,
    input.adContributionRanking.length > 0 || Boolean(input.eventRanking),
    input.pastBroadcasts.length > 0,
    input.supporterChikuran.rows.length > 0
  ].filter(Boolean).length;
  const contextUnits = skillOn + skillPartial;
  const cards = [
    {
      label: 'System scaling',
      value: 'Harness',
      hint: '記憶・文脈・スキル・検証を分析対象にする'
    },
    {
      label: '記憶基盤',
      value: `${memorySignals}/6系統`,
      hint: 'コメント、来場、ギフト、広告、過去配信'
    },
    {
      label: '動的コンテキスト',
      value: `${formatEventRankingNumber(r.totalComments)}件→${contextUnits}系統`,
      hint: '取得済み素材だけで読む順番を組む'
    },
    {
      label: '検証ゲート',
      value: input.maskShareLabels ? '伏せ字ON' : 'Local first',
      hint: '共有・AI連携は明示操作時だけ'
    }
  ];
  const layerRows = [
    {
      layer: '記憶基盤',
      current: `コメント ${formatEventRankingNumber(r.totalComments)}件 / 過去 ${input.pastBroadcasts.length}枠`,
      role: 'HTML内JSONと各セクションの共通材料を残す',
      scale: '保存対象を増やすほど、比較・継続・常連化を読みやすくする'
    },
    {
      layer: '動的コンテキスト',
      current: `来場 ${marketingMetricLabel(input.audienceGap.totalVisitors, '人')} / サンプル ${input.sessionSummaryRows.length}点`,
      role: '来場→発言→応援→支援へ、配信ごとに読む順番を組み替える',
      scale: '時間窓と番組統計を足して、盛り上がりの前後関係を強くする'
    },
    {
      layer: 'スキルルーティング',
      current: `ON ${skillOn} / 一部 ${skillPartial} / 待機 ${skillOff}`,
      role: '必要な分析だけ起動し、足りない入力は待機として見せる',
      scale: '新しい分析スキルを足しても入口と読み順を崩さない'
    },
    {
      layer: 'オーケストレーション',
      current: 'Build → Run → Diagnose → Render',
      role: '集計、診断、打ち手、HTML表示を同じ流れで接続する',
      scale: 'ギフト・広告・イベントのタイミングを同じ時間軸へ寄せる'
    },
    {
      layer: '検証・ガバナンス',
      current: input.maskShareLabels ? '共有伏せ字ON' : 'ローカル詳細',
      role: 'ローカル優先、共有/AIは明示操作、スマホ表示はカード化する',
      scale: '将来のクラウド同期やAI共有を、同意と検証の別ゲートで扱う'
    }
  ];
  const gateRows = [
    {
      gate: 'ローカル優先',
      status: 'ON',
      check: 'HTML生成時点で外部送信なし',
      meaning: '利用者のPCに残った材料だけでまず読む'
    },
    {
      gate: '文脈効率',
      status: `${contextUnits}/${input.analysisSkillBoard.skills.length}`,
      check: 'スキルの ON / 一部 / 待機',
      meaning: '全部を読む前に、見るべき分析へ進める'
    },
    {
      gate: '記憶衛生',
      status: `${memorySignals}/6`,
      check: 'データソース表と欠損診断',
      meaning: 'あるデータと足りないデータを分けて表示する'
    },
    {
      gate: '信頼性',
      status: '検証対象',
      check: 'unit / lint / build / visual',
      meaning: '表、カード、スマホ表示の崩れを検査しやすくする'
    },
    {
      gate: '安全な進化',
      status: 'Opt-in',
      check: '共有伏せ字とAI準備',
      meaning: 'クラウド・AI連携は同意を別ゲートにする'
    }
  ];
  return { cards, layerRows, gateRows };
}

/** @param {ReturnType<typeof buildHarnessScalingBoard>} board */
function sectionHarnessScalingBoard(board) {
  const cardHtml = board.cards
    .map(
      (c) => `<div class="mkt-harness-card">
<span class="mkt-harness-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-harness-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-harness-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  const layerHtml = board.layerRows
    .map(
      (row) => `<tr>
<td data-label="層">${escapeHtml(row.layer)}</td>
<td data-label="今の入力">${escapeHtml(row.current)}</td>
<td data-label="HTMLでの役割">${escapeHtml(row.role)}</td>
<td data-label="伸ばし方">${escapeHtml(row.scale)}</td>
</tr>`
    )
    .join('');
  const gateHtml = board.gateRows
    .map(
      (row) => `<tr>
<td data-label="ゲート">${escapeHtml(row.gate)}</td>
<td data-label="状態"><span class="mkt-harness-gate-status">${escapeHtml(row.status)}</span></td>
<td data-label="見ているもの">${escapeHtml(row.check)}</td>
<td data-label="意味">${escapeHtml(row.meaning)}</td>
</tr>`
    )
    .join('');
  return `<section class="mkt-section mkt-section--harness" id="mkt-harness-scaling">
<h2>分析ハーネス設計</h2>
<p class="mkt-note">モデルだけでなく、記憶・文脈構築・スキル選択・実行ループ・検証を束ねる仕組みを育てる考え方を、このローカルHTML分析の全体設計に入れます。外部AIや共有は明示操作時だけです。</p>
<div class="mkt-harness-card-grid">${cardHtml}</div>
<h3 class="mkt-subhead">ハーネス層</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-harness-layer-table">
<thead><tr><th>層</th><th>今の入力</th><th>HTMLでの役割</th><th>伸ばし方</th></tr></thead>
<tbody>${layerHtml}</tbody>
</table></div>
<h3 class="mkt-subhead">信頼性ゲート</h3>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-harness-gate-table">
<thead><tr><th>ゲート</th><th>状態</th><th>見ているもの</th><th>意味</th></tr></thead>
<tbody>${gateHtml}</tbody>
</table></div>
</section>`;
}

/** @param {string} source */
function supporterChikuranSourceLabel(source) {
  return {
    comment: 'コメント',
    'gift-users': 'ギフト記録',
    'gift-events': 'ギフト時刻',
    'gift-contribution': 'ギフト貢献度',
    'ad-contribution': '広告'
  }[source] || source;
}

/**
 * @param {import('./supporterChikuranScore.js').SupporterChikuranRow} row
 * @param {boolean} maskShare
 * @returns {string}
 */
function supporterChikuranNameHtml(row, maskShare) {
  const rawLabel = row.isAnonymousAggregate
    ? '匿名応援'
    : row.userId && /^\d+$/.test(row.userId)
      ? displayUserLabel(row.userId, row.displayName || '')
      : row.displayName || '応援者';
  if (row.isAnonymousAggregate) return escapeHtml(rawLabel);
  if (maskShare) return escapeHtml(maskLabelForShare(rawLabel));
  return row.userId && /^\d+$/.test(row.userId)
    ? buildUserProfileLinkedLabelHtml(row.userId, rawLabel)
    : escapeHtml(rawLabel);
}

/**
 * @param {import('./supporterChikuranScore.js').SupporterChikuranRow} row
 * @param {number} rank
 * @param {boolean} maskShare
 * @param {((uid: string) => string) | undefined} identiconResolver
 * @returns {string}
 */
function supporterChikuranAvatarHtml(row, rank, maskShare, identiconResolver) {
  if (maskShare || row.isAnonymousAggregate) {
    return `<span class="mkt-supporter-avatar mkt-supporter-avatar--empty" aria-hidden="true">${rank}</span>`;
  }
  const thumbSrc = resolveReportUserThumbSrc({
    userId: row.userId || '',
    avatarUrl: row.avatarUrl || '',
    identiconResolver
  });
  return thumbSrc
    ? `<img class="mkt-supporter-avatar" src="${escapeAttr(thumbSrc)}" alt="" width="34" height="34" loading="lazy" decoding="async" ${DEFAULT_USERICON_ONERROR_ATTR}>`
    : `<span class="mkt-supporter-avatar mkt-supporter-avatar--empty" aria-hidden="true">${rank}</span>`;
}

/**
 * @param {import('./supporterChikuranScore.js').SupporterChikuranRow[]} rows
 * @param {boolean} maskShare
 */
function supporterChikuranSummaryLine(rows, maskShare) {
  const top = rows[0];
  if (!top) return '手元データから見える応援者の勢いはまだ薄めです。';
  const signals = [];
  if (top.commentCount > 0) signals.push(`コメント${top.commentCount}件`);
  if (top.giftThrowCount > 0) signals.push(`ギフト${top.giftThrowCount}投`);
  if (top.giftPointTotal > 0) signals.push(`${formatEventRankingNumber(top.giftPointTotal)}pt`);
  if (top.adPointTotal > 0) signals.push(`広告${formatEventRankingNumber(top.adPointTotal)}pt`);
  const detail = signals.length ? `（${signals.join(' / ')}）` : '';
  const rawName = top.isAnonymousAggregate
    ? '匿名応援'
    : top.userId && /^\d+$/.test(top.userId)
      ? displayUserLabel(top.userId, top.displayName || '')
      : top.displayName || '応援者';
  const name = !top.isAnonymousAggregate && maskShare ? maskLabelForShare(rawName) : rawName;
  return `${name}さんが、このPCで見た応援の勢いでは先頭です${detail}。`;
}

/**
 * @param {ReturnType<typeof buildSupporterChikuranRows>} analysis
 * @param {boolean} maskShare
 * @param {((uid: string) => string) | undefined} identiconResolver
 */
function sectionSupporterChikuranBeta(analysis, maskShare, identiconResolver) {
  if (!analysis || !Array.isArray(analysis.rows) || analysis.rows.length === 0) return '';
  const rows = analysis.rows.slice(0, 15);
  const maxScore = Math.max(1, ...rows.map((row) => row.totalScore || 0));
  const giftSupporterCount = rows.filter(
    (row) => row.giftThrowCount > 0 || row.giftPointTotal > 0
  ).length;
  const adSupporterCount = rows.filter((row) => row.adPointTotal > 0).length;
  const recentSupporterCount = rows.filter((row) => row.recent15mCommentCount > 0).length;
  const cards = [
    {
      label: '応援者候補',
      value: `${analysis.totals.supporterCount}名`,
      hint: 'コメント・ギフト・広告を合算'
    },
    {
      label: '直近15分で反応',
      value: `${recentSupporterCount}名`,
      hint: '最近のコメント勢い'
    },
    {
      label: 'ギフト反応あり',
      value: `${giftSupporterCount}名`,
      hint: '投げ回数またはptあり'
    },
    {
      label: '広告/匿名',
      value: `${adSupporterCount}名 / ${analysis.totals.anonymousIncluded ? 'あり' : 'なし'}`,
      hint: '広告ptと匿名応援の有無'
    }
  ];
  const cardHtml = cards
    .map(
      (c) => `<div class="mkt-supporter-card">
<span class="mkt-supporter-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-supporter-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-supporter-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  const rowHtml = rows
    .map((row, i) => {
      const rank = i + 1;
      const pct = Math.max(4, Math.min(100, Math.round((row.totalScore / maxScore) * 100)));
      const giftLabel =
        row.giftThrowCount > 0 || row.giftPointTotal > 0
          ? `${row.giftThrowCount || 0}投 / ${
              row.giftPointTotal > 0 ? `${formatEventRankingNumber(row.giftPointTotal)}pt` : 'pt未取得'
            }`
          : '—';
      const adLabel = row.adPointTotal > 0 ? `${formatEventRankingNumber(row.adPointTotal)}pt` : '—';
      const sources = row.sources.length
        ? row.sources
            .map((source) => `<span class="mkt-supporter-source">${escapeHtml(supporterChikuranSourceLabel(source))}</span>`)
            .join(' ')
        : '<span class="mkt-supporter-source mkt-supporter-source--muted">手元記録</span>';
      return `<tr>
<td data-label="#">${rank}</td>
<td data-label="応援者" class="mkt-supporter-name">
<div class="mkt-supporter-person">${supporterChikuranAvatarHtml(row, rank, maskShare, identiconResolver)}<span>${supporterChikuranNameHtml(row, maskShare)}</span></div>
</td>
<td data-label="ローカル勢い" class="mkt-supporter-score-cell">
<div class="mkt-supporter-score"><strong>${escapeHtml(String(row.totalScore))}</strong><span class="mkt-supporter-scorebar"><i style="width:${pct}%"></i></span></div>
</td>
<td data-label="コメ" class="mkt-num">${row.commentCount}</td>
<td data-label="直近15分" class="mkt-num">${row.recent15mCommentCount || '—'}</td>
<td data-label="ギフト">${escapeHtml(giftLabel)}</td>
<td data-label="広告pt">${escapeHtml(adLabel)}</td>
<td data-label="根拠" class="mkt-supporter-sources">${sources}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section mkt-section--supporter-chikuran" id="mkt-supporter-chikuran">
<h2>応援者ちくらん β（ローカル）</h2>
<p class="mkt-note">このPCに残ったコメント・ギフト・広告・貢献度だけで見た<strong>応援する人が主役</strong>の勢いです。公式順位ではありません。</p>
<div class="mkt-supporter-card-grid">${cardHtml}</div>
<p class="mkt-supporter-summary">${escapeHtml(supporterChikuranSummaryLine(rows, maskShare))}</p>
<div class="mkt-table-scroll"><table class="mkt-rank mkt-supporter-table">
<thead><tr><th>#</th><th>応援者</th><th>ローカル勢い</th><th>コメ</th><th>直近15分</th><th>ギフト</th><th>広告pt</th><th>根拠</th></tr></thead>
<tbody>${rowHtml}</tbody>
</table></div>
</section>`;
}

/**
 * @param {MarketingReport} r
 * @param {{
 *   maskShareLabels?: boolean,
 *   anonymousIdenticonResolver?: (uid: string) => string,
 *   broadcasterUserId?: string,
 *   sessionSummaryRows?: import('./concurrentTimelineSeries.js').ConcurrentTimelineRow[],
 *   commentsForAnalytics?: import('./commentVelocityTimeline.js').VelocityCommentInput[],
 *   pastBroadcasts?: import('./commenterHistoricalAnalytics.js').BroadcastBundle[],
 *   giftUsers?: import('./giftRecord.js').StoredGiftUser[],
 *   giftEvents?: import('./giftEventStore.js').StoredGiftEvent[],
 *   giftHistoryThrows?: Array<{ userId?: string, nickname?: string, throwCount?: number, totalPoints?: number, capturedAt?: number }>,
 *   officialEventDomBundle?: import('./officialEventDomBundle.js').OfficialEventDomBundle | null,
 *   broadcastTitle?: string,
 *   broadcasterName?: string,
 *   recordedCommentCount?: number,
 *   streamAgeMin?: number,
 *   yukkuriImageDataUrlMap?: Record<string, string>,
 *   eventRanking?: EventRankingReportModel | null
 * }} [opts]
 * @returns {string}
 */
export function buildMarketingDashboardHtml(r, opts = {}) {
  const maskShare = opts.maskShareLabels === true;
  // 0.1.12 (F1/F3): 匿名 a:... に identicon SVG data URL を当てるための resolver。
  // popup-entry 側で事前計算したマップを引いてもらう（ここからは識別の責務は持たない）。
  const identiconResolver =
    typeof opts.anonymousIdenticonResolver === 'function'
      ? opts.anonymousIdenticonResolver
      : undefined;
  // 0.1.17 (R): 配信者本人の userId を thread。サムネ付きユーザー一覧 / トップコメンター
  // から除外する（配信者は応援される側で、応援する側ではない）。
  const broadcasterUserId =
    typeof opts.broadcasterUserId === 'string' ? opts.broadcasterUserId : '';
  // 0.1.22 (W): 同接推移は IDB から取得した session sample を popup 側で渡す。
  const sessionSummaryRows = Array.isArray(opts.sessionSummaryRows)
    ? opts.sessionSummaryRows
    : [];
  const exportedAtIso = new Date().toISOString();
  const embedJson = buildMarketingEmbedScriptInnerText(r, {
    maskShareLabels: maskShare,
    exportedAt: exportedAtIso
  });
  const subSuffix = maskShare ? ' · 共有向けに表示名を伏せた出力' : '';

  // 0.1.22 (W): 純粋関数で全集計を回し、各セクションに渡す。
  const concurrentSeries = buildConcurrentTimelineSeries(sessionSummaryRows);
  const concurrentPeak = analyzeConcurrentPeak(concurrentSeries);
  // velocity / silence / laughter は MarketingReport には乗っていないので、
  // r 経由で comments 全件は取れない。代わりに r.timeline の 1 分 bucket を流用するか、
  // opts.commentsForTimeline を別経路で受ける。今回は opts.commentsForAnalytics を採用。
  const commentsForAnalytics = Array.isArray(opts.commentsForAnalytics)
    ? opts.commentsForAnalytics
    : [];
  const velocityTimeline = buildCommentVelocityTimeline(commentsForAnalytics, {
    bucketMs: 60_000,
    rollingWindowMin: 5
  });
  const silenceZones = detectCommentSilenceZones(commentsForAnalytics, {
    thresholdMs: 60_000,
    quality: { windowMs: 30_000 }
  });
  const laughterDensity = buildLaughterDensityTimeline(commentsForAnalytics, {
    bucketMs: 30_000
  });

  // 0.1.23 (X): 過去 N 配信を突き合わせるユーザー層分析。pastBroadcasts 未渡しなら
  // 空集計が返る（純粋関数側で吸収）。配信者本人は除外する。
  const pastBroadcasts = Array.isArray(opts.pastBroadcasts) ? opts.pastBroadcasts : [];
  /** @type {(cs: any) => any[]} */
  const filterBroadcaster = broadcasterUserId
    ? (cs) =>
        Array.isArray(cs)
          ? cs.filter((c) => String(c?.userId || '').trim() !== broadcasterUserId)
          : []
    : (cs) => (Array.isArray(cs) ? cs : []);
  const currentCommentsForLayer = filterBroadcaster(commentsForAnalytics);
  const broadcastNarrative = buildBroadcastNarrative({
    report: r,
    comments: currentCommentsForLayer,
    broadcasterUserId,
    includeSamples: !maskShare
  });
  const pastBroadcastsForLayer = pastBroadcasts.map((b) => ({
    liveId: String(b?.liveId || ''),
    comments: filterBroadcaster(b?.comments)
  }));
  const newVsRepeat = classifyCommentersAgainstHistory({
    currentLiveId: r.liveId,
    currentComments: currentCommentsForLayer,
    pastBroadcasts: pastBroadcastsForLayer,
    heavyThreshold: 5
  });
  const survivalCurve = buildCommenterSurvivalCurve(currentCommentsForLayer, {
    segmentCount: 5
  });
  const departedHeavy = findDepartedHeavyCommenters({
    currentComments: currentCommentsForLayer,
    pastBroadcasts: pastBroadcastsForLayer.filter(
      (b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()
    ),
    heavyThreshold: 5,
    topN: 15
  });
  // 出席カレンダーは「過去 + 現在」を含めた 全 N 配信 で
  const attendanceMatrix = buildCommenterAttendanceMatrix({
    broadcasts: [
      ...pastBroadcastsForLayer.filter(
        (b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()
      ),
      { liveId: r.liveId, comments: currentCommentsForLayer }
    ],
    topN: 20
  });
  const keyboardTypes = diagnoseKeyboardTypes(commentsForAnalytics, {
    broadcasterUserId
  });

  // 0.1.24 (Y): 横断比較・予兆・波形指紋。
  const allBroadcastsForCompare = [
    ...pastBroadcastsForLayer.filter(
      (b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase()
    ),
    { liveId: String(r.liveId || ''), comments: currentCommentsForLayer }
  ];
  const recentComparison = buildRecentBroadcastComparison({
    broadcasts: allBroadcastsForCompare,
    limit: 5
  });
  const weekdayHourHeat = buildWeekdayHourHeatmap({
    broadcasts: allBroadcastsForCompare
  });
  // 成長メーター: 「総コメ数」を指標に
  const pastTotalsForGrowth = pastBroadcastsForLayer
    .filter((b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase())
    .map((b) => (Array.isArray(b.comments) ? b.comments.length : 0))
    .filter((n) => n > 0);
  const growth = computeBroadcastGrowthScore({
    currentValue: r.totalComments || currentCommentsForLayer.length,
    pastValues: pastTotalsForGrowth
  });
  const openingFivePts = buildOpeningFiveMinutePoints(allBroadcastsForCompare);
  // 波形指紋: 現在 + 各過去配信の指紋を作って類似度上位を出す
  const currentFingerprint = buildBroadcastWaveformFingerprint(currentCommentsForLayer);
  const pastFingerprints = pastBroadcastsForLayer
    .filter((b) => String(b.liveId).toLowerCase() !== String(r.liveId).toLowerCase())
    .map((b) => {
      const fp = buildBroadcastWaveformFingerprint(b.comments);
      return fp ? { liveId: b.liveId, vector: fp.vector, totalCount: fp.totalCount } : null;
    })
    .filter(/** @returns {x is { liveId: string, vector: number[], totalCount: number }} */ (x) => x != null);
  const similarBroadcasts = currentFingerprint
    ? findSimilarBroadcasts(
        { liveId: String(r.liveId || ''), vector: currentFingerprint.vector, totalCount: currentFingerprint.totalCount },
        pastFingerprints,
        { topN: 5 }
      )
    : [];

  // 0.1.25 (Z): 文化分析 7 件。
  const echoPropagation = detectCommentPropagation(currentCommentsForLayer, {
    windowMs: 30_000,
    minDistinctUsers: 3
  });
  const echoSync = detectCommentSyncBursts(currentCommentsForLayer, {
    windowMs: 5_000,
    minDistinctUsers: 3
  });
  const firstSecondLatency = buildCommenterFirstSecondLatency(currentCommentsForLayer);
  const talentPeaks = detectTalentPeakMoments(currentCommentsForLayer);
  const sentimentCurve = scoreSentimentTimeline(currentCommentsForLayer, {
    bucketMs: 60_000
  });
  // 自コメ抜粋: selfPosted=true のもの
  const selfComments = Array.isArray(opts.commentsForAnalytics)
    ? opts.commentsForAnalytics.filter((c) =>
        Boolean(/** @type {{ selfPosted?: any }} */ (c)?.selfPosted)
      )
    : [];
  const uniqueWords = suggestUniqueWords({
    allComments: currentCommentsForLayer,
    selfComments,
    topN: 15,
    minOccurrence: 3
  });
  // リーチ係数: 直近 5 分の active commenters と現在の concurrent estimate
  const lastPoint = concurrentSeries.points[concurrentSeries.points.length - 1];
  const recentActiveCommenters = (() => {
    if (!currentCommentsForLayer.length) return 0;
    const last = currentCommentsForLayer.reduce(
      (mx, c) => (typeof c?.capturedAt === 'number' && c.capturedAt > mx ? c.capturedAt : mx),
      0
    );
    if (!last) return 0;
    const since = last - 5 * 60_000;
    /** @type {Set<string>} */
    const recent = new Set();
    for (const c of currentCommentsForLayer) {
      if (typeof c?.capturedAt !== 'number' || c.capturedAt < since) continue;
      const uid = c.userId == null ? '' : String(c.userId).trim();
      if (uid) recent.add(uid);
    }
    return recent.size;
  })();
  const reach = computeReachCoefficient({
    currentConcurrent: lastPoint ? lastPoint.value : NaN,
    uniqueCommentersInWindow: recentActiveCommenters
  });

  /*
   * 0.1.49 (AE): marketingDynamicAdvice.js の rule registry に渡す metrics を
   *   集約データから組み立てる。各セクションの advice 配置位置で
   *   `dynamicAdviceCardsHtml(section, metricsForAdvice)` を呼ぶと、データに応じた
   *   キャラ別アドバイス（最大 3 件）が静的アドバイスの後ろに出力される。
   */
  const dynMetrics = buildDynamicAdviceMetrics({
    r,
    concurrentPeak,
    laughterDensity,
    silenceZones,
    newVsRepeat,
    sentimentCurve,
    reach,
    growth,
    firstSecondLatency,
    survivalCurve,
    talentPeaks,
    echoPropagation,
    echoSync,
    recentComparison,
    uniqueWords,
    similarBroadcasts,
    keyboardTypes
  });

  const giftUsersForSg = Array.isArray(opts.giftUsers) ? opts.giftUsers : [];
  const giftEventsForAnalytics = Array.isArray(opts.giftEvents) ? opts.giftEvents : [];
  const giftHistoryThrowsForAnalytics = Array.isArray(opts.giftHistoryThrows)
    ? opts.giftHistoryThrows
    : [];
  const officialGiftHistoryForAnalytics = Array.isArray(opts.officialEventDomBundle?.giftHistory)
    ? opts.officialEventDomBundle.giftHistory
    : [];
  const giftContributionRankingForAnalytics = Array.isArray(
    opts.officialEventDomBundle?.contributionRanking
  )
    ? opts.officialEventDomBundle.contributionRanking
    : [];
  const adContributionRankingForAnalytics = Array.isArray(
    opts.officialEventDomBundle?.adContributionRanking
  )
    ? opts.officialEventDomBundle.adContributionRanking
    : [];
  const sgInsights = buildSupportGrowthInsights({
    report: r,
    comments: currentCommentsForLayer,
    giftUsers: giftUsersForSg,
    sessionSummaryRows,
    pastBroadcasts: pastBroadcastsForLayer,
    broadcasterUserId,
    maskShareLabels: maskShare
  });
  const giftMomentum = analyzeGiftMomentum({
    comments: currentCommentsForLayer,
    giftUsers: giftUsersForSg,
    giftEvents: giftEventsForAnalytics,
    giftHistoryThrows: giftHistoryThrowsForAnalytics,
    officialGiftHistory: officialGiftHistoryForAnalytics,
    giftContributionRanking: giftContributionRankingForAnalytics,
    adContributionRanking: adContributionRankingForAnalytics,
    programStats: opts.officialEventDomBundle?.programStats || null
  }, {
    broadcasterUserId
  });
  const supporterChikuran = buildSupporterChikuranRows({
    liveId: r.liveId,
    comments: currentCommentsForLayer,
    giftUsers: giftUsersForSg,
    giftEvents: giftEventsForAnalytics,
    giftContributionRanking: [
      ...giftContributionRankingForAnalytics,
      ...giftHistoryThrowsForAnalytics
    ],
    adContributionRanking: adContributionRankingForAnalytics
  }, {
    liveId: r.liveId,
    excludeUserIds: broadcasterUserId ? [broadcasterUserId] : [],
    maxRows: 15
  });
  const audienceGap = analyzeAudienceEngagementGap({
    liveId: r.liveId,
    comments: currentCommentsForLayer,
    samples: sessionSummaryRows,
    visitorCount: opts.officialEventDomBundle?.programStats?.watchCount ?? null,
    officialCommentCount: opts.officialEventDomBundle?.programStats?.commentCount ?? null
  }, {
    broadcasterUserId
  });
  const marketingDataSummary = buildMarketingDataSummary({
    report: r,
    audienceGap,
    giftMomentum,
    supporterChikuran,
    sessionSummaryRows,
    pastBroadcasts: pastBroadcastsForLayer,
    giftUsers: giftUsersForSg,
    giftEvents: giftEventsForAnalytics,
    giftHistoryThrows: giftHistoryThrowsForAnalytics,
    officialGiftHistory: officialGiftHistoryForAnalytics,
    giftContributionRanking: giftContributionRankingForAnalytics,
    adContributionRanking: adContributionRankingForAnalytics,
    programStats: opts.officialEventDomBundle?.programStats || null,
    eventRanking: opts.eventRanking || null
  });
  const marketingFunnelBoard = buildMarketingFunnelBoard({
    report: r,
    audienceGap,
    giftMomentum,
    supporterChikuran,
    sessionSummaryRows,
    pastBroadcasts: pastBroadcastsForLayer,
    giftUsers: giftUsersForSg,
    giftEvents: giftEventsForAnalytics,
    giftHistoryThrows: giftHistoryThrowsForAnalytics,
    officialGiftHistory: officialGiftHistoryForAnalytics,
    giftContributionRanking: giftContributionRankingForAnalytics,
    adContributionRanking: adContributionRankingForAnalytics,
    programStats: opts.officialEventDomBundle?.programStats || null,
    eventRanking: opts.eventRanking || null
  });
  const marketingSegmentActionBoard = buildMarketingSegmentActionBoard({
    report: r,
    giftMomentum,
    supporterChikuran
  });
  const analysisSkillBoard = buildAnalysisSkillBoard({
    report: r,
    audienceGap,
    giftMomentum,
    supporterChikuran,
    sessionSummaryRows,
    pastBroadcasts: pastBroadcastsForLayer,
    adContributionRanking: adContributionRankingForAnalytics,
    eventRanking: opts.eventRanking || null,
    uniqueWords,
    talentPeaks,
    silenceZones,
    recentComparison,
    maskShareLabels: maskShare
  });
  const harnessScalingBoard = buildHarnessScalingBoard({
    report: r,
    audienceGap,
    giftMomentum,
    supporterChikuran,
    analysisSkillBoard,
    sessionSummaryRows,
    pastBroadcasts: pastBroadcastsForLayer,
    adContributionRanking: adContributionRankingForAnalytics,
    eventRanking: opts.eventRanking || null,
    programStats: opts.officialEventDomBundle?.programStats || null,
    maskShareLabels: maskShare
  });
  const metricsForAdvice = {
    ...dynMetrics,
    ...supportGrowthMetricsForAdvice(sgInsights.adviceSlice)
  };

  // 0.1.26 (AA): TOC は「実際に描画されたセクション」だけ表示する。
  // 沈黙ゾーンやコメ伝染など、データ不足で空文字を返すセクションをクリックしても
  // 何も起こらない／謎のスクロール挙動になる問題を解消する。
  const allTocItems = [
    { id: 'mkt-analysis-skills', label: '分析スキルボード' },
    { id: 'mkt-harness-scaling', label: '分析ハーネス設計' },
    { id: 'mkt-next-actions', label: 'りんく達の作戦会議' },
    { id: 'mkt-data-summary', label: 'マーケ総合サマリ' },
    { id: 'mkt-marketing-funnel', label: 'マーケファネル' },
    { id: 'mkt-segment-action', label: '層別マーケ診断' },
    { id: 'mkt-audience-gap', label: '来場→コメント変換率' },
    { id: 'mkt-supporter-chikuran', label: '応援者ちくらんβ' },
    { id: 'mkt-support-chance', label: '応援が増えそうな時間' },
    { id: 'mkt-gift-flow', label: 'ギフトの流れ' },
    { id: 'mkt-gift-deep', label: 'ギフト深掘り' },
    { id: 'mkt-onboarding', label: '初見さんの手がかり' },
    { id: 'mkt-clip-promo', label: '切り抜き・告知候補' },
    { id: 'mkt-listener-care', label: 'リスナーお返し' },
    { id: 'mkt-ask-timing', label: 'お願いの出しどころ' },
    { id: 'mkt-sg-caution', label: '読み取りの注意' },
    { id: 'mkt-event-ranking', label: 'イベント順位' },
    { id: 'mkt-kpi', label: 'KPI サマリ' },
    { id: 'mkt-content', label: 'コメント本文・属性の傾向' },
    { id: 'mkt-narrative', label: '配信内容の流れ' },
    { id: 'mkt-quarter', label: '冒頭・終盤（四分位）' },
    { id: 'mkt-timeline', label: 'コメントタイムライン' },
    { id: 'mkt-velocity', label: 'コメ速度カーブ（PRO）' },
    { id: 'mkt-concurrent', label: '同接推移カーブ（PRO）' },
    { id: 'mkt-silence', label: '沈黙ゾーン × 沈黙の質（PRO）' },
    { id: 'mkt-laughter', label: '笑い密度（PRO）' },
    { id: 'mkt-new-vs-repeat', label: '新規 vs 常連（PRO）' },
    { id: 'mkt-survival', label: 'コメンター生存曲線（PRO）' },
    { id: 'mkt-departed', label: '離反コメンター TOP（PRO）' },
    { id: 'mkt-attendance', label: '常連出席カレンダー（PRO）' },
    { id: 'mkt-keyboard', label: 'キーボード型診断（PRO）' },
    { id: 'mkt-recent-cmp', label: '直近 5 配信の比較（PRO）' },
    { id: 'mkt-weekday-heat', label: '曜日×時間帯ヒートマップ（PRO）' },
    { id: 'mkt-growth-meter', label: '成長メーター（PRO）' },
    { id: 'mkt-opening-five', label: '冒頭 5 分の予兆（PRO）' },
    { id: 'mkt-waveform', label: '似てる配信（波形指紋）（PRO）' },
    { id: 'mkt-echo', label: 'コメ伝染 × 被り（PRO）' },
    { id: 'mkt-first-second', label: '初コメ→2コメ目 latency（PRO）' },
    { id: 'mkt-talent-peak', label: '配信者の話芸ピーク（PRO）' },
    { id: 'mkt-sentiment', label: '感情曲線（PRO）' },
    { id: 'mkt-unique-words', label: '視聴者発の人気語 TOP（PRO）' },
    { id: 'mkt-reach', label: 'リーチ係数（PRO）' },
    { id: 'mkt-derived', label: '累積コメント数と5分窓' },
    { id: 'mkt-segment', label: 'ユーザーセグメント' },
    { id: 'mkt-top-users', label: 'トップコメンター TOP 20' },
    { id: 'mkt-thumb-grid', label: 'サムネ付きユーザー一覧' },
    { id: 'mkt-vpos', label: 'vpos 三分割（再生位置）' },
    { id: 'mkt-hour', label: '時間帯ヒートマップ' },
    { id: 'mkt-json', label: '表計算・ツール向け JSON' }
  ];

  const bodyHtml = `${sectionFeaturesOverview()}
__NL_TOC_PLACEHOLDER__
${sectionAdviceIntro()}
${sectionAnalysisSkillBoard(analysisSkillBoard)}
${sectionHarnessScalingBoard(harnessScalingBoard)}
${renderSupportGrowthSections(sgInsights, metricsForAdvice)}
${sectionMarketingDataSummary(marketingDataSummary)}
${sectionMarketingFunnelBoard(marketingFunnelBoard)}
${sectionMarketingSegmentActionBoard(marketingSegmentActionBoard)}
${sectionAudienceEngagementGap(audienceGap)}
${sectionSupporterChikuranBeta(supporterChikuran, maskShare, identiconResolver)}
${sectionGiftMomentum(giftMomentum, maskShare)}
${idWrap('mkt-event-ranking', sectionEventRanking(opts.eventRanking, maskShare))}
${idWrap('mkt-kpi', sectionKpi(r))}
${sectionAdviceAfterKpi(r)}
${dynamicAdviceCardsHtml('kpi', metricsForAdvice)}
${idWrap('mkt-content', sectionContentShape(r))}
${sectionAdviceAfterContentShape(r)}
${idWrap('mkt-narrative', sectionBroadcastNarrative(broadcastNarrative, maskShare))}
${idWrap('mkt-quarter', sectionQuarterEngagement(r))}
${sectionAdviceAfterQuarterEngagement(r)}
${idWrap('mkt-timeline', sectionTimeline(r))}
${sectionAdviceAfterTimeline(r)}
${sectionCommentVelocityCurve(velocityTimeline)}
${adviceAfterCommentVelocity()}
${sectionConcurrentTimeline(concurrentSeries, concurrentPeak)}
${adviceAfterConcurrent()}
${dynamicAdviceCardsHtml('concurrent', metricsForAdvice)}
${sectionSilenceZones(silenceZones)}
${silenceZones.length ? adviceAfterSilence() : ''}
${silenceZones.length ? dynamicAdviceCardsHtml('silence', metricsForAdvice) : ''}
${sectionLaughterDensity(laughterDensity)}
${laughterDensity.buckets.length >= 2 ? adviceAfterLaughter() : ''}
${laughterDensity.buckets.length >= 2 ? dynamicAdviceCardsHtml('laughter', metricsForAdvice) : ''}
${sectionNewVsRepeat(newVsRepeat)}
${newVsRepeat.totalCurrent > 0 ? adviceAfterNewVsRepeat() : ''}
${newVsRepeat.totalCurrent > 0 ? dynamicAdviceCardsHtml('newVsRepeat', metricsForAdvice) : ''}
${sectionSurvivalCurve(survivalCurve)}
${survivalCurve.segments.length >= 2 ? adviceAfterSurvival() : ''}
${survivalCurve.segments.length >= 2 ? dynamicAdviceCardsHtml('survival', metricsForAdvice) : ''}
${sectionDepartedHeavy(departedHeavy, maskShare, identiconResolver)}
${(!maskShare && departedHeavy.length > 0) ? adviceAfterDeparted() : ''}
${sectionAttendanceMatrix(attendanceMatrix, maskShare, identiconResolver)}
${(!maskShare && attendanceMatrix.users.length > 0 && attendanceMatrix.broadcasts.length >= 2) ? adviceAfterAttendance() : ''}
${sectionKeyboardTypes(keyboardTypes)}
${(keyboardTypes.counts.emoji + keyboardTypes.counts.short + keyboardTypes.counts.long + keyboardTypes.counts.quiet + keyboardTypes.counts.balanced) > 0 ? adviceAfterKeyboard() : ''}
${(keyboardTypes.counts.emoji + keyboardTypes.counts.short + keyboardTypes.counts.long + keyboardTypes.counts.quiet + keyboardTypes.counts.balanced) > 0 ? dynamicAdviceCardsHtml('keyboard', metricsForAdvice) : ''}
${sectionRecentComparison(recentComparison)}
${recentComparison.bars.length >= 2 ? adviceAfterRecentCmp() : ''}
${recentComparison.bars.length >= 2 ? dynamicAdviceCardsHtml('recentCmp', metricsForAdvice) : ''}
${sectionWeekdayHourHeatmap(weekdayHourHeat)}
${weekdayHourHeat.maxValue > 0 ? adviceAfterWeekdayHeat() : ''}
${sectionGrowthMeter(growth, '今回の総コメ数')}
${growth.average != null ? adviceAfterGrowthMeter() : ''}
${growth.average != null ? dynamicAdviceCardsHtml('growth', metricsForAdvice) : ''}
${sectionOpeningFivePrediction(openingFivePts)}
${openingFivePts.points.length >= 2 ? adviceAfterOpeningFive() : ''}
${sectionWaveformSimilarity(similarBroadcasts)}
${similarBroadcasts.length > 0 ? adviceAfterWaveform() : ''}
${similarBroadcasts.length > 0 ? dynamicAdviceCardsHtml('waveform', metricsForAdvice) : ''}
${sectionEchoBursts(echoPropagation, echoSync)}
${(echoPropagation.length > 0 || echoSync.length > 0) ? adviceAfterEcho() : ''}
${(echoPropagation.length > 0 || echoSync.length > 0) ? dynamicAdviceCardsHtml('echo', metricsForAdvice) : ''}
${sectionFirstSecondLatency(firstSecondLatency)}
${firstSecondLatency.totalUsers > 0 ? adviceAfterFirstSecond() : ''}
${firstSecondLatency.totalUsers > 0 ? dynamicAdviceCardsHtml('firstSecond', metricsForAdvice) : ''}
${sectionTalentPeak(talentPeaks)}
${talentPeaks.length > 0 ? adviceAfterTalentPeak() : ''}
${talentPeaks.length > 0 ? dynamicAdviceCardsHtml('talentPeak', metricsForAdvice) : ''}
${sectionSentimentCurve(sentimentCurve)}
${sentimentCurve.buckets.length >= 2 ? adviceAfterSentiment() : ''}
${sentimentCurve.buckets.length >= 2 ? dynamicAdviceCardsHtml('sentiment', metricsForAdvice) : ''}
${sectionUniqueWordSuggestions(uniqueWords)}
${uniqueWords.length > 0 ? adviceAfterUniqueWords() : ''}
${uniqueWords.length > 0 ? dynamicAdviceCardsHtml('uniqueWords', metricsForAdvice) : ''}
${sectionReachCoefficient(reach)}
${reach.coefficient != null ? adviceAfterReach() : ''}
${reach.coefficient != null ? dynamicAdviceCardsHtml('reach', metricsForAdvice) : ''}
${idWrap('mkt-derived', sectionDerivedTimeline(r))}
${sectionAdviceAfterDerivedTimeline(r)}
${idWrap('mkt-segment', sectionSegment(r))}
${sectionAdviceAfterSegment(r)}
${idWrap('mkt-top-users', sectionTopUsers(r, maskShare, identiconResolver, broadcasterUserId))}
${sectionAdviceAfterRank(r)}
${idWrap('mkt-thumb-grid', sectionUsersWithThumbnails(r, maskShare, identiconResolver, broadcasterUserId))}
${idWrap('mkt-vpos', sectionVposThirds(r))}
${idWrap('mkt-hour', sectionHourHeatmap(r))}`;
  const tocItems = allTocItems.filter((t) => bodyHtml.includes(`id="${t.id}"`));
  const finalBody = bodyHtml.replace('__NL_TOC_PLACEHOLDER__', sectionToc(tocItems));

  // 漫画コマ風の「番組のおさらい」セクション。bundle が無い場合も opening / closing
  // の最低 2 コマは出る設計。レスポンシブ：clamp + container query で全幅に追従。
  const mangaPanels = buildMangaBroadcastPanels({
    bundle: opts?.officialEventDomBundle ?? null,
    broadcastTitle: typeof opts?.broadcastTitle === 'string' ? opts.broadcastTitle : '',
    broadcasterName: typeof opts?.broadcasterName === 'string' ? opts.broadcasterName : '',
    recordedCommentCount:
      typeof opts?.recordedCommentCount === 'number' ? opts.recordedCommentCount : undefined,
    streamAgeMin: typeof opts?.streamAgeMin === 'number' ? opts.streamAgeMin : undefined
  });
  const yukkuriHtml = renderMangaBroadcastPanelsHtml(mangaPanels, {
    heading: '今回の放送のおさらい・漫画版',
    imageDataUrlMap:
      opts?.yukkuriImageDataUrlMap && typeof opts.yukkuriImageDataUrlMap === 'object'
        ? opts.yukkuriImageDataUrlMap
        : undefined
  });

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配信マーケ分析 — ${escapeHtml(r.liveId)}</title>
<style>${CSS_BODY}${yukkuriBroadcastSummaryEmbeddedCss()}${mangaBroadcastSummaryEmbeddedCss()}</style>
</head>
<body>
<header class="mkt-header">
<h1 class="mkt-header__title">📊 配信マーケティング分析</h1>
<p class="mkt-header__sub">${escapeHtml(r.liveId)} — ${new Date().toLocaleString('ja-JP')} 出力${escapeHtml(subSuffix)} · JSON埋め込み ${escapeHtml(exportedAtIso)}</p>
</header>
${yukkuriHtml}
<main class="mkt-main">
${finalBody}
</main>
<footer class="mkt-footer">追憶のきらめき · マーケ分析（手元用） — ${escapeHtml(exportedAtIso)}</footer>
${idWrap('mkt-json', sectionMachineReadableJson(embedJson, maskShare))}
</body></html>`;
}

/**
 * 0.1.22 (W): 既存 sectionXxx() の出力に id 属性を後付けで挟むラッパ。
 * 既存セクションを書き換えずアンカーリンクの target にできるようにする。
 * @param {string} id
 * @param {string} html
 */
function idWrap(id, html) {
  if (!html) return '';
  // 既存実装は `<section class="mkt-section">...` で始まるので最初の出現箇所だけ id を差し込む。
  return html.replace(/<section\b/, `<section id="${id}"`);
}

/**
 * 0.1.15 (L): サムネ付きユーザー一覧。「数値 ID（個人サムネ or ニコ既定）」と
 * 「匿名（identicon）」を別の <ol> に分けてカテゴリ感を出す。0.1.12 では同じ grid に
 * 混在していて視覚的にうるさかったというユーザー報告に対応。
 *
 * 共有向け伏せ字（maskShare=true）はアイコン残存で識別される懸念があるため、
 * セクションごと出力しない（従来挙動を維持）。
 *
 * 0.1.17 (R): broadcasterUserId を受け取り、配信者本人を一覧から除外する。
 *
 * @param {MarketingReport} r
 * @param {boolean} maskShare
 * @param {((uid: string) => string) | undefined} identiconResolver
 * @param {string} [broadcasterUserId]
 */
function sectionUsersWithThumbnails(r, maskShare, identiconResolver, broadcasterUserId) {
  if (maskShare) return '';
  if (!Array.isArray(r.topUsers) || r.topUsers.length === 0) return '';

  const { numericIdUsers, anonymousUsers } = categorizeUsersForThumbGrid(
    r.topUsers,
    {
      identiconResolver,
      maxNumeric: 60,
      maxAnonymous: 60,
      broadcasterUserId
    }
  );

  if (numericIdUsers.length === 0 && anonymousUsers.length === 0) return '';

  /**
   * @param {import('./userThumbGrid.js').ResolvedThumbGridUser} u
   * @returns {string}
   */
  const cellHtml = (u) => {
    const uidForLabel = u.userId || UNKNOWN_USER_KEY;
    const rawLabel = displayUserLabel(u.userId, u.nickname || '');
    const labelHtml = buildUserProfileLinkedLabelHtml(uidForLabel, rawLabel);
    const countText = `${u.count}件`;
    return `<li class="mkt-thumb-grid__cell">
<span class="mkt-thumb-grid__avatar-wrap"><img class="mkt-thumb-grid__avatar" src="${escapeHtml(u.thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ${DEFAULT_USERICON_ONERROR_ATTR}></span>
<span class="mkt-thumb-grid__label">${labelHtml}</span>
<span class="mkt-thumb-grid__count">${escapeHtml(countText)}</span>
</li>`;
  };

  const numericBlock =
    numericIdUsers.length > 0
      ? `<h3 class="mkt-thumb-grid__heading">数値 ID（個人サムネ・ニコ既定アイコン）<span class="mkt-thumb-grid__heading-count">${numericIdUsers.length}名</span></h3>
<ol class="mkt-thumb-grid">${numericIdUsers.map(cellHtml).join('')}</ol>`
      : '';

  const anonymousBlock =
    anonymousUsers.length > 0
      ? `<h3 class="mkt-thumb-grid__heading">匿名（識別子から生成した identicon）<span class="mkt-thumb-grid__heading-count">${anonymousUsers.length}名</span></h3>
<ol class="mkt-thumb-grid">${anonymousUsers.map(cellHtml).join('')}</ol>`
      : '';

  return `<section class="mkt-section mkt-section--thumb-grid" aria-label="サムネ付きユーザー一覧">
<h2>サムネ付きユーザー一覧</h2>
<p class="mkt-note">アイコンが解決できた応援ユーザーをコメ件数の多い順、種別ごとに並べました（各カテゴリ最大 60 名）。アイコンは ① 個人サムネ ② ニコ既定アイコン ③ 識別子から生成した identicon の優先順で選びます。</p>
<p class="mkt-spec-note">※ 表示名はコメ記録時点のもの（仕様）。配信者がニコニコでハンドル名を変更した場合、ここの表示と niconico の最新表示が異なることがあります。リアルタイム取得は行っていないため（API 連発によるレート制限を避けるため）、最新名は ID クリック先のユーザーページで確認できます。</p>
${numericBlock}
${anonymousBlock}
</section>`;
}

/**
 * @param {string} embedJson script 内にそのまま入れる JSON 文字列（先に buildMarketingEmbedScriptInnerText）
 * @param {boolean} maskShare
 */
function sectionMachineReadableJson(embedJson, maskShare) {
  const maskNote = maskShare
    ? 'この出力では共有向けに<strong>伏せ字</strong>を付けており、JSON 内のトップコメンターの表示名・ID も伏せ、アイコン URL は空です。'
    : '手元用のため ID がそのまま入ります。第三者に渡すときは拡張の「伏せ字」チェック付きで書き出してください。';
  return `<section class="mkt-section mkt-section--embed" aria-label="JSON データ">
<h2>表計算・ツール向け JSON</h2>
<p class="mkt-note">${maskNote} 中身は <code>id="nl-marketing-export-v1"</code> の <code>script</code> 要素にあります（<code>schemaVersion</code>・<code>report</code> 形式）。</p>
<script type="application/json" id="nl-marketing-export-v1">${embedJson}</script>
</section>`;
}

/** @param {unknown} v */
function finiteIntOrNull(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

/** @param {unknown} v */
function formatEventRankingNumber(v) {
  const n = finiteIntOrNull(v);
  return n == null ? '—' : n.toLocaleString('ja-JP');
}

/** @param {unknown} v */
function safeEventRankingThumbnailUrl(v) {
  const s = String(v == null ? '' : v).trim();
  return /^https?:/i.test(s) ? s : '';
}

/**
 * @param {EventRankingReportModel | null | undefined} eventRanking
 * @param {boolean} maskShare
 */
function sectionEventRanking(eventRanking, maskShare) {
  if (!eventRanking || typeof eventRanking !== 'object') return '';
  const model = /** @type {EventRankingReportModel} */ (eventRanking);
  const rows = Array.isArray(model.rows) ? model.rows : [];
  const eventName = String(model.eventName || '').trim();
  const self = model.self && typeof model.self === 'object' ? model.self : null;
  if (!eventName && !self && rows.length === 0) return '';

  const selfRank = self ? finiteIntOrNull(self.rank) : null;
  const selfScore = self ? finiteIntOrNull(self.score) : null;
  const selfDiff = self ? finiteIntOrNull(self.diffToNext) : null;
  const selfName = self ? String(self.broadcasterName || '').trim() : '';
  const nextRankLabel =
    selfRank != null && selfRank > 1 && selfDiff != null && selfDiff > 0
      ? `あと💎${selfDiff.toLocaleString('ja-JP')} で ${selfRank - 1}位`
      : '上位との差分なし';
  const selfHtml = self
    ? `<div class="mkt-event-self" aria-label="本人のイベント順位">
<div class="mkt-event-self__card"><span class="mkt-event-self__label">現在順位</span><strong>${escapeHtml(selfRank == null ? '—' : `${selfRank.toLocaleString('ja-JP')}位`)}</strong></div>
<div class="mkt-event-self__card"><span class="mkt-event-self__label">累計💎</span><strong>${escapeHtml(formatEventRankingNumber(selfScore))}</strong></div>
<div class="mkt-event-self__card"><span class="mkt-event-self__label">${escapeHtml(selfName || '本人')}</span><strong>${escapeHtml(nextRankLabel)}</strong></div>
</div>`
    : '';

  const topRows = rows
    .slice(0, 10)
    .map((row) => {
      const rank = finiteIntOrNull(row?.rank);
      const score = finiteIntOrNull(row?.score);
      if (rank == null || rank <= 0) return '';
      const name = String(row?.name || '').trim() || '名無し';
      const thumbSrc = safeEventRankingThumbnailUrl(row?.thumbnailUrl);
      const thumbHtml = thumbSrc
        ? `<img class="mkt-event-rank__thumb" src="${escapeAttr(thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.hidden=true">`
        : '<span class="mkt-event-rank__thumb mkt-event-rank__thumb--empty"></span>';
      const anon = row?.isAnonymous === true
        ? '<span class="mkt-event-rank__anon">匿名</span>'
        : '';
      return `<tr>
<td class="mkt-event-rank__rank">${escapeHtml(`${rank}位`)}</td>
<td class="mkt-event-rank__thumb-cell">${thumbHtml}</td>
<td class="mkt-event-rank__name">${escapeHtml(name)}${anon}</td>
<td class="mkt-event-rank__score">💎${escapeHtml(formatEventRankingNumber(score))}</td>
</tr>`;
    })
    .filter(Boolean)
    .join('');
  const tableHtml = topRows
    ? `<h3 class="mkt-event-rank__subhead">参加配信者TOP</h3>
<div class="mkt-event-rank__table-wrap"><table class="mkt-event-rank__table"><tbody>${topRows}</tbody></table></div>`
    : '<p class="mkt-note">参加配信者TOPはまだ取得できていません。</p>';
  const staleNote = model.isStale
    ? '<p class="mkt-note mkt-event-rank__stale">少し前に取得した値です。最新の順位とは異なる場合があります。</p>'
    : '';
  const maskNote = maskShare
    ? '<p class="mkt-note">イベント順位は公開ランキング由来のため、共有向け出力でも配信者名を表示します。</p>'
    : '';

  return `<section class="mkt-section mkt-section--event-ranking" aria-label="イベント順位">
<h2>🏆 イベント順位</h2>
${eventName ? `<p class="mkt-event-rank__event-name">${escapeHtml(eventName)}</p>` : ''}
${selfHtml}
${tableHtml}
${staleNote}
${maskNote}
</section>`;
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
 * @param {((uid: string) => string) | undefined} [identiconResolver]
 *   匿名 a:... ユーザー向けの identicon SVG data URL を返す関数（呼び出し側で
 *   事前計算したマップを引いてもらう）。null/undefined のときは匿名は空。
 * @param {string} [broadcasterUserId] 配信者本人の userId。一致したら topUsers から除外。
 */
function sectionTopUsers(r, maskShare = false, identiconResolver = undefined, broadcasterUserId = '') {
  if (r.topUsers.length === 0) return '';
  // 0.1.17 (R): 配信者本人をトップコメンターから除外する。
  const broadcasterUid = String(broadcasterUserId || '').trim();
  const filteredTopUsers = broadcasterUid
    ? r.topUsers.filter((u) => String(u.userId || '').trim() !== broadcasterUid)
    : r.topUsers;
  if (filteredTopUsers.length === 0) return '';
  const maxCount = filteredTopUsers[0].count;
  const rows = filteredTopUsers.slice(0, 20)
    .map((u, i) => {
      const pct = (u.count / Math.max(1, maxCount)) * 100;
      // 0.1.12 (F1): 「最低サムネ」を必ず出す方針へ。
      // 1) avatarUrl が http/https → 採用（プロフィール由来の本物）
      // 2) 数値 ID → ニコ既定 user icon CDN URL（プレミアム会員に限らず誰でも）
      // 3) 匿名 a: + identiconResolver → SVG data URL
      // 4) 上記いずれも該当しない → 既存の空プレースホルダ
      // maskShare=true（共有向け伏せ字）のときは何も出さない（識別補助しない）。
      const resolvedAvatar = maskShare
        ? ''
        : resolveReportUserThumbSrc({
            userId: u.userId || '',
            avatarUrl: u.avatarUrl || '',
            identiconResolver
          });
      const avImg =
        !resolvedAvatar
          ? '<span class="mkt-rank-av mkt-rank-av--empty"></span>'
          : `<img src="${escapeHtml(resolvedAvatar)}" class="mkt-rank-av" alt="" loading="lazy" referrerpolicy="no-referrer">`;
      // ランキング内で複数の匿名 (a:xxxx) ユーザーがすべて「匿名」と表示されて
      // 識別不能になる問題を避けるため、共通の displayUserLabel を通して
      // 「nickname（shortId）」形にする。数値 ID のときは niconico プロフィール
      // へのリンクで包む。maskShare 時はリンクにせず、マスクだけ適用する。
      const uidForLabel = u.userId || UNKNOWN_USER_KEY;
      const rawLabel = u.userId
        ? displayUserLabel(u.userId, u.nickname || '')
        : u.nickname || '—';
      const nameCellHtml = maskShare
        ? escapeHtml(maskLabelForShare(rawLabel))
        : buildUserProfileLinkedLabelHtml(uidForLabel, rawLabel);
      return `<tr>
<td class="mkt-rank-n">${i + 1}</td>
<td>${avImg}</td>
<td class="mkt-rank-name">${nameCellHtml}</td>
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
body{margin:0;font-family:'Segoe UI','Hiragino Sans',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.65;scroll-behavior:smooth;-webkit-text-size-adjust:100%;font-size:16px}
.mkt-header{padding:2rem 1.5rem 1rem;background:linear-gradient(135deg,#1e293b,#0f172a);border-bottom:1px solid #334155}
.mkt-header__title{margin:0;font-size:1.6rem;font-weight:700}
.mkt-header__sub{margin:.3rem 0 0;font-size:.85rem;color:#94a3b8}
.mkt-main{max-width:1080px;margin:0 auto;padding:1.5rem 1rem}
.mkt-section{background:#1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;border:1px solid #334155;scroll-margin-top:1rem}
.mkt-section h2{margin:0 0 .8rem;font-size:1.1rem;line-height:1.35;color:#f8fafc;border-left:4px solid #3b82f6;padding-left:.6rem}
.mkt-section p,.mkt-section li{overflow-wrap:anywhere}
.mkt-subhead{margin:1rem 0 .55rem;font-size:.95rem;line-height:1.4;color:#f8fafc}
.mkt-section--toc{background:#0f172a}
.mkt-toc{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.45rem}
.mkt-toc__link{display:block;color:#bfdbfe;text-decoration:none;font-size:.84rem;line-height:1.35;background:#111c31;border:1px solid #26364f;border-radius:8px;padding:.5rem .65rem}
.mkt-toc__link:hover{border-color:#60a5fa;background:#16233a}
.mkt-pro-tag{display:inline-block;font-size:.68rem;font-weight:700;color:#f0f9ff;background:linear-gradient(135deg,#a855f7,#7c3aed);border-radius:6px;padding:1px 6px;margin-left:.4rem;vertical-align:middle;letter-spacing:.04em}
.mkt-mini-stats{margin:.6rem 0 0;padding-left:1.2rem;font-size:.85rem;color:#cbd5e1}
.mkt-mini-stats li{margin-bottom:.15rem}
.mkt-quality-pill{display:inline-block;border-radius:6px;padding:1px 8px;color:#0f172a;font-size:.72rem;font-weight:600}
.mkt-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;color:#cbd5e1;word-break:break-all}
.mkt-attendance{font-size:.75rem}
.mkt-attendance th,.mkt-attendance td{padding:.25rem .35rem;text-align:center}
.mkt-attendance th:first-child,.mkt-attendance td:first-child{text-align:left;min-width:140px}
.mkt-att-cell{font-family:ui-monospace,monospace;font-weight:700}
.mkt-att-cell--on{color:#22c55e}
.mkt-att-cell--off{color:#475569}
.mkt-heatmap{font-size:.65rem}
.mkt-heatmap th,.mkt-heatmap td{padding:.15rem .25rem;text-align:center;min-width:1.6rem}
.mkt-heat-cell{color:#f8fafc;font-weight:700}
.mkt-bar{background:#1e3a5a;border-radius:4px;height:14px;width:100%;overflow:hidden}
.mkt-bar__fill{display:block;height:100%}
.mkt-departed-thumb{width:24px;height:24px;border-radius:6px;object-fit:cover;display:inline-block;background:#0f172a}
.mkt-departed-thumb--empty{border:1px dashed #334155}
.mkt-note{font-size:.78rem;color:#94a3b8;margin:0 0 .6rem}
.mkt-spec-note{font-size:.72rem;color:#fbbf24;background:rgba(251,191,36,0.08);border-left:3px solid #fbbf24;padding:.4rem .6rem;margin:0 0 .8rem;border-radius:0 4px 4px 0}
.mkt-kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.8rem}
.mkt-kpi{background:#0f172a;border-radius:10px;padding:.8rem;text-align:center;border:1px solid #334155}
.mkt-kpi__icon{font-size:1.4rem;display:block}
.mkt-kpi__val{font-size:1.3rem;font-weight:700;display:block;color:#f8fafc}
.mkt-kpi__label{font-size:.72rem;color:#94a3b8}
.mkt-kpi--compact .mkt-kpi__val{font-size:1.05rem;line-height:1.25}
.mkt-kpi--compact .mkt-kpi__label{font-size:.68rem;line-height:1.3}
.mkt-leg-inline{font-weight:700;margin:0 .2rem}
.mkt-note--legend{margin-top:.35rem}
.mkt-svg--vpos{max-height:168px}
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
.mkt-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.mkt-rank{width:100%;border-collapse:collapse;font-size:.83rem}
.mkt-rank th,.mkt-rank td{padding:.44rem .5rem;border-bottom:1px solid #334155;text-align:left;vertical-align:top}
.mkt-rank th{font-size:.72rem;color:#94a3b8;font-weight:700;white-space:nowrap;background:#17233a}
.mkt-rank td{color:#dbeafe}
.mkt-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mkt-rank-n{width:2rem;color:#64748b;text-align:right;font-size:.8rem}
.mkt-rank-av{width:28px;height:28px;border-radius:50%;object-fit:cover;display:block}
.mkt-rank-av--empty{background:#334155}
.mkt-rank-name{font-size:.85rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkt-rank-name .nl-user-profile-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-rank-name .nl-user-profile-link:hover{color:#bfdbfe}
.mkt-rank-bar{position:relative;height:22px;background:#0f172a;border-radius:4px;overflow:hidden}
.mkt-rank-bar__fill{height:100%;background:linear-gradient(90deg,#3b82f6,#6366f1);border-radius:4px}
.mkt-rank-bar__label{position:absolute;right:6px;top:2px;font-size:.75rem;color:#f8fafc;font-weight:600}
.mkt-section--event-ranking h2{border-left-color:#facc15}
.mkt-event-rank__event-name{margin:.15rem 0 .75rem;font-size:.9rem;color:#fde68a;font-weight:700;line-height:1.45}
.mkt-event-self{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .95rem}
.mkt-event-self__card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-event-self__label{display:block;font-size:.72rem;color:#94a3b8;margin-bottom:.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkt-event-self__card strong{display:block;color:#f8fafc;font-size:1rem;line-height:1.35;overflow-wrap:anywhere}
.mkt-event-rank__subhead{margin:.3rem 0 .45rem;font-size:.9rem;color:#e2e8f0}
.mkt-event-rank__table-wrap{overflow-x:auto}
.mkt-event-rank__table{width:100%;border-collapse:collapse}
.mkt-event-rank__table td{padding:.4rem .45rem;border-bottom:1px solid #334155;vertical-align:middle}
.mkt-event-rank__rank{width:3.6rem;color:#fde68a;font-weight:700;font-size:.82rem;text-align:right}
.mkt-event-rank__thumb-cell{width:38px}
.mkt-event-rank__thumb{width:30px;height:30px;border-radius:8px;object-fit:cover;display:block;background:#0f172a}
.mkt-event-rank__thumb--empty{border:1px dashed #475569}
.mkt-event-rank__name{font-size:.85rem;color:#e2e8f0;min-width:140px;overflow-wrap:anywhere}
.mkt-event-rank__score{text-align:right;font-variant-numeric:tabular-nums;font-size:.85rem;color:#f8fafc;white-space:nowrap}
.mkt-event-rank__anon{display:inline-block;margin-left:.35rem;border:1px solid #475569;border-radius:999px;padding:0 .4rem;color:#94a3b8;font-size:.68rem}
.mkt-event-rank__stale{color:#fbbf24}
/* 0.1.12 (F3): サムネ付きユーザー一覧グリッド。トップコメンター表とは別軸で、
   どんな顔ぶれが応援してくれたかを視覚的に振り返るための面。 */
.mkt-section--thumb-grid h2{border-left-color:#fb923c}
.mkt-thumb-grid__heading{margin:1rem 0 .5rem;padding:0 0 .35rem;border-bottom:1px solid #334155;font-size:.92rem;font-weight:700;color:#cbd5e1;display:flex;align-items:baseline;gap:.5rem}
.mkt-thumb-grid__heading:first-of-type{margin-top:.4rem}
.mkt-thumb-grid__heading-count{font-size:.74rem;color:#94a3b8;font-weight:600}
.mkt-thumb-grid{list-style:none;margin:.6rem 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
.mkt-thumb-grid__cell{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px;background:#1e293b;border:1px solid #334155;border-radius:10px;min-width:0;text-align:center}
.mkt-thumb-grid__avatar-wrap{width:48px;height:48px;border-radius:50%;overflow:hidden;background:#0f172a;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.mkt-thumb-grid__avatar{width:48px;height:48px;object-fit:cover;display:block}
.mkt-thumb-grid__label{font-size:.74rem;line-height:1.25;color:#e2e8f0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
.mkt-thumb-grid__label .nl-user-profile-link{color:#93c5fd}
.mkt-thumb-grid__count{font-size:.7rem;color:#94a3b8}
.mkt-hour-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:4px}
.mkt-hour{border-radius:6px;text-align:center;padding:.5rem .2rem;min-height:52px;display:flex;flex-direction:column;justify-content:center;border:1px solid #334155}
.mkt-hour__label{font-size:.7rem;color:#94a3b8}
.mkt-hour__val{font-size:.9rem;font-weight:600}
.mkt-footer{text-align:center;padding:1.5rem;font-size:.72rem;color:#475569}
.mkt-section--embed h2{border-left-color:#22d3ee}
.mkt-section--embed script{display:none}
.mkt-section--features h2{border-left-color:#34d399}
.mkt-lead{margin:0 0 .85rem;font-size:.88rem;color:#e2e8f0;line-height:1.65}
.mkt-feature-list{margin:.4rem 0 0;padding-left:1.15rem;color:#cbd5e1;font-size:.82rem;line-height:1.65}
.mkt-feature-list li{margin:.45rem 0 0}
.mkt-feature-list li:first-child{margin-top:0}
.mkt-values-note{margin:.95rem 0 0;padding-top:.85rem;border-top:1px solid #334155;font-size:.82rem;color:#94a3b8;line-height:1.65}
.mkt-section--advice h2{border-left-color:#a78bfa}
.mkt-advice-stack{display:flex;flex-direction:column;gap:clamp(.85rem,3vw,1.35rem)}
.mkt-advice-stack--intro{gap:clamp(1rem,3.5vw,1.5rem)}
.mkt-advice-stack--next{gap:clamp(.65rem,2.4vw,.9rem);margin:.65rem 0 .85rem}
.mkt-advice-after{display:flex;flex-direction:column;gap:clamp(.75rem,2.5vw,1rem);margin:.85rem 0 0}
.mkt-advice-row{display:flex;flex-direction:row;align-items:flex-start;gap:clamp(.65rem,2.5vw,.95rem);max-width:100%}
.mkt-advice__avatar-wrap{flex-shrink:0;width:clamp(48px,12vw,56px)}
.mkt-advice__avatar{width:clamp(48px,12vw,56px);height:clamp(48px,12vw,56px);object-fit:contain;display:block;border-radius:12px;background:#0f172a;border:1px solid #334155;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.mkt-advice__bubble{flex:1;min-width:0;position:relative;background:#0f172a;border:1px solid #334155;border-radius:14px;padding:clamp(.8rem,2.8vw,1.05rem) clamp(.85rem,3vw,1.15rem);box-shadow:0 2px 10px rgba(0,0,0,.12);overflow-wrap:break-word;word-wrap:break-word}
.mkt-advice__bubble::before{content:"";position:absolute;left:-7px;top:18px;width:12px;height:12px;background:#0f172a;border-left:1px solid #334155;border-bottom:1px solid #334155;transform:rotate(45deg)}
.mkt-advice--tanu .mkt-advice__bubble{border-top:1px solid rgba(196,181,253,.35)}
.mkt-advice--link .mkt-advice__bubble{border-top:1px solid rgba(56,189,248,.35)}
.mkt-advice--konta .mkt-advice__bubble{border-top:1px solid rgba(251,146,60,.35)}
.mkt-advice--tanu .mkt-advice__bubble{border-left:3px solid #c4b5fd}
.mkt-advice--link .mkt-advice__bubble{border-left:3px solid #38bdf8}
.mkt-advice--konta .mkt-advice__bubble{border-left:3px solid #fb923c}
.mkt-advice__name{font-size:clamp(.78rem,2.2vw,.85rem);font-weight:700;color:#f8fafc;margin:0 0 .5rem;letter-spacing:.02em;line-height:1.45}
.mkt-advice__p{margin:.55rem 0 0;font-size:clamp(.8rem,2.3vw,.875rem);color:#cbd5e1;line-height:1.8}
.mkt-advice__p:first-of-type{margin-top:0}
.mkt-advice__roles-hint{margin:clamp(.35rem,2vw,.25rem) 0 0;padding:clamp(.65rem,2.5vw,.85rem) clamp(.75rem,3vw,1rem);font-size:clamp(.74rem,2.1vw,.8rem);color:#94a3b8;line-height:1.75;background:#0f172a;border-radius:10px;border:1px dashed #475569}
@media(max-width:640px){
  .mkt-header{padding:1.35rem 1rem .85rem}
  .mkt-header__title{font-size:1.25rem}
  .mkt-header__sub{font-size:.76rem;line-height:1.55}
  .mkt-main{padding:1rem .65rem;overflow-x:hidden}
  .mkt-section{padding:1rem .9rem;border-radius:10px;margin-bottom:1rem;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .mkt-toc{grid-template-columns:1fr}
  .mkt-rank-table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .mkt-rank{min-width:520px}
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
@media(max-width:380px){
  .mkt-kpi-grid{grid-template-columns:1fr}
}
.mkt-sg-pack{margin-bottom:.5rem}
.mkt-section--sg{border-left:4px solid #22c55e}
.mkt-sg-live-note{margin:.25rem 0 .7rem;padding:.55rem .7rem;border:1px dashed #4ade80;border-radius:10px;background:#0b2a1b;color:#dcfce7;font-size:.82rem;line-height:1.55}
.mkt-sg-note{margin:.35rem 0 .55rem;font-size:.85rem;color:#94a3b8;line-height:1.45}
.mkt-sg-next-list{margin:.4rem 0 0;padding-left:1.2rem}
.mkt-sg-next-item{margin-bottom:1rem;padding:.62rem .68rem;border:1px solid #334155;border-radius:10px;background:#0f172a}
.mkt-sg-phase{display:inline-block;font-size:.72rem;font-weight:700;color:#bbf7d0;background:#14532d;border-radius:6px;padding:2px 8px;margin-bottom:.25rem}
.mkt-sg-line{margin:.25rem 0;font-weight:600;color:#f8fafc}
.mkt-sg-meta{margin:.15rem 0;font-size:.82rem;color:#94a3b8}
.mkt-sg-time{font-size:.82rem;color:#cbd5e1}
.mkt-sg-simple-list{margin:.4rem 0;padding-left:1.2rem}
.mkt-sg-simple-list li{margin-bottom:.45rem}
.mkt-section--narrative h2{border-left-color:#38bdf8}
.mkt-narrative-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem;margin:.8rem 0}
.mkt-narrative-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.8rem;min-width:0}
.mkt-narrative-card__head{display:flex;justify-content:space-between;gap:.6rem;align-items:baseline;font-size:.82rem;color:#cbd5e1;margin-bottom:.5rem;flex-wrap:wrap}
.mkt-narrative-card__head strong{color:#f8fafc;font-size:.95rem}
.mkt-narrative-keywords{display:flex;flex-wrap:wrap;gap:.35rem}
.mkt-narrative-keyword{display:inline-block;border:1px solid rgba(56,189,248,.45);background:rgba(56,189,248,.12);color:#bae6fd;border-radius:999px;padding:.12rem .45rem;font-size:.74rem}
.mkt-narrative-muted{color:#64748b;font-size:.78rem}
.mkt-narrative-samples{margin:.65rem 0 0;padding-left:1.1rem;color:#e2e8f0;font-size:.8rem;line-height:1.55}
.mkt-narrative-samples li{margin-bottom:.25rem}
.mkt-narrative-subhead{font-size:.9rem;margin:.9rem 0 .35rem;color:#f8fafc}
.mkt-narrative-hints{margin:.3rem 0 0;padding-left:1.2rem;color:#cbd5e1;font-size:.84rem}
.mkt-narrative-hints li{margin-bottom:.35rem}
.mkt-sg-gift-block{margin-bottom:1rem;padding:.6rem .4rem;border-top:1px solid #334155}
.mkt-sg-gift-block h3{margin:.2rem 0 .4rem;font-size:.95rem;color:#e2e8f0}
.mkt-sg-clip{margin-bottom:.85rem;padding-bottom:.6rem;border-bottom:1px dashed #334155}
.mkt-sg-sample{font-size:.88rem;color:#e2e8f0}
.mkt-section--data-summary h2{border-left-color:#14b8a6}
.mkt-data-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-data-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-data-card__label{display:block;font-size:.72rem;color:#5eead4;margin-bottom:.18rem}
.mkt-data-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-data-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-data-matrix td:nth-child(1),.mkt-data-source-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-data-status{display:inline-block;border-radius:999px;padding:.08rem .45rem;font-size:.7rem;font-weight:700;border:1px solid #334155;background:#111827;color:#cbd5e1;white-space:nowrap}
.mkt-data-status--あり{border-color:rgba(20,184,166,.55);background:rgba(20,184,166,.14);color:#99f6e4}
.mkt-data-status--未取得{border-color:#475569;background:#111827;color:#94a3b8}
.mkt-data-status--なし,.mkt-data-status--少なめ{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.12);color:#fde68a}
.mkt-data-gift-items{display:flex;flex-wrap:wrap;gap:.4rem;margin:.35rem 0 0}
.mkt-data-gift-chip{display:inline-block;border:1px solid rgba(20,184,166,.5);background:rgba(20,184,166,.1);color:#ccfbf1;border-radius:999px;padding:.14rem .55rem;font-size:.76rem;line-height:1.35}
.mkt-data-gift-chip b{color:#f8fafc}
.mkt-section--funnel h2{border-left-color:#38bdf8}
.mkt-funnel-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-funnel-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-funnel-card__label{display:block;font-size:.72rem;color:#93c5fd;margin-bottom:.18rem}
.mkt-funnel-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-funnel-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-funnel-table td:nth-child(1),.mkt-priority-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-funnel-priority{display:inline-block;border-radius:999px;padding:.08rem .5rem;font-size:.72rem;font-weight:700;border:1px solid #334155;background:#111827;color:#cbd5e1;white-space:nowrap}
.mkt-funnel-priority--高{border-color:rgba(248,113,113,.55);background:rgba(248,113,113,.13);color:#fecaca}
.mkt-funnel-priority--中{border-color:rgba(251,191,36,.5);background:rgba(251,191,36,.12);color:#fde68a}
.mkt-funnel-priority--低{border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.11);color:#bbf7d0}
.mkt-funnel-gap-list{display:flex;flex-wrap:wrap;gap:.45rem;margin:.35rem 0 0}
.mkt-funnel-gap{display:inline-flex;flex-direction:column;gap:.1rem;max-width:220px;border:1px solid #334155;background:#111827;color:#cbd5e1;border-radius:10px;padding:.42rem .55rem;font-size:.76rem;line-height:1.35}
.mkt-funnel-gap small{color:#94a3b8;font-size:.68rem;line-height:1.35}
.mkt-funnel-gap--ok{border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.08);color:#bbf7d0}
.mkt-funnel-gap--missing{border-color:rgba(148,163,184,.38);background:#0f172a;color:#cbd5e1}
.mkt-section--segment-action h2{border-left-color:#a3e635}
.mkt-segment-action-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-segment-action-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-segment-action-card__label{display:block;font-size:.72rem;color:#bef264;margin-bottom:.18rem}
.mkt-segment-action-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-segment-action-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-segment-action-table td:nth-child(1),.mkt-support-overlap-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-section--analysis-skills h2{border-left-color:#60a5fa}
.mkt-skill-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-skill-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-skill-card__label{display:block;font-size:.72rem;color:#bfdbfe;margin-bottom:.18rem}
.mkt-skill-card__value{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-skill-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-skill-loop{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.55rem;margin:.75rem 0 1rem}
.mkt-skill-loop-step{position:relative;background:#111827;border:1px solid #334155;border-radius:10px;padding:.65rem .75rem;min-width:0}
.mkt-skill-loop-step__step{display:inline-block;margin-bottom:.22rem;border:1px solid rgba(96,165,250,.45);border-radius:999px;padding:.06rem .45rem;color:#bfdbfe;font-size:.68rem;font-weight:700}
.mkt-skill-loop-step strong{display:block;color:#f8fafc;font-size:.86rem;line-height:1.35}
.mkt-skill-loop-step p{margin:.22rem 0 0;color:#94a3b8;font-size:.72rem;line-height:1.45}
.mkt-skill-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-skill-status{display:inline-block;border-radius:999px;padding:.08rem .48rem;font-size:.7rem;font-weight:700;border:1px solid #334155;background:#111827;color:#cbd5e1;white-space:nowrap}
.mkt-skill-status--on{border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.12);color:#bbf7d0}
.mkt-skill-status--partial{border-color:rgba(251,191,36,.5);background:rgba(251,191,36,.12);color:#fde68a}
.mkt-skill-status--off{border-color:#475569;background:#0f172a;color:#94a3b8}
.mkt-section--harness h2{border-left-color:#f472b6}
.mkt-harness-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-harness-card{background:#111827;border:1px solid #374151;border-radius:10px;padding:.75rem;min-width:0}
.mkt-harness-card__label{display:block;font-size:.72rem;color:#f9a8d4;margin-bottom:.18rem}
.mkt-harness-card__value{display:block;font-size:1.05rem;line-height:1.35;color:#f8fafc;overflow-wrap:anywhere}
.mkt-harness-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-harness-layer-table td:nth-child(1),.mkt-harness-gate-table td:nth-child(1){font-weight:700;color:#e2e8f0;white-space:nowrap}
.mkt-harness-gate-status{display:inline-block;border-radius:999px;padding:.08rem .5rem;font-size:.72rem;font-weight:700;border:1px solid rgba(244,114,182,.45);background:rgba(244,114,182,.12);color:#fbcfe8;white-space:nowrap}
.mkt-section--audience-gap h2{border-left-color:#22d3ee}
.mkt-audience-level{display:inline-block;margin:0 0 .75rem;border-radius:999px;padding:.18rem .62rem;font-size:.76rem;font-weight:700}
.mkt-audience-level--healthy{background:rgba(34,197,94,.14);color:#bbf7d0;border:1px solid rgba(34,197,94,.45)}
.mkt-audience-level--quiet{background:rgba(251,191,36,.14);color:#fde68a;border:1px solid rgba(251,191,36,.45)}
.mkt-audience-level--silent-crowd{background:rgba(248,113,113,.14);color:#fecaca;border:1px solid rgba(248,113,113,.45)}
.mkt-audience-level--unknown{background:#111827;color:#cbd5e1;border:1px solid #334155}
.mkt-audience-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.3rem 0 .8rem}
.mkt-audience-card{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.75rem;min-width:0}
.mkt-audience-card__label{display:block;font-size:.72rem;color:#67e8f9;margin-bottom:.18rem}
.mkt-audience-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-audience-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#94a3b8;line-height:1.45}
.mkt-section--supporter-chikuran h2{border-left-color:#a78bfa}
.mkt-supporter-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .85rem}
.mkt-supporter-card{background:#111827;border:1px solid #374151;border-radius:10px;padding:.75rem;min-width:0}
.mkt-supporter-card__label{display:block;font-size:.72rem;color:#c4b5fd;margin-bottom:.18rem}
.mkt-supporter-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-supporter-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#9ca3af;line-height:1.45}
.mkt-supporter-summary{margin:.25rem 0 .75rem;color:#e9d5ff;font-size:.86rem;line-height:1.65}
.mkt-supporter-name{min-width:180px}
.mkt-supporter-person{display:flex;align-items:center;gap:.55rem;min-width:0}
.mkt-supporter-person span:last-child{min-width:0;overflow-wrap:anywhere}
.mkt-supporter-avatar{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:0 0 34px;border-radius:50%;object-fit:cover;background:#1f2937;border:1px solid #4b5563;color:#c4b5fd;font-size:.75rem;font-weight:700}
.mkt-supporter-avatar--empty{background:linear-gradient(135deg,#1f2937,#312e81);color:#ddd6fe}
.mkt-supporter-score-cell{min-width:130px}
.mkt-supporter-score{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:.45rem}
.mkt-supporter-score strong{color:#f8fafc;font-size:.85rem}
.mkt-supporter-scorebar{display:block;height:8px;border-radius:999px;background:#1f2937;overflow:hidden;border:1px solid #374151}
.mkt-supporter-scorebar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#22d3ee,#a78bfa)}
.mkt-supporter-sources{display:flex;flex-wrap:wrap;gap:.22rem;min-width:150px}
.mkt-supporter-source{display:inline-block;margin:.08rem .18rem .08rem 0;border:1px solid rgba(167,139,250,.45);background:rgba(167,139,250,.12);color:#ddd6fe;border-radius:999px;padding:.08rem .42rem;font-size:.7rem;line-height:1.35;white-space:nowrap}
.mkt-supporter-source--muted{border-color:#334155;background:#111827;color:#94a3b8}
.mkt-section--gift-deep h2{border-left-color:#f97316}
.mkt-gift-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:.7rem 0 .9rem}
.mkt-gift-card{background:#111827;border:1px solid #374151;border-radius:10px;padding:.75rem;min-width:0}
.mkt-gift-card__label{display:block;font-size:.72rem;color:#a7f3d0;margin-bottom:.18rem}
.mkt-gift-card__value{display:block;font-size:1.1rem;line-height:1.3;color:#f8fafc;overflow-wrap:anywhere}
.mkt-gift-card__hint{display:block;margin-top:.25rem;font-size:.72rem;color:#9ca3af;line-height:1.45}
.mkt-insight-list{margin:.6rem 0 .8rem;padding-left:1.15rem;color:#e5e7eb;font-size:.86rem}
.mkt-insight-list li{margin-bottom:.35rem}
.mkt-gift-sender{min-width:150px}
.mkt-gift-rank{display:inline-block;margin-left:.35rem;border:1px solid #f59e0b;border-radius:999px;padding:0 .42rem;color:#fde68a;font-size:.68rem;white-space:nowrap}
.mkt-gift-type{display:inline-block;border:1px solid rgba(251,146,60,.45);background:rgba(251,146,60,.12);color:#fed7aa;border-radius:999px;padding:.1rem .45rem;font-size:.74rem;line-height:1.35}
.mkt-gift-evidence{font-size:.78rem;color:#cbd5e1;min-width:150px}
.mkt-gift-window-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem}
.mkt-gift-window{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:.8rem;min-width:0}
.mkt-gift-window__head{display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:.5rem}
.mkt-gift-window__head strong{color:#f8fafc;font-size:.95rem}
.mkt-gift-window__head span{color:#fdba74;font-size:.76rem;border:1px solid rgba(251,146,60,.45);border-radius:999px;padding:.08rem .45rem}
.mkt-gift-window__stats{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem;margin:.45rem 0}
.mkt-gift-window__stats div{background:#111827;border:1px solid #26364f;border-radius:8px;padding:.45rem;min-width:0}
.mkt-gift-window__stats dt{font-size:.68rem;color:#94a3b8}
.mkt-gift-window__stats dd{margin:0;color:#f8fafc;font-size:.78rem;line-height:1.35}
.mkt-gift-window__sample{margin:.5rem 0 .35rem;font-size:.82rem;color:#e2e8f0}
.mkt-gift-words{display:flex;flex-wrap:wrap;gap:.3rem}
.mkt-gift-word{display:inline-block;border:1px solid rgba(34,211,238,.4);background:rgba(34,211,238,.1);color:#a5f3fc;border-radius:999px;padding:.08rem .42rem;font-size:.72rem}
.mkt-gift-word--muted{border-color:#334155;background:#111827;color:#94a3b8}
.mkt-gift-window__source{margin:.5rem 0 0;font-size:.72rem;color:#94a3b8}
.mkt-gift-notes{margin:.75rem 0 0;padding-left:1.15rem;color:#94a3b8;font-size:.76rem}
@media(max-width:560px){
  .mkt-data-matrix,.mkt-data-source-table,.mkt-funnel-table,.mkt-priority-table,.mkt-segment-action-table,.mkt-support-overlap-table,.mkt-skill-table,.mkt-harness-layer-table,.mkt-harness-gate-table{min-width:0}
  .mkt-data-matrix thead,.mkt-data-source-table thead,.mkt-funnel-table thead,.mkt-priority-table thead,.mkt-segment-action-table thead,.mkt-support-overlap-table thead,.mkt-skill-table thead,.mkt-harness-layer-table thead,.mkt-harness-gate-table thead{display:none}
  .mkt-data-matrix,.mkt-data-matrix tbody,.mkt-data-matrix tr,.mkt-data-matrix td,.mkt-data-source-table,.mkt-data-source-table tbody,.mkt-data-source-table tr,.mkt-data-source-table td,.mkt-funnel-table,.mkt-funnel-table tbody,.mkt-funnel-table tr,.mkt-funnel-table td,.mkt-priority-table,.mkt-priority-table tbody,.mkt-priority-table tr,.mkt-priority-table td,.mkt-segment-action-table,.mkt-segment-action-table tbody,.mkt-segment-action-table tr,.mkt-segment-action-table td,.mkt-support-overlap-table,.mkt-support-overlap-table tbody,.mkt-support-overlap-table tr,.mkt-support-overlap-table td,.mkt-skill-table,.mkt-skill-table tbody,.mkt-skill-table tr,.mkt-skill-table td,.mkt-harness-layer-table,.mkt-harness-layer-table tbody,.mkt-harness-layer-table tr,.mkt-harness-layer-table td,.mkt-harness-gate-table,.mkt-harness-gate-table tbody,.mkt-harness-gate-table tr,.mkt-harness-gate-table td{display:block;width:100%}
  .mkt-data-matrix tr,.mkt-data-source-table tr,.mkt-funnel-table tr,.mkt-priority-table tr,.mkt-segment-action-table tr,.mkt-support-overlap-table tr,.mkt-skill-table tr,.mkt-harness-layer-table tr,.mkt-harness-gate-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-data-matrix td,.mkt-data-source-table td,.mkt-funnel-table td,.mkt-priority-table td,.mkt-segment-action-table td,.mkt-support-overlap-table td,.mkt-skill-table td,.mkt-harness-layer-table td,.mkt-harness-gate-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem;align-items:flex-start}
  .mkt-data-matrix td::before,.mkt-data-source-table td::before,.mkt-funnel-table td::before,.mkt-priority-table td::before,.mkt-segment-action-table td::before,.mkt-support-overlap-table td::before,.mkt-skill-table td::before,.mkt-harness-layer-table td::before,.mkt-harness-gate-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-data-matrix td:nth-child(1),.mkt-data-source-table td:nth-child(1),.mkt-funnel-table td:nth-child(1),.mkt-priority-table td:nth-child(1),.mkt-segment-action-table td:nth-child(1),.mkt-support-overlap-table td:nth-child(1),.mkt-skill-table td:nth-child(1),.mkt-harness-layer-table td:nth-child(1),.mkt-harness-gate-table td:nth-child(1){white-space:normal}
  .mkt-audience-window-table{min-width:0}
  .mkt-audience-window-table thead{display:none}
  .mkt-audience-window-table,.mkt-audience-window-table tbody,.mkt-audience-window-table tr,.mkt-audience-window-table td{display:block;width:100%}
  .mkt-audience-window-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-audience-window-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem}
  .mkt-audience-window-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 7.2rem}
  .mkt-supporter-table{min-width:0}
  .mkt-supporter-table thead{display:none}
  .mkt-supporter-table,.mkt-supporter-table tbody,.mkt-supporter-table tr,.mkt-supporter-table td{display:block;width:100%}
  .mkt-supporter-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-supporter-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem;align-items:flex-start}
  .mkt-supporter-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-supporter-name,.mkt-supporter-score-cell,.mkt-supporter-sources{min-width:0}
  .mkt-supporter-person{justify-content:flex-end;text-align:right;max-width:100%}
  .mkt-supporter-score{min-width:140px}
  .mkt-supporter-sources{justify-content:flex-end;text-align:right;max-width:100%}
  .mkt-gift-table{min-width:0}
  .mkt-gift-table thead{display:none}
  .mkt-gift-table,.mkt-gift-table tbody,.mkt-gift-table tr,.mkt-gift-table td{display:block;width:100%}
  .mkt-gift-table tr{border:1px solid #334155;border-radius:10px;margin:.55rem 0;padding:.45rem;background:#0f172a}
  .mkt-gift-table td{border:0;padding:.28rem .15rem;display:flex;justify-content:space-between;gap:.8rem}
  .mkt-gift-table td::before{content:attr(data-label);color:#94a3b8;font-size:.72rem;flex:0 0 5.8rem}
  .mkt-gift-evidence{min-width:0;text-align:right}
  .mkt-gift-window__stats{grid-template-columns:1fr}
}
@media print{
  body{background:#fff;color:#0f172a}
  .mkt-header,.mkt-section{background:#f1f5f9;border-color:#cbd5e1;box-shadow:none}
  .mkt-advice-row{break-inside:avoid}
  .mkt-section{break-inside:avoid-page}
  .mkt-chart-wrap{overflow:visible}
}
`;
