// noWatchHint.js — 配信ページが開いていないときにパネルへ出す「配信を探す」案内を、そのサービスの言葉と行き先にする。
//   ニコ生版の案内(ニコニコ生放送トップ・生放送ランキング・ちくらん・recent)を YouTube 系の画面へそのまま出すと、
//   ツイキャスや TikTok を開いているのに「YouTube トップ・生放送ランキング・ちくらん」と出ていた
//   (文字だけ YouTube に直り、行き先はニコ生のまま・2026-11-12 申請前の PC 実ページ確認で発見)。
//   行き先はそのサービスの公開ページだけ(拡張の権限を増やさない・リンクは新しいタブで開くだけ)。

/** @typedef {{ href: string, text: string }} NoWatchHintLink */
/** @typedef {{ label: string, lead: string, links: NoWatchHintLink[] }} NoWatchHint */

/** @type {Record<string, NoWatchHint>} */
const HINTS = {
  youtube: {
    label: 'YouTube の配信を探す',
    lead: '🔎 配信ページが見つかりません。YouTube のライブ配信を開くと記録が始まります。',
    links: [{ href: 'https://www.youtube.com/live', text: '📺 YouTube のライブ' }],
  },
  twitch: {
    label: 'Twitch の配信を探す',
    lead: '🔎 配信ページが見つかりません。Twitch の配信を開くと記録が始まります。',
    links: [{ href: 'https://www.twitch.tv/directory', text: '📺 Twitch のカテゴリ一覧' }],
  },
  kick: {
    label: 'Kick の配信を探す',
    lead: '🔎 配信ページが見つかりません。Kick の配信を開くと記録が始まります。',
    links: [{ href: 'https://kick.com/browse', text: '📺 Kick の配信一覧' }],
  },
  whowatch: {
    label: 'ふわっちの配信を探す',
    lead: '🔎 配信ページが見つかりません。ふわっちの配信を開くと記録が始まります。',
    links: [{ href: 'https://whowatch.tv/', text: '📺 ふわっち トップ' }],
  },
  showroom: {
    label: 'SHOWROOM の配信を探す',
    lead: '🔎 配信ページが見つかりません。SHOWROOM の部屋を開くと記録が始まります。',
    links: [{ href: 'https://www.showroom-live.com/', text: '📺 SHOWROOM トップ' }],
  },
  mixch: {
    label: 'ミクチャの配信を探す',
    lead: '🔎 配信ページが見つかりません。ミクチャの配信を開くと記録が始まります。',
    links: [{ href: 'https://mixch.tv/', text: '📺 ミクチャ トップ' }],
  },
  tiktok: {
    label: 'TikTok LIVE の配信を探す',
    lead: '🔎 配信ページが見つかりません。TikTok LIVE の配信を開くと記録が始まります。',
    links: [{ href: 'https://www.tiktok.com/live', text: '📺 TikTok LIVE' }],
  },
  abema: {
    label: 'ABEMA の放送を探す',
    lead: '🔎 放送ページが見つかりません。ABEMA の放送を開くと記録が始まります。',
    links: [{ href: 'https://abema.tv/now-on-air/', text: '📺 ABEMA の放送中の番組' }],
  },
  twitcasting: {
    label: 'ツイキャスの配信を探す',
    lead: '🔎 配信ページが見つかりません。ツイキャスの配信を開くと記録が始まります。',
    links: [{ href: 'https://twitcasting.tv/', text: '📺 ツイキャス トップ' }],
  },
};

/**
 * @param {unknown} siteId 'youtube' か streamPlatform.js の id。分からなければ YouTube。
 * @returns {NoWatchHint}
 */
export function noWatchHintFor(siteId) {
  const id = String(siteId || '');
  return HINTS[id] || HINTS.youtube;
}

/** 案内を持っているサービスの id(テスト用) */
export const NO_WATCH_HINT_SITES = Object.freeze(Object.keys(HINTS));
