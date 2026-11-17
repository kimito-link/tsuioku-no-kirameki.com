/**
 * ニコ生以外のマーケHTMLに足す章。見た目のクラスは既存の mkt-* を使う。
 * 数は渡された記録にあるものだけ。換算した円は出さない（台帳の列が「推定」と書く）。
 */

import { escapeHtml } from '../htmlEscape.js';
import { isMarketingSupportRow } from '../marketingAggregate.js';
import { GIFT_MOMENT_FORBIDDEN_WORDS } from '../giftMomentAnalytics.js';
import { panelExtraChips } from './platformMetrics.js';

const FLOW_CAP = 24;
const WORD_CONTEXT_MAX_COMMENTS = 4000;
const WINDOW_MS = 5 * 60_000;

/**
 * @param {number} ms
 */
function clock(ms) {
  if (!(ms > 0)) return '';
  return new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

/**
 * @param {Array<Record<string, unknown>>} comments
 * @param {{ giftWord: string }} view
 */
export function sectionSupportFlowHtml(comments, view) {
  if (!view) return '';
  const rows = Array.isArray(comments) ? comments : [];
  /** @type {Array<Record<string, unknown>>} */
  const support = [];
  /** @type {Array<Record<string, unknown>>} */
  const speech = [];
  for (const c of rows) {
    if (isMarketingSupportRow(c)) support.push(c);
    else if (c && String(c.text || '').trim()) speech.push(c);
  }
  if (!support.length) return '';
  const events = support
    .slice()
    .sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0))
    .slice(0, FLOW_CAP);
  const withWords = speech.length > 0 && speech.length <= WORD_CONTEXT_MAX_COMMENTS;
  /** @type {Array<Record<string, unknown>> | null} */
  const speechSorted = withWords
    ? speech.slice().sort((a, b) => (Number(a.capturedAt) || 0) - (Number(b.capturedAt) || 0))
    : null;
  /** @type {Map<string, Record<string, unknown>>} */
  const firstByUser = new Map();
  if (speechSorted) {
    for (const c of speechSorted) {
      const uid = String(c.userId || '').trim();
      if (!uid || firstByUser.has(uid)) continue;
      firstByUser.set(uid, c);
    }
  }
  const items = events.map((ev) => {
    const uid = String(ev.userId || '').trim();
    const name = String(ev.nickname || ev.name || '').trim() || '名前なし';
    const when = clock(Number(ev.capturedAt) || 0);
    const what = String(ev.text || ev.ytGiftName || view.giftWord || '').trim();
    const first = uid ? firstByUser.get(uid) : null;
    const firstAt = first ? Number(first.capturedAt) || 0 : 0;
    const firstBit = first
      ? `最初のコメントは ${clock(firstAt)}`
      : 'この記録では、その前のコメントは見えていません';
    let near = '';
    if (speechSorted && (Number(ev.capturedAt) || 0) > 0) {
      const t = Number(ev.capturedAt);
      const bits = [];
      for (const c of speechSorted) {
        const ct = Number(c.capturedAt) || 0;
        if (ct < t - WINDOW_MS) continue;
        if (ct > t) break;
        const text = String(c.text || '').trim();
        if (text) bits.push(text);
        if (bits.length >= 3) break;
      }
      if (bits.length) near = `直前に見えていたコメント: ${bits.join(' / ')}`;
    }
    return `<li>${escapeHtml([when, name, what, firstBit, near].filter(Boolean).join(' · '))}</li>`;
  });
  const note = '推定（同じ時間に起きたこと・原因とは限らない）。';
  for (const word of GIFT_MOMENT_FORBIDDEN_WORDS) {
    if (note.includes(word)) return '';
  }
  const more = support.length > events.length
    ? `<p class="mkt-note">表示は ${events.length} 件まで（記録 ${support.length} 件）。</p>`
    : '';
  return `<section class="mkt-section" id="mkt-support-flow">
<h2>登録・応援してくれた人の流れ</h2>
<p class="mkt-note">${escapeHtml(note)}</p>
<ul class="mkt-mini-stats">${items.join('')}</ul>
${more}
</section>`;
}

/** パーサが kind として残しているものだけ。無い kind は数えない。 */
/** @type {Readonly<Record<string, string>>} */
const EXTRA_KIND_LABEL = Object.freeze({
  yt_gift: '新しいギフト',
  sticker: 'ステッカー',
  tw_milestone: '連続視聴の記念',
  tw_reward: 'ポイント交換',
  tw_hype: 'ハイプトレイン',
  kk_reward: 'リワード',
  mx_fan: 'ファン登録',
});

/** 記録の通貨コードを、そのサービスの単位の名前にする。知らないコードはそのまま出す。 */
/** @type {Readonly<Record<string, string>>} */
const CURRENCY_LABEL = Object.freeze({
  JPY: '円の合計（記録）',
  USD: 'USD の合計（記録）',
  BITS: 'Bits の合計（記録）',
  KICKS: 'Kicks の合計（記録）',
  WWITEM: 'アイテム（個・記録）',
  SRPT: 'ギフトpt（記録）',
  MXCOIN: 'コイン（記録）',
  TTCOIN: 'コイン（記録）',
  TCSCORE: 'スコア（記録）',
});

/**
 * @param {Array<Record<string, unknown>>} comments
 * @param {{ id: string, pageCountLabel: string, showMember: boolean, hideGift: boolean, pointEstimate: boolean, mixchUnitNote?: boolean }} view
 * @param {number} pageCount
 * @param {object | null} [pageFacts]
 */
export function sectionPlatformDedicatedHtml(comments, view, pageCount, pageFacts = null) {
  if (!view) return '';
  const rows = Array.isArray(comments) ? comments : [];
  /** @type {Map<string, number>} */
  const byCur = new Map();
  /** @type {Map<string, number>} */
  const extraKinds = new Map();
  /** @type {Map<string, number>} */
  const giftNames = new Map();
  /** @type {Map<string, number>} */
  const commentTypes = new Map();
  /** @type {Set<string>} */
  const tiers = new Set();
  /** @type {string[]} */
  const recipients = [];
  let raids = 0;
  let raidViewers = 0;
  let hosts = 0;
  let hostViewers = 0;
  let subs = 0;
  let resubs = 0;
  let giftSubs = 0;
  let giftPieces = 0;
  let memberBadges = 0;
  let milestoneMax = 0;
  /** @type {number[]} */
  const months = [];
  for (const c of rows) {
    if (!isMarketingSupportRow(c)) {
      if (view.showMember && Array.isArray(c?.badges) && c.badges.includes('member')) memberBadges += 1;
      if (view.id === 'whowatch' && Array.isArray(c?.badges)) {
        for (const b of c.badges) {
          const name = String(b || '').trim();
          if (name) commentTypes.set(name, (commentTypes.get(name) || 0) + 1);
        }
      }
      continue;
    }
    const kind = String(c.ytKind || '');
    const cur = String(c.ytCurrency || '').trim().toUpperCase();
    const amt = Number(c.ytAmount);
    if (cur && Number.isFinite(amt) && amt > 0) byCur.set(cur, (byCur.get(cur) || 0) + amt);
    const giftName = String(c.ytGiftName || '').trim();
    if (giftName) giftNames.set(giftName, (giftNames.get(giftName) || 0) + 1);
    if (EXTRA_KIND_LABEL[kind]) extraKinds.set(kind, (extraKinds.get(kind) || 0) + 1);
    if (kind === 'tw_milestone' && Number.isFinite(amt) && amt > 0) milestoneMax = Math.max(milestoneMax, Math.floor(amt));
    if (kind === 'tw_raid') {
      raids += 1;
      if (Number.isFinite(amt) && amt > 0) raidViewers += Math.floor(amt);
    }
    if (kind === 'kk_host') {
      hosts += 1;
      if (Number.isFinite(amt) && amt > 0) hostViewers += Math.floor(amt);
    }
    if (kind === 'membership') {
      if (c.subEvent === 'resub') resubs += 1;
      else if (c.subEvent === 'sub') subs += 1;
      const m = Number(c.subMonths);
      if (m > 0) months.push(Math.floor(m));
      const tier = String(c.subTier || '').trim();
      if (tier) tiers.add(tier);
    }
    if (kind === 'membership_gift') {
      giftSubs += 1;
      const pieces = Number(c.ytGiftCount);
      if (pieces > 0) giftPieces += Math.floor(pieces);
      const tier = String(c.subTier || '').trim();
      if (tier) tiers.add(tier);
      if (Array.isArray(c.giftRecipients)) {
        for (const name of c.giftRecipients) {
          const s = String(name || '').trim();
          if (s && recipients.length < 8) recipients.push(s);
        }
      }
    }
    if (view.showMember && Array.isArray(c.badges) && c.badges.includes('member')) memberBadges += 1;
  }
  /** @type {Array<[string, string]>} */
  const cards = [];
  if (view.pageCountLabel && pageCount > 0) cards.push([view.pageCountLabel, `${pageCount.toLocaleString('ja-JP')}`]);
  for (const [cur, sum] of byCur) {
    cards.push([CURRENCY_LABEL[cur] || `${cur} の合計（記録）`, String(sum)]);
  }
  if (subs > 0) cards.push(['新しいサブスク', `${subs}件`]);
  if (resubs > 0) cards.push(['継続のサブスク', `${resubs}件`]);
  if (giftSubs > 0) cards.push(['ギフトサブ', `${giftSubs}件`]);
  if (giftPieces > 0 && giftPieces !== giftSubs) cards.push(['贈った件数（記録）', `${giftPieces}件`]);
  if (months.length) cards.push(['サブスク月数（記録にあるもの）', months.join('、')]);
  if (tiers.size) cards.push(['段階（記録）', [...tiers].join('、')]);
  if (recipients.length) cards.push(['受け取った人（記録にある名前）', recipients.join('、')]);
  if (raids > 0) cards.push(['レイド', raidViewers > 0 ? `${raids}回 / ${raidViewers}人` : `${raids}回`]);
  if (hosts > 0) cards.push(['ホスト', hostViewers > 0 ? `${hosts}回 / ${hostViewers}人` : `${hosts}回`]);
  for (const [kind, n] of extraKinds) {
    const label = EXTRA_KIND_LABEL[kind];
    if (!label || !(n > 0)) continue;
    const value = kind === 'tw_milestone' && milestoneMax > 0 ? `${n}件（${milestoneMax}回）` : `${n}件`;
    cards.push([label, value]);
  }
  if (giftNames.size) {
    const names = [...giftNames.entries()].slice(0, 6).map(([name, n]) => `${name} ×${n}`);
    cards.push(['出ていた名前（記録）', names.join('、')]);
  }
  if (commentTypes.size) {
    const types = [...commentTypes.entries()].slice(0, 6).map(([name, n]) => `${name} ×${n}`);
    cards.push(['コメントの種類（記録）', types.join('、')]);
  }
  if (view.showMember && memberBadges > 0) cards.push(['メンバーの印', `${memberBadges}件`]);
  if (pageFacts) {
    for (const chip of panelExtraChips(view.id, pageFacts)) {
      if (chip.placeholder) continue;
      if (chip.key === 'totalViews' && pageCount > 0) continue;
      cards.push([`ページの${chip.label}`, chip.text]);
    }
  }
  if (!cards.length) return '';
  const estimate = view.pointEstimate
    ? '<p class="mkt-note">通貨ごとの合計は、チャットに書いてあった金額です。円への換算はしていません。円換算の列がある表は推定です。</p>'
    : '';
  const unitNote = view.mixchUnitNote && byCur.has('MXCOIN')
    ? '<p class="mkt-note">コインの単位は未確認です。</p>'
    : '';
  const inner = cards
    .map(
      ([label, value]) =>
        `<div class="mkt-kpi mkt-kpi--compact"><span class="mkt-kpi__val">${escapeHtml(value)}</span><span class="mkt-kpi__label">${escapeHtml(label)}</span></div>`
    )
    .join('');
  return `<section class="mkt-section" id="mkt-platform-dedicated">
<h2>この配信の記録</h2>
<p class="mkt-note">このPCの記録に残っている数だけです。ページに無い数は出していません。</p>
${estimate}${unitNote}
<div class="mkt-kpi-grid">${inner}</div>
</section>`;
}

/**
 * 来場・広告の枠を出さない参加の章。ページの累計があるときだけその数を出す。
 * @param {{ totalComments: number, identifiedUsers?: number, uniqueUsers: number }} report
 * @param {{ pageCountLabel: string, hideGift: boolean, giftWord: string }} view
 * @param {number} pageCount
 */
export function sectionParticipationForPlatform(report, view, pageCount) {
  const people = Math.max(0, Number(report.identifiedUsers ?? report.uniqueUsers) || 0);
  const comments = Math.max(0, Number(report.totalComments) || 0);
  const showPage = Boolean(view.pageCountLabel) && pageCount > 0;
  const pageCard = showPage
    ? `<div class="mkt-participation-lead-card mkt-participation-lead-card--visitors">
<span class="mkt-participation-lead-card__label">${escapeHtml(view.pageCountLabel)}</span>
<strong class="mkt-participation-lead-card__value">${escapeHtml(pageCount.toLocaleString('ja-JP'))}</strong>
<span class="mkt-participation-lead-card__hint">ページに出ている数です。同時に見ている人数ではありません。</span>
</div>`
    : '';
  const headline = showPage
    ? `${view.pageCountLabel} ${pageCount.toLocaleString('ja-JP')} — コメント ${people.toLocaleString('ja-JP')}人`
    : `${people.toLocaleString('ja-JP')} 人がコメント`;
  return `<section class="mkt-section mkt-section--participation-lead" id="mkt-participation-lead" aria-label="コメント参加">
<h2>コメント参加</h2>
<p class="mkt-note">このPCの記録にある発言です。${view.hideGift ? '' : `${escapeHtml(view.giftWord)}は下の章に分けています。`}</p>
<p class="mkt-participation-headline">${escapeHtml(headline)}</p>
<div class="mkt-participation-lead-grid">
${pageCard}
<div class="mkt-participation-lead-card mkt-participation-lead-card--commenters">
<span class="mkt-participation-lead-card__label">コメントした人</span>
<strong class="mkt-participation-lead-card__value">${escapeHtml(`${people.toLocaleString('ja-JP')}人`)}</strong>
<span class="mkt-participation-lead-card__hint">${escapeHtml(`${comments.toLocaleString('ja-JP')}件`)}</span>
</div>
</div>
</section>`;
}

/**
 * 広告pt・来場を入れないサマリ。同接のピークはサンプルがあるときだけ。
 * @param {{ totalComments: number, uniqueUsers: number, identifiedUsers?: number, commentsPerMinute: number, durationMinutes: number }} report
 * @param {{ concurrentLabel: string }} view
 * @param {{ points?: Array<{ value: number }>, source?: string } | null} series
 * @param {{ peakValue?: number } | null} peak
 * @param {number} pageCount
 */
export function sectionPlatformSummaryHtml(report, view, series, peak, pageCount) {
  const points = series && Array.isArray(series.points) ? series.points : [];
  /** @type {Array<{ label: string, value: string, hint: string }>} */
  const cards = [];
  if (points.length && peak && Number(peak.peakValue) > 0) {
    cards.push({
      label: `最大${view.concurrentLabel}`,
      value: `${Number(peak.peakValue).toLocaleString('ja-JP')}人`,
      hint: `${points.length}点`,
    });
  }
  if (pageCount > 0 && view && 'pageCountLabel' in view && view.pageCountLabel) {
    cards.push({
      label: String(view.pageCountLabel),
      value: pageCount.toLocaleString('ja-JP'),
      hint: 'ページの数',
    });
  }
  cards.push(
    { label: 'コメント', value: `${Number(report.totalComments || 0).toLocaleString('ja-JP')}件`, hint: 'このPCの記録' },
    { label: 'コメントした人', value: `${Number(report.identifiedUsers ?? report.uniqueUsers ?? 0).toLocaleString('ja-JP')}人`, hint: 'このPCの記録' },
    { label: 'コメント/分', value: String(report.commentsPerMinute ?? ''), hint: `${report.durationMinutes}分` },
  );
  const inner = cards
    .map(
      (c) => `<div class="mkt-data-card">
<span class="mkt-data-card__label">${escapeHtml(c.label)}</span>
<strong class="mkt-data-card__value">${escapeHtml(c.value)}</strong>
<span class="mkt-data-card__hint">${escapeHtml(c.hint)}</span>
</div>`
    )
    .join('');
  return `<section class="mkt-section mkt-section--data-summary" id="mkt-data-summary">
<h2>配信の記録サマリ</h2>
<p class="mkt-note">このPCの記録と、ページに出ていた数だけをまとめています。</p>
<div class="mkt-data-card-grid">${inner}</div>
</section>`;
}
