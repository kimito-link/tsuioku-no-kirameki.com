// tcPageInfo.js — ツイキャスの配信ページに出ている数と配信の情報を読む(ページの文字を読むだけ・通信しない)
// @layer L1 — DOM の読み取り(書き込みなし)
//
// 形は 2026-11-12 の PC 実測(本物・ログインなし):
//   - 現在/累計の視聴者: #viewer-counter .tw-fraction の「3485/67462」(左=現在・右=累計・4秒おきに変わる)
//   - コメント数: #comment-count a > span(配信全体の公式の数)
//   - 開始時刻: #updatetimer[data-started-at](ms)。data-live-type が配信中は live・終わると movie
//   - 配信者: #comment-list-app の data-broadcaster-name / -profile-image、data-account-type="not_logged_in" で未ログイン
//   - 題: meta og:title(テロップは og:description)
//   ページの数はそのまま使う(推定は出さない)。読めない数は入れない。

import { safeTcImageUrl } from './tcParse.js';

/** 「3,485」→ 3485(数でなければ null) @param {unknown} s */
export function tcIntOf(s) {
  const t = String(s ?? '').replace(/[,，\s]/g, '');
  if (!/^\d{1,12}$/.test(t)) return null;
  return Number(t);
}

/** 「3485/67462」→ { current, total }(形が違えば null) @param {unknown} s */
export function tcFractionOf(s) {
  const m = /^\s*([\d,]{1,15})\s*\/\s*([\d,]{1,15})\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const current = tcIntOf(m[1]);
  const total = tcIntOf(m[2]);
  return current == null || total == null ? null : { current, total };
}

/**
 * @param {Document} doc
 * @param {string} user
 * @returns {{ title: string, telop: string, name: string, iconUrl: string, startedAtMs: number, liveType: string,
 *   viewers: number | null, signedOut: boolean | null, movieId: string, stats: Record<string, number> }}
 */
export function readTcPageInfo(doc, user) {
  const q = (/** @type {string} */ sel) => {
    try {
      return doc.querySelector(sel);
    } catch {
      return null;
    }
  };
  const meta = (/** @type {string} */ prop) => String(q(`meta[property="${prop}"]`)?.getAttribute('content') || '').trim();
  const app = q('#comment-list-app');
  const timer = q('#updatetimer');
  const frac = tcFractionOf(q('#viewer-counter .tw-fraction')?.textContent);
  const comments = tcIntOf(q('#comment-count a > span')?.textContent);
  const started = Number(timer?.getAttribute('data-started-at'));
  /** @type {Record<string, number>} */
  const stats = {};
  if (frac) stats.totalViews = frac.total;
  if (comments != null) stats.commentTotal = comments;
  // 配信者の名前は comment-list-app の印が確か(同じページの題に「(@id) さんのライブ」が付く)
  const sameUser = String(app?.getAttribute('data-broadcaster-screen-name') || app?.getAttribute('data-broadcaster-id') || '').toLowerCase();
  const own = !sameUser || sameUser === String(user || '').toLowerCase();
  const accountType = String(app?.getAttribute('data-account-type') || '');
  const mid = String(app?.getAttribute('data-movie-id') || '');
  return {
    title: meta('og:title').slice(0, 200),
    telop: meta('og:description').slice(0, 200),
    name: own ? String(app?.getAttribute('data-broadcaster-name') || '').trim().slice(0, 120) : '',
    iconUrl: own ? safeTcImageUrl(app?.getAttribute('data-broadcaster-profile-image')) : '',
    startedAtMs: Number.isFinite(started) && started > 1e12 ? Math.floor(started) : 0,
    liveType: String(timer?.getAttribute('data-live-type') || '').slice(0, 20),
    viewers: frac ? frac.current : null,
    signedOut: accountType ? accountType === 'not_logged_in' : null,
    movieId: /^\d{1,20}$/.test(mid) ? mid : '',
    stats,
  };
}

/**
 * 配信者のサポーターランキング(/<user>/supporter・サーバーが描いた HTML)→ 公式の順位表の行。
 *   形は 2026-11-12 の PC 実測(ログインなし・fetch で同じ行が読める):
 *   上位3人 section.tw-top-supporters > div.tw-top-supporter[data-rank]・4位から div.tw-supporter-row(.tw-supporter-number)。
 *   数は .tw-supporter-point-stat-current(「現在のレベルのアイテムスコア」・この順で並ぶ)と -total(累計スコア)。
 *   見出し .tw-supporter-ranking-summary-title は「現在のレベル: 85」。
 * @param {ParentNode} doc
 * @returns {{ level: number | null, rows: { rank: number, name: string, xp: number, total: number | null, iconUrl: string, login: string }[] }}
 */
export function parseTcSupporterDoc(doc) {
  /** @type {{ rank: number, name: string, xp: number, total: number | null, iconUrl: string, login: string }[]} */
  const rows = [];
  const all = (/** @type {string} */ sel) => {
    try {
      return Array.from(doc.querySelectorAll(sel));
    } catch {
      return [];
    }
  };
  const cells = [...all('section.tw-top-supporters .tw-top-supporter'), ...all('.tw-supporter-ranking .tw-supporter-row')];
  for (const el of cells) {
    // 空き枠(サポーターが3人未満のとき公式ページは data-is-empty="true" の「0・-」の枠を出す)は人ではないので並べない(2026-11-12 PC 実測)
    if (el.getAttribute('data-is-empty') === 'true' || el.querySelector('[data-is-empty="true"]')) continue;
    const rank = tcIntOf(el.getAttribute('data-rank') || el.querySelector('.tw-supporter-number')?.textContent);
    const name = String(el.querySelector('.tw-supporter-user-name span, .tw-supporter-user-name')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const xp = tcIntOf(el.querySelector('.tw-supporter-point-stat-current')?.textContent);
    // 1件の形が違っても、その行だけ捨てる(AGENTS.md §3.6)
    if (rank == null || rank < 1 || !name || name === '-' || xp == null) continue;
    const link = el.querySelector('a.tw-user-name-icon[data-user-id]') || el.querySelector('[data-user-id]');
    const login = String(link?.getAttribute('data-user-id') || '').trim().slice(0, 60);
    const img = String(el.querySelector('a.tw-user-name-icon img, img.tw-user-name-icon, img')?.getAttribute('src') || '');
    rows.push({ rank, name, xp, total: tcIntOf(el.querySelector('.tw-supporter-point-stat-total')?.textContent), iconUrl: safeTcImageUrl(img), login: /^(?:[a-z]{1,3}:)?[A-Za-z0-9_]{1,40}$/.test(login) ? login : '' });
    if (rows.length >= 100) break;
  }
  rows.sort((a, b) => a.rank - b.rank);
  const m = /(\d{1,4})/.exec(String(all('.tw-supporter-ranking-summary-title')[0]?.textContent || ''));
  return { level: m ? Number(m[1]) : null, rows };
}

/** サポーターランキングのページの URL(0 ページ目) @param {string} user */
export function tcSupporterUrl(user) {
  return /^(?:[a-z]{1,3}:)?[a-z0-9_]{1,40}$/i.test(String(user || '')) ? `https://twitcasting.tv/${String(user).toLowerCase()}/supporter` : '';
}
