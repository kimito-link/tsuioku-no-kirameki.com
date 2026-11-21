/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】共有カード用の HTML(見出しと説明。画像バイトは作らない)
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】紅白の og:title / og:description はこのファイルのみ
 *
 * ogHtml.js — クローラー向け。公式ページへは取りに行かない。
 */

import { escapeHtml } from '../htmlText.js';
import { PUBLIC_SITE_URL } from './constants.js';

/**
 * @param {string} path
 * @returns {string}
 */
function absolute(path) {
  return `${PUBLIC_SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * @param {{
 *   path: string,
 *   title: string,
 *   description: string,
 *   imagePath: string
 * }} card
 * @returns {string}
 */
export function buildKouhakuOgHtml(card) {
  const pageUrl = absolute(card.path);
  const imageUrl = absolute(card.imagePath);
  const title = escapeHtml(card.title);
  const description = escapeHtml(card.description);
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="追憶のきらめき ランキング">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head>
<body>
<p>${title}</p>
<p>${description}</p>
<p><a href="${escapeHtml(pageUrl)}">紅白歌枠合戦2026 イベントpt応援ランキング</a></p>
</body>
</html>`;
}

/**
 * @param {{ officialUpdateLabel?: string }} board
 * @returns {{ path: string, title: string, description: string, imagePath: string }}
 */
export function boardOgCard(board) {
  const label = board && board.officialUpdateLabel ? board.officialUpdateLabel : '';
  return {
    path: '/live/kouhaku/',
    title: '紅白歌枠合戦2026 イベントpt応援ランキング',
    description: label
      ? `紅組と白組の公式順位です。最終の公式更新は${label}。公式は1日1回更新です。`
      : '紅組と白組の公式順位です。公式は1日1回更新です。',
    imagePath: '/api/kouhaku-og-image?kind=board'
  };
}

/**
 * @param {{
 *   entry: { teamLabel: string, rank: number, displayName: string, scoreLabel: string, gapLabel: string, deltaLabel: string, userId: string },
 *   officialUpdateLabel?: string
 * }} profile
 * @returns {{ path: string, title: string, description: string, imagePath: string }}
 */
export function profileOgCard(profile) {
  const entry = profile.entry;
  const label = profile.officialUpdateLabel ? `公式更新: ${profile.officialUpdateLabel}` : '公式は1日1回更新です';
  return {
    path: `/live/kouhaku/u/${entry.userId}/`,
    title: `${entry.displayName} ${entry.teamLabel} ${entry.rank}位`,
    description: `紅白歌枠合戦2026 ${entry.teamLabel} ${entry.rank}位。公式 ${entry.scoreLabel}。${entry.gapLabel}。${entry.deltaLabel}。${label}。公式は1日1回更新です。`,
    imagePath: `/api/kouhaku-og-image?user=${encodeURIComponent(entry.userId)}`
  };
}
