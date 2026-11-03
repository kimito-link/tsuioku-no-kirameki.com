// ytChatParse.js — YouTube Live チャット DOM 1要素の取得・正規化パーサー（純関数）
// @layer L0 — 純粋計算（ブラウザ グローバル API 直接参照禁止。渡された要素オブジェクトのみ読む）

import { safeHttpUrl } from '../htmlText.js';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const CURRENCY_PREFIX_MAP = [
  ['NT$', 'TWD'],
  ['HK$', 'HKD'],
  ['CA$', 'CAD'],
  ['A$', 'AUD'],
  ['NZ$', 'NZD'],
  ['MX$', 'MXN'],
  ['US$', 'USD'],
  ['R$', 'BRL'],
  ['S$', 'SGD'],
  ['￥', 'JPY'],
  ['¥', 'JPY'],
  ['$', 'USD'],
  ['₩', 'KRW'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['₹', 'INR'],
  ['₱', 'PHP'],
  ['₫', 'VND'],
  ['฿', 'THB'],
];

/**
 * 純粋 JavaScript による Base64 デコード（ASCII バイナリ文字列を返す）。
 * @param {string} input
 * @returns {string}
 */
function decodeBase64Ascii(input) {
  const clean = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return '';

  let out = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '=') break;
    const val = BASE64_CHARS.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

/**
 * YouTube チャット要素の `whole-message-clickable` に埋め込まれた
 * `liveChatItemContextMenuEndpoint.params` から投稿者のチャンネル ID (`UC...`) を抽出する。
 *
 * 実ページ（2026年時点の ShadyDOM）では `params` を Base64 デコードすると
 * URL エンコードされた内部 Base64 文字列になり、さらにデコードした protobuf 内に
 * 配信者チャンネルID（先頭）と投稿者チャンネルID（末尾）が含まれる。
 *
 * @param {string} params
 * @returns {string}
 */
export function extractChannelIdFromContextMenuParams(params) {
  if (!params || typeof params !== 'string') return '';
  try {
    const step1 = decodeBase64Ascii(params.trim());
    if (!step1) return '';

    let candidates = step1.match(/UC[A-Za-z0-9_-]{22}/g) || [];
    let decodedUri = step1;
    try {
      decodedUri = decodeURIComponent(step1);
    } catch {
      decodedUri = step1;
    }
    const step2 = decodeBase64Ascii(decodedUri);
    if (step2) {
      const innerMatches = step2.match(/UC[A-Za-z0-9_-]{22}/g);
      if (innerMatches && innerMatches.length > 0) {
        candidates = innerMatches;
      }
    }
    if (candidates.length === 0) return '';
    return candidates[candidates.length - 1];
  } catch {
    return '';
  }
}

/**
 * スパチャ・ステッカーの金額表記（例: `￥500`, `$10.00`, `NT$150.00`, `SGD 20.00`）を
 * 数値と通貨コードに分解する。通貨換算は行わない。
 *
 * @param {string} raw
 * @returns {{ amount: number, currency: string }}
 */
export function parsePurchaseAmount(raw) {
  const s = String(raw || '').replace(/\u00a0/g, ' ').trim();
  if (!s) return { amount: 0, currency: '' };

  let currency = '';
  let rest = s;

  // 1) ISO 3文字通貨コード先頭（例: "SGD 20.00", "CHF 10.00", "JPY 500"）
  const isoMatch = rest.match(/^([A-Z]{3})\s*([0-9.,]+)$/);
  if (isoMatch) {
    currency = isoMatch[1];
    rest = isoMatch[2];
  } else {
    // 2) 通貨記号プレフィックス
    for (const [symbol, code] of CURRENCY_PREFIX_MAP) {
      if (rest.startsWith(symbol)) {
        currency = code;
        rest = rest.slice(symbol.length).trim();
        break;
      }
    }
  }

  if (!currency) return { amount: 0, currency: '' };

  const numStr = rest.replace(/,/g, '').trim();
  const amount = Number.parseFloat(numStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: 0, currency: '' };
  }
  return { amount, currency };
}

/**
 * DOM ノードからテキストと絵文字 `<img alt="...">` を安全に連結して取り出す。
 * @param {any} root
 * @returns {string}
 */
function extractMessageTextWithEmoji(root) {
  if (!root) return '';
  let out = '';

  /** @param {any} node */
  const walk = (node) => {
    if (!node) return;
    const nodeType = node.nodeType;
    if (nodeType === 3) {
      out += node.nodeValue || '';
      return;
    }
    if (nodeType === 1) {
      const tag = String(node.tagName || '').toLowerCase();
      if (tag === 'img') {
        const alt =
          (typeof node.getAttribute === 'function' &&
            (node.getAttribute('alt') || node.getAttribute('shared-tooltip-text'))) ||
          '';
        out += alt;
        return;
      }
      const children = node.childNodes;
      if (children && typeof children.length === 'number') {
        for (let i = 0; i < children.length; i += 1) {
          walk(children[i]);
        }
      }
    }
  };

  walk(root);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 要素から投稿者バッジ一覧（`owner` / `moderator` / `member` / `verified`）を抽出する。
 * @param {any} el
 * @returns {string[]}
 */
function extractBadges(el) {
  const badgeSet = new Set();
  const authorType = String(el.getAttribute?.('author-type') || '').trim().toLowerCase();
  if (authorType === 'owner' || authorType === 'moderator' || authorType === 'member') {
    badgeSet.add(authorType);
  }

  const badgeEls = el.querySelectorAll?.('yt-live-chat-author-badge-renderer') || [];
  for (let i = 0; i < badgeEls.length; i += 1) {
    const b = badgeEls[i];
    const t = String(b.getAttribute?.('type') || '').trim().toLowerCase();
    if (t) badgeSet.add(t);
  }
  return Array.from(badgeSet);
}

/**
 * 要素から投稿者アイコン画像の URL を抽出する。
 * `yt-gift-message-view-model` 等の新旧コンポーネント構造に対応し、
 * ギフト箱イラスト（`#gift-image`）やバッジ画像・絵文字は除外する。
 *
 * @param {any} el
 * @returns {string}
 */
export function extractAuthorIconUrl(el) {
  if (!el || typeof el.querySelectorAll !== 'function') return '';

  /** @param {any} raw */
  const normalizeCandidateUrl = (raw) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const withProtocol = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    return safeHttpUrl(withProtocol);
  };

  // 1) 投稿者アイコン専用コンテナを優先探索
  const prioritySelectors = [
    '#author-photo img',
    'yt-img-shadow#author-photo img',
    '#avatar img',
    'yt-avatar-shape img',
    '.yt-spec-avatar-shape img',
    'img.yt-spec-avatar-shape__image',
  ];
  for (const sel of prioritySelectors) {
    const imgs = el.querySelectorAll(sel) || [];
    for (let i = 0; i < imgs.length; i += 1) {
      const img = imgs[i];
      const rawSrc =
        img?.getAttribute?.('src') || (typeof img?.src === 'string' ? img.src : '');
      const valid = normalizeCandidateUrl(rawSrc);
      if (valid) return valid;
    }
  }

  // 2) フォールバック: 要素内の img からギフト絵柄・絵文字・バッジ・通貨アイコンを除いて探索
  const allImgs = el.querySelectorAll('#img, yt-img-shadow img, img') || [];
  for (let i = 0; i < allImgs.length; i += 1) {
    const img = allImgs[i];
    if (!img) continue;
    if (
      typeof img.closest === 'function' &&
      img.closest(
        '#gift-image, #sticker, #sticker-bumper, #currency-img, #chat-badges, #chip-badges, #prepend-chat-badges, yt-live-chat-author-badge-renderer, #message, #message-v2',
      )
    ) {
      continue;
    }
    const cls = String(img.getAttribute?.('class') || '');
    if (cls.includes('emoji')) continue;

    const rawSrc =
      img.getAttribute?.('src') || (typeof img.src === 'string' ? img.src : '');
    const valid = normalizeCandidateUrl(rawSrc);
    if (!valid) continue;
    if (valid.includes('/youtube/img/pdg/gift/') || valid.includes('/notoemoji/')) {
      continue;
    }
    return valid;
  }

  return '';
}

/** 同時視聴としてあり得る上限(これを超える数は読み違いとして捨てる) */
const YT_MAX_PLAUSIBLE_VIEWERS = 50_000_000;

/**
 * YouTube 視聴ページ（`/watch`）の視聴人数テキスト（例: `"1,234 人が視聴中"`, `"1.2万 人が視聴中"`, `"3,456 watching now"`）から
 * 同時接続数（整数）を抽出する。該当しない文字列や異常値の場合は `null` を返す（AGENTS.md §3.6 fail-soft）。
 *
 * @param {string} rawText
 * @returns {number | null}
 */
export function extractYtWatchConcurrentViewersFromText(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return null;
  const normalized = rawText
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/．/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

  // 数字は「3桁区切り」か「9桁まで」だけ(長い数字の連なりを1つの数と読み違えない・2026-11-03 実機で 12,345,678,901,234… と出た)
  const NUM = '(?<![0-9,.])((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,9})(?:\\.[0-9]+)?)';
  const jaMatch = normalized.match(new RegExp(`${NUM}\\s*(万|億)?\\s*人(?:が)?\\s*視聴中`));
  if (jaMatch) {
    const base = Number.parseFloat(jaMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(base) || base < 0) return null;
    const unit = jaMatch[2] || '';
    const mult = unit === '億' ? 100_000_000 : unit === '万' ? 10_000 : 1;
    const v = Math.round(base * mult);
    return v <= YT_MAX_PLAUSIBLE_VIEWERS ? v : null;
  }

  const enMatch = normalized.match(new RegExp(`${NUM}\\s*([KkMm])?\\s*watching(?:\\s+now)?\\b`, 'i'));
  if (enMatch) {
    const base = Number.parseFloat(enMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(base) || base < 0) return null;
    const unit = (enMatch[2] || '').toUpperCase();
    const mult = unit === 'M' ? 1_000_000 : unit === 'K' ? 1_000 : 1;
    const v = Math.round(base * mult);
    return v <= YT_MAX_PLAUSIBLE_VIEWERS ? v : null;
  }

  return null;
}

/**
 * @param {any} el
 * @param {string} name
 * @returns {string}
 */
function extractChannelId(el, name) {
  const direct =
    el.getAttribute?.('data-author-external-channel-id') ||
    el.getAttribute?.('author-external-channel-id') ||
    '';
  if (direct && direct.trim()) return direct.trim();

  const clickableRaw = el.getAttribute?.('whole-message-clickable') || '';
  if (clickableRaw) {
    try {
      const parsed = JSON.parse(clickableRaw);
      const params = parsed?.liveChatItemContextMenuEndpoint?.params || '';
      const fromParams = extractChannelIdFromContextMenuParams(params);
      if (fromParams) return fromParams;
    } catch {
      // JSON パース失敗時はフォールバックへ進む
    }
  }

  const linkEl = el.querySelector?.('a[href*="/channel/UC"]');
  const href = linkEl?.getAttribute?.('href') || '';
  const m = href.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (m) return m[1];

  if (name) {
    return `handle:${name}`;
  }
  return '';
}

/**
 * YouTube Live チャット DOM の 1 要素を正規化オブジェクトへ変換する。
 * 未対応のシステム要素や壊れた要素の場合は例外を投げずに `null` を返す（AGENTS.md §3.6 fail-soft）。
 *
 * @param {any} el
 * @returns {{
 *   id: string,
 *   channelId: string,
 *   name: string,
 *   iconUrl: string,
 *   text: string,
 *   kind: 'text' | 'superchat' | 'sticker' | 'membership' | 'membership_gift',
 *   amount: number,
 *   currency: string,
 *   badges: string[],
 *   ts: string
 * } | null}
 */
export function parseYtChatElement(el) {
  try {
    if (!el || typeof el.tagName !== 'string') return null;
    const tag = el.tagName.toLowerCase();

    /** @type {'text' | 'superchat' | 'sticker' | 'membership' | 'membership_gift' | ''} */
    let kind = '';
    if (tag === 'yt-live-chat-text-message-renderer') {
      kind = 'text';
    } else if (tag === 'yt-live-chat-paid-message-renderer') {
      kind = 'superchat';
    } else if (tag === 'yt-live-chat-paid-sticker-renderer') {
      kind = 'sticker';
    } else if (tag === 'yt-live-chat-membership-item-renderer') {
      kind = 'membership';
    } else if (
      tag === 'ytd-sponsorships-live-chat-gift-purchase-announcement-renderer' ||
      tag === 'yt-live-chat-sponsorships-gift-purchase-announcement-renderer' ||
      tag === 'yt-gift-message-view-model'
    ) {
      kind = 'membership_gift';
    } else {
      return null;
    }

    const rawId = String(el.getAttribute?.('id') || '').trim();

    const authorEl = el.querySelector?.('#author-name, #author-name-v2');
    const name = String(authorEl?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!rawId && !name) return null;

    const channelId = extractChannelId(el, name);

    const iconUrl = extractAuthorIconUrl(el);

    const badges = extractBadges(el);

    let text = '';
    const msgEl = el.querySelector?.('#message, #message-v2');
    if (msgEl) {
      text = extractMessageTextWithEmoji(msgEl);
    }

    if (!text && kind === 'membership') {
      const subEl = el.querySelector?.('#header-subtext, #header-primary-text');
      text = extractMessageTextWithEmoji(subEl);
    } else if (!text && kind === 'membership_gift') {
      const giftEl = el.querySelector?.('#primary-text, #header-primary-text');
      text = extractMessageTextWithEmoji(giftEl);
    } else if (!text && kind === 'sticker') {
      const stickerImg = el.querySelector?.('#sticker img, #sticker-bumper img');
      const alt = String(stickerImg?.getAttribute?.('alt') || '').trim();
      text = alt || 'スーパーステッカー';
    }

    let amount = 0;
    let currency = '';
    if (kind === 'superchat' || kind === 'sticker') {
      const amountEl = el.querySelector?.('#purchase-amount, #purchase-amount-chip');
      const parsedAmount = parsePurchaseAmount(amountEl?.textContent || '');
      amount = parsedAmount.amount;
      currency = parsedAmount.currency;
    }

    // 名前もテキストも金額も取れない空要素は破棄する
    if (!name && !text && amount <= 0) {
      return null;
    }

    const tsEl = el.querySelector?.('#timestamp');
    const ts = String(tsEl?.textContent || '').replace(/\s+/g, ' ').trim();
    const id = rawId || `${kind}:${channelId || name}:${ts || text.slice(0, 32)}`;

    return {
      id,
      channelId,
      name,
      iconUrl,
      text,
      kind,
      amount,
      currency,
      badges,
      ts,
    };
  } catch {
    return null;
  }
}
