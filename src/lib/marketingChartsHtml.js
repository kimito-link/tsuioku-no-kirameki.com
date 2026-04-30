/**
 * @typedef {import('./marketingAggregate.js').MarketingReport} MarketingReport
 * @typedef {import('./marketingAggregate.js').UserCommentProfile} UserCommentProfile
 */

import { escapeHtml } from './htmlEscape.js';
import { maskLabelForShare } from './privacyDisplay.js';
import { MKT_ADVISOR_AVATAR_DATA_URI } from './marketingHtmlAdvisorAvatars.js';
import { buildMarketingEmbedScriptInnerText } from './marketingReportEmbed.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';
import { displayUserLabel, UNKNOWN_USER_KEY } from './userRooms.js';
import { resolveReportUserThumbSrc } from './reportUserThumb.js';
import { categorizeUsersForThumbGrid } from './userThumbGrid.js';
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
  const sourceLabel = series.source === 'official' ? '公式来場者数' : '同接推定値';
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
 * 0.1.23 (X): 離反コメンター TOP（L8）。
 * @param {ReturnType<typeof findDepartedHeavyCommenters>} departed
 * @param {boolean} maskShare
 */
function sectionDepartedHeavy(departed, maskShare) {
  if (!Array.isArray(departed) || departed.length === 0) return '';
  if (maskShare) return ''; // 個人特定リストなので共有モードでは出さない
  const rows = departed
    .map((d, i) => {
      const labelHtml = buildUserProfileLinkedLabelHtml(
        d.userId,
        displayUserLabel(d.userId, '')
      );
      return `<tr>
<td>${i + 1}</td>
<td>${labelHtml}</td>
<td>${d.totalComments}</td>
<td>${d.broadcastCount}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-departed">
<h2>離反コメンター TOP <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">過去の配信で 5+ コメだったが、今回は記録に居ないユーザー（ラテラル分析 L8）。引き留め / 復帰アプローチの候補。</p>
<table class="mkt-rank">
<thead><tr><th>#</th><th>ユーザー</th><th>過去累計コメ</th><th>過去参加放送数</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</section>`;
}

/**
 * 0.1.23 (X): 常連出席カレンダー（L9）。
 * @param {ReturnType<typeof buildCommenterAttendanceMatrix>} matrix
 * @param {boolean} maskShare
 */
function sectionAttendanceMatrix(matrix, maskShare) {
  if (!matrix || matrix.users.length === 0 || matrix.broadcasts.length < 2) return '';
  if (maskShare) return '';
  const headCols = matrix.broadcasts
    .map((b, i) => `<th title="${escapeHtml(b.liveId)}">配信${i + 1}</th>`)
    .join('');
  const rows = matrix.users
    .map((u) => {
      const labelHtml = buildUserProfileLinkedLabelHtml(
        u.userId,
        displayUserLabel(u.userId, '')
      );
      const cells = u.attendance
        .map(
          (v) =>
            v
              ? '<td class="mkt-att-cell mkt-att-cell--on" aria-label="出席">●</td>'
              : '<td class="mkt-att-cell mkt-att-cell--off" aria-label="不参加">·</td>'
        )
        .join('');
      return `<tr>
<td>${labelHtml}</td>
${cells}
<td>${u.totalComments}</td>
</tr>`;
    })
    .join('');
  return `<section class="mkt-section" id="mkt-attendance">
<h2>常連出席カレンダー <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">直近 ${matrix.broadcasts.length} 配信 × TOP ${matrix.users.length} コメンター（ラテラル分析 L9）。● = 出席 / · = 不参加。各列の横軸は左→右が古→新。</p>
<div class="mkt-chart-wrap">
<table class="mkt-rank mkt-attendance">
<thead><tr><th>ユーザー</th>${headCols}<th>累計</th></tr></thead>
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
 * 0.1.25 (Z): 自分が言わなかった人気語 TOP（L14）。
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
<h2>自分が言わなかった人気語 TOP <span class="mkt-pro-tag">PRO</span></h2>
<p class="mkt-note">配信全体で頻出だが、自分のコメントには 1 度も使っていない語（ラテラル分析 L14）。"次回試したい弾" の自動抽出。</p>
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
 * @param {MarketingReport} r
 * @param {{
 *   maskShareLabels?: boolean,
 *   anonymousIdenticonResolver?: (uid: string) => string,
 *   broadcasterUserId?: string,
 *   sessionSummaryRows?: import('./concurrentTimelineSeries.js').ConcurrentTimelineRow[],
 *   commentsForAnalytics?: import('./commentVelocityTimeline.js').VelocityCommentInput[],
 *   pastBroadcasts?: import('./commenterHistoricalAnalytics.js').BroadcastBundle[]
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

  // 0.1.26 (AA): TOC は「実際に描画されたセクション」だけ表示する。
  // 沈黙ゾーンやコメ伝染など、データ不足で空文字を返すセクションをクリックしても
  // 何も起こらない／謎のスクロール挙動になる問題を解消する。
  const allTocItems = [
    { id: 'mkt-kpi', label: 'KPI サマリ' },
    { id: 'mkt-content', label: 'コメント本文・属性の傾向' },
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
    { id: 'mkt-unique-words', label: '言わなかった人気語 TOP（PRO）' },
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
${idWrap('mkt-kpi', sectionKpi(r))}
${sectionAdviceAfterKpi(r)}
${idWrap('mkt-content', sectionContentShape(r))}
${sectionAdviceAfterContentShape(r)}
${idWrap('mkt-quarter', sectionQuarterEngagement(r))}
${sectionAdviceAfterQuarterEngagement(r)}
${idWrap('mkt-timeline', sectionTimeline(r))}
${sectionAdviceAfterTimeline(r)}
${sectionCommentVelocityCurve(velocityTimeline)}
${sectionConcurrentTimeline(concurrentSeries, concurrentPeak)}
${sectionSilenceZones(silenceZones)}
${sectionLaughterDensity(laughterDensity)}
${sectionNewVsRepeat(newVsRepeat)}
${sectionSurvivalCurve(survivalCurve)}
${sectionDepartedHeavy(departedHeavy, maskShare)}
${sectionAttendanceMatrix(attendanceMatrix, maskShare)}
${sectionKeyboardTypes(keyboardTypes)}
${sectionRecentComparison(recentComparison)}
${sectionWeekdayHourHeatmap(weekdayHourHeat)}
${sectionGrowthMeter(growth, '今回の総コメ数')}
${sectionOpeningFivePrediction(openingFivePts)}
${sectionWaveformSimilarity(similarBroadcasts)}
${sectionEchoBursts(echoPropagation, echoSync)}
${sectionFirstSecondLatency(firstSecondLatency)}
${sectionTalentPeak(talentPeaks)}
${sectionSentimentCurve(sentimentCurve)}
${sectionUniqueWordSuggestions(uniqueWords)}
${sectionReachCoefficient(reach)}
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
<p class="mkt-header__sub">${escapeHtml(r.liveId)} — ${new Date().toLocaleString('ja-JP')} 出力${escapeHtml(subSuffix)} · JSON埋め込み ${escapeHtml(exportedAtIso)}</p>
</header>
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
<span class="mkt-thumb-grid__avatar-wrap"><img class="mkt-thumb-grid__avatar" src="${escapeHtml(u.thumbSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>
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
body{margin:0;font-family:'Segoe UI','Hiragino Sans',sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6;scroll-behavior:smooth}
.mkt-header{padding:2rem 1.5rem 1rem;background:linear-gradient(135deg,#1e293b,#0f172a);border-bottom:1px solid #334155}
.mkt-header__title{margin:0;font-size:1.6rem;font-weight:700}
.mkt-header__sub{margin:.3rem 0 0;font-size:.85rem;color:#94a3b8}
.mkt-main{max-width:960px;margin:0 auto;padding:1.5rem 1rem}
.mkt-section{background:#1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.2rem;border:1px solid #334155;scroll-margin-top:1rem}
.mkt-section h2{margin:0 0 .8rem;font-size:1.1rem;color:#f8fafc;border-left:4px solid #3b82f6;padding-left:.6rem}
.mkt-section--toc{background:#0f172a}
.mkt-toc{margin:0;padding-left:1.5rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.3rem .8rem}
.mkt-toc__link{color:#93c5fd;text-decoration:none;font-size:.85rem}
.mkt-toc__link:hover{text-decoration:underline}
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
.mkt-note{font-size:.78rem;color:#94a3b8;margin:0 0 .6rem}
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
.mkt-rank-n{width:2rem;color:#64748b;text-align:right;font-size:.8rem}
.mkt-rank-av{width:28px;height:28px;border-radius:50%;object-fit:cover;display:block}
.mkt-rank-av--empty{background:#334155}
.mkt-rank-name{font-size:.85rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mkt-rank-name .nl-user-profile-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-rank-name .nl-user-profile-link:hover{color:#bfdbfe}
.mkt-rank-bar{position:relative;height:22px;background:#0f172a;border-radius:4px;overflow:hidden}
.mkt-rank-bar__fill{height:100%;background:linear-gradient(90deg,#3b82f6,#6366f1);border-radius:4px}
.mkt-rank-bar__label{position:absolute;right:6px;top:2px;font-size:.75rem;color:#f8fafc;font-weight:600}
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
@media print{
  body{background:#fff;color:#0f172a}
  .mkt-header,.mkt-section{background:#f1f5f9;border-color:#cbd5e1;box-shadow:none}
  .mkt-advice-row{break-inside:avoid}
  .mkt-section{break-inside:avoid-page}
  .mkt-chart-wrap{overflow:visible}
}
`;
