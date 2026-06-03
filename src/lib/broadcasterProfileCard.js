/**
 * 配信者プロフィールの「レポート用 正規化モデル」と HTML 断片ビルダー（純関数）。
 *
 * 役割:
 *   - watch スナップショット由来（名前・userId・アイコン・pageUrl・LV・開始表記）と、
 *     プロフィール取得由来（プレミアム・フォロー/フォロワー・配信開始日・累計配信日数・
 *     欲しいものリスト 等。Phase 2）を 1 つのモデルに正規化する。
 *   - マーケ分析（ダークテーマ）と HTML レポート（ライトテーマ）の両方が同じモデルから
 *     描画できるよう、2 つのビルダーを提供する。
 *   - 取得できたフィールドだけ表示する（無い項目は出さない＝誤情報ゼロ）。
 *
 * DOM/storage/ネットワークには触れない。
 */

import { escapeHtml, escapeAttr } from '../shared/html/escape.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   avatarUrl: string,
 *   pageUrl: string,
 *   startAtText: string,
 *   level: number|null,
 *   isPremium: boolean|null,
 *   followeeCount: number|null,
 *   followerCount: number|null,
 *   broadcastStartDate: string,
 *   cumulativeBroadcastDays: number|null,
 *   wishlistUrl: string,
 *   broadcastRequestEnabled: boolean|null
 * }} BroadcasterProfileModel
 */

/** @param {unknown} v @returns {string} */
function str(v) {
  return String(v == null ? '' : v).trim();
}

/** @param {unknown} v @returns {string} */
function httpUrl(v) {
  const s = str(v);
  return /^https?:\/\//i.test(s) ? s : '';
}

/** @param {unknown} v @returns {number|null} */
function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** @param {unknown} v @returns {boolean|null} */
function boolOrNull(v) {
  return v === true ? true : v === false ? false : null;
}

/**
 * 生オブジェクト（snapshot + profile 取得結果のマージ等）を正規化する。
 * 別名キーも吸収する。何も意味のある項目が無ければ null。
 *
 * @param {unknown} raw
 * @returns {BroadcasterProfileModel|null}
 */
export function normalizeBroadcasterProfileModel(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);

  const userId = str(o.userId ?? o.broadcasterUserId ?? o.id);
  const nickname = str(o.nickname ?? o.broadcasterName ?? o.name);
  const avatarUrl = httpUrl(o.avatarUrl ?? o.broadcasterIconUrl ?? o.iconUrl);
  const pageUrl = httpUrl(o.pageUrl ?? o.broadcasterPageUrl ?? o.userPageUrl);
  const startAtText = str(o.startAtText);
  const level = nonNegInt(o.level ?? o.broadcasterLevel ?? o.niconicoLevel ?? o.userLevel);
  const isPremium = boolOrNull(o.isPremium ?? o.premium);
  const followeeCount = nonNegInt(o.followeeCount ?? o.followingCount ?? o.followCount);
  const followerCount = nonNegInt(o.followerCount ?? o.followersCount);
  const broadcastStartDate = str(o.broadcastStartDate ?? o.broadcastStartedDate);
  const cumulativeBroadcastDays = nonNegInt(
    o.cumulativeBroadcastDays ?? o.totalBroadcastDays ?? o.broadcastDays
  );
  const wishlistUrl = httpUrl(o.wishlistUrl ?? o.wishlist);
  const broadcastRequestEnabled = boolOrNull(o.broadcastRequestEnabled ?? o.broadcastRequest);

  const model = {
    userId,
    nickname,
    avatarUrl,
    pageUrl,
    startAtText,
    level,
    isPremium,
    followeeCount,
    followerCount,
    broadcastStartDate,
    cumulativeBroadcastDays,
    wishlistUrl,
    broadcastRequestEnabled
  };

  const hasAnything =
    nickname ||
    userId ||
    avatarUrl ||
    pageUrl ||
    startAtText ||
    level != null ||
    isPremium != null ||
    followeeCount != null ||
    followerCount != null ||
    broadcastStartDate ||
    cumulativeBroadcastDays != null ||
    wishlistUrl ||
    broadcastRequestEnabled != null;

  return hasAnything ? model : null;
}

/** 数値 userId か（ユーザーページにリンクできるか）。 @param {unknown} userId */
function isNumericUid(userId) {
  return /^\d{1,18}$/.test(str(userId));
}

/**
 * 配信者名を、可能ならリンクで包んで返す。
 * 優先: 数値 userId → /user/<id>。無ければ pageUrl（channel 等）。どちらも無ければ素のテキスト。
 *
 * @param {BroadcasterProfileModel} m
 * @returns {string}
 */
export function broadcasterNameLinkedHtml(m) {
  const label = m.nickname || (m.userId ? `ユーザー ${m.userId}` : '配信者');
  if (isNumericUid(m.userId)) {
    return buildUserProfileLinkedLabelHtml(m.userId, label);
  }
  if (m.pageUrl) {
    return (
      `<a href="${escapeAttr(m.pageUrl)}" target="_blank" rel="noopener noreferrer"` +
      ` class="nl-user-profile-link">${escapeHtml(label)}</a>`
    );
  }
  return escapeHtml(label);
}

/** プロフィールページ URL（userId からの正規 URL or pageUrl）。 @param {BroadcasterProfileModel} m */
function profileHref(m) {
  if (isNumericUid(m.userId)) return `https://www.nicovideo.jp/user/${encodeURIComponent(m.userId)}`;
  return m.pageUrl || '';
}

/** @param {number} n */
function jp(n) {
  return Number(n).toLocaleString('ja-JP');
}

/**
 * マーケ分析（ダークテーマ）用の配信者プロフィールカード。
 * @param {BroadcasterProfileModel|null|undefined} model
 * @returns {string}
 */
export function buildBroadcasterProfileMarketingCardHtml(model) {
  if (!model) return '';
  const m = model;
  const href = profileHref(m);
  const avatar = m.avatarUrl
    ? `<img class="mkt-bcaster__avatar" src="${escapeAttr(m.avatarUrl)}" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '<span class="mkt-bcaster__avatar mkt-bcaster__avatar--empty" aria-hidden="true">配</span>';

  /** @type {string[]} */
  const chips = [];
  if (m.level != null) chips.push(`<span class="mkt-bcaster__chip">LV${escapeHtml(String(m.level))}</span>`);
  if (m.isPremium === true) chips.push('<span class="mkt-bcaster__chip mkt-bcaster__chip--prem">プレミアム会員</span>');
  else if (m.isPremium === false) chips.push('<span class="mkt-bcaster__chip mkt-bcaster__chip--reg">一般会員</span>');
  if (m.followerCount != null) chips.push(`<span class="mkt-bcaster__chip">フォロワー ${escapeHtml(jp(m.followerCount))}</span>`);
  if (m.followeeCount != null) chips.push(`<span class="mkt-bcaster__chip">フォロー中 ${escapeHtml(jp(m.followeeCount))}</span>`);
  if (m.cumulativeBroadcastDays != null) {
    chips.push(`<span class="mkt-bcaster__chip">累計配信 ${escapeHtml(jp(m.cumulativeBroadcastDays))}日</span>`);
  }
  if (m.broadcastRequestEnabled === true) chips.push('<span class="mkt-bcaster__chip">放送リクエスト 可</span>');

  /** @type {string[]} */
  const metaLines = [];
  if (m.userId) {
    metaLines.push(`<span class="mkt-bcaster__meta">ID: ${escapeHtml(m.userId)}</span>`);
  }
  if (m.broadcastStartDate) {
    metaLines.push(`<span class="mkt-bcaster__meta">配信開始日: ${escapeHtml(m.broadcastStartDate)}</span>`);
  } else if (m.startAtText) {
    metaLines.push(`<span class="mkt-bcaster__meta">開始: ${escapeHtml(m.startAtText)}</span>`);
  }

  /** @type {string[]} */
  const links = [];
  if (href) {
    links.push(
      `<a class="mkt-bcaster__link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">プロフィール</a>`
    );
  }
  if (m.wishlistUrl) {
    links.push(
      `<a class="mkt-bcaster__link mkt-bcaster__link--wish" href="${escapeAttr(m.wishlistUrl)}" target="_blank" rel="noopener noreferrer">欲しいものリスト</a>`
    );
  }

  return `<section class="mkt-section mkt-section--bcaster" aria-label="配信者プロフィール">
<h2>配信者プロフィール</h2>
<div class="mkt-bcaster">
${avatar}
<div class="mkt-bcaster__body">
<p class="mkt-bcaster__name">${broadcasterNameLinkedHtml(m)}</p>
${metaLines.length ? `<div class="mkt-bcaster__metas">${metaLines.join('')}</div>` : ''}
${chips.length ? `<div class="mkt-bcaster__chips">${chips.join('')}</div>` : ''}
${links.length ? `<div class="mkt-bcaster__links">${links.join('')}</div>` : ''}
</div>
</div>
</section>`;
}

/** マーケ分析カードの CSS（CSS_BODY へ append する）。 */
export const BROADCASTER_PROFILE_MARKETING_CSS = `
.mkt-section--bcaster h2{border-left-color:#38bdf8}
.mkt-bcaster{display:flex;gap:.9rem;align-items:flex-start;flex-wrap:wrap}
.mkt-bcaster__avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#0f172a;border:1px solid #334155;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:#93c5fd;font-weight:700}
.mkt-bcaster__avatar--empty{font-size:.85rem}
.mkt-bcaster__body{flex:1;min-width:0}
.mkt-bcaster__name{margin:0 0 .35rem;font-size:1.05rem;font-weight:700;color:#f8fafc;overflow-wrap:anywhere}
.mkt-bcaster__name .nl-user-profile-link{color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-bcaster__metas{display:flex;flex-wrap:wrap;gap:.5rem;margin:.1rem 0 .4rem}
.mkt-bcaster__meta{font-size:.78rem;color:#aab6c8}
.mkt-bcaster__chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.1rem 0}
.mkt-bcaster__chip{display:inline-block;border:1px solid #334155;background:#111827;color:#dbeafe;border-radius:999px;padding:.1rem .5rem;font-size:.74rem;line-height:1.4;white-space:nowrap}
.mkt-bcaster__chip--prem{border-color:rgba(251,191,36,.55);background:rgba(251,191,36,.14);color:#fde68a}
.mkt-bcaster__chip--reg{border-color:#475569;background:#0f172a;color:#cbd5e1}
.mkt-bcaster__links{display:flex;flex-wrap:wrap;gap:.6rem;margin:.5rem 0 0}
.mkt-bcaster__link{font-size:.8rem;color:#93c5fd;text-decoration:underline;text-underline-offset:2px}
.mkt-bcaster__link--wish{color:#fdba74}
.mkt-acct-badge{display:inline-block;margin-left:.4rem;border-radius:999px;padding:.02rem .42rem;font-size:.66rem;font-weight:700;line-height:1.5;vertical-align:middle;white-space:nowrap}
.mkt-acct-badge--prem{border:1px solid rgba(251,191,36,.55);background:rgba(251,191,36,.16);color:#fde68a}
.mkt-acct-badge--reg{border:1px solid #475569;background:#0f172a;color:#cbd5e1}
.mkt-ext-link-chips{display:flex;flex-wrap:wrap;gap:.5rem}
.mkt-ext-link-chip{display:inline-block;max-width:100%;border:1px solid #334155;background:#111827;color:#93c5fd;border-radius:999px;padding:.18rem .6rem;font-size:.8rem;text-decoration:none;overflow-wrap:anywhere}
.mkt-ext-link-chip:hover{text-decoration:underline;border-color:#475569}
.nl-user-thumb-link{display:inline-block;line-height:0;text-decoration:none;border-radius:50%}
.nl-user-thumb-link:hover{outline:2px solid #38bdf8;outline-offset:1px}
.mkt-gift-thumb{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#0f172a;vertical-align:middle}
.mkt-gift-thumb--empty{display:inline-block;border:1px solid #334155}
`;

/**
 * HTML レポート（ライトテーマ・概要テーブル）用の追加 <tr> 行。
 * search-item クラスは付けず（検索対象外）、リンクは新規タブ。
 *
 * @param {BroadcasterProfileModel|null|undefined} model
 * @returns {string}
 */
export function buildBroadcasterProfileReportRowsHtml(model) {
  if (!model) return '';
  const m = model;
  /** @type {string[]} */
  const rows = [];
  const href = profileHref(m);
  if (href) {
    rows.push(
      `<tr><th>配信者プロフィール</th><td><a class="nl-user-profile-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a></td></tr>`
    );
  }
  if (m.userId) {
    rows.push(`<tr><th>配信者ID</th><td class="mono">${escapeHtml(m.userId)}</td></tr>`);
  }
  if (m.isPremium != null) {
    rows.push(`<tr><th>会員種別</th><td>${m.isPremium ? 'プレミアム会員' : '一般会員'}</td></tr>`);
  }
  if (m.followerCount != null) {
    rows.push(`<tr><th>フォロワー数</th><td>${escapeHtml(jp(m.followerCount))}</td></tr>`);
  }
  if (m.followeeCount != null) {
    rows.push(`<tr><th>フォロー中</th><td>${escapeHtml(jp(m.followeeCount))}</td></tr>`);
  }
  if (m.broadcastStartDate) {
    rows.push(`<tr><th>配信開始日</th><td>${escapeHtml(m.broadcastStartDate)}</td></tr>`);
  }
  if (m.cumulativeBroadcastDays != null) {
    rows.push(`<tr><th>累計配信日数</th><td>${escapeHtml(jp(m.cumulativeBroadcastDays))}日</td></tr>`);
  }
  if (m.broadcastRequestEnabled != null) {
    rows.push(`<tr><th>放送リクエスト</th><td>${m.broadcastRequestEnabled ? '受付中' : '—'}</td></tr>`);
  }
  if (m.wishlistUrl) {
    rows.push(
      `<tr><th>欲しいものリスト</th><td><a class="nl-user-profile-link" href="${escapeAttr(m.wishlistUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.wishlistUrl)}</a></td></tr>`
    );
  }
  return rows.join('\n');
}

/**
 * 概要テーブルの「配信者名」セル中身（リンク化済み）。
 * @param {BroadcasterProfileModel|null|undefined} model
 * @param {string} fallbackName  model が無い/名前空のときの素テキスト
 * @returns {string}
 */
export function broadcasterNameCellHtml(model, fallbackName) {
  if (model && (model.nickname || model.userId || model.pageUrl)) {
    return broadcasterNameLinkedHtml(model);
  }
  return escapeHtml(str(fallbackName) || '-');
}
