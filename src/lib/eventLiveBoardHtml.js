/**
 * イベント💎ボードの HTML（純関数・2026-11-21 Phase 2）。モデルは eventLiveBoardModel.js。
 *
 * 読む順（全画面共通の読む流れ）: いちばん知りたい「いまの順位・pt・次まであと何pt」を先頭に大きく。
 * 推定値は必ず「推定」と根拠を添え、公式の値とは分けて書く。最終取得時刻を必ず出す。
 * 外部の文字列はすべて escapeHtml を通す。
 */
import { escapeHtml } from './htmlEscape.js';
import { formatJstHm, formatJstMdHm } from './eventLiveBoardModel.js';

const fmt = (/** @type {number} */ n) => Math.trunc(n).toLocaleString('en-US');

/**
 * 自分（見ている配信者）のカード。
 * @param {ReturnType<typeof import('./eventLiveBoardModel.js').buildEventLiveBoardModel>} m
 * @param {{ broadcasterName?: string, showListButton?: boolean }} [opts]
 */
export function buildEventSelfCardHtml(m, opts = {}) {
  if (!m) return '';
  const s = m.self;
  const title = m.title ? `<p class="nl-evb__title">🏆 ${escapeHtml(m.title)}</p>` : '';
  const got = m.gotAt ? `最終取得 ${formatJstHm(m.gotAt)}` : '';
  if (!s) {
    return (
      `<section class="nl-evb__card" data-event-key="${escapeHtml(m.key)}">${title}` +
      `<p class="nl-evb__muted">この配信者さんの順位はまだ公式に出ていません。${escapeHtml(got)}</p></section>`
    );
  }
  const who = escapeHtml(String(opts.broadcasterName || s.name || '').trim() || 'この配信者さん');
  const next =
    s.nextRank && s.toNext != null
      ? `<p class="nl-evb__next">次の<strong>${s.nextRank}位</strong>まで あと <strong>💎${fmt(s.toNext)}</strong></p>`
      : s.rank === 1
        ? `<p class="nl-evb__next">🎉 いま<strong>1位</strong>です</p>`
        : '';
  let eventLine = '';
  if (s.estimated) {
    const er =
      s.estRank != null
        ? `（推定 ${s.estRank}位${s.estToNext != null ? `・1つ上まで あと💎${fmt(s.estToNext)}` : ''}）`
        : '';
    eventLine =
      `<p class="nl-evb__event"><span class="nl-evb__tag nl-evb__tag--est">推定</span>` +
      `イベントpt <strong>💎${fmt(s.estimated.value)}</strong>${escapeHtml(er)}</p>` +
      `<p class="nl-evb__basis">${escapeHtml(s.estimated.basis)}</p>`;
  }
  let sinceLine = '';
  if (s.since) {
    const label =
      s.since.kind === 'server'
        ? `公式更新（${formatJstMdHm(s.since.sinceAt)}頃）以降`
        : `この画面で初めて取得した ${formatJstHm(s.since.sinceAt)} 以降`;
    sinceLine = `<p class="nl-evb__since">${escapeHtml(label)} <strong>+💎${fmt(s.since.delta)}</strong></p>`;
  }
  let officialLine = '';
  if (s.official) {
    officialLine = `<p class="nl-evb__basis">公式イベントランキング ${s.official.rank}位・💎${fmt(s.official.score)}（${escapeHtml(m.officialNote || '1日1回の更新分')}）</p>`;
  } else if (m.separate && !s.estimated) {
    officialLine = `<p class="nl-evb__basis">イベントptの合計は、公式は1日1回・各組25位までしか出していません。上の「以降 +」はリアルタイムの増加です。</p>`;
  }
  return (
    `<section class="nl-evb__card nl-evb__card--self" data-event-key="${escapeHtml(m.key)}">` +
    title +
    `<div class="nl-evb__main">` +
    `<div class="nl-evb__rank"><span class="nl-evb__rank-num">${s.rank}</span><span class="nl-evb__rank-suf">位</span></div>` +
    `<div class="nl-evb__body">` +
    `<p class="nl-evb__who">${who}さん</p>` +
    `<p class="nl-evb__score"><span class="nl-evb__tag">${escapeHtml(m.scoreLabel)}</span> <strong>💎${fmt(s.score)}</strong></p>` +
    next +
    `</div></div>` +
    eventLine +
    sinceLine +
    officialLine +
    `<p class="nl-evb__foot">${escapeHtml(got)}${m.totalCount ? `・参加 ${fmt(m.totalCount)}人` : ''}</p>` +
    (opts.showListButton
      ? `<button type="button" class="nl-evb__open" data-evb-open="${escapeHtml(m.key)}">この順位表の全員を見る</button>`
      : '') +
    `</section>`
  );
}

/**
 * 全員一覧の行（chunk 分だけ）。自分の行は強調。
 * @param {ReturnType<typeof import('./eventLiveBoardModel.js').buildEventFullListRows>} rows
 * @param {{ separate: boolean }} opts
 */
export function buildEventFullListRowsHtml(rows, opts) {
  let html = '';
  for (const r of rows) {
    const extra = [];
    if (r.estimated != null) extra.push(`<span class="nl-evb__tag nl-evb__tag--est">推定</span>イベント💎${fmt(r.estimated)}`);
    if (r.sinceDelta != null) extra.push(`公式更新以降 +${fmt(r.sinceDelta)}`);
    html +=
      `<li class="nl-evb__row${r.isSelf ? ' nl-evb__row--self' : ''}"${r.isSelf ? ' data-evb-self="1"' : ''}>` +
      `<span class="nl-evb__row-rank">${r.rank}</span>` +
      `<span class="nl-evb__row-name">${escapeHtml(r.name)}${r.isSelf ? '（この配信）' : ''}</span>` +
      `<span class="nl-evb__row-score">💎${fmt(r.score)}</span>` +
      (extra.length ? `<span class="nl-evb__row-extra">${extra.join('・')}</span>` : '') +
      `</li>`;
  }
  void opts;
  return html;
}

/**
 * 全員一覧の見出し（何の数字か・いつ取得したか）。
 * @param {{ scoreLabel: string, gotAt: number, totalCount: number, shown: number, officialNote?: string }} p
 */
export function buildEventFullListHeadHtml(p) {
  return (
    `<p class="nl-evb__muted">💎は${escapeHtml(p.scoreLabel)}。最終取得 ${escapeHtml(formatJstHm(p.gotAt))}・` +
    `${fmt(p.shown)} / ${fmt(p.totalCount)}人を表示` +
    (p.officialNote ? `・「推定」は公式表（${escapeHtml(p.officialNote)}）からの推定で、公式の値ではありません` : '') +
    `</p>`
  );
}
