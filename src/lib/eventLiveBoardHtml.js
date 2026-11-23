/**
 * イベント💎ボードの HTML（純関数・2026-11-21 Phase 2）。モデルは eventLiveBoardModel.js。
 *
 * 読む順（全画面共通の読む流れ）: いちばん知りたい「いまの順位・pt・次まであと何pt」を先頭に大きく。
 * 推定値は必ず「推定」と根拠を添え、公式の値とは分けて書く。最終取得時刻を必ず出す。
 * 外部の文字列はすべて escapeHtml を通す。
 */
import { escapeAttr, escapeHtml } from './htmlEscape.js';
import { formatJstHm, formatJstMdHm } from './eventLiveBoardModel.js';

const fmt = (/** @type {number} */ n) => Math.trunc(n).toLocaleString('en-US');

/**
 * 既存の画像だけを使う（新しい絵は作らない）。ヘッダーのロゴと、プリロード済みの thumb128 のゆっくり。
 * 小さく・lazy・アニメ無し。
 */
export const EVB_BRAND_MARK_SRC = 'images/logo/kimito-maru-black.png';
export const EVB_FACE_SRC = Object.freeze({
  rink: 'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png',
  konta: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png',
  tanu: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png'
});

/** カード見出し（大会名＋小さなブランド）。ほかのサービスのカード（platform/eventStandingView.js）も使う。 */
export function cardHeadHtml(/** @type {string} */ title) {
  return (
    `<div class="nl-evb__head">` +
    (title ? `<p class="nl-evb__title">🏆 ${escapeHtml(title)}</p>` : '<span></span>') +
    `<span class="nl-evb__brand"><img class="nl-evb__brand-mark" src="${escapeAttr(EVB_BRAND_MARK_SRC)}" alt="" width="14" height="14" loading="lazy" decoding="async" />追憶のきらめき</span>` +
    `</div>`
  );
}

/**
 * ゆっくり解説の1行（既存の .nl-story-userlane-guide__line と同じ形：顔24px＋「名前: 本文」）。
 * @param {'rink'|'konta'|'tanu'} who
 * @param {string} text 未エスケープ本文
 */
export function buildEventGuideLineHtml(who, text) {
  const name = who === 'konta' ? 'こん太' : who === 'tanu' ? 'たぬ姉' : 'りんく';
  return (
    `<div class="nl-evb__guide">` +
    `<img class="nl-evb__guide-face" src="${escapeAttr(EVB_FACE_SRC[who])}" alt="" width="24" height="24" loading="lazy" decoding="async" />` +
    `<span class="nl-evb__guide-text">${escapeHtml(`${name}: ${text}`)}</span>` +
    `</div>`
  );
}

/**
 * 自分（見ている配信者）のカード。
 * @param {ReturnType<typeof import('./eventLiveBoardModel.js').buildEventLiveBoardModel>} m
 * @param {{ broadcasterName?: string, showListButton?: boolean }} [opts]
 */
export function buildEventSelfCardHtml(m, opts = {}) {
  if (!m) return '';
  const s = m.self;
  const head = cardHeadHtml(m.title || '');
  const got = m.gotAt ? `最終取得 ${formatJstHm(m.gotAt)}` : '';
  if (!s) {
    return (
      `<section class="nl-evb__card" data-event-key="${escapeHtml(m.key)}">${head}` +
      `<p class="nl-evb__muted">この配信者さんの順位はまだ公式に出ていません。${escapeHtml(got)}</p></section>`
    );
  }
  const who = escapeHtml(String(opts.broadcasterName || s.name || '').trim() || 'この配信者さん');
  /** いまのスコア順（年間/公式ランキング）の「次の順位まで」 */
  const scoreNextText =
    s.nextRank && s.toNext != null
      ? `次の${s.nextRank}位まで あと 💎${fmt(s.toNext)}`
      : s.rank === 1
        ? 'いま1位'
        : '';
  let sinceLine = '';
  if (s.since) {
    const label =
      s.since.kind === 'server'
        ? `公式更新（${formatJstMdHm(s.since.sinceAt)}頃）以降`
        : `この画面で初めて取得した ${formatJstHm(s.since.sinceAt)} 以降`;
    sinceLine = `<p class="nl-evb__since">${escapeHtml(label)} <strong>+💎${fmt(s.since.delta)}</strong></p>`;
  }
  const foot =
    `<p class="nl-evb__foot">${escapeHtml(got)}${m.totalCount ? `・参加 ${fmt(m.totalCount)}人` : ''}</p>` +
    (opts.showListButton
      ? `<button type="button" class="nl-evb__open" data-evb-open="${escapeHtml(m.key)}">この順位表の全員を見る</button>`
      : '');

  // イベントpt の順位があるとき（推定 or 公式表）: それを大きな数字に。年間は2行目に「年間」と明記。
  const eventRank = s.estimated && s.estRank != null ? s.estRank : s.official ? s.official.rank : null;
  if (m.separate && eventRank != null) {
    const isEst = !!(s.estimated && s.estRank != null);
    const tag = isEst
      ? `<span class="nl-evb__tag nl-evb__tag--est">推定</span>`
      : `<span class="nl-evb__tag nl-evb__tag--official">公式表</span>`;
    const ptValue = isEst && s.estimated ? s.estimated.value : s.official ? s.official.score : 0;
    const eventNext =
      isEst && s.estToNext != null
        ? `<p class="nl-evb__next">1つ上の${eventRank - 1}位まで あと <strong>💎${fmt(s.estToNext)}</strong>（推定）</p>`
        : eventRank === 1
          ? `<p class="nl-evb__next">🎉 イベントpt ${isEst ? '推定' : '公式表で'}<strong>1位</strong></p>`
          : '';
    const annual =
      `<p class="nl-evb__annual"><span class="nl-evb__tag">${escapeHtml(m.scoreLabel)}</span> ` +
      `<strong>${s.rank}位</strong>・<span class="nl-evb__nowrap">💎${fmt(s.score)}</span>${scoreNextText ? `・<span class="nl-evb__nowrap">${escapeHtml(scoreNextText)}</span>` : ''}</p>`;
    const guide =
      isEst && s.estimated
        ? buildEventGuideLineHtml('konta', `大きな数字は${s.estimated.basis}したイベントptの順位だよ。公式の発表ではなく目安だよ。`)
        : buildEventGuideLineHtml('konta', `大きな数字は公式のイベント表（${m.officialNote || '1日1回の更新分'}）の順位だよ。`);
    const official = s.official
      ? `<p class="nl-evb__basis">公式イベントランキング ${s.official.rank}位・💎${fmt(s.official.score)}（${escapeHtml(m.officialNote || '1日1回の更新分')}）</p>`
      : '';
    return (
      `<section class="nl-evb__card nl-evb__card--self" data-event-key="${escapeHtml(m.key)}" data-evb-big="event">` +
      head +
      `<div class="nl-evb__main">` +
      `<div class="nl-evb__rank">${tag}<span class="nl-evb__rank-num">${eventRank}</span><span class="nl-evb__rank-suf">位</span></div>` +
      `<div class="nl-evb__body">` +
      `<p class="nl-evb__who">${who}さん</p>` +
      `<p class="nl-evb__score"><span class="nl-evb__tag">イベントpt${isEst ? '（推定）' : '（公式表）'}</span> <strong>💎${fmt(ptValue)}</strong></p>` +
      eventNext +
      `</div></div>` +
      annual +
      sinceLine +
      guide +
      official +
      foot +
      `</section>`
    );
  }

  const next =
    s.nextRank && s.toNext != null
      ? `<p class="nl-evb__next">次の<strong>${s.nextRank}位</strong>まで あと <strong>💎${fmt(s.toNext)}</strong></p>`
      : s.rank === 1
        ? `<p class="nl-evb__next">🎉 いま<strong>1位</strong>です</p>`
        : '';
  const explain =
    m.separate && !s.estimated
      ? buildEventGuideLineHtml(
          'rink',
          'イベントptの合計は、公式が1日1回・各組25位までしか出していないのだ。上の「以降 +」は、それからリアルタイムで増えた💎だよ。'
        )
      : '';
  return (
    `<section class="nl-evb__card nl-evb__card--self" data-event-key="${escapeHtml(m.key)}" data-evb-big="score">` +
    head +
    `<div class="nl-evb__main">` +
    `<div class="nl-evb__rank"><span class="nl-evb__rank-num">${s.rank}</span><span class="nl-evb__rank-suf">位</span></div>` +
    `<div class="nl-evb__body">` +
    `<p class="nl-evb__who">${who}さん</p>` +
    `<p class="nl-evb__score"><span class="nl-evb__tag">${escapeHtml(m.scoreLabel)}</span> <strong>💎${fmt(s.score)}</strong></p>` +
    next +
    `</div></div>` +
    sinceLine +
    explain +
    foot +
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
    `${fmt(p.shown)} / ${fmt(p.totalCount)}人を表示</p>` +
    (p.officialNote
      ? buildEventGuideLineHtml(
          'tanu',
          `「推定」は公式表（${p.officialNote}）からの推定で、公式の値ではないよ。25位より下の人は「公式更新以降 +」だけ出すね。`
        )
      : '')
  );
}
