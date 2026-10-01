/**
 * livePlatformsHtml.js — /live/ の「ほかの配信サービス」セクション(Kick・後で YouTube)の HTML 文字列を作る純関数。
 *
 * ■ なぜ別ファイルか(2026-10-01・設計 docs/handoff/live-multiplatform-kick-youtube-SPEC.md)
 *   ニコ生の render()(live-ranking-entry.js)は lv をキーにした追跡器(脈拍レーン・増分・4段)を回す。
 *   Kick/YouTube にはそのデータが無く、YouTube は規約で自前の指標・順位の推移を作れない。
 *   ⟹ ここは「API が返した値をそのまま並べる」だけ。★推定・増分・順位推移の部品は import しない(テストで固定)。
 *
 * ■ この箱に入るもの: 応答 → HTML 文字列。DOM・fetch は触らない(entry の仕事)。
 */
import { escapeHtml as esc, safeHttpUrl, formatNumberJa as num } from './htmlText.js';
import { jstClock, elapsedText, freshness, cacheBust } from './liveRankingView.js';
import { KICK_MAX_LIVES } from './kickLivestreams.js';
import { toEpochMs } from './timeAuthority.js';

/** ★成人向け配信を出すか。1 か所で切り替える(既定: 出さない・出さなかった件数は黙らずに添える)。 */
export const SHOW_MATURE = false;

/** プラットフォームごとの表示名と出典の文言(★出典表示は Kick/YouTube の両方で必須にする)。 */
const LABEL = {
  kick: {
    name: 'Kick',
    source: '出典: Kick 公式 API（同時視聴数・サムネ・配信者名は Kick が返す値をそのまま表示）。各カードは Kick の配信ページへのリンクです。'
  },
  youtube: {
    name: 'YouTube',
    source: '出典: YouTube Data API（同時視聴数・サムネ・チャンネル名は YouTube が返す値をそのまま表示）。各カードは YouTube の配信ページへのリンクです。'
  }
};

/**
 * @typedef {{ linkBlink: string, linkNormal: string, tanuHalf: string }} Faces
 */

/**
 * 1 枚のカード。★既存のニコ生カードと同じクラス(.live__head/.shot/.sicon…)を使う＝見た目と
 *   画像失敗時の差し替え(entry の bindImgFallback)をそのまま共有する。
 * @param {import('./kickLivestreams.js').PlatformLive} l
 * @param {number} rankNo
 * @param {unknown} capturedAt
 * @param {number} nowMs
 * @param {Faces} faces
 * @returns {string}
 */
export function buildPlatformCardHtml(l, rankNo, capturedAt, nowMs, faces) {
  const label = LABEL[/** @type {'kick'|'youtube'} */ (l.platform)] || LABEL.kick;
  const url = safeHttpUrl(l.url);
  /** @param {string} inner @param {string} [cls] @param {string} [aria] */
  const link = (inner, cls = '', aria = '') => (url
    ? `<a${cls ? ` class="${cls}"` : ''} href="${esc(url)}" target="_blank" rel="noopener noreferrer"${aria ? ` aria-label="${esc(aria)}"` : ''}>${inner}</a>`
    : (cls ? `<span class="${cls}">${inner}</span>` : inner));

  // ★時点の解釈は timeAuthority に委ねる(ms 数値でも ISO 文字列でも同じ値になる)。
  const shotSrc = cacheBust(l.thumbnail, toEpochMs(capturedAt));
  const shotImg = shotSrc
    ? `<img class="shotimg" src="${esc(shotSrc)}" width="352" height="198" alt="配信画面のサムネイル" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<span class="noimg"><img src="${esc(faces.linkBlink)}" alt=""></span>`;
  const rankCls = rankNo <= 3 ? ` r${rankNo}` : '';
  const shot = link(`${shotImg}<span class="rankno${rankCls}">${rankNo}</span><span class="onair">LIVE</span>`,
    'shot', `${label.name} の配信ページを開く（新しいタブ）`);

  const ch = l.channel || { name: '', icon: '', url: '' };
  const icon = safeHttpUrl(ch.icon);
  const iconHtml = `<img class="sicon" src="${esc(icon || faces.linkNormal)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  const chUrl = safeHttpUrl(ch.url);
  const name = String(ch.name || '').trim() || '配信者';
  const nameHtml = chUrl
    ? `<a class="sname" href="${esc(chUrl)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`
    : `<span class="sname">${esc(name)}</span>`;

  // ★jstClock / elapsedText は UNIX 秒を取る(ニコ生の beginTime に合わせた部品)。startedAt は ms。
  const beginSec = l.startedAt > 0 ? Math.floor(l.startedAt / 1000) : 0;
  const begin = jstClock(beginSec);
  const elapsed = elapsedText(beginSec, nowMs);
  const times = '<div class="times">'
    + (begin ? `<span>▶ ${esc(begin)} 開始</span>` : '')
    + (elapsed ? `<span>経過 <b>${esc(elapsed)}</b></span>` : '')
    + '</div>';
  const category = l.category ? `<span class="category">${esc(l.category)}</span>` : '';
  const viewers = Number(l.viewers) > 0
    ? `<b>${num(l.viewers)}人</b><span>同時視聴（${esc(label.name)} の値）</span>`
    : `<b>—</b><span>同時視聴（${esc(label.name)} の値）</span>`;

  return `<article class="plive" data-platform="${esc(l.platform)}" data-id="${esc(l.id)}">`
    + `<div class="live__head">${shot}<div class="live__info">`
    + `<div class="streamer">${iconHtml}${nameHtml}</div>`
    + `<h3>${link(esc(l.title || name))}</h3>`
    + `${times}${category}</div>`
    + `<div class="now">${viewers}</div>`
    + '</div></article>';
}

/**
 * 1 プラットフォームぶんのセクション。
 *   ・鍵なし / 停止中 / 未実装 / 壊れた応答 → ''(セクションごと出さない＝機能を出していない状態)
 *   ・まだ集めていない → 見出し＋「まだ取得できていません」
 *   ・0 件 → 見出し＋「表示できる日本語配信がありません」(★0 件は正常)
 * @param {any} section /api/live-platforms の platforms.<name>
 * @param {{ nowMs: number, faces: Faces, maxLives?: number, showMature?: boolean }} o
 * @returns {string}
 */
export function buildPlatformSectionHtml(section, o) {
  if (!section || typeof section !== 'object') return '';
  const label = LABEL[/** @type {'kick'|'youtube'} */ (section.platform)];
  if (!label) return '';
  const head = `<h2 class="platform__title"><span class="platform__badge platform__badge--${esc(section.platform)}">${esc(label.name)}</span>いま配信中 <small>同時視聴の多い順</small></h2>`;
  const open = `<section class="platform" data-platform="${esc(section.platform)}">${head}`;
  const close = `<p class="platform__source">${esc(label.source)}</p></section>`;
  /** @param {string} msg */
  const emptyLine = (msg) => `<p class="empty"><img src="${esc(o.faces.tanuHalf)}" alt="">${esc(msg)}</p>`;

  if (!section.ok) {
    if (section.error === 'not collected yet') {
      return open + emptyLine(`${label.name} の一覧をまだ取得できていません。少し待つと出てきます。`) + close;
    }
    return '';
  }

  /** @type {import('./kickLivestreams.js').PlatformLive[]} */
  const all = Array.isArray(section.lives) ? section.lives : [];
  const showMature = o.showMature == null ? SHOW_MATURE : !!o.showMature;
  const visible = showMature ? all : all.filter((l) => !(l && l.mature));
  const hiddenMature = all.length - visible.length;
  const max = Number(o.maxLives) > 0 ? Number(o.maxLives) : KICK_MAX_LIVES;
  const shown = visible.slice(0, max);

  const at = toEpochMs(section.capturedAt);
  const f = freshness(at, o.nowMs);
  const meta = '<p class="platform__meta">'
    + `<span>配信中 <b>${num(shown.length)}</b> 配信</span>`
    + (f.text ? `<span${f.stale ? ' class="stale"' : ''}>・${esc(f.text)}</span>` : '')
    + (hiddenMature > 0 ? `<span>・成人向け ${num(hiddenMature)} 件は表示していません</span>` : '')
    + (section.truncated ? `<span>・上位のみ表示（${esc(label.name)} 側の一覧が多すぎるため）</span>` : '')
    + '</p>';

  if (!shown.length) {
    return open + meta + emptyLine(`いま ${label.name} で表示できる日本語配信がありません。`) + close;
  }
  const cards = shown.map((l, i) => buildPlatformCardHtml(l, i + 1, at, o.nowMs, o.faces)).join('');
  return open + meta + `<div class="platform__list">${cards}</div>` + close;
}

/**
 * 取得そのものに失敗したとき(ネットワーク・5xx)。ニコ生側には触れない。
 * @param {string} msg @param {string} face
 * @returns {string}
 */
export function platformsErrorHtml(msg, face) {
  return `<div class="state"><img src="${esc(face)}" alt="">${esc(msg)}</div>`;
}
