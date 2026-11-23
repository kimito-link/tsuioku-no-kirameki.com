/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ニコ生以外のサービスの「イベントの今の順位」カードと参加者一覧の HTML・前回との変化
 * 【この箱に入らないもの】fetch / timer / DOM 操作(extension-youtube/src/ytEventStanding.js)・読み取り(eventStandingParsers.js)
 *
 * 読む順(ニコ生のイベント💎ボード eventLiveBoardHtml.js と同じ): 先頭に「イベント◯pt・◯位・上まであと◯pt」、
 *   その下に参加者全員(開いたときだけ)、各行に前回取得からの変化。
 * 数の出どころを必ず書く: 公式(サービスの値そのまま)/ 公式の数字から計算(2つの公式の pt の差)/ 推定(このモジュールでは使わない)。
 * 公式が隠している pt(SHOWROOM の is_point_visible_period=false の一覧)は出さない。最終取得の時刻(JST)を必ず出す。
 * ★見た目はニコ生のイベント💎ボード(eventLiveBoardHtml.js・v0.1.2171)と同じ nl-evb__* の形をそのまま使う:
 *   見出しの小さなロゴ(cardHeadHtml)・大きな順位・2行目(ほかの部門など)・ゆっくりのひとこと(buildEventGuideLineHtml)・最終取得。
 *   CSS も yt-sidepanel.html の .nl-evb__* を使い、ここで足すのは変化の印など少しだけ(EVENT_STANDING_CSS)。
 *   ニコ生は 💎、ほかのサービスは pt なので、数字の組み立てだけはここで持つ。
 */
import { escapeHtml } from '../htmlEscape.js';
import { cardHeadHtml, buildEventGuideLineHtml } from '../eventLiveBoardHtml.js';
import { formatJstHm } from '../eventLiveBoardModel.js';

export { formatJstHm };

/** @typedef {import('./eventStandingParsers.js').Standing} Standing */
/** @typedef {import('./eventStandingParsers.js').StandingRow} StandingRow */

const fmt = (/** @type {number} */ n) => Math.trunc(n).toLocaleString('en-US');

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

/** 2行目などに出す短い範囲名 @param {Standing} s */
function scopeShort(s) {
  if (s.scope === 'block') return s.group ? `ブロック「${s.group}」` : 'ブロック';
  if (s.scope === 'group') return s.group ? `部門「${s.group}」` : '部門';
  return 'イベント全体';
}

/** 「次の◯位まで あと◯pt」/「1つ上(◯位)との差 ◯pt」(未エスケープの文。数字は fmt 済み) @param {Standing} s */
function nextText(s) {
  if (s.rank === 1) return 'いま1位';
  if (s.toNext == null || s.nextRank == null) return '';
  const calc = s.toNextSource === 'derived' ? '（公式の数字から計算）' : '';
  return s.toNextKind === 'pass' ? `次の${s.nextRank}位まで あと ${fmt(s.toNext)}pt${calc}` : `1つ上の${s.nextRank}位との差 ${fmt(s.toNext)}pt${calc}`;
}

/** 大きな数字が何の順位かを、こん太がひとこと @param {Standing} s @param {string} pf */
function guideFor(s, pf) {
  if (s.platform === 'whowatch') return `大きな数字は${scopeShort(s)}の順位だよ。「あと◯pt」もふわっち公式の数字だよ。`;
  if (s.platform === 'showroom') {
    return s.scope === 'block'
      ? `大きな数字は${scopeShort(s)}の中の順位で、イベント全体の順位とは違うよ。`
      : '大きな数字はSHOWROOM公式のイベント順位だよ。';
  }
  if (s.platform === 'mixch') return '大きな数字はミクチャ公式のイベント順位。1つ上との差は、公式の一覧のptから計算したよ。';
  return `大きな数字は${pf}公式の順位だよ。`;
}

/**
 * 自分(見ている配信者)の1枚。ニコ生のカードと同じ形(nl-evb__)。
 * ほかの部門(ふわっちの「総合」など)は2行目に小さく(secondary)。
 * @param {Standing} s @param {{ fetchedAt: number, who?: string, secondary?: Standing[] }} meta
 */
export function buildStandingCardHtml(s, meta) {
  if (!s) return '';
  const pf = /** @type {Record<string,string>} */ (PLATFORM_NAME)[s.platform] || '';
  const head = cardHeadHtml(s.eventName || '');
  const who = escapeHtml(String(meta.who || '').trim() || 'この配信者さん');
  const got = meta.fetchedAt ? `最終取得 ${formatJstHm(meta.fetchedAt)}` : '';
  const rt = s.realtimeLabel ? `・${pf}の表示「${s.realtimeLabel}」` : '';
  if (s.rank == null) {
    return `<section class="nl-evb__card" data-evs-platform="${escapeHtml(s.platform)}">${head}<p class="nl-evb__muted">この配信者さんの順位は、まだ${escapeHtml(pf)}の公式に出ていません。${escapeHtml(got)}</p></section>`;
  }
  const pt = s.point != null ? `<p class="nl-evb__score"><span class="nl-evb__tag">イベントpt（公式）</span> <strong>${fmt(s.point)}pt</strong></p>` : '';
  let next = '';
  if (s.rank === 1) next = `<p class="nl-evb__next">🎉 いま<strong>1位</strong>です</p>`;
  else if (s.toNext != null && s.nextRank != null) {
    const calc = s.toNextSource === 'derived' ? '<span class="nl-evb__tag nl-evs__tag--calc">公式の数字から計算</span> ' : '';
    next =
      s.toNextKind === 'pass'
        ? `<p class="nl-evb__next">${calc}次の<strong>${s.nextRank}位</strong>まで あと <strong>${fmt(s.toNext)}pt</strong></p>`
        : `<p class="nl-evb__next">${calc}1つ上の<strong>${s.nextRank}位</strong>との差 <strong>${fmt(s.toNext)}pt</strong></p>`;
  }
  const second = (meta.secondary || [])
    .filter((x) => x && x.rank != null)
    .map((x) => {
      const nt = nextText(x);
      return (
        `<p class="nl-evb__annual"><span class="nl-evb__tag">${escapeHtml(scopeShort(x))}</span> <strong>${x.rank}位</strong>` +
        (x.point != null ? `・<span class="nl-evb__nowrap">${fmt(x.point)}pt</span>` : '') +
        (nt ? `・<span class="nl-evb__nowrap">${escapeHtml(nt)}</span>` : '') +
        `</p>`
      );
    })
    .join('');
  return (
    `<section class="nl-evb__card nl-evb__card--self" data-evs-platform="${escapeHtml(s.platform)}" data-evb-big="event">` +
    head +
    `<div class="nl-evb__main">` +
    `<div class="nl-evb__rank"><span class="nl-evb__tag nl-evb__tag--official">公式</span><span class="nl-evb__rank-num">${s.rank}</span><span class="nl-evb__rank-suf">位</span></div>` +
    `<div class="nl-evb__body"><p class="nl-evb__who">${who}さん</p>${pt}${next}</div></div>` +
    second +
    buildEventGuideLineHtml('konta', guideFor(s, pf)) +
    `<p class="nl-evb__foot">${escapeHtml(`${scopeShort(s)}の順位・${pf}の公式の値・${got}${rt}`)}</p>` +
    `</section>`
  );
}

/**
 * 参加者一覧(開いたときだけ作る)。自分の行は強調、前回取得からの変化を添える。行の形はニコ生と同じ nl-evb__row。
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
      `<li class="nl-evb__row${self ? ' nl-evb__row--self' : ''}"${self ? ' data-evb-self="1"' : ''}>` +
      `<span class="nl-evb__row-rank">${r.rank}</span>` +
      `<span class="nl-evb__row-name">${escapeHtml(r.name || '—')}${self ? '（この配信）' : ''}</span>` +
      `<span class="nl-evb__row-score">${p.pointsVisible && r.point != null ? `${fmt(r.point)}pt` : ''}</span>` +
      (bits.length ? `<span class="nl-evb__row-extra nl-evs__change">${escapeHtml(bits.join('・'))}</span>` : '') +
      `</li>`;
  }
  const head =
    `<p class="nl-evb__muted">${escapeHtml(p.scope)}・公式・最終取得 ${escapeHtml(formatJstHm(p.fetchedAt))}` +
    `${p.prevFetchedAt ? `・変化は前回(${escapeHtml(formatJstHm(p.prevFetchedAt))})から` : ''}` +
    `・${fmt(Math.min(p.rows.length, shown.length))} / ${fmt(p.rows.length)}人を表示` +
    `${p.note ? `・${escapeHtml(p.note)}` : ''}</p>` +
    (p.pointsVisible ? '' : buildEventGuideLineHtml('tanu', 'いまは公式がptを隠している期間だから、一覧にptは出さないね。'));
  return head + `<ol class="nl-evb__list">${html}</ol>` + (p.rows.length > shown.length ? `<button type="button" class="nl-evb__more" data-evs-more="1">もっと見る</button>` : '');
}

/** 順位を出せないサービスの一言(りんく) @param {string} platformId */
export function buildNoEventRankingHtml(platformId) {
  const note = noEventRankingNote(platformId);
  return note ? `<div class="nl-evs__note">${buildEventGuideLineHtml('rink', note)}</div>` : '';
}

/**
 * 見た目は yt-sidepanel.html の .nl-evb__*(ニコ生のボード)をそのまま使う。ここは足りない分だけ。
 * 狭い横の欄では、大きな順位と本文を折り返す。
 */
export const EVENT_STANDING_CSS = `
.nl-evs { margin: 6px 0 8px; grid-column: 1 / -1; flex: 1 1 100%; width: 100%; min-width: 0; box-sizing: border-box; }
.nl-evs[hidden] { display: none !important; }
.nl-evs .nl-evb__main { flex-wrap: wrap; gap: 4px 10px; }
.nl-evs .nl-evb__body { flex: 1 1 150px; }
.nl-evs__tag--calc { background: #dfeeff; color: #0b3d7a; }
.nl-evs__change { color: inherit; }
.nl-evs__note .nl-evb__guide { margin-top: 0; }
`;
