/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ニコ生以外のサービスの「イベントの今の順位」カードと参加者一覧の HTML・前回との変化
 * 【この箱に入らないもの】fetch / timer / DOM 操作(extension-youtube/src/ytEventStanding.js)・読み取り(eventStandingParsers.js)
 *
 * 読む順(ニコ生のイベント💎ボード eventLiveBoardHtml.js と同じ): 先頭に「イベント◯pt・◯位・上まであと◯pt」、
 *   その下に参加者全員(開いたときだけ)、各行に前回取得からの変化。
 * 数の出どころを必ず書く: 公式(サービスの値そのまま)/ 公式の数字から計算(2つの公式の pt の差)/ 推定(このモジュールでは使わない)。
 * 公式が隠している pt(SHOWROOM の is_point_visible_period=false の一覧)は出さない。最終取得の時刻(JST)を必ず出す。
 * ★ニコ生版のボードと見た目をそろえるため、クラス名は nl-evs__*(ニコ生版 nl-evb__* と同じ並び)。1つにまとめるのは両方が入ってから。
 */
import { escapeHtml } from '../htmlEscape.js';

/** @typedef {import('./eventStandingParsers.js').Standing} Standing */
/** @typedef {import('./eventStandingParsers.js').StandingRow} StandingRow */

const fmt = (/** @type {number} */ n) => Math.trunc(n).toLocaleString('en-US');

/** ms → JST「HH:MM」 @param {number} ms */
export function formatJstHm(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** 数の出どころの札 */
export const SOURCE_LABEL = Object.freeze({ official: '公式', derived: '公式の数字から計算', estimated: '推定' });

/**
 * 前回取得した一覧との違い(順位の上下・pt の増え)。前回に居なかった人は new。
 * @param {StandingRow[]|null|undefined} prev @param {StandingRow[]} rows
 * @returns {Record<string, { rankDelta: number, pointDelta: number|null, isNew: boolean }>}
 */
export function diffStandingRows(prev, rows) {
  /** @type {Record<string, { rankDelta: number, pointDelta: number|null, isNew: boolean }>} */
  const out = {};
  if (!Array.isArray(prev) || !prev.length) return out;
  const before = new Map(prev.map((r) => [r.id, r]));
  for (const r of rows) {
    const b = before.get(r.id);
    if (!b) {
      out[r.id] = { rankDelta: 0, pointDelta: null, isNew: true };
      continue;
    }
    const rankDelta = b.rank - r.rank; // 正 = 上がった
    const pointDelta = r.point != null && b.point != null ? r.point - b.point : null;
    if (rankDelta !== 0 || (pointDelta != null && pointDelta !== 0)) out[r.id] = { rankDelta, pointDelta, isNew: false };
  }
  return out;
}

/** 2つのカード(自分の順位)が同じ中身か(描き直しを省く) @param {any} a @param {any} b */
export function sameJson(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * イベントの順位を持たないサービスの一言(作らない数は出さない)。
 * @param {string} platformId
 */
export function noEventRankingNote(platformId) {
  switch (platformId) {
    case 'twitch':
      return 'Twitch には公式のイベント順位がありません。いちばん近い公式の数字は、上の Bits ランキングとハイプトレインです。';
    case 'kick':
      return 'Kick には公式のイベント順位がありません。いちばん近い公式の数字は、上の Kicks・ギフトサブのランキングです。';
    case 'youtube':
      return 'YouTube には公式のイベント順位がありません。いちばん近い公式の数字は、上のトップファン(スーパーチャット)です。';
    case 'abema':
      return 'ABEMA には公式のイベント順位がありません。';
    case 'tiktok':
      return 'TikTok LIVE のイベント順位はアプリの中だけで公開されていて、この拡張ではまだ読めていません。';
    case 'twitcasting':
      return 'ツイキャスのイベント(キャンペーン)の順位は、開催中のキャンペーンページにだけ出ます。いまは読んでいません。';
    default:
      return '';
  }
}

const PLATFORM_NAME = Object.freeze({ whowatch: 'ふわっち', showroom: 'SHOWROOM', mixch: 'ミクチャ' });

/** @param {Standing} s */
function scopeText(s) {
  if (s.scope === 'block') return `ブロックの中の順位${s.group ? `(${s.group})` : ''}`;
  if (s.scope === 'group') return s.group ? `部門「${s.group}」の順位` : '部門の中の順位';
  return 'イベント全体の順位';
}

/** @param {'official'|'derived'|'estimated'|''} src */
function tag(src) {
  if (!src) return '';
  const cls = src === 'official' ? '' : src === 'derived' ? ' nl-evs__tag--calc' : ' nl-evs__tag--est';
  return `<span class="nl-evs__tag${cls}">${escapeHtml(SOURCE_LABEL[src])}</span>`;
}

/**
 * 自分(見ている配信者)の1枚。
 * @param {Standing} s @param {{ fetchedAt: number, who?: string }} meta
 */
export function buildStandingCardHtml(s, meta) {
  if (!s) return '';
  const pf = /** @type {Record<string,string>} */ (PLATFORM_NAME)[s.platform] || '';
  const title = s.eventName ? `<p class="nl-evs__title">🏆 ${escapeHtml(s.eventName)}</p>` : '';
  const who = escapeHtml(String(meta.who || '').trim() || 'この配信者さん');
  const got = meta.fetchedAt ? `最終取得 ${formatJstHm(meta.fetchedAt)}` : '';
  const rt = s.realtimeLabel ? `・${pf}の表示「${escapeHtml(s.realtimeLabel)}」` : '';
  const src = `${pf}の公式の値`;
  if (s.rank == null) {
    return `<section class="nl-evs__card">${title}<p class="nl-evs__muted">この配信者さんの順位は、まだ${escapeHtml(pf)}の公式に出ていません。${escapeHtml(got)}</p></section>`;
  }
  const pt = s.point != null ? `<p class="nl-evs__score">${tag('official')} イベント <strong>${fmt(s.point)}pt</strong></p>` : '';
  let next = '';
  if (s.rank === 1) next = `<p class="nl-evs__next">🎉 いま<strong>1位</strong>です</p>`;
  else if (s.toNext != null && s.nextRank != null) {
    next =
      s.toNextKind === 'pass'
        ? `<p class="nl-evs__next">${tag(s.toNextSource)} 次の<strong>${s.nextRank}位</strong>まで あと <strong>${fmt(s.toNext)}pt</strong></p>`
        : `<p class="nl-evs__next">${tag(s.toNextSource)} 1つ上(<strong>${s.nextRank}位</strong>)との差 <strong>${fmt(s.toNext)}pt</strong></p>`;
  }
  return (
    `<section class="nl-evs__card nl-evs__card--self">` +
    title +
    `<div class="nl-evs__main">` +
    `<div class="nl-evs__rank"><span class="nl-evs__rank-num">${s.rank}</span><span class="nl-evs__rank-suf">位</span></div>` +
    `<div class="nl-evs__body"><p class="nl-evs__who">${who}さん</p>${pt}${next}</div></div>` +
    `<p class="nl-evs__foot">${escapeHtml(scopeText(s))}・${escapeHtml(src)}・${escapeHtml(got)}${rt}</p>` +
    `</section>`
  );
}

/**
 * 参加者一覧(開いたときだけ作る)。自分の行は強調、前回取得からの変化を添える。
 * @param {{ rows: StandingRow[], selfId: string, changes: ReturnType<typeof diffStandingRows>, pointsVisible: boolean,
 *   fetchedAt: number, prevFetchedAt: number, scope: string, note?: string, limit: number }} p
 */
export function buildStandingListHtml(p) {
  const shown = p.rows.slice(0, Math.max(1, p.limit));
  const selfRow = p.rows.find((r) => r.id === p.selfId);
  if (selfRow && !shown.includes(selfRow)) shown.push(selfRow);
  let html = '';
  for (const r of shown) {
    const c = p.changes[r.id];
    const bits = [];
    if (c?.isNew) bits.push('前回は圏外');
    else if (c) {
      if (c.rankDelta > 0) bits.push(`↑${c.rankDelta}`);
      if (c.rankDelta < 0) bits.push(`↓${-c.rankDelta}`);
      if (p.pointsVisible && c.pointDelta != null && c.pointDelta > 0) bits.push(`+${fmt(c.pointDelta)}pt`);
    }
    const self = r.id === p.selfId;
    html +=
      `<li class="nl-evs__row${self ? ' nl-evs__row--self' : ''}">` +
      `<span class="nl-evs__row-rank">${r.rank}</span>` +
      `<span class="nl-evs__row-name">${escapeHtml(r.name || '—')}${self ? '(この配信)' : ''}</span>` +
      `<span class="nl-evs__row-score">${p.pointsVisible && r.point != null ? `${fmt(r.point)}pt` : ''}</span>` +
      (bits.length ? `<span class="nl-evs__row-extra">${escapeHtml(bits.join('・'))}</span>` : '') +
      `</li>`;
  }
  const head =
    `<p class="nl-evs__muted">${escapeHtml(p.scope)}・${tag('official')}最終取得 ${escapeHtml(formatJstHm(p.fetchedAt))}` +
    `${p.prevFetchedAt ? `・変化は前回(${escapeHtml(formatJstHm(p.prevFetchedAt))})から` : ''}` +
    `・${fmt(Math.min(p.rows.length, shown.length))} / ${fmt(p.rows.length)}人を表示` +
    `${p.pointsVisible ? '' : '・pt は公式が隠している期間なので出しません'}` +
    `${p.note ? `・${escapeHtml(p.note)}` : ''}</p>`;
  return head + `<ol class="nl-evs__list">${html}</ol>` + (p.rows.length > shown.length ? `<button type="button" class="nl-evs__more" data-evs-more="1">もっと見る</button>` : '');
}

/** 見た目(ニコ生版 nl-evb__ と同じ形)。拡張の画面の <style> に1回だけ入れる。 */
export const EVENT_STANDING_CSS = `
.nl-evs { margin: 6px 0 8px; display: flex; flex-direction: column; gap: 6px; }
.nl-evs[hidden] { display: none !important; }
.nl-evs__card { padding: 8px 10px; border-radius: 10px; border: 1px solid color-mix(in srgb, #056dff 35%, transparent); background: color-mix(in srgb, #056dff 8%, transparent); }
.nl-evs__card--self { background: linear-gradient(135deg, color-mix(in srgb, #056dff 18%, transparent), transparent); }
.nl-evs__title { margin: 0 0 4px; font-size: 11px; font-weight: 700; opacity: 0.9; overflow-wrap: anywhere; }
.nl-evs__main { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.nl-evs__rank { flex: none; min-width: 56px; text-align: center; font-weight: 800; line-height: 1; }
.nl-evs__rank-num { font-size: 30px; }
.nl-evs__rank-suf { font-size: 13px; margin-inline-start: 2px; }
.nl-evs__body { min-width: 0; flex: 1 1 150px; }
.nl-evs__body p, .nl-evs__card > p, .nl-evs__note { margin: 0; line-height: 1.45; }
.nl-evs__who { font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
.nl-evs__score, .nl-evs__next { font-size: 12px; }
.nl-evs__score strong, .nl-evs__next strong { font-size: 15px; }
.nl-evs__muted, .nl-evs__foot, .nl-evs__note { font-size: 10.5px; opacity: 0.8; }
.nl-evs__foot { margin-top: 4px !important; }
.nl-evs__tag { display: inline-block; padding: 0 5px; border-radius: 6px; font-size: 10px; font-weight: 700; background: color-mix(in srgb, currentColor 12%, transparent); vertical-align: 1px; margin-inline-end: 3px; }
.nl-evs__tag--calc { background: #dfeeff; color: #0b3d7a; }
.nl-evs__tag--est { background: #ffe6a3; color: #6b4800; }
.nl-evs__full > summary { cursor: pointer; font-size: 11.5px; font-weight: 700; }
.nl-evs__list { list-style: none; margin: 4px 0 0; padding: 0; }
.nl-evs__row { display: grid; grid-template-columns: 34px 1fr auto; gap: 2px 6px; padding: 3px 4px; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); font-size: 11.5px; }
.nl-evs__row--self { background: color-mix(in srgb, #ffcf5e 35%, transparent); font-weight: 700; border-radius: 6px; }
.nl-evs__row-rank { text-align: end; opacity: 0.8; }
.nl-evs__row-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nl-evs__row-score { text-align: end; font-variant-numeric: tabular-nums; }
.nl-evs__row-extra { grid-column: 2 / 4; font-size: 10.5px; opacity: 0.85; }
.nl-evs__more { margin-top: 6px; font: inherit; font-size: 11px; padding: 3px 8px; border-radius: 8px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; }
`;
