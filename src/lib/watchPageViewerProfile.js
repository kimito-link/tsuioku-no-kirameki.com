/**
 * watch ページのサイトヘッダー付近からログイン中ユーザーのアイコン・表示名を推定
 */

import { absoluteNicoUserIconFromImg } from './nicoliveDom.js';

/** ヘッダー帯より下はコメント欄アイコンと誤認しやすいので上限 */
const HEADER_BAND_MAX_TOP = 220;

/**
 * @param {string} href
 * @returns {string}
 */
function extractNicoUserIdFromHref(href) {
  const m = String(href || '').match(/\/user\/(\d+)/);
  return m ? m[1] : '';
}

/**
 * アカウントメニュー等の `/user/数字` をスコア付けして1件に絞る
 * @param {Element[]} uniqueRoots
 * @returns {string}
 */
function pickViewerUserIdFromRoots(uniqueRoots) {
  /** @type {Map<string, number>} */
  const best = new Map();
  for (const root of uniqueRoots) {
    for (const a of root.querySelectorAll('a[href*="/user/"]')) {
      if (!(a instanceof HTMLAnchorElement)) continue;
      const uid = extractNicoUserIdFromHref(a.getAttribute('href') || '');
      if (!uid) continue;
      let score = 1;
      if (
        a.querySelector(
          'img[src*="nicoaccount"], img[src*="/usericon/"], img[src*="usericon"]'
        )
      ) {
        score += 4;
      }
      const hint = `${a.getAttribute('aria-label') || ''} ${a.textContent || ''}`;
      if (/アカウント|マイページ|プロフィール|ログイン|ユーザー/i.test(hint)) score += 2;
      if (/広場|フォロー|フォロワー|コミュニティ|チャンネル/i.test(hint)) score -= 2;
      best.set(uid, Math.max(best.get(uid) || 0, score));
    }
  }
  if (best.size === 0) return '';
  return [...best.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * @param {Document} doc
 * @param {string} baseHref location.href 相当
 * @returns {{ viewerAvatarUrl: string, viewerNickname: string, viewerUserId: string }}
 */
export function collectLoggedInViewerProfile(doc, baseHref) {
  const base = String(baseHref || '').trim() || 'https://live.nicovideo.jp/';
  /** @param {unknown} v */
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();

  /** @type {Element[]} */
  const roots = [];
  const h = doc.querySelector('header');
  if (h) roots.push(h);
  doc.querySelectorAll('[role="banner"]').forEach((el) => roots.push(el));
  const site = doc.querySelector(
    '[class*="SiteHeader" i], [class*="GlobalHeader" i], [class*="site-header" i], [class*="siteHeader" i], [class*="AccountMenu" i], [class*="account-menu" i], [class*="UserMenu" i]'
  );
  if (site && !roots.includes(site)) roots.push(site);

  const seen = new Set();
  const uniqueRoots = roots.filter((r) => {
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });

  let viewerAvatarUrl = '';

  for (const root of uniqueRoots) {
    const imgs = root.querySelectorAll('img');
    for (const img of imgs) {
      const u = absoluteNicoUserIconFromImg(
        /** @type {HTMLImageElement} */ (img),
        base
      );
      if (u) {
        viewerAvatarUrl = u;
        break;
      }
    }
    if (viewerAvatarUrl) break;
  }

  if (!viewerAvatarUrl) {
    const all = [...doc.querySelectorAll('img')];
    all.sort(
      (a, b) =>
        a.getBoundingClientRect().top - b.getBoundingClientRect().top
    );
    for (const img of all) {
      const rect = img.getBoundingClientRect();
      if (rect.top > HEADER_BAND_MAX_TOP) break;
      const u = absoluteNicoUserIconFromImg(
        /** @type {HTMLImageElement} */ (img),
        base
      );
      if (u) {
        viewerAvatarUrl = u;
        break;
      }
    }
  }

  let viewerNickname = '';

  for (const root of uniqueRoots) {
    const nodes = root.querySelectorAll('button[aria-label], a[href*="/user/"]');
    for (const b of nodes) {
      const al = clean(b.getAttribute('aria-label') || '');
      if (
        al &&
        al.length >= 2 &&
        al.length < 72 &&
        !/^(開く|メニュー|通知|検索|ログアウト|設定|menu|open)/i.test(al)
      ) {
        if (/^P\s*ポイント|^ポイント購入/i.test(al)) continue;
        viewerNickname = al;
        break;
      }
      if (b instanceof HTMLAnchorElement) {
        const href = String(b.getAttribute('href') || '');
        if (/\/user\/\d+/.test(href)) {
          const t = clean(b.textContent || '');
          if (t && t.length < 72 && !/^https?:\/\//i.test(t)) {
            viewerNickname = t;
            break;
          }
        }
      }
    }
    if (viewerNickname) break;
  }

  const viewerUserId = pickViewerUserIdFromRoots(uniqueRoots);

  return { viewerAvatarUrl, viewerNickname, viewerUserId };
}
