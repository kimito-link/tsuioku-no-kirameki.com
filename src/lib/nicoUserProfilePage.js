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

/**
 * ページに埋め込まれた JSON（meta[name=server-response] / data-* / script）を 1 つだけ拾って parse。
 * 失敗時は null。巨大文字列は無視（安全側）。
 *
 * @param {Document} doc
 * @returns {unknown}
 */
function readEmbeddedUserPageJson(doc) {
  /** @type {string[]} */
  const candidates = [];
  const metaSr = doc.querySelector('meta[name="server-response"]');
  if (metaSr instanceof HTMLMetaElement) {
    const c = metaSr.getAttribute('content');
    if (c) candidates.push(c);
  }
  for (const el of Array.from(doc.querySelectorAll('[data-initial-data],[data-props]'))) {
    const c =
      el.getAttribute('data-initial-data') || el.getAttribute('data-props') || '';
    if (c) candidates.push(c);
  }
  for (const raw of candidates) {
    if (typeof raw !== 'string' || raw.length > 2_000_000) continue;
    try {
      return JSON.parse(raw);
    } catch {
      // ignore and try next
    }
  }
  return null;
}

/**
 * オブジェクト/配列を幅優先で辿り、指定キーに最初にマッチした値を返す（型述語で確定）。
 * ノード数に上限を設け、循環/巨大データでも安全に止まる。
 *
 * @param {unknown} root
 * @param {(key: string) => boolean} keyMatch
 * @param {(value: unknown) => boolean} valueOk
 * @returns {unknown}
 */
function findValueByKey(root, keyMatch, valueOk) {
  if (!root || typeof root !== 'object') return undefined;
  /** @type {unknown[]} */
  const queue = [root];
  let visited = 0;
  while (queue.length && visited < 8000) {
    const node = queue.shift();
    visited += 1;
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const v of node) if (v && typeof v === 'object') queue.push(v);
      continue;
    }
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (node))) {
      if (keyMatch(k) && valueOk(v)) return v;
      if (v && typeof v === 'object') queue.push(v);
    }
  }
  return undefined;
}

/** @param {unknown} v @returns {number|null} */
function asPosInt(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/**
 * www.nicovideo.jp/user/<id> から、プロフィール詳細（LV・プレミアム・フォロー/フォロワー・
 * 配信開始日・累計配信日数・欲しいものリスト・放送リクエスト）を best-effort 抽出。
 * 取れた項目だけを持つオブジェクトを返す（無ければ空オブジェクト）。
 *
 * @param {Document} doc
 * @returns {{
 *   level?: number,
 *   isPremium?: boolean,
 *   followeeCount?: number,
 *   followerCount?: number,
 *   broadcastStartDate?: string,
 *   cumulativeBroadcastDays?: number,
 *   wishlistUrl?: string,
 *   broadcastRequestEnabled?: boolean
 * }}
 */
export function extractNicoUserBroadcastStats(doc) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (!doc) return out;

  // 1) 埋め込み JSON 由来（最も信頼できる）。
  const json = readEmbeddedUserPageJson(doc);
  if (json && typeof json === 'object') {
    const lvl = asPosInt(
      findValueByKey(
        json,
        (k) => /^(?:currentLevel|niconicoLevel|userLevel|level)$/i.test(k),
        (v) => asPosInt(v) != null
      )
    );
    if (lvl != null) out.level = lvl;

    const prem = findValueByKey(
      json,
      (k) => /^(?:isPremium|premium)$/i.test(k),
      (v) => v === true || v === false
    );
    if (prem === true || prem === false) out.isPremium = prem;

    const followee = asPosInt(
      findValueByKey(
        json,
        (k) => /^(?:followeeCount|followingCount)$/i.test(k),
        (v) => asPosInt(v) != null
      )
    );
    if (followee != null) out.followeeCount = followee;

    const follower = asPosInt(
      findValueByKey(
        json,
        (k) => /^followerCount$/i.test(k),
        (v) => asPosInt(v) != null
      )
    );
    if (follower != null) out.followerCount = follower;
  }

  // 2) DOM テキストのフォールバック（JSON で取れなかった項目のみ補う）。
  const bodyText = cleanText(doc.body ? doc.body.textContent || '' : '');
  if (out.level == null) {
    const m = bodyText.match(/(?:Lv\.?|レベル)\s*(\d{1,4})/i);
    if (m) {
      const n = asPosInt(m[1]);
      if (n != null) out.level = n;
    }
  }
  if (out.isPremium == null && /プレミアム会員/.test(bodyText)) {
    out.isPremium = true;
  }
  if (out.followerCount == null) {
    const m = bodyText.match(/フォロワー\s*([\d,]+)/);
    if (m) {
      const n = asPosInt(m[1].replace(/,/g, ''));
      if (n != null) out.followerCount = n;
    }
  }
  if (out.followeeCount == null) {
    const m = bodyText.match(/フォロー中\s*([\d,]+)/);
    if (m) {
      const n = asPosInt(m[1].replace(/,/g, ''));
      if (n != null) out.followeeCount = n;
    }
  }
  {
    const m = bodyText.match(/(?:累計)?配信日数\s*([\d,]+)\s*日/);
    if (m) {
      const n = asPosInt(m[1].replace(/,/g, ''));
      if (n != null) out.cumulativeBroadcastDays = n;
    }
  }
  {
    const m = bodyText.match(/配信開始日?\s*[:：]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
    if (m) out.broadcastStartDate = m[1].replace(/-/g, '/');
  }
  if (/放送リクエスト/.test(bodyText)) {
    out.broadcastRequestEnabled = true;
  }

  // 3) 欲しいものリスト（Amazon wishlist 等）のアンカー。
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = String(a.getAttribute('href') || '').trim();
    if (!/^https?:\/\//i.test(href)) continue;
    if (/amazon\.[a-z.]+\/.*(?:wishlist|hz\/wishlist|registry)/i.test(href) || /amzn\.(?:to|asia)\//i.test(href)) {
      out.wishlistUrl = href;
      break;
    }
    const label = cleanText(a.textContent || '');
    if (/(?:欲し|ほし)い?もの?リスト|ウィッシュリスト|wishlist/i.test(label)) {
      out.wishlistUrl = href;
      break;
    }
  }

  return out;
}
