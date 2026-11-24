/**
 * ニコ生以外のマーケHTMLに足す章。見た目のクラスは既存の mkt-* を使う。
 * 数は渡された記録にあるものだけ。換算した円は出さない（台帳の列が「推定」と書く）。
 */

import { escapeHtml } from '../htmlEscape.js';
import { maskLabelForShare } from '../privacyDisplay.js';
import { isMarketingSupportRow } from '../marketingAggregate.js';
import { GIFT_MOMENT_FORBIDDEN_WORDS } from '../giftMomentAnalytics.js';
import { panelExtraChips } from './platformMetrics.js';
import { analyzeSupportArrivals } from './supportArrival.js';
import { followerKpiTexts } from './followerCountSample.js';
import { followerSeriesForPlatform } from './followerSampleStore.js';

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
      if (chip.key === 'estimatedViewerSpend' || chip.key === 'estimatedViewerConsumption') continue;
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

const MOMENT_LIST_CAP = 6;
const RAID_CAP = 3;
const RAID_WINDOW_MS = 15 * 60_000;

/**
 * @param {readonly unknown[]} rows
 * @returns {Array<{ at: number, value: number, estimated: boolean }>}
 */
function momentSamples(rows) {
  /** @type {Array<{ at: number, value: number, estimated: boolean }>} */
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {{ capturedAt?: unknown, officialViewerCount?: unknown, peakConcurrentEstimate?: unknown }} */ (row);
    const at = Number(rec.capturedAt);
    if (!(at > 0)) continue;
    const official = Number(rec.officialViewerCount);
    const estimated = Number(rec.peakConcurrentEstimate);
    if (Number.isFinite(official) && official >= 0) out.push({ at, value: official, estimated: false });
    else if (Number.isFinite(estimated) && estimated >= 0) out.push({ at, value: estimated, estimated: true });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * @param {Array<{ at: number, value: number, estimated: boolean }>} samples
 * @param {number} at
 * @param {boolean} before
 */
function sampleNear(samples, at, before) {
  let found = null;
  for (const s of samples) {
    if (before) {
      if (s.at > at) break;
      if (at - s.at <= RAID_WINDOW_MS) found = s;
    } else if (s.at >= at && s.at - at <= RAID_WINDOW_MS) {
      return s;
    }
  }
  return found;
}

/**
 * 記録の時刻から、そのサービスの山を1回の走査で出す。無い列は作らない。
 * @param {Array<Record<string, unknown>>} comments
 * @param {{ moments?: {
 *   title: string,
 *   besideSpeech?: boolean,
 *   speech?: boolean,
 *   pageCountAside?: boolean,
 *   raidKind?: string,
 *   tracks: readonly { kinds: readonly string[], mode: 'amount' | 'times' | 'text', label: string, currency?: string }[]
 * } | null } | null} view
 * @param {readonly unknown[]} sessionRows
 * @param {number} pageCount
 */
export function sectionStreamerMomentsHtml(comments, view, sessionRows, pageCount) {
  const plan = view && view.moments;
  if (!plan) return '';
  const rows = Array.isArray(comments) ? comments : [];
  /** @type {Map<number, number>} */
  const speech = new Map();
  /** @type {Array<{ at: number, viewers: number }>} */
  const raids = [];
  const tracks = plan.tracks.map(() => ({
    /** @type {Map<string, Map<number, { sum: number, n: number }>>} */
    byCur: new Map(),
    /** @type {Array<{ at: number, tag: string }>} */
    times: [],
    /** @type {Array<{ at: number, text: string }>} */
    texts: [],
  }));
  for (const c of rows) {
    if (!c) continue;
    const at = Number(c.capturedAt) || 0;
    if (!(at > 0)) continue;
    const minute = Math.floor(at / 60_000) * 60_000;
    const support = isMarketingSupportRow(c);
    if ((plan.speech || plan.besideSpeech) && !support) {
      speech.set(minute, (speech.get(minute) || 0) + 1);
    }
    if (!support) continue;
    const kind = String(c.ytKind || '');
    if (plan.raidKind && kind === plan.raidKind && raids.length < RAID_CAP) {
      const viewers = Math.floor(Number(c.ytAmount) || 0);
      raids.push({ at, viewers: viewers > 0 ? viewers : 0 });
    }
    for (let i = 0; i < plan.tracks.length; i += 1) {
      const spec = plan.tracks[i];
      if (!spec.kinds.includes(kind)) continue;
      const cur = spec.currency || String(c.ytCurrency || '').trim().toUpperCase();
      if (spec.currency && cur !== spec.currency) continue;
      const slot = tracks[i];
      if (spec.mode === 'amount') {
        let bucket = slot.byCur.get(cur);
        if (!bucket) {
          bucket = new Map();
          slot.byCur.set(cur, bucket);
        }
        const prev = bucket.get(minute) || { sum: 0, n: 0 };
        const amt = Number(c.ytAmount);
        if (Number.isFinite(amt) && amt > 0) prev.sum += amt;
        prev.n += 1;
        bucket.set(minute, prev);
      } else if (spec.mode === 'times' && slot.times.length < MOMENT_LIST_CAP) {
        let tag = spec.label;
        if (c.subEvent === 'sub') tag = '新しいサブスク';
        else if (c.subEvent === 'resub') tag = '継続のサブスク';
        slot.times.push({ at, tag });
      } else if (spec.mode === 'text' && slot.texts.length < 4) {
        const text = String(c.text || '').trim().slice(0, 40);
        if (text) slot.texts.push({ at, text });
      }
    }
  }
  /** @type {string[]} */
  const lines = [];
  if (plan.speech) {
    let bestMin = 0;
    let bestN = 0;
    for (const [minute, n] of speech) {
      if (n > bestN) {
        bestN = n;
        bestMin = minute;
      }
    }
    if (bestN > 0) lines.push(`${clock(bestMin)} にコメント ${bestN}件（この分の記録）`);
    if (plan.pageCountAside && pageCount > 0) {
      lines.push(`ページの視聴数は ${pageCount.toLocaleString('ja-JP')}（この配信で見えていた数）。配信中の増え方は記録に無いので、コメントの波とは別の数です。`);
    }
  }
  for (let i = 0; i < plan.tracks.length; i += 1) {
    const spec = plan.tracks[i];
    const slot = tracks[i];
    if (spec.mode === 'amount') {
      for (const [cur, bucket] of slot.byCur) {
        let bestMin = 0;
        let bestSum = 0;
        let bestN = 0;
        for (const [minute, cell] of bucket) {
          const score = cell.sum > 0 ? cell.sum : cell.n;
          const best = bestSum > 0 ? bestSum : bestN;
          if (score > best) {
            bestMin = minute;
            bestSum = cell.sum;
            bestN = cell.n;
          }
        }
        if (!(bestSum > 0) && !(bestN > 0)) continue;
        const unit = spec.currency || !cur ? spec.label : `${spec.label} ${cur}`;
        const body = bestSum > 0
          ? `${clock(bestMin)} に ${unit} ${bestSum}（この分の記録）`
          : `${clock(bestMin)} に ${unit} ${bestN}件（金額は記録にありません）`;
        const near = plan.besideSpeech ? speech.get(bestMin) || 0 : 0;
        const aside = near > 0 ? ` 推定（同じ分のコメント ${near}件・原因とは限らない）` : '';
        lines.push(body + aside);
      }
    }
    for (const ev of slot.times) lines.push(`${clock(ev.at)} ${ev.tag}（記録）`);
    for (const ev of slot.texts) lines.push(`${clock(ev.at)} ${ev.text}`);
  }
  if (raids.length) {
    const samples = momentSamples(sessionRows);
    for (const raid of raids) {
      const who = raid.viewers > 0 ? ` ${raid.viewers}人` : '';
      const before = sampleNear(samples, raid.at, true);
      const after = sampleNear(samples, raid.at, false);
      /** @param {{ estimated: boolean, value: number } | null} s */
      const side = (s) => (s ? `${s.estimated ? '推定の視聴者数' : '視聴者数'} ${s.value}人` : '');
      const around = [before ? `直前の${side(before)}` : '', after && after !== before ? `その後の${side(after)}` : '']
        .filter(Boolean)
        .join('、');
      const guess = around
        ? `。${around}。推定（同じ時間の視聴者数。レイドで来た人の残りは記録にありません）`
        : '。その前後の視聴者数はこの記録にありません';
      lines.push(`${clock(raid.at)} レイド${who}（記録）${guess}`);
    }
  }
  if (!lines.length) return '';
  const items = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `<section class="mkt-section" id="mkt-streamer-moments">
<h2>${escapeHtml(plan.title)}</h2>
<p class="mkt-note">このPCの記録にある時刻だけです。</p>
<ul class="mkt-mini-stats">${items}</ul>
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

/**
 * @param {number} ms
 */
function offsetLabel(ms) {
  if (!(ms >= 0)) return '';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * @param {{ platformId?: string, comments?: unknown[], giftEvents?: unknown[] | null }} input
 */
function followerWindowTimes(input) {
  /** @type {number[]} */
  const supportAts = [];
  /** @type {number[]} */
  const commentAts = [];
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  for (const c of comments) {
    const row = /** @type {{ capturedAt?: unknown, text?: unknown, isSystem?: unknown, commentType?: unknown }} */ (c);
    const at = Number(row?.capturedAt);
    if (!(at > 0)) continue;
    if (isMarketingSupportRow(c)) supportAts.push(at);
    else if (String(row.text || '').trim() && row.isSystem !== true && row.commentType !== 'followNotice') commentAts.push(at);
  }
  if ((input?.platformId || 'niconico') === 'niconico') {
    const gifts = Array.isArray(input?.giftEvents) ? input.giftEvents : [];
    for (const g of gifts) {
      const at = Number(/** @type {{ capturedAt?: unknown }} */ (g)?.capturedAt);
      if (at > 0) supportAts.push(at);
    }
  }
  return { supportAts, commentAts };
}

/**
 * @param {NonNullable<ReturnType<typeof followerSeriesForPlatform>>} series
 */
function followerBlockHtml(series) {
  const texts = followerKpiTexts(series);
  if (series.rounded) {
    const head = `${series.noun} ${texts.countText}。増えた人数は出していません。`;
    for (const word of GIFT_MOMENT_FORBIDDEN_WORDS) {
      if (head.includes(word)) return '';
    }
    return `<p class="mkt-arrival-summary">${escapeHtml(head)}</p>`;
  }
  const head = `${series.noun} ${texts.countText}（${texts.gainedText}）`;
  const wins = (series.windows || []).map((w) => {
    const a = clock(w.t0) || '—';
    const b = clock(w.t1) || '—';
    return `${a}〜${b} ＋${w.delta.toLocaleString('ja-JP')}人（そのあいだの応援 ${w.supportCount.toLocaleString('ja-JP')}件・コメント ${w.commentCount.toLocaleString('ja-JP')}件）`;
  });
  const body = wins.length ? `増えた時間: ${wins.join('、')}` : 'この記録では、増えた時間はありません。';
  const text = `${head}\n${body}`;
  for (const word of GIFT_MOMENT_FORBIDDEN_WORDS) {
    if (text.includes(word)) return '';
  }
  return `<p class="mkt-arrival-summary">${escapeHtml(head)}</p><p class="mkt-arrival-summary">${escapeHtml(body)}</p>`;
}

/**
 * 応援が届いた瞬間。応援も人数の標本も無ければ空（章を出さない）。
 * @param {{ platformId: string, comments?: unknown[], giftEvents?: unknown[] | null, startedAtMs?: number, maskShare?: boolean, cap?: number, followerSamples?: unknown[] }} input
 */
export function sectionSupportArrivalHtml(input) {
  const platformId = input?.platformId || 'niconico';
  const analysis = analyzeSupportArrivals({
    platformId,
    comments: input?.comments,
    giftEvents: input?.giftEvents || [],
    startedAtMs: input?.startedAtMs,
    cap: input?.cap,
  });
  const times = followerWindowTimes(input);
  const series = followerSeriesForPlatform(platformId, input?.followerSamples, {
    supportAts: times.supportAts,
    commentAts: times.commentAts,
  });
  const followHtml = series ? followerBlockHtml(series) : '';
  // 応援が無く、人数の標本（正確な2件、または概数の説明）も無ければ章を出さない。
  if (!analysis && !followHtml) return '';
  const mask = input?.maskShare === true;
  const whoOf = (/** @type {string} */ name) => escapeHtml(mask ? maskLabelForShare(name) : name);
  const renderRow = (/** @type {NonNullable<typeof analysis>['rows'][number]} */ row) => {
    const when = clock(row.at);
    const offset = row.offsetMs == null ? '' : `（開始から ${offsetLabel(row.offsetMs)}）`;
    const kind = row.itemName ? `${row.kindLabel}（${row.itemName}）` : row.kindLabel;
    const meta = [when ? `${when}${offset}` : offset, kind, row.amountText].filter(Boolean);
    let trigger = row.beforeRecording
      ? '記録開始前のためコメントなし'
      : `推定: 直前60秒のコメント ${row.commentCount.toLocaleString('ja-JP')}件`;
    if (!row.beforeRecording && !mask && row.excerpts.length) {
      trigger += row.excerpts.map((t) => `「${t}」`).join('');
    }
    if (!row.beforeRecording && row.contextCount > 0) {
      trigger += `。同じ1分の通知 ${row.contextCount.toLocaleString('ja-JP')}件`;
      if (!mask && row.contexts.length) trigger += `（${row.contexts.join('、')}）`;
    }
    if (!row.beforeRecording && mask && (row.excerpts.length || row.contexts.length)) trigger += '。共有用に本文は出していません';
    return `<li class="mkt-arrival-row"><p class="mkt-arrival-row__meta">${meta.map((part) => escapeHtml(part)).join('<span class="mkt-arrival-row__dot"> · </span>')} · ${whoOf(row.who)}</p><p class="mkt-arrival-row__trigger">${escapeHtml(trigger)}</p></li>`;
  };
  const ranked = (analysis ? analysis.rows : []).map((row, i) => ({ row, i }));
  ranked.sort((a, b) => (b.row.amountValue || 0) - (a.row.amountValue || 0) || b.row.at - a.row.at || a.i - b.i);
  const notableIx = new Set(ranked.slice(0, 10).map((x) => x.i));
  /** @type {NonNullable<typeof analysis>['rows']} */
  const headRows = [];
  /** @type {NonNullable<typeof analysis>['rows']} */
  const restRows = [];
  (analysis ? analysis.rows : []).forEach((row, i) => (notableIx.has(i) ? headRows : restRows).push(row));
  headRows.sort((a, b) => b.at - a.at);
  restRows.sort((a, b) => b.at - a.at);
  const counts = analysis
    ? analysis.counts.map((c) => `${escapeHtml(c.label)} ${c.count.toLocaleString('ja-JP')}件`).join('、')
    : '';
  const windows = analysis
    ? analysis.windows.map((w) => `${escapeHtml(clock(w.startAt) || '—')} からの5分に ${w.count.toLocaleString('ja-JP')}件`).join('、')
    : '';
  const headHtml = headRows.map(renderRow).join('');
  const restHtml = restRows.map(renderRow).join('');
  const folded = restHtml && analysis
    ? `<details class="mkt-arrival-more"><summary>すべて見る（${analysis.total.toLocaleString('ja-JP')}件）</summary><ol class="mkt-arrival-list">${restHtml}</ol></details>`
    : '';
  const more = analysis && analysis.total > analysis.rows.length
    ? `<p class="mkt-note">表示は ${analysis.rows.length.toLocaleString('ja-JP')} 件まで（記録 ${analysis.total.toLocaleString('ja-JP')} 件）。新しい方から出しています。</p>`
    : '';
  const moreCss = folded
    ? '\n.mkt-arrival-more{margin:.7rem 0 0}.mkt-arrival-more > summary{cursor:pointer;color:#e2e8f0;font-size:.9rem}.mkt-arrival-more > summary:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}'
    : '';
  const note = '推定（同じ時間に起きたこと・原因とは限らない）。';
  for (const word of GIFT_MOMENT_FORBIDDEN_WORDS) {
    if (note.includes(word)) return '';
  }
  return `<section class="mkt-section" id="mkt-support-arrival">
<style>
.mkt-arrival-summary{margin:.2rem 0 .7rem;color:#e2e8f0;font-size:.92rem;line-height:1.5}
.mkt-arrival-list{list-style:none;margin:.4rem 0 0;padding:0;display:flex;flex-direction:column;gap:.55rem}
.mkt-arrival-row{background:#0f172a;border:1px solid #334155;border-radius:.7rem;padding:.65rem .8rem}
.mkt-arrival-row__meta{margin:0;color:#e2e8f0;font-size:.9rem;line-height:1.45}
.mkt-arrival-row__dot{color:#94a3b8}
.mkt-arrival-row__trigger{margin:.25rem 0 0;color:#fde68a;font-size:.82rem;line-height:1.45}${moreCss}
</style>
<h2>応援が届いた瞬間</h2>
${counts ? `<p class="mkt-arrival-summary">${counts}</p>\n` : ''}${followHtml ? `${followHtml}\n` : ''}${analysis ? `<p class="mkt-note">5分で多かった時間: ${windows}</p>
<ol class="mkt-arrival-list">${headHtml}</ol>
${folded ? `${folded}\n` : ''}${more}
<p class="mkt-note">${escapeHtml(note)}</p>` : ''}
</section>`;
}
