import { escapeAttr, escapeHtml } from '../shared/html/escape.js';

/**
 * PR #79 の出力型には依存せず、このファイル内で独立に定義する。
 *
 * @typedef {{ [key: string]: unknown }} SupporterRecognitionBreakdown
 *
 * @typedef {object} SupporterRecognitionSupporter
 * @property {string} userKey
 * @property {string} displayName
 * @property {number} score
 * @property {SupporterRecognitionBreakdown} breakdown
 * @property {number} rank
 * @property {boolean} isAnonymous
 * @property {string[]} highlights
 *
 * @typedef {object} SupporterRecognitionReportMeta
 * @property {string} [liveId]
 * @property {string} [programTitle]
 * @property {string} [broadcasterName]
 * @property {number} [generatedAt]
 */

const CSS = `
:root{
  color-scheme:light;
  --bg:#f5efe4;
  --bg-accent:#fff7ea;
  --paper:#fffdf8;
  --ink:#2f241c;
  --muted:#6f6257;
  --line:#e7d7c7;
  --rinku:#2d8f83;
  --rinku-soft:#e0f4f1;
  --konta:#c97f18;
  --konta-soft:#fff1d8;
  --tanunee:#8f5d41;
  --tanunee-soft:#f4e8df;
  --gold:#b86d1c;
  --shadow:0 20px 50px rgba(88,58,32,0.12);
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{
  min-height:100vh;
  font-family:"Hiragino Sans","Yu Gothic","Meiryo",sans-serif;
  color:var(--ink);
  background:
    radial-gradient(circle at top left, rgba(45,143,131,0.14), transparent 34%),
    radial-gradient(circle at top right, rgba(201,127,24,0.15), transparent 30%),
    linear-gradient(180deg, #fff7e7 0%, var(--bg) 46%, #efe4d4 100%);
}
.report-shell{
  width:min(1120px, calc(100% - 32px));
  margin:0 auto;
  padding:32px 0 48px;
}
.hero{
  position:relative;
  overflow:hidden;
  padding:28px;
  border:1px solid rgba(255,255,255,0.55);
  border-radius:28px;
  background:
    linear-gradient(135deg, rgba(255,255,255,0.94), rgba(255,250,242,0.86)),
    radial-gradient(circle at top right, rgba(201,127,24,0.14), transparent 34%);
  box-shadow:var(--shadow);
}
.hero::after{
  content:"";
  position:absolute;
  inset:auto -24px -28px auto;
  width:180px;
  height:180px;
  border-radius:50%;
  background:rgba(45,143,131,0.08);
  filter:blur(4px);
}
.eyebrow{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:7px 12px;
  border-radius:999px;
  font-size:13px;
  color:var(--gold);
  background:rgba(255,244,225,0.95);
  border:1px solid rgba(184,109,28,0.22);
}
.hero h1{
  margin:16px 0 10px;
  font-size:clamp(31px, 5vw, 46px);
  line-height:1.08;
  letter-spacing:0.01em;
}
.hero__lead{
  position:relative;
  z-index:1;
  margin:0;
  max-width:720px;
  font-size:16px;
  line-height:1.8;
  color:var(--muted);
}
.meta-grid,
.summary-grid,
.guide-grid{
  display:grid;
  gap:16px;
}
.meta-grid{
  margin-top:20px;
  grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
}
.meta-card,
.summary-card,
.guide-card,
.ranking-card{
  border-radius:24px;
  background:var(--paper);
  border:1px solid var(--line);
  box-shadow:var(--shadow);
}
.meta-card{
  padding:16px 18px;
}
.meta-card__label{
  margin:0 0 8px;
  font-size:12px;
  font-weight:700;
  letter-spacing:0.08em;
  color:var(--muted);
  text-transform:uppercase;
}
.meta-card__value{
  margin:0;
  font-size:15px;
  line-height:1.6;
  word-break:break-word;
}
.summary-grid{
  margin-top:18px;
  grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
}
.summary-card{
  padding:20px;
}
.summary-card__label{
  margin:0 0 10px;
  font-size:13px;
  color:var(--muted);
}
.summary-card__value{
  margin:0;
  font-size:30px;
  font-weight:800;
}
.summary-note{
  margin-top:16px;
  padding:14px 16px;
  border-radius:16px;
  background:rgba(255,248,236,0.88);
  border:1px solid rgba(185,132,64,0.18);
  font-size:14px;
  line-height:1.75;
  color:var(--muted);
}
.guide-grid{
  margin-top:24px;
  grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
}
.guide-card{
  padding:20px;
}
.guide-card__tag{
  display:inline-flex;
  padding:5px 10px;
  border-radius:999px;
  font-size:12px;
  font-weight:700;
}
.guide-card--rinku .guide-card__tag{
  color:var(--rinku);
  background:var(--rinku-soft);
}
.guide-card--konta .guide-card__tag{
  color:var(--konta);
  background:var(--konta-soft);
}
.guide-card--tanunee .guide-card__tag{
  color:var(--tanunee);
  background:var(--tanunee-soft);
}
.guide-card h2{
  margin:14px 0 10px;
  font-size:20px;
}
.guide-card p{
  margin:0;
  font-size:14px;
  line-height:1.8;
  color:var(--muted);
}
.ranking-card{
  margin-top:24px;
  padding:24px;
}
.ranking-card__head{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:16px;
  margin-bottom:18px;
}
.ranking-card__head h2{
  margin:0;
  font-size:28px;
}
.ranking-card__head p{
  margin:0;
  font-size:14px;
  line-height:1.7;
  color:var(--muted);
}
.ranking-list{
  list-style:none;
  margin:0;
  padding:0;
  display:grid;
  gap:16px;
}
.supporter-card{
  display:grid;
  gap:14px;
  padding:18px;
  border-radius:20px;
  border:1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,250,244,0.94));
}
.supporter-card--anonymous{
  border-color:rgba(143,93,65,0.3);
  background:
    linear-gradient(180deg, rgba(255,252,249,0.98), rgba(246,234,222,0.95));
}
.supporter-card__top{
  display:grid;
  grid-template-columns:auto 1fr auto;
  gap:14px;
  align-items:center;
}
.supporter-card__rank{
  display:grid;
  place-items:center;
  min-width:56px;
  min-height:56px;
  padding:8px;
  border-radius:18px;
  color:#fff;
  font-weight:800;
  font-size:20px;
  background:linear-gradient(135deg, #d6953d, #b86d1c);
}
.supporter-card__name{
  margin:0;
  font-size:20px;
  line-height:1.3;
  word-break:break-word;
}
.supporter-card__sub{
  margin:6px 0 0;
  font-size:13px;
  line-height:1.6;
  color:var(--muted);
  word-break:break-all;
}
.supporter-card__score{
  text-align:right;
}
.supporter-card__score-label{
  display:block;
  font-size:12px;
  color:var(--muted);
}
.supporter-card__score-value{
  display:block;
  font-size:26px;
  font-weight:800;
}
.supporter-card__badges{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.supporter-card__badge{
  display:inline-flex;
  align-items:center;
  padding:6px 10px;
  border-radius:999px;
  font-size:12px;
  font-weight:700;
  background:rgba(45,143,131,0.1);
  color:var(--rinku);
}
.supporter-card__badge--anonymous{
  background:rgba(143,93,65,0.12);
  color:var(--tanunee);
}
.supporter-card__praise{
  margin:0;
  padding:13px 14px;
  border-radius:16px;
  font-size:14px;
  line-height:1.75;
  color:var(--ink);
  background:rgba(255,247,234,0.88);
}
.supporter-card__speaker{
  font-weight:800;
  color:var(--gold);
}
.supporter-card__breakdown{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.supporter-card__chip{
  display:inline-flex;
  gap:6px;
  padding:8px 12px;
  border-radius:14px;
  font-size:13px;
  background:#fbf6ef;
  border:1px solid rgba(111,98,87,0.12);
}
.supporter-card__chip-label{
  color:var(--muted);
}
.supporter-card__highlights{
  margin:0;
  padding:0;
  list-style:none;
  display:grid;
  gap:9px;
}
.supporter-card__highlight{
  padding:12px 14px;
  border-left:4px solid rgba(45,143,131,0.26);
  border-radius:0 16px 16px 0;
  background:rgba(255,255,255,0.72);
  font-size:14px;
  line-height:1.7;
}
.supporter-card--anonymous .supporter-card__highlight{
  border-left-color:rgba(143,93,65,0.28);
}
.empty-state{
  padding:26px;
  border-radius:20px;
  background:linear-gradient(180deg, rgba(255,251,244,0.96), rgba(255,245,227,0.92));
  border:1px dashed rgba(184,109,28,0.3);
}
.empty-state h3{
  margin:0 0 10px;
  font-size:22px;
}
.empty-state p{
  margin:0;
  font-size:15px;
  line-height:1.8;
  color:var(--muted);
}
@media (max-width: 720px){
  .report-shell{width:min(100% - 20px, 1120px);padding:20px 0 32px;}
  .hero,.ranking-card,.summary-card,.guide-card,.meta-card{padding-inline:18px;}
  .supporter-card__top{
    grid-template-columns:auto 1fr;
  }
  .supporter-card__score{
    grid-column:1 / -1;
    text-align:left;
  }
  .ranking-card__head{
    flex-direction:column;
    align-items:flex-start;
  }
}
`;

const GUIDE_CARDS = [
  {
    key: 'rinku',
    name: 'りんく',
    role: '配信者視点',
    line:
      'がんばってコメントを打ってくれた人も、ギフトで背中を押してくれた人も、あとから「ちゃんと届いていた」と見返せるように並べたよ。'
  },
  {
    key: 'konta',
    name: 'こん太',
    role: 'ファン視点',
    line:
      '盛り上げの熱量は、静かな一言にも大きな連投にも宿るよね。応援の積み重ねが次の配信の元気につながるように、見える形にしてあります。'
  },
  {
    key: 'tanunee',
    name: 'たぬ姉',
    role: '匿名ガイド',
    line:
      '184 匿名の応援も、見えないからといって後ろへ追いやらないタヌ。匿名のままでも支えてくれた熱を、同じランキングの中で丁寧に拾ってあるタヌよ。'
  }
];

/** @param {unknown} value */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function textOrBlank(value) {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function finiteNumberOrZero(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function rankOrFallback(value, fallback) {
  const n = Math.floor(finiteNumberOrZero(value));
  return n > 0 ? n : fallback;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatScore(value) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value - Math.round(value)) < 0.000001) {
    return Math.round(value).toLocaleString('ja-JP');
  }
  return value.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatBreakdownValue(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return formatScore(value);
  if (typeof value === 'boolean') return value ? 'あり' : '';

  if (Array.isArray(value)) {
    const parts = [];
    for (const item of value) {
      const text = formatBreakdownValue(item);
      if (text) parts.push(text);
      if (parts.length >= 3) break;
    }
    return parts.join(' / ');
  }

  if (isRecord(value)) {
    const parts = [];
    for (const [key, entryValue] of Object.entries(value)) {
      const entryText = formatBreakdownValue(entryValue);
      if (!entryText) continue;
      parts.push(`${humanizeBreakdownKey(key)}:${entryText}`);
      if (parts.length >= 3) break;
    }
    return parts.join(' / ');
  }

  return textOrBlank(value);
}

/**
 * @param {string} key
 * @returns {string}
 */
function humanizeBreakdownKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

/**
 * @param {SupporterRecognitionBreakdown} breakdown
 * @returns {{ label: string, value: string }[]}
 */
function breakdownItems(breakdown) {
  const items = [];
  for (const [key, value] of Object.entries(breakdown)) {
    const text = formatBreakdownValue(value);
    if (!text) continue;
    items.push({
      label: humanizeBreakdownKey(key),
      value: text
    });
  }
  return items.slice(0, 6);
}

/**
 * @param {SupporterRecognitionSupporter} supporter
 * @param {number} index
 * @returns {'りんく'|'こん太'|'たぬ姉'}
 */
function praiseSpeaker(supporter, index) {
  if (supporter.isAnonymous) return 'たぬ姉';
  if (index % 3 === 1) return 'こん太';
  if (index % 3 === 2) return 'たぬ姉';
  return 'りんく';
}

/**
 * @param {SupporterRecognitionSupporter} supporter
 * @param {number} index
 * @returns {string}
 */
function fallbackHighlight(supporter, index) {
  const speaker = praiseSpeaker(supporter, index);
  if (supporter.isAnonymous) {
    return `${speaker}より: 匿名のままでも、配信を支えてくれた熱がしっかり残っています。`;
  }
  if (supporter.rank === 1) {
    return `${speaker}より: 今回いちばん大きく場を押し上げてくれた応援でした。`;
  }
  if (supporter.rank <= 3) {
    return `${speaker}より: 目立つところでも、見えないところでも、番組を前へ進めてくれました。`;
  }
  return `${speaker}より: 積み重ねてくれた一つひとつの応援が、配信の空気を明るくしてくれました。`;
}

/**
 * @param {unknown} supporters
 * @returns {SupporterRecognitionSupporter[]}
 */
function normalizeSupporters(supporters) {
  if (!Array.isArray(supporters)) return [];

  /** @type {SupporterRecognitionSupporter[]} */
  const normalized = [];
  for (let index = 0; index < supporters.length; index += 1) {
    const value = supporters[index];
    if (!isRecord(value)) continue;

    /** @type {SupporterRecognitionBreakdown} */
    const breakdown = isRecord(value.breakdown)
      ? /** @type {SupporterRecognitionBreakdown} */ (value.breakdown)
      : {};

    const highlights = [];
    if (Array.isArray(value.highlights)) {
      for (const entry of value.highlights) {
        const text = textOrBlank(entry);
        if (text) highlights.push(text);
        if (highlights.length >= 4) break;
      }
    }

    const isAnonymous = value.isAnonymous === true;
    normalized.push({
      userKey: textOrBlank(value.userKey) || `supporter-${index + 1}`,
      displayName:
        textOrBlank(value.displayName) || (isAnonymous ? '匿名の応援者' : `応援者 ${index + 1}`),
      score: Math.max(0, finiteNumberOrZero(value.score)),
      breakdown,
      rank: rankOrFallback(value.rank, index + 1),
      isAnonymous,
      highlights
    });
  }

  normalized.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.score !== b.score) return b.score - a.score;
    return a.displayName.localeCompare(b.displayName, 'ja');
  });

  return normalized;
}

/**
 * @param {SupporterRecognitionReportMeta | undefined} meta
 * @returns {{ liveId: string, programTitle: string, broadcasterName: string, generatedAtText: string, generatedAtIso: string }}
 */
function normalizeMeta(meta) {
  const liveId = textOrBlank(meta?.liveId);
  const programTitle = textOrBlank(meta?.programTitle);
  const broadcasterName = textOrBlank(meta?.broadcasterName);
  const generatedAt = finiteNumberOrZero(meta?.generatedAt);
  if (generatedAt > 0) {
    return {
      liveId,
      programTitle,
      broadcasterName,
      generatedAtText: new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Asia/Tokyo'
      }).format(new Date(generatedAt)),
      generatedAtIso: new Date(generatedAt).toISOString()
    };
  }
  return {
    liveId,
    programTitle,
    broadcasterName,
    generatedAtText: '',
    generatedAtIso: ''
  };
}

/**
 * @param {SupporterRecognitionSupporter} supporter
 * @param {number} index
 * @returns {string}
 */
function renderSupporterCard(supporter, index) {
  const speaker = praiseSpeaker(supporter, index);
  const highlights = supporter.highlights.length
    ? supporter.highlights
    : [fallbackHighlight(supporter, index)];
  const chips = breakdownItems(supporter.breakdown);
  const badgeHtml = [
    `<span class="supporter-card__badge">userKey ${escapeHtml(supporter.userKey)}</span>`
  ];
  if (supporter.isAnonymous) {
    badgeHtml.push('<span class="supporter-card__badge supporter-card__badge--anonymous">匿名も記録</span>');
  }

  const breakdownHtml = chips.length
    ? `<div class="supporter-card__breakdown">${chips
        .map(
          (item) =>
            `<span class="supporter-card__chip"><span class="supporter-card__chip-label">${escapeHtml(item.label)}</span><span>${escapeHtml(item.value)}</span></span>`
        )
        .join('')}</div>`
    : '';

  const highlightHtml = `<ul class="supporter-card__highlights">${highlights
    .map(
      (line) =>
        `<li class="supporter-card__highlight">${escapeHtml(line)}</li>`
    )
    .join('')}</ul>`;

  const praiseLine = supporter.isAnonymous
    ? '匿名の応援も埋もれさせず、今回の支えとして同じ列に並べています。'
    : `${supporter.displayName}さんの応援は、配信の流れを前に押してくれました。`;

  return `
      <li class="supporter-card${supporter.isAnonymous ? ' supporter-card--anonymous' : ''}" aria-label="${escapeAttr(`第${supporter.rank}位 ${supporter.displayName}`)}">
        <div class="supporter-card__top">
          <div class="supporter-card__rank">#${supporter.rank}</div>
          <div>
            <h3 class="supporter-card__name">${escapeHtml(supporter.displayName)}</h3>
            <p class="supporter-card__sub">${supporter.isAnonymous ? '匿名のまま届いた応援もそのまま掲載' : '見返したときに分かるよう userKey を併記'} / ${escapeHtml(supporter.userKey)}</p>
          </div>
          <div class="supporter-card__score">
            <span class="supporter-card__score-label">応援スコア</span>
            <span class="supporter-card__score-value">${escapeHtml(formatScore(supporter.score))}</span>
          </div>
        </div>
        <div class="supporter-card__badges">${badgeHtml.join('')}</div>
        <p class="supporter-card__praise"><span class="supporter-card__speaker">${escapeHtml(speaker)}</span> ${escapeHtml(praiseLine)}</p>
        ${breakdownHtml}
        ${highlightHtml}
      </li>`;
}

/**
 * 配信を支えてくれた人たちを、完全 standalone な HTML として称える。
 * 外部リソース取得なし、inline CSS のみ、ローカル保存前提。
 *
 * @param {SupporterRecognitionSupporter[]} supporters
 * @param {SupporterRecognitionReportMeta} [meta]
 * @returns {string}
 */
export function buildSupporterRecognitionReportHtml(supporters, meta = {}) {
  const normalizedSupporters = normalizeSupporters(supporters);
  const normalizedMeta = normalizeMeta(meta);

  const liveLabel = normalizedMeta.programTitle || normalizedMeta.liveId || 'この放送';
  const docTitle = `${liveLabel} の応援者振り返りレポート`;
  const anonymousCount = normalizedSupporters.filter((supporter) => supporter.isAnonymous).length;
  const namedCount = Math.max(0, normalizedSupporters.length - anonymousCount);
  const topScore = normalizedSupporters.length ? formatScore(normalizedSupporters[0].score) : '—';

  const metaCards = [
    {
      label: '番組タイトル',
      value: normalizedMeta.programTitle || '未設定'
    },
    {
      label: '配信者',
      value: normalizedMeta.broadcasterName || '未設定'
    },
    {
      label: 'live ID',
      value: normalizedMeta.liveId || '未設定'
    },
    {
      label: '生成日時',
      value: normalizedMeta.generatedAtText || '未設定',
      datetime: normalizedMeta.generatedAtIso
    }
  ];

  const metaGridHtml = metaCards
    .map((card) => {
      const valueHtml =
        card.datetime && card.value !== '未設定'
          ? `<time datetime="${escapeAttr(card.datetime)}" class="meta-card__value">${escapeHtml(card.value)}</time>`
          : `<p class="meta-card__value">${escapeHtml(card.value)}</p>`;
      return `
        <section class="meta-card">
          <p class="meta-card__label">${escapeHtml(card.label)}</p>
          ${valueHtml}
        </section>`;
    })
    .join('');

  const summaryCards = [
    { label: 'ランキング掲載', value: `${normalizedSupporters.length}人` },
    { label: '名前ありの応援', value: `${namedCount}人` },
    { label: '匿名の応援', value: `${anonymousCount}人` },
    { label: 'トップスコア', value: topScore }
  ]
    .map(
      (item) => `
        <section class="summary-card">
          <p class="summary-card__label">${escapeHtml(item.label)}</p>
          <p class="summary-card__value">${escapeHtml(item.value)}</p>
        </section>`
    )
    .join('');

  const guideHtml = GUIDE_CARDS.map(
    (card) => `
      <section class="guide-card guide-card--${escapeHtml(card.key)}">
        <span class="guide-card__tag">${escapeHtml(card.role)}</span>
        <h2>${escapeHtml(card.name)}</h2>
        <p>${escapeHtml(card.line)}</p>
      </section>`
  ).join('');

  const rankingHtml = normalizedSupporters.length
    ? `<ol class="ranking-list">${normalizedSupporters
        .map((supporter, index) => renderSupporterCard(supporter, index))
        .join('')}</ol>`
    : `
      <div class="empty-state">
        <h3>今回はまだ表彰カードがありません</h3>
        <p>応援の集計がまだ無い回でも大丈夫です。次回はコメントやギフトの積み重ねを、匿名のひとことも含めてこのレポートに並べられます。</p>
      </div>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(docTitle)}</title>
<style>${CSS}</style>
</head>
<body>
  <div class="report-shell">
    <header class="hero">
      <div class="eyebrow">完全ローカル保存 / 外部送信なし / standalone HTML</div>
      <h1>${escapeHtml(docTitle)}</h1>
      <p class="hero__lead">がんばってコメントを打ってくれた人も、ギフトを投げてくれた人も、見逃さずに称えられるようにまとめた振り返りページです。この HTML は外部リソースを読まず、この PC の中だけで応援の足あとを見返せます。</p>
      <div class="meta-grid">${metaGridHtml}</div>
      <div class="summary-grid">${summaryCards}</div>
      <div class="summary-note">りんくは配信者視点で感謝を伝え、こん太はファン視点で熱量を言葉にし、たぬ姉は匿名の応援も取りこぼさず案内します。目立つ応援も静かな応援も、同じ一回としてここに残します。</div>
    </header>

    <section class="guide-grid" aria-label="キャラガイド">
      ${guideHtml}
    </section>

    <section class="ranking-card">
      <div class="ranking-card__head">
        <div>
          <h2>応援者きらめきランキング</h2>
          <p>上位の応援者を一覧で並べ、内訳と highlights をそのまま称賛文として残します。匿名の支えも、たぬ姉の案内で同じカードに含めます。</p>
        </div>
      </div>
      ${rankingHtml}
    </section>
  </div>
</body>
</html>`;
}
