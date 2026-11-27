/**
 * whatsNewNotice.js — 版を上げたあと「この版で変わったこと」を出す判定と、
 * ユーザー向け説明の体裁チェック（純関数・副作用なし）。
 *
 * 表示そのものは popup-entry 側。ここでは:
 *   ・初めて開いたときは出さず、今の版だけ覚える
 *   ・覚えた版より新しいときだけ出す
 *   ・監視・タイマー・通信は使わない（開いたときに storage を一度読むだけ）
 *   ・ユーザー向け説明に入れてはいけない言葉（有料・LINE・紹介、恐れを煽る表現、GPU案内）
 */

import { compareSemver } from './changelog.js';

/** chrome.storage.local に残す「利用者が確認済みの版」。 */
export const WHATS_NEW_SEEN_STORAGE_KEY = 'whatsNewSeenVersion';

/** 先頭エントリの各 items の最短字数（プレースホルダや一行だけの記号を落とす）。 */
export const CHANGELOG_ITEM_MIN = 20;

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** 拡張 UI と、版ごとのユーザー向け説明に入れない言葉。 */
export const CHANGELOG_NOTE_FORBIDDEN = Object.freeze([
  { re: /有料/, label: '「有料」' },
  { re: /LINE|ＬＩＮＥ/, label: 'LINE' },
  { re: /リファラル|紹介コード|referral/i, label: '紹介・リファラル' },
  {
    re: /ハードウェアアクセラレーション|グラフィック\s*アクセラレーション|\bGPU\b/,
    label: 'GPU案内'
  },
  { re: /今すぐやらないと|致命的|危険です/, label: '恐れを煽る表現' }
]);

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isSemver(value) {
  return typeof value === 'string' && SEMVER_RE.test(value);
}

/**
 * 更新後お知らせを出すか、初回だけ版を覚えるかを決める。
 * @param {{ currentVersion?: unknown, seenVersion?: unknown }} input
 * @returns {{
 *   show: boolean,
 *   persistSeenOnLoad: boolean,
 *   persistVersion: string
 * }}
 */
export function resolveWhatsNewState(input) {
  const currentRaw =
    input && typeof input === 'object' ? input.currentVersion : '';
  const seenRaw =
    input && typeof input === 'object' ? input.seenVersion : '';
  if (!isSemver(currentRaw)) {
    return { show: false, persistSeenOnLoad: false, persistVersion: '' };
  }
  const currentVersion = currentRaw;
  if (!isSemver(seenRaw)) {
    return {
      show: false,
      persistSeenOnLoad: true,
      persistVersion: currentVersion
    };
  }
  const seenVersion = seenRaw;
  if (compareSemver(currentVersion, seenVersion) > 0) {
    return {
      show: true,
      persistSeenOnLoad: false,
      persistVersion: currentVersion
    };
  }
  return {
    show: false,
    persistSeenOnLoad: false,
    persistVersion: currentVersion
  };
}

/**
 * 視聴ページへの埋め込みなど、お知らせを出さない面か。
 * 横の欄（sidepanel）やツールバーのポップアップでは出す。
 * @param {{ embedWatch?: boolean, embedLiveView?: boolean, passive?: boolean }} flags
 * @returns {boolean}
 */
export function shouldSuppressWhatsNewSurface(flags) {
  const f = flags && typeof flags === 'object' ? flags : {};
  return !!(f.embedWatch || f.embedLiveView || f.passive);
}

/**
 * 先頭エントリが、配信者・視聴者向けの短い説明になっているか。
 * @param {{ summary?: unknown, items?: unknown }} entry
 * @returns {string[]} 違反メッセージ（空なら OK）
 */
export function checkUserFacingChangelogNote(entry) {
  /** @type {string[]} */
  const violations = [];
  if (!entry || typeof entry !== 'object') {
    return ['ユーザー向け説明（changelog 先頭）が無い'];
  }
  if (typeof entry.summary !== 'string' || entry.summary.trim().length === 0) {
    violations.push('ユーザー向け説明の summary が空');
  }
  if (!Array.isArray(entry.items) || entry.items.length === 0) {
    violations.push('ユーザー向け説明（items）が無い');
    return violations;
  }
  for (const [i, item] of entry.items.entries()) {
    if (typeof item !== 'string' || item.trim().length < CHANGELOG_ITEM_MIN) {
      violations.push(
        `items[${i}] が短すぎる（${CHANGELOG_ITEM_MIN} 字以上のユーザー向け説明が必要）`
      );
    } else if (/<\/?[a-z]/i.test(item)) {
      violations.push(`items[${i}] に HTML タグを含めないでください`);
    }
  }
  const texts = [
    typeof entry.summary === 'string' ? entry.summary : '',
    ...entry.items.filter((it) => typeof it === 'string')
  ];
  for (const text of texts) {
    for (const rule of CHANGELOG_NOTE_FORBIDDEN) {
      if (rule.re.test(text)) {
        violations.push(`ユーザー向け説明に ${rule.label} を含めないでください`);
      }
    }
  }
  return violations;
}

/**
 * 紹介 LP の「この版で変わったこと」欄が、今の版の説明と一致しているか。
 * @param {{
 *   html?: unknown,
 *   version?: unknown,
 *   summary?: unknown,
 *   items?: unknown
 * }} input
 * @returns {string[]}
 */
export function checkLpWhatsNewSection(input) {
  /** @type {string[]} */
  const violations = [];
  const html = input && typeof input === 'object' ? input.html : '';
  const version = input && typeof input === 'object' ? input.version : '';
  const summary = input && typeof input === 'object' ? input.summary : '';
  const items = input && typeof input === 'object' ? input.items : [];
  if (typeof html !== 'string' || html.length === 0) {
    return ['紹介LP の HTML が読めない'];
  }
  const sectionRe =
    /<section\b[^>]*\bid="lp-whats-new"[^>]*>([\s\S]*?)<\/section>/;
  const sectionMatch = html.match(sectionRe);
  if (!sectionMatch) {
    return [
      '紹介LP に id="lp-whats-new"（この版で変わったこと）が無い。版を上げるときはこの欄も更新してください'
    ];
  }
  const openTagMatch = html.match(/<section\b[^>]*\bid="lp-whats-new"[^>]*>/);
  const openTag = openTagMatch ? openTagMatch[0] : '';
  const verAttr = openTag.match(/\bdata-whats-new-version="(\d+\.\d+\.\d+)"/);
  if (!verAttr) {
    violations.push(
      '紹介LP の #lp-whats-new に data-whats-new-version が無い'
    );
  } else if (typeof version === 'string' && verAttr[1] !== version) {
    violations.push(
      `紹介LP のこの版で変わったことが v${verAttr[1]} → package の v${version} に合わせてください`
    );
  }
  const body = sectionMatch[1];
  const summaryAttr = body.match(
    /data-whats-new-summary="([^"]*)"|data-whats-new-summary>([^<]*)</
  );
  const shownSummary = summaryAttr
    ? (summaryAttr[1] ?? summaryAttr[2] ?? '').trim()
    : '';
  // 属性が無くても要素テキストで照合できるよう、span 本文も見る
  const summaryTextMatch = body.match(
    /data-whats-new-summary[^>]*>([^<]*)</
  );
  const summaryText = (shownSummary || (summaryTextMatch ? summaryTextMatch[1] : '')).trim();
  if (typeof summary === 'string' && summary.length > 0) {
    if (!summaryText) {
      violations.push(
        '紹介LP の #lp-whats-new に data-whats-new-summary が無い'
      );
    } else if (summaryText !== summary) {
      violations.push(
        `紹介LP のこの版で変わったことの概要が changelog 先頭と違う（LP:「${summaryText}」 / changelog:「${summary}」）`
      );
    }
  }
  if (Array.isArray(items)) {
    for (const [i, item] of items.entries()) {
      if (typeof item === 'string' && item.trim() && !body.includes(item.trim())) {
        violations.push(
          `紹介LP のこの版で変わったことに items[${i}] の文が無い`
        );
      }
    }
  }
  return violations;
}

/**
 * v0.1.2263(りんく 11-27: YouTube の横の欄に「Kick の録画で…」と出ていた):
 *   版の一言が別のサービスのことだけなら、いまの画面ではサービス名を出さない一言にする。
 *   どのサービスの名前も無い一言・いまのサービスの名前がある一言は、そのまま。版番号と「詳しく」は今までどおり LP のその版へ。
 */
export const WHATS_NEW_SITE_NAMES = Object.freeze([
  { site: 'niconico', re: /ニコ生|ニコニコ|ニコ動|niconico/i },
  { site: 'youtube', re: /YouTube|ユーチューブ/i },
  { site: 'twitch', re: /Twitch/i },
  { site: 'kick', re: /Kick/ },
  { site: 'twitcasting', re: /ツイキャス|TwitCasting/i },
  { site: 'tiktok', re: /TikTok/i },
  { site: 'abema', re: /ABEMA/i },
  { site: 'whowatch', re: /ふわっち/ },
  { site: 'showroom', re: /SHOWROOM/i },
  { site: 'mixch', re: /ミクチャ/ },
]);

/** 別のサービスのことだけのときに代わりに出す一言 */
export const WHATS_NEW_GENERIC_SUMMARY = 'ほかのサービス向けの直しです。くわしくは「詳しく」から';

/**
 * @param {unknown} summary 版の一言
 * @param {unknown} site いまの画面のサービス(youtube / niconico / twitch …)。分からなければ ''
 * @param {readonly unknown[] | null | undefined} [platforms] 版のサービスの印(changelog.js の platforms)。無ければ本文で決める
 * @returns {string}
 */
export function whatsNewSummaryForSite(summary, site, platforms) {
  const text = String(summary || '');
  const cur = String(site || '').trim().toLowerCase();
  if (!text || !cur) return text;
  // 版にサービスの印(platforms: ['kick'] など)があれば、それで決める。印の無い版は本文のサービス名で決める。
  if (Array.isArray(platforms) && platforms.length) {
    return platforms.map((x) => String(x).toLowerCase()).includes(cur) ? text : WHATS_NEW_GENERIC_SUMMARY;
  }
  const named = WHATS_NEW_SITE_NAMES.filter((n) => n.re.test(text)).map((n) => n.site);
  if (!named.length || named.includes(cur)) return text;
  return WHATS_NEW_GENERIC_SUMMARY;
}

/**
 * 横の欄・ポップアップの URL から、いまの画面のサービスを読む(YouTube 版の画面は &site= か &stream=<サービス>:…)。
 * @param {{ pathname?: string, search?: string } | null | undefined} loc
 * @returns {string}
 */
export function whatsNewSiteOfLocation(loc) {
  const path = String(loc?.pathname || '');
  const search = String(loc?.search || '');
  if (!/yt-sidepanel\.html|yt-comeview\.html|yt-venue\.html/.test(path)) {
    return /\/(popup|sidepanel)\.html$/.test(path) ? 'niconico' : '';
  }
  try {
    const q = new URLSearchParams(search);
    const site = String(q.get('site') || '').trim().toLowerCase();
    if (site) return site;
    const stream = String(q.get('stream') || '');
    const m = stream.match(/^([a-z]+):/);
    if (m) return m[1] === 'yt' ? 'youtube' : m[1];
  } catch {
    /* 読めなければ分からないまま */
  }
  return '';
}
