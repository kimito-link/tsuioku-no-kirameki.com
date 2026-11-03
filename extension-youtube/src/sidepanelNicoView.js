// sidepanelNicoView.js — ニコ生版 popup.html を丸写ししたサイドパネルに、YouTube のデータを流し込む。
//
// ★方針(りんく「ソースをごっそり写してから変える」2026-11-03):
//   画面(HTML/CSS)は scripts/build-youtube-sidepanel-html.mjs がニコ生版から丸ごと写す。
//   ここはニコ生版と同じ id の場所へ、YouTube のデータを入れるだけ。描画もできるだけ
//   ニコ生版と同じ部品(順位カードのモデル・ユーザーレーンの描画・ティッカー)を使う。

/* global document, window, performance, chrome, setTimeout, HTMLElement, HTMLImageElement */

import { formatNumberJa, safeHttpUrl } from '../../src/lib/htmlText.js';
import { anonymousIdenticonDataUrl } from '../../src/lib/anonymousIdenticon.js';
import { escapeAttr, escapeHtml } from '../../src/lib/htmlEscape.js';
import { isHttpOrHttpsUrl } from '../../src/lib/supportGrowthTileSrc.js';
import { topSupportRankLineModels } from '../../src/lib/topSupportRankStripLines.js';
import { storyTileUsesYukkuriTvStyle } from '../../src/lib/storyTileTvStyle.js';
import { buildCommentTickerLatestHtml } from '../../src/lib/commentTickerLatestHtml.js';
import { paintStoryUserLaneDomFilled } from '../../src/extension/story/renderStoryUserLaneDom.js';
import { buildYtChannelUrl, formatYtCurrencyAmount } from '../../src/lib/youtube/ytSupportRanking.js';
import { buildYtUserLaneTiers } from '../../src/lib/youtube/ytUserLaneTiers.js';
import {
  buildYtRankLinesHtml,
  buildYtCasterTileHtml,
  ytRankUserKey,
} from '../../src/lib/youtube/ytRankLinesHtml.js';

const IMG = Object.freeze({
  linkFace: 'images/yukkuri-charactore-english/link/link-yukkuri-normal-mouth-closed.thumb128.png',
  kontaFace: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-normal.thumb128.png',
  tanuFace: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-normal-mouth-closed.thumb128.png',
  linkSmile: 'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png',
  linkHalf: 'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png',
  kontaSmile: 'images/yukkuri-charactore-english/konta/kitsune-yukkuri-smile-mouth-open.png',
  tanuSmile: 'images/yukkuri-charactore-english/tanunee/tanuki-yukkuri-smile-mouth-open.png',
});

/** 順位カード・レーンの人数 */
const RANK_STRIP_LIMIT = 10;
const LANE_RANK_LIMIT = 10;
/** ユーザーレーン各段の最大人数 */
const STORY_USERLANE_LIMIT = 60;
/** 室温(直近5分の応援増加)の窓 */
const ROOM_HEAT_WINDOW_MS = 5 * 60 * 1000;

/** @type {Map<string, string>} */
const identiconCache = new Map();

/** @param {string} key */
export function identiconFor(key) {
  const k = String(key || 'anon').trim() || 'anon';
  const hit = identiconCache.get(k);
  if (hit) return hit;
  const url = anonymousIdenticonDataUrl(k, 64);
  if (identiconCache.size > 2000) {
    const first = identiconCache.keys().next().value;
    if (first) identiconCache.delete(first);
  }
  identiconCache.set(k, url);
  return url;
}

/** @param {string} id */
function $(id) {
  return document.getElementById(id);
}

/**
 * @param {string} id
 * @param {string} text
 */
function setText(id, text) {
  const el = $(id);
  if (el && el.textContent !== text) el.textContent = text;
}

/**
 * ニコ生版の「—」から実際の値に変わったら、薄い色(is-placeholder)を外す。
 * @param {string} id
 * @param {string} text
 */
function setStatValue(id, text) {
  const el = $(id);
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('is-placeholder', text === '—' || text === '');
}

/**
 * innerHTML で入れた画像の読み込み失敗を拾う(拡張の CSP ではインラインの onerror が動かない)。
 * ニコ生版 bindOnErrorHandlersWithin と同じ印(data-on-error-hide / data-on-error-fallback)を見る。
 * 顔が取れなかった人は、その人固有の顔(identicon)にする(AGENTS.md §3.6)。
 * @param {ParentNode | null} root
 */
function bindImageFallbacks(root) {
  if (!root) return;
  root.querySelectorAll('img').forEach((node) => {
    if (!(node instanceof HTMLImageElement)) return;
    if (node.dataset.ytOnErrorBound === '1') return;
    node.dataset.ytOnErrorBound = '1';
    node.addEventListener(
      'error',
      () => {
        if (node.dataset.onErrorHide === '1') {
          node.style.visibility = 'hidden';
          return;
        }
        const keyEl = node.closest('[data-yt-user-key],[data-user-key]');
        const key =
          (keyEl && (keyEl.getAttribute('data-yt-user-key') || keyEl.getAttribute('data-user-key'))) ||
          node.alt ||
          'anon';
        const fb = identiconFor(String(key).replace(/^u:/, ''));
        if (node.src !== fb) node.src = fb;
      },
      { once: true },
    );
  });
}

/** 初回の幕(りんく・こん太・たぬ姉)を畳む。ニコ生版 dismissInitialLoadShade と同じ見え方。 */
export function dismissInitialLoadShade() {
  const shade = $('nlInitialLoadShade');
  const primary = $('nlPopupPrimary');
  if (primary) primary.setAttribute('aria-busy', 'false');
  if (!shade || shade.classList.contains('nl-init-shade--done')) return;
  shade.classList.add('nl-init-shade--done');
  setTimeout(() => {
    shade.setAttribute('hidden', '');
  }, 400);
}

/**
 * ニコ生版 applyResponsivePopupLayoutImpl の「埋め込み(INLINE_MODE)」と同じ: 窓の大きさを CSS 変数へ渡す。
 */
export function applyInlineLayout() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;
  root.classList.add('nl-inline');
  body.classList.add('nl-inline');
  const width = Math.max(260, Math.round(window.innerWidth || 360));
  const height = Math.max(180, Math.round(window.innerHeight || 400));
  const baseFont = width >= 900 ? 15.5 : width >= 720 ? 15.25 : width >= 520 ? 15 : 14.5;
  root.style.setProperty('--nl-pop-width', `${width}px`);
  root.style.setProperty('--nl-pop-height', `${height}px`);
  root.style.setProperty('--nl-base-font', `${baseFont}px`);
  body.classList.remove('nl-tight', 'nl-compact');
}

/** ビルドの札(ニコ生版 #nlVersionBadge)に拡張の版を出す。 */
export function paintVersionBadge() {
  let version = '';
  try {
    version = String(chrome.runtime.getManifest().version || '');
  } catch {
    version = '';
  }
  setText('nlVersionBadgeValue', version ? `v${version} · YouTube` : 'YouTube');
}

/**
 * 経過ミリ秒を「12分」「1時間05分」にする。
 * @param {number} ms
 */
export function formatElapsedJa(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '1分未満';
  if (totalMin < 60) return `${totalMin}分`;
  return `${Math.floor(totalMin / 60)}時間${String(totalMin % 60).padStart(2, '0')}分`;
}

/** 同時視聴としてあり得る上限(ytChatParse と同じ 5,000万) */
const MAX_PLAUSIBLE_VIEWERS = 50_000_000;
/** @param {number} v */
function isPlausibleViewers(v) {
  return Number.isFinite(v) && v >= 0 && v <= MAX_PLAUSIBLE_VIEWERS;
}

/**
 * 1. 数字カード(記録・同時視聴・コメントした人)と数字の行。
 * @param {any} summary
 * @param {number} total
 * @param {any} ranking
 * @param {{ firstRecordedAt?: number, lastRecordedAt?: number } | null} incState
 */
export function paintStatCards(summary, total, ranking, incState) {
  const uniq = Number(ranking?.uniqueCommenterCount || 0);
  const cv = Number(summary?.concurrentViewers);
  // 前の版が保存した壊れた値(数字が回るアニメの 0〜9 を全部つなげた巨大な数)は表示でも捨てる
  const concurrent = summary?.concurrentViewers != null && isPlausibleViewers(cv) ? cv : null;
  const peakRaw = Number(summary?.peakConcurrentViewers);
  const peak = isPlausibleViewers(peakRaw) ? peakRaw : NaN;

  setStatValue('liveStatComments', total > 0 || summary ? formatNumberJa(total) : '—');
  setStatValue('watchConcurrentEst', concurrent !== null ? formatNumberJa(concurrent) : '—');
  setStatValue('watchViewerDom', uniq > 0 || summary ? formatNumberJa(uniq) : '—');

  const breakdown = $('liveStatCommentsBreakdown');
  if (breakdown) {
    const c = ranking?.counts || {};
    const paid = Number(c.superchat || 0) + Number(c.sticker || 0);
    const mem = Number(c.membership || 0) + Number(c.membershipGift || 0);
    const text = total > 0 ? `うち スパチャ ${formatNumberJa(paid)} · メンバー ${formatNumberJa(mem)}` : '';
    breakdown.textContent = text;
    breakdown.hidden = !text;
  }

  setStatValue('officialStatNicoViewers', Number.isFinite(peak) && peak > 0 ? formatNumberJa(peak) : '—');
  setStatValue('officialStatNicoComments', total > 0 ? formatNumberJa(total) : '—');
  const rate = $('officialStatNicoCommentsRate');
  const startMs =
    (incState && Number(incState.firstRecordedAt) > 0 ? Number(incState.firstRecordedAt) : 0) ||
    Number(summary?.createdAt || 0);
  const endMs =
    Math.max(
      incState && Number(incState.lastRecordedAt) > 0 ? Number(incState.lastRecordedAt) : 0,
      Number(summary?.updatedAt || 0),
    ) || Date.now();
  const elapsed = startMs > 0 && endMs >= startMs ? endMs - startMs : -1;
  setStatValue('officialStatNicoStreamAge', elapsed >= 0 && (total > 0 || summary) ? formatElapsedJa(elapsed) : '—');
  if (rate) {
    const perMin = elapsed >= 60000 && total > 0 ? Math.round((total / (elapsed / 60000)) * 10) / 10 : 0;
    const t = perMin > 0 ? `${perMin}/分` : '';
    if (rate.textContent !== t) rate.textContent = t;
    rate.classList.toggle('is-placeholder', !t);
  }
  const primary = ranking?.primaryCurrencySummary;
  setStatValue('officialStatNicoAdPts', primary && primary.amount > 0 ? String(primary.formatted) : '—');
  const memCount = Number(ranking?.counts?.membership || 0) + Number(ranking?.counts?.membershipGift || 0);
  setStatValue('officialStatNicoGiftPts', memCount > 0 ? `${formatNumberJa(memCount)}件` : '—');
}

/**
 * 順位カード・レーン用のモデル(ニコ生版 topSupportRankLineModels そのもの)。
 * @param {{ userKey: string, nickname: string, count: number, avatarUrl?: string }[]} rooms
 */
function rankModels(rooms) {
  return topSupportRankLineModels(rooms, {
    defaultThumbSrc: IMG.linkFace,
    anonymousFallbackThumbSrc: IMG.linkFace,
    colorScheme: 'light',
    anonymousIdenticonResolver: (uid) => identiconFor(uid),
  });
}

/**
 * @param {any} person
 * @returns {string}
 */
function channelHrefOf(person) {
  return safeHttpUrl(person?.channelUrl || buildYtChannelUrl(person?.channelId || ''));
}

/**
 * 2. 応援ユーザーの順位カード(#topSupportRankStrip)。左端に配信者、続いてコメントの多い順。
 * @param {any} summary
 * @param {any} ranking
 * @param {string} videoId
 */
export function paintTopSupportRankStrip(summary, ranking, videoId) {
  const strip = $('topSupportRankStrip');
  if (!strip) return;
  const bChannelId = String(summary?.broadcasterChannelId || '').trim();
  const casterHtml = buildYtCasterTileHtml({
    name: String(summary?.broadcasterName || '').trim(),
    iconUrl: String(summary?.broadcasterIconUrl || ''),
    pageUrl:
      safeHttpUrl(buildYtChannelUrl(bChannelId)) ||
      (videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : ''),
    followLabel: bChannelId ? 'チャンネル' : '視聴ページ',
  });
  const commenters = (Array.isArray(ranking?.commenters) ? ranking.commenters : [])
    .filter((/** @type {any} */ c) => !bChannelId || c.channelId !== bChannelId)
    .slice(0, RANK_STRIP_LIMIT);
  let html;
  if (!commenters.length) {
    if (!casterHtml) {
      strip.hidden = true;
      strip.setAttribute('aria-hidden', 'true');
      strip.innerHTML = '';
      return;
    }
    strip.setAttribute('aria-label', '配信者情報');
    html =
      `<p class="nl-top-support-rank__note">まだ応援コメントがありません。まずは配信者のチャンネル登録から。</p>` +
      `<div class="nl-top-support-rank__list" role="list">${casterHtml}</div>`;
  } else {
    strip.setAttribute('aria-label', '記録した応援コメントをユーザー別に数えた件数の多い順');
    const rooms = commenters.map((/** @type {any} */ c) => ({
      userKey: ytRankUserKey(c.channelId, c.name),
      nickname: String(c.name || ''),
      count: Number(c.commentCount || 0),
      avatarUrl: String(c.iconUrl || ''),
    }));
    const lines = buildYtRankLinesHtml(rankModels(rooms), {
      countTextAt: (i) => {
        const c = commenters[i];
        return c.primaryFormattedAmount ? `${c.commentCount}件 · ${c.primaryFormattedAmount}` : `${c.commentCount}件`;
      },
      hrefFor: (_k, i) => channelHrefOf(commenters[i]),
    });
    html =
      `<p class="nl-top-support-rank__note">記録内・ユーザー別の応援件数が多い順です。</p>` +
      `<div class="nl-top-support-rank__list" role="list">${casterHtml}${lines}</div>`;
  }
  if (strip.dataset.ytLastHtml === html && strip.firstChild) {
    strip.hidden = false;
    return;
  }
  strip.innerHTML = html;
  strip.dataset.ytLastHtml = html;
  strip.hidden = false;
  strip.removeAttribute('aria-hidden');
  bindImageFallbacks(strip);
}

/**
 * レーン(ニコ生版 .nl-north-star-lane)の左のガジェット「現在の取得率」を、記録から集計できた状態にする。
 * @param {string} laneId
 * @param {boolean} hasRows
 */
function syncLaneGadget(laneId, hasRows) {
  const lane = document.querySelector(`.nl-north-star-lane[data-lane="${laneId}"]`);
  if (!(lane instanceof HTMLElement)) return;
  // ニコ生版と同じく、まだ何も無いレーンは畳む(空の大きな箱を並べない)
  lane.hidden = !hasRows;
  const gadget = lane.querySelector('.nl-north-star-lane__gadget:not(.nl-north-star-lane__gadget--summary)');
  if (gadget instanceof HTMLElement) {
    gadget.setAttribute('data-nl-acq-mode', 'determinate');
    const fill = gadget.querySelector('.nl-north-star-lane__acq-fill');
    if (fill instanceof HTMLElement) fill.style.width = hasRows ? '100%' : '0%';
    const pct = gadget.querySelector('.nl-north-star-lane__acq-pct-num');
    if (pct) pct.textContent = hasRows ? '100%' : '—';
    const chara = gadget.querySelector('.nl-north-star-lane__chara-wrap');
    if (chara) chara.setAttribute('data-nl-acq-tier', hasRows ? 'ok' : 'wait');
  }
}

/**
 * レーン本体に順位カードを並べる(空ならニコ生版と同じく note だけ)。
 * @param {string} laneId
 * @param {any[]} people
 * @param {(p: any) => number} countOf
 * @param {(p: any, i: number) => string} countTextOf
 * @param {string} noteText
 * @param {string} emptyText
 */
function paintLaneRanking(laneId, people, countOf, countTextOf, noteText, emptyText) {
  const body = $(`northStarLaneBody-${laneId}`);
  if (!body) return;
  syncLaneGadget(laneId, people.length > 0);
  body.classList.add('nl-top-support-rank', 'nl-top-support-rank--below-cards');
  if (laneId === 'giftHistory') body.classList.add('nl-gift-rank-strip');
  let html;
  if (!people.length) {
    body.setAttribute('data-lane-state', 'not_yet');
    html = `<p class="nl-top-support-rank__note">${escapeHtml(emptyText)}</p>`;
  } else {
    body.setAttribute('data-lane-state', 'ok');
    const rooms = people.map((p) => ({
      userKey: ytRankUserKey(p.channelId, p.name),
      nickname: String(p.name || ''),
      count: countOf(p),
      avatarUrl: String(p.iconUrl || ''),
    }));
    html =
      `<p class="nl-top-support-rank__note">${escapeHtml(noteText)}</p>` +
      `<div class="nl-top-support-rank__list" role="list">${buildYtRankLinesHtml(rankModels(rooms), {
        countTextAt: (i) => countTextOf(people[i], i),
        hrefFor: (_k, i) => channelHrefOf(people[i]),
      })}</div>`;
  }
  if (body.dataset.ytLastHtml === html && body.firstChild) return;
  body.innerHTML = html;
  body.dataset.ytLastHtml = html;
  bindImageFallbacks(body);
}

/**
 * 3. 応援レーン(ニコ生版の公式値レーンの位置): スーパーチャット貢献度・メンバー・通貨別の内訳。
 * @param {any} ranking
 */
export function paintNorthStarLanes(ranking) {
  const primary = ranking?.primaryCurrencySummary;
  const cur = String(primary?.currency || '');
  const scRows = cur && ranking?.byCurrency?.[cur] ? ranking.byCurrency[cur].slice(0, LANE_RANK_LIMIT) : [];
  paintLaneRanking(
    'contributionRanking',
    scRows,
    (p) => Number(p.amount || 0),
    (p) => `${p.formattedAmount}`,
    `${cur} の金額が多い順（${formatNumberJa(scRows.length)}人）`,
    'スーパーチャット・スーパーステッカーが届くと、ここに金額の多い順で並びます。',
  );

  const members = (Array.isArray(ranking?.supporters) ? ranking.supporters : [])
    .filter((/** @type {any} */ s) => s.membershipCount > 0 || s.giftCount > 0)
    .sort(
      (/** @type {any} */ a, /** @type {any} */ b) =>
        b.giftCount + b.membershipCount - (a.giftCount + a.membershipCount) || b.lastTs - a.lastTs,
    )
    .slice(0, LANE_RANK_LIMIT);
  paintLaneRanking(
    'giftHistory',
    members,
    (p) => p.giftCount + p.membershipCount,
    (p) => (p.giftCount > 0 ? `🎁${p.giftCount}回` : `加入${p.membershipCount}回`),
    'ユーザー別（多い順・最大10）',
    'メンバー加入・メンバーシップギフトが届くと、ここに並びます。',
  );
  {
    const memTotal = Number(ranking?.counts?.membership || 0) + Number(ranking?.counts?.membershipGift || 0);
    const ptWrap = $('giftHistoryProgramPt');
    if (ptWrap) {
      const num = ptWrap.querySelector('.nl-north-star-lane__program-pt-num');
      if (num) num.textContent = memTotal > 0 ? formatNumberJa(memTotal) : '—';
      const unit = ptWrap.querySelector('small');
      if (unit) unit.textContent = '件';
      ptWrap.classList.toggle('is-placeholder', memTotal === 0);
    }
  }

  // 通貨別の内訳(番組累計ポイントの位置)
  {
    const body = $('northStarLaneBody-programPoints');
    const codes = Object.keys(ranking?.totalsByCurrency || {}).sort(
      (a, b) => (ranking.currencyItemCounts?.[b] || 0) - (ranking.currencyItemCounts?.[a] || 0),
    );
    syncLaneGadget('programPoints', codes.length > 0);
    if (body) {
      body.classList.add('nl-top-support-rank', 'nl-top-support-rank--below-cards');
      body.setAttribute('data-lane-state', codes.length ? 'ok' : 'not_yet');
      const html = codes.length
        ? `<p class="nl-top-support-rank__note">通貨ごとの合計（換算なし）</p>` +
          `<div class="nl-top-support-rank__list" role="list">${codes
            .map(
              (code, i) =>
                `<div class="nl-top-support-rank__line" role="listitem" title="${escapeAttr(code)}">` +
                `<span class="nl-top-support-rank__place" aria-hidden="true">${i + 1}</span>` +
                `<span class="nl-top-support-rank__count">${escapeHtml(formatYtCurrencyAmount(ranking.totalsByCurrency[code], code))}</span>` +
                `<span class="nl-top-support-rank__id">${escapeHtml(code)}</span>` +
                `<span class="nl-top-support-rank__name">${formatNumberJa(ranking.currencyItemCounts?.[code] || 0)}件</span>` +
                `</div>`,
            )
            .join('')}</div>`
        : `<p class="nl-top-support-rank__note">スーパーチャットが届くと、通貨ごとの合計が出ます。</p>`;
      if (body.dataset.ytLastHtml !== html) {
        body.innerHTML = html;
        body.dataset.ytLastHtml = html;
      }
    }
  }

  // 3キャラの札(りんく=スパチャ人数 / こん太=メンバー人数 / たぬ姉=通貨の数)
  /** @type {[string, number, string][]} */
  const trio = [
    ['rink', scRows.length, '人'],
    ['konta', members.length, '人'],
    ['tanu', Object.keys(ranking?.totalsByCurrency || {}).length, '通貨'],
  ];
  for (const [slot, n, unit] of trio) {
    const el = document.querySelector(`[data-nl-trio-slot="${slot}"]`);
    if (!el) continue;
    el.setAttribute('data-nl-acq-tier', n > 0 ? 'ok' : 'wait');
    const num = el.querySelector('.nl-north-star-chara-trio__pct-num');
    if (num) num.textContent = n > 0 ? `${formatNumberJa(n)}${unit}` : '—';
  }
}

/** ユーザーレーンの各段の案内(ニコ生版 storyUserLaneGuideHtml と同じ形・YouTube の言葉) */
const LANE_GUIDE = Object.freeze({
  top: [IMG.linkFace, 'りんく: チャンネルID・表示名・アイコンがそろった人を、直近に話した順に並べるよ。'],
  gift: [
    IMG.linkSmile,
    'ギフト列: スーパーチャット・スーパーステッカーで応援してくれた人を、金額の大きい順に並べるよ。',
  ],
  ad: [IMG.kontaSmile, 'メンバー列: メンバー加入・メンバーシップギフト・メンバーバッジの人を並べるよ。'],
  konta: [IMG.kontaFace, 'こん太: 表示名かアイコンのどちらかまで取れた人は、この段に並ぶよ。'],
  tanu: [IMG.tanuFace, 'たぬ姉: チャンネルIDが取れない人や情報が薄い人は、ぜんぶこの段に集めるよ。'],
});

/**
 * @param {string} face
 * @param {string} text
 * @param {number} count
 */
function guideLineHtml(face, text, count) {
  return (
    `<div class="nl-story-userlane-guide__line">` +
    `<img class="nl-story-userlane-guide__face" src="${escapeAttr(face)}" alt="" width="24" height="24" decoding="async" />` +
    `<span class="nl-story-userlane-guide__text">${escapeHtml(text)}<span class="nl-story-userlane-guide__count">${Math.floor(count)}人</span></span>` +
    `</div>`
  );
}

/**
 * @param {string} wrapId
 * @param {string} linesId
 * @param {string} html
 */
function setGuide(wrapId, linesId, html) {
  const wrap = $(wrapId);
  const lines = $(linesId);
  if (lines && lines.innerHTML !== html) lines.innerHTML = html;
  if (wrap) wrap.hidden = !html;
}

const laneIo = {
  storyAvatarLoadGuard: {
    /** @param {string} s */
    pickDisplaySrc: (s) => s,
    /** @param {HTMLImageElement} img @param {string} requested */
    noteRemoteAttempt: (img, requested) => {
      if (!isHttpOrHttpsUrl(requested)) return;
      img.addEventListener(
        'error',
        () => {
          const cell = img.closest('[data-user-key]');
          const key = String(cell?.getAttribute('data-user-key') || img.title || 'anon').replace(/^u:/, '');
          const fb = identiconFor(key);
          if (img.src !== fb) img.src = fb;
        },
        { once: true },
      );
    },
  },
  isHttpOrHttpsUrl,
  storyTileUsesYukkuriTvStyle,
};

/** タイルを押したときに出す人を引くための表(userKey → 人) */
/** @type {Map<string, any>} */
const laneUserByKey = new Map();

/**
 * @param {any} u
 * @param {'link'|'gift'|'member'|'konta'|'tanu'} tier
 */
function laneItemOf(u, tier) {
  const key = ytRankUserKey(u.channelId, u.name);
  const name = String(u.name || u.channelId || 'リスナー').trim();
  const iconOk = /^https:\/\//i.test(String(u.iconUrl || ''));
  const shortId = (() => {
    const raw = String(u.channelId || '').replace(/^handle:/, '');
    return raw.length > 12 ? `${raw.slice(0, 12)}…` : raw;
  })();
  let nameLine = name;
  if (tier === 'gift' && u.primaryFormattedAmount) nameLine = `${name} ${u.primaryFormattedAmount}`;
  return {
    displaySrc: iconOk ? String(u.iconUrl) : identiconFor(key || name),
    title: name,
    meta: { idLine: shortId, nameLine },
    entry: { userId: key },
    stats: { commentCount: Number(u.commentCount || 0) },
  };
}

/**
 * 4. 「アイコン列・グリッド・診断を表示」のユーザーレーン(ニコ生版の描画 paintStoryUserLaneDomFilled をそのまま使う)。
 * YouTube の段: りんく / ギフト列=スーパーチャット / 広告列の位置=メンバー / こん太 / たぬ姉。
 * @param {any} ranking
 * @param {number} total
 */
export function paintStoryUserLanes(ranking, total) {
  const stack = $('sceneStoryUserLaneStack');
  if (!stack) return;
  const commenters = Array.isArray(ranking?.commenters) ? ranking.commenters : [];
  const built = buildYtUserLaneTiers(commenters, { limitPerTier: STORY_USERLANE_LIMIT });
  laneUserByKey.clear();
  for (const c of commenters) laneUserByKey.set(ytRankUserKey(c.channelId, c.name), c);
  const buckets = {
    link: built.tiers.link.map((u) => laneItemOf(u, 'link')),
    gift: built.tiers.gift.map((u) => laneItemOf(u, 'gift')),
    ad: built.tiers.member.map((u) => laneItemOf(u, 'member')),
    konta: built.tiers.konta.map((u) => laneItemOf(u, 'konta')),
    tanu: built.tiers.tanu.map((u) => laneItemOf(u, 'tanu')),
  };
  const els = {
    stack,
    laneLink: $('sceneStoryUserLaneLink'),
    laneGift: $('sceneStoryUserLaneGift'),
    laneAd: $('sceneStoryUserLaneAd'),
    laneKonta: $('sceneStoryUserLaneKonta'),
    laneTanu: $('sceneStoryUserLaneTanu'),
    hintLink: $('sceneStoryUserLaneLinkHint'),
    linkWrap: $('sceneStoryUserLaneLinkWrap'),
    giftWrap: $('sceneStoryUserLaneGiftWrap'),
    adWrap: $('sceneStoryUserLaneAdWrap'),
    guideTop: null,
    guideLinesTop: null,
    guideMidGift: null,
    guideLinesMidGift: null,
    guideMidAd: null,
    guideLinesMidAd: null,
    guideMidKonta: null,
    guideLinesMidKonta: null,
    guideMidTanu: null,
    guideLinesMidTanu: null,
    guideBottom: null,
    guideLinesBottom: null,
  };
  if (!els.laneLink || !els.laneGift || !els.laneKonta || !els.laneTanu) return;
  // 案内はニコ生版の言葉(数値ユーザーID 等)なので描かせず、同じ形で YouTube の言葉を入れる。
  paintStoryUserLaneDomFilled(
    els,
    { faceLink: IMG.linkFace, faceGift: IMG.linkSmile, faceKonta: IMG.kontaFace, faceTanu: IMG.tanuFace },
    buckets,
    built.displayed,
    laneIo,
    { guides: false, recordedCommentRowsTotal: total, totalCandidates: built.total },
  );
  const hasAny = built.total > 0;
  if (els.hintLink) els.hintLink.hidden = !(buckets.link.length === 0 && hasAny);
  if (els.linkWrap) els.linkWrap.hidden = !(buckets.link.length > 0 || (els.hintLink && !els.hintLink.hidden));
  if (els.giftWrap) els.giftWrap.hidden = buckets.gift.length === 0;
  setGuide('sceneStoryUserLaneGuideTop', 'sceneStoryUserLaneGuideLinesTop', hasAny ? guideLineHtml(LANE_GUIDE.top[0], LANE_GUIDE.top[1], buckets.link.length) : '');
  setGuide(
    'sceneStoryUserLaneGuideMidGift',
    'sceneStoryUserLaneGuideLinesMidGift',
    buckets.gift.length ? guideLineHtml(LANE_GUIDE.gift[0], LANE_GUIDE.gift[1], buckets.gift.length) : '',
  );
  setGuide(
    'sceneStoryUserLaneGuideMidAd',
    'sceneStoryUserLaneGuideLinesMidAd',
    buckets.ad.length ? guideLineHtml(LANE_GUIDE.ad[0], LANE_GUIDE.ad[1], buckets.ad.length) : '',
  );
  setGuide(
    'sceneStoryUserLaneGuideMidKonta',
    'sceneStoryUserLaneGuideLinesMidKonta',
    hasAny ? guideLineHtml(LANE_GUIDE.konta[0], LANE_GUIDE.konta[1], buckets.konta.length) : '',
  );
  setGuide(
    'sceneStoryUserLaneGuideMidTanu',
    'sceneStoryUserLaneGuideLinesMidTanu',
    hasAny ? guideLineHtml(LANE_GUIDE.tanu[0], LANE_GUIDE.tanu[1], buckets.tanu.length) : '',
  );
  const others = built.total - built.displayed;
  setGuide(
    'sceneStoryUserLaneGuideBottom',
    'sceneStoryUserLaneGuideLinesBottom',
    hasAny
      ? `<p class="nl-story-userlane-guide__foot" aria-live="polite">${escapeHtml(
          others > 0
            ? `いま ${built.displayed} 件を表示中（ほか ${others}人・直近アクティブ順）`
            : `いま ${built.displayed} 件を表示中`,
        )}</p>` +
          `<p class="nl-story-userlane-guide__foot">${escapeHtml(`記録 ${formatNumberJa(total)} 件・💬はこのPCに記録した件数`)}</p>`
      : '',
  );
  if (!hasAny) stack.hidden = true;
}

/**
 * タイルを押したら、その人の詳細を出す(Ctrl/⌘/中クリックはリンク本来の動き)。
 * @param {(user: any) => void} onPick
 */
export function bindStoryUserLaneClicks(onPick) {
  const stack = $('sceneStoryUserLaneStack');
  if (!stack || stack.dataset.ytClickBound === '1') return;
  stack.dataset.ytClickBound = '1';
  stack.addEventListener('click', (ev) => {
    const e = /** @type {MouseEvent} */ (ev);
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    const target = /** @type {HTMLElement|null} */ (e.target instanceof HTMLElement ? e.target : null);
    const cell = target?.closest('.nl-story-userlane-cell');
    if (!(cell instanceof HTMLElement)) return;
    const key = String(cell.getAttribute('data-user-key') || '').replace(/^u:/, '');
    const user = laneUserByKey.get(key);
    if (!user) return;
    e.preventDefault();
    onPick(user);
  });
}

/** 室温(直近5分の応援増加)用の記録 */
/** @type {{ at: number, key: string }[]} */
let recentActivity = [];

/**
 * @param {any[]} records
 * @param {boolean} reset
 */
export function pushRecentActivity(records, reset) {
  if (reset) recentActivity = [];
  for (const r of Array.isArray(records) ? records : []) {
    const at = Number(r?.recordedAt || 0);
    if (at > 0) recentActivity.push({ at, key: ytRankUserKey(r.channelId, r.name) || 'unknown' });
  }
  const latest = recentActivity.reduce((m, x) => Math.max(m, x.at), 0);
  const threshold = latest - ROOM_HEAT_WINDOW_MS;
  recentActivity = recentActivity.filter((x) => x.at >= threshold);
}

/**
 * 5. 「応援 N コメント」・最新コメントのティッカー・直近5分の応援増加・りんくのひとこと。
 * @param {number} total
 * @param {any} latest いちばん新しい記録
 */
export function paintStoryHeader(total, latest) {
  const countEl = $('count');
  if (countEl) {
    const t = total > 0 ? formatNumberJa(total) : '-';
    if (countEl.textContent !== t) countEl.textContent = t;
    countEl.classList.toggle('is-placeholder', total <= 0);
  }

  const segA = $('commentTickerSegA');
  const viewport = $('commentTickerViewport');
  if (segA && latest) {
    const name = String(latest.name || latest.channelId || 'リスナー');
    const text =
      String(latest.text || '') ||
      (latest.kind === 'membership' ? '（メンバー加入）' : latest.kind === 'membership_gift' ? '（メンバーシップギフト）' : '');
    const sig = `${latest.pk || ''}|${latest.recordedAt || ''}|${text}`;
    if (segA.dataset.ytSig !== sig) {
      segA.dataset.ytSig = sig;
      const key = ytRankUserKey(latest.channelId, latest.name);
      segA.innerHTML = buildCommentTickerLatestHtml({
        label: name,
        avatarSrc: /^https:\/\//i.test(String(latest.iconUrl || '')) ? String(latest.iconUrl) : identiconFor(key || name),
        textShown: text,
        userPageHref: channelHrefOf(latest),
      });
      segA.setAttribute('data-yt-user-key', key);
      bindImageFallbacks(segA);
    }
    if (viewport) viewport.classList.remove('is-empty');
  }

  // 直近5分の応援増加(ニコ生版 renderRoomHeatSummary と同じ計算・同じ言葉)
  const users = new Set(recentActivity.map((x) => x.key));
  const recent = recentActivity.length;
  const heatPercent = recent > 0 ? Math.min(100, Math.log10(recent + 1) * 38) : 0;
  const heatText =
    recent >= 50 ? '増加がとても大きい' : recent >= 20 ? '増加が大きい' : recent >= 5 ? '増加あり' : '増加は少なめ';
  setText('roomHeatMeta', `直近5分 +${recent}件 / ${users.size}人`);
  const fill = $('roomHeatFill');
  if (fill) fill.style.width = `${heatPercent.toFixed(2)}%`;
  setText('roomHeatNote', `${heatText}（この5分で増えた件数）`);

  const lead =
    total <= 0
      ? 'りんくがみんなの応援コメントを集めているよ！'
      : recent >= 20
        ? 'いま応援がどんどん増えているよ！'
        : recent > 0
          ? 'みんなの応援コメントが届いているよ！'
          : 'りんくがみんなの応援コメントを集めているよ！';
  setText('sceneStoryLead', lead);
  setText(
    'sceneStorySub',
    total > 0 ? `この配信で ${formatNumberJa(total)} 件の応援を記録したよ。` : '応援コメントの増え方をここで見守るよ。',
  );
  const img = /** @type {HTMLImageElement|null} */ ($('sceneStoryImg'));
  const want = recent > 0 ? IMG.linkSmile : IMG.linkHalf;
  if (img && img.getAttribute('src') !== want) img.setAttribute('src', want);
}

/** パフォーマンス計測用(実機の確認で使う) */
export function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

if (typeof window !== 'undefined') {
  /** @type {any} */ (window).__ytNicoView = { identiconFor };
}
