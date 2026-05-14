/**
 * www.nicovideo.jp/user/<id> のプロフィールページに表示されている
 * ユーザーID・表示名・アイコンを、コメント表示名補完用のローカルキャッシュへ
 * 渡せる形に抽出する。
 */

import { isAvatarUrlForUserId } from './avatarBroadcasterGuard.js';

/**
 * @param {unknown} value
 * @returns {string}
 */
function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @param {string} userId
 * @returns {string}
 */
function cleanNicknameCandidate(text, userId) {
  let s = cleanText(text);
  if (!s) return '';
  s = s.replace(new RegExp(`\\bID\\s*[:：]?\\s*${userId}\\b`, 'i'), '').trim();
  s = s.replace(/\b(?:フォロー中|フォロー|フォロワー|プレミアム会員)\b.*$/i, '').trim();
  s = s.replace(/\s*[|｜\-–—]\s*(?:ニコニコ|niconico).*$/i, '').trim();
  s = s.replace(/\s*[×✕xX]\s*$/, '').trim();
  if (!s || s === userId) return '';
  if (/^(?:ニコニコ|niconico|プロフィール|ユーザー|user)$/i.test(s)) return '';
  if (s.length > 80) return '';
  return s;
}

/**
 * @param {Document} doc
 * @param {string} userId
 * @returns {string}
 */
function pickProfileNickname(doc, userId) {
  const selectors = [
    'main h1',
    'h1',
    '[class*="UserPage"] h1',
    '[class*="Profile"] h1',
    '[data-testid*="user" i] h1',
    'meta[property="og:title"]',
    'meta[name="twitter:title"]'
  ];

  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const raw =
      el instanceof HTMLMetaElement
        ? el.getAttribute('content')
        : el.textContent;
    const nick = cleanNicknameCandidate(raw || '', userId);
    if (nick) return nick;
  }

  const title = cleanNicknameCandidate(doc.title || '', userId);
  return title;
}

/**
 * @param {string} value
 * @param {string} baseUrl
 * @returns {string}
 */
function toAbsoluteUrl(value, baseUrl) {
  const s = String(value || '').trim();
  if (!s) return '';
  try {
    return new URL(s, baseUrl || 'https://www.nicovideo.jp/').href;
  } catch {
    return '';
  }
}

/**
 * @param {HTMLImageElement} img
 * @returns {string[]}
 */
function imageUrlCandidates(img) {
  const attrs = [
    'src',
    'data-src',
    'data-original',
    'data-lazy-src',
    'data-nico-lazy-src',
    'srcset'
  ];
  const out = [];
  for (const attr of attrs) {
    const raw = img.getAttribute(attr);
    if (!raw) continue;
    if (attr === 'srcset') {
      out.push(...raw.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean));
    } else {
      out.push(raw);
    }
  }
  return out;
}

/**
 * @param {Document} doc
 * @param {string} userId
 * @param {string} pageUrl
 * @returns {string}
 */
function pickProfileAvatarUrl(doc, userId, pageUrl) {
  const metaImage =
    doc.querySelector('meta[property="og:image"]') ||
    doc.querySelector('meta[name="twitter:image"]');
  const first = metaImage instanceof HTMLMetaElement
    ? toAbsoluteUrl(metaImage.getAttribute('content') || '', pageUrl)
    : '';
  if (first && isAvatarUrlForUserId(first, userId)) return first;

  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (!(img instanceof HTMLImageElement)) continue;
    for (const raw of imageUrlCandidates(img)) {
      const url = toAbsoluteUrl(raw, pageUrl);
      if (url && isAvatarUrlForUserId(url, userId)) return url;
    }
  }
  return '';
}

/**
 * @param {string} pageUrl
 * @returns {string}
 */
export function extractNicoUserIdFromProfileUrl(pageUrl) {
  try {
    const url = new URL(String(pageUrl || ''));
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'nicovideo.jp' && !hostname.endsWith('.nicovideo.jp')) {
      return '';
    }
    const m = url.pathname.match(/^\/user\/(\d{5,14})(?:\/|$)/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/**
 * @param {Document} doc
 * @param {string} pageUrl
 * @returns {{ userId: string, nickname: string, avatarUrl: string } | null}
 */
export function extractNicoUserProfilePageProfile(doc, pageUrl) {
  const userId = extractNicoUserIdFromProfileUrl(pageUrl);
  if (!userId || !doc) return null;
  const nickname = pickProfileNickname(doc, userId);
  const avatarUrl = pickProfileAvatarUrl(doc, userId, pageUrl);
  if (!nickname && !avatarUrl) return null;
  return { userId, nickname, avatarUrl };
}
