/**
 * liveMovers.js — /live/ の配信カード先頭「⚡ いま動いた人」の純ロジック(行の選び方と HTML)。
 *
 * ★2026-11-21(りんくさん「これもユーザーがもとめるリアルタイム性だして」):
 *   見る人がいちばん知りたいのは「いま誰が動いたか」。それを配信ごとのカードの上(配信の名前のすぐ下)に出す。
 *
 * ★出すのは【実測 2 点の差だけ】(でっち上げない・AGENTS.md の掟):
 *   - 🎁 ギフト: ニコ生公開のギフト順位表を前回の取得と引き算して pt が増えた人(liveGiftPulse の結果をそのまま使う)
 *   - 💬 コメント: 当サイトのコメント集計を前回の集計と引き算して件数が増えた人(同上)
 *   前回に居なかった人・減った人・匿名のギフト行は出さない(差を発明しない)。
 *   何も増えていなければ「増えた人はいない」と正直に出す。初めての取得は「次の取得と比べる」と出す。
 * ★動きの演出はしない(数字を補間しない)。描き直しは取得のときだけ(= 60 秒に 1 回まで)。
 *
 * @module liveMovers
 */

import { escapeHtml as esc, formatNumberJa as num } from './htmlText.js';
import { formatPtDelta, formatCountDelta, spanText } from './liveGiftPulse.js';
import { toEpochMs } from './timeAuthority.js';

/** 1 配信に並べる最大人数(低スペック・スマホでも 1〜2 行に収める)。 */
export const MOVERS_MAX = 6;

/**
 * @typedef {{ kind: 'gift'|'comment', name: string, avatar: string, url: string, uid: string, delta: number, tier: string }} Mover
 */

/**
 * @param {import('./liveRankingView.js').SupporterRow[]} rows
 * @param {import('./liveGiftPulse.js').PulseResult|null|undefined} pulse
 * @param {'gift'|'comment'} kind
 * @returns {Mover[]}
 */
function pick(rows, pulse, kind) {
  /** @type {Mover[]} */
  const out = [];
  if (!pulse || !pulse.byKey || !pulse.byKey.size) return out;
  for (const r of Array.isArray(rows) ? rows : []) {
    const uid = String((r && r.uid) || '').trim();
    if (!uid) continue;
    const rp = pulse.byKey.get(`u:${uid}`);
    if (!rp || !(rp.delta > 0)) continue;
    out.push({ kind, name: String(r.name || ''), avatar: String(r.avatar || ''), url: String(r.url || ''), uid, delta: rp.delta, tier: rp.tier });
  }
  out.sort((a, b) => b.delta - a.delta);
  return out;
}

/**
 * ギフトで動いた人を先に(お金の応援がいちばん知りたい)、次にコメントで動いた人。max 指定が無ければ全員
 * (並べる人数は buildMoversHtml が MOVERS_MAX で切り、「ほか N 人」を添える)。
 * ★同じ人がギフトとコメントの両方で動いたら、ギフトの方だけ出す(1 人 1 枠)。
 * @param {{ giftRows?: any[], giftPulse?: any, commentRows?: any[], commentPulse?: any, max?: number }} o
 * @returns {Mover[]}
 */
export function pickMovers(o) {
  const max = Number(o && o.max) > 0 ? Number(o.max) : Infinity;
  const gifts = pick(o && o.giftRows || [], o && o.giftPulse, 'gift');
  const seen = new Set(gifts.map((m) => m.uid));
  const comments = pick(o && o.commentRows || [], o && o.commentPulse, 'comment').filter((m) => !seen.has(m.uid));
  return [...gifts, ...comments].slice(0, max);
}

/** 時刻(JST)。秒まで=ギフト、分まで=コメント集計。 @param {unknown} at @param {boolean} withSec */
export function jstTime(at, withSec) {
  const ms = toEpochMs(at);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', ...(withSec ? { second: '2-digit' } : {}), timeZone: 'Asia/Tokyo' });
  } catch {
    return '';
  }
}

/**
 * @param {{
 *   movers: Mover[],
 *   firstSample: boolean,
 *   giftAt?: unknown, giftSpanMs?: number,
 *   commentAt?: unknown, commentSpanMs?: number,
 *   isBlankIcon?: (u: string) => boolean,
 *   faceQuiet?: string
 * }} o
 * @returns {string}
 */
export function buildMoversHtml(o) {
  const movers = Array.isArray(o.movers) ? o.movers : [];
  const gAt = jstTime(o.giftAt, true);
  const cAt = jstTime(o.commentAt, false);
  const head = '<span class="movers__head">⚡ いま動いた人</span>';
  if (!movers.length) {
    const msg = o.firstSample
      ? '次の取得（約 1 分後）と比べて、増えた人をここに出すわ'
      : `前回の取得から増えた人はいないわ${gAt ? `（${gAt} 取得）` : ''}`;
    const face = o.faceQuiet ? `<img src="${esc(o.faceQuiet)}" alt="" width="22" height="22" loading="lazy" decoding="async">` : '';
    return `<div class="movers movers--quiet">${head}<span class="movers__quiet">${face}${esc(msg)}</span></div>`;
  }
  const shown = movers.slice(0, MOVERS_MAX);
  const more = movers.length - shown.length;
  const blank = typeof o.isBlankIcon === 'function' ? o.isBlankIcon : () => false;
  const items = shown.map((m) => {
    const ava = (m.avatar && !blank(m.avatar))
      ? `<img class="ava" src="${esc(m.avatar)}" alt="" width="22" height="22" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : '<span class="ava"></span>';
    const mark = m.kind === 'gift' ? '🎁' : '💬';
    const delta = m.kind === 'gift' ? formatPtDelta(m.delta) : formatCountDelta(m.delta);
    const label = `${m.name}：${m.kind === 'gift' ? 'ギフト' : 'コメント'} ${delta}`;
    const body = `${ava}<span class="mv-name">${esc(m.name)}</span><span class="mv-delta">${mark}${esc(delta)}</span>`;
    const inner = m.url
      ? `<a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer" title="${esc(label)}">${body}</a>`
      : `<span title="${esc(label)}">${body}</span>`;
    return `<li class="mover mover--${m.kind} tier-${esc(m.tier)}">${inner}</li>`;
  }).join('');
  const whenParts = [];
  if (shown.some((m) => m.kind === 'gift')) {
    const span = spanText(o.giftSpanMs);
    whenParts.push(`🎁 ${span ? `${span}の増分` : '前回の取得からの増分'}${gAt ? `（${gAt} 取得）` : ''}`);
  }
  if (shown.some((m) => m.kind === 'comment')) {
    const span = spanText(o.commentSpanMs);
    whenParts.push(`💬 ${span ? `${span}の増分` : '前回の集計からの増分'}${cAt ? `（${cAt} 集計）` : ''}`);
  }
  const count = `<span class="movers__count">${num(movers.length)}人${more > 0 ? `（ほか ${num(more)}人は下の順位表に）` : ''}</span>`;
  return `<div class="movers">${head}${count}<ul class="movers__list">${items}</ul>`
    + `<p class="movers__when">${esc(whenParts.join('・'))}</p></div>`;
}
