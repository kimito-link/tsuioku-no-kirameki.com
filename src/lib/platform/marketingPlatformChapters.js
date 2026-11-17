/**
 * ニコ生以外のマーケHTMLに足す章。見た目のクラスは既存の mkt-* を使う。
 * 数は渡された記録にあるものだけ。換算した円は出さない（台帳の列が「推定」と書く）。
 */

import { escapeHtml } from '../htmlEscape.js';
import { isMarketingSupportRow } from '../marketingAggregate.js';
import { GIFT_MOMENT_FORBIDDEN_WORDS } from '../giftMomentAnalytics.js';

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

/**
 * @param {Array<Record<string, unknown>>} comments
 * @param {{ id: string, pageCountLabel: string, showMember: boolean, hideGift: boolean, pointEstimate: boolean }} view
 * @param {number} pageCount
 */
export function sectionPlatformDedicatedHtml(comments, view, pageCount) {
  if (!view) return '';
  const rows = Array.isArray(comments) ? comments : [];
  /** @type {Map<string, number>} */
  const byCur = new Map();
  let raids = 0;
  let raidViewers = 0;
  let hosts = 0;
  let hostViewers = 0;
  let subs = 0;
  let resubs = 0;
  let giftSubs = 0;
  let memberBadges = 0;
  /** @type {number[]} */
  const months = [];
  for (const c of rows) {
    if (!isMarketingSupportRow(c)) {
      if (view.showMember && Array.isArray(c?.badges) && c.badges.includes('member')) memberBadges += 1;
      continue;
    }
    const kind = String(c.ytKind || '');
    const cur = String(c.ytCurrency || '').trim().toUpperCase();
    const amt = Number(c.ytAmount);
    if (cur && Number.isFinite(amt) && amt > 0) byCur.set(cur, (byCur.get(cur) || 0) + amt);
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
    }
    if (kind === 'membership_gift') giftSubs += 1;
    if (view.showMember && Array.isArray(c.badges) && c.badges.includes('member')) memberBadges += 1;
  }
  /** @type {Array<[string, string]>} */
  const cards = [];
  if (view.pageCountLabel && pageCount > 0) cards.push([view.pageCountLabel, `${pageCount.toLocaleString('ja-JP')}`]);
  for (const [cur, sum] of byCur) {
    cards.push([`${cur} の合計（記録）`, String(sum)]);
  }
  if (subs > 0) cards.push(['新しいサブスク', `${subs}件`]);
  if (resubs > 0) cards.push(['継続のサブスク', `${resubs}件`]);
  if (giftSubs > 0) cards.push(['ギフトサブ', `${giftSubs}件`]);
  if (months.length) cards.push(['サブスク月数（記録にあるもの）', months.join('、')]);
  if (raids > 0) cards.push(['レイド', raidViewers > 0 ? `${raids}回 / ${raidViewers}人` : `${raids}回`]);
  if (hosts > 0) cards.push(['ホスト', hostViewers > 0 ? `${hosts}回 / ${hostViewers}人` : `${hosts}回`]);
  if (view.showMember && memberBadges > 0) cards.push(['メンバーの印', `${memberBadges}件`]);
  if (!cards.length) return '';
  const estimate = view.pointEstimate
    ? '<p class="mkt-note">通貨ごとの合計は、チャットに書いてあった金額です。円への換算はしていません。円換算の列がある表は推定です。</p>'
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
${estimate}
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
