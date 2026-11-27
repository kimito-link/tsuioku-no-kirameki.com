import { kickSlugOfName } from '../kick/kickChatParse.js';

/**
 * v0.1.2253: Twitch の録画チャットには顔の画像が無い(実測 DOM)。ライブの Twitch でこの PC が覚えた顔
 *   (tw-content-entry.js が login ごとに storage の yt_tw_icons に置いたもの)を、録画の同じ login の人に使う。
 *   通信はしない。覚えていない人は今までどおり(横の欄がその人ごとのゆっくり顔を出す)。
 */
export const TW_LIVE_ICONS_KEY = 'yt_tw_icons';
/** v0.1.2260: ライブの Kick が slug ごとに置く顔(kick-content-entry.js)。録画の Kick も同じ形で引く */
export const KK_LIVE_ICONS_KEY = 'yt_kk_icons';

/**
 * @template {{ id: string, avatarUrl?: string }} T
 * @param {T[]} authors
 * @param {Record<string, unknown> | null | undefined} icons login → 顔の URL
 * @returns {{ authors: T[], filled: number }}
 */
export function fillTwitchVodAvatarsFromLiveIcons(authors, icons) {
  const list = Array.isArray(authors) ? authors : [];
  if (!icons || typeof icons !== 'object') return { authors: list, filled: 0 };
  let filled = 0;
  const out = list.map((a) => {
    if (!a || String(a.avatarUrl || '').trim()) return a;
    const m = /^tw:(.+)$/.exec(String(a.id || ''));
    const login = m ? m[1].trim().toLowerCase() : '';
    const url = login ? String(icons[login] || '').trim() : '';
    if (!/^https:\/\//.test(url)) return a;
    filled += 1;
    return { ...a, avatarUrl: url };
  });
  return { authors: out, filled };
}

/**
 * v0.1.2260: 録画のページのサービス → ライブで覚えた顔の storage の鍵。覚えが無いサービスは ''。
 * @param {string} platform vodWatchPageFromUrl の platform
 */
export function vodLiveIconsKeyForPlatform(platform) {
  if (platform === 'twitch') return TW_LIVE_ICONS_KEY;
  if (platform === 'kick') return KK_LIVE_ICONS_KEY;
  return '';
}

/**
 * v0.1.2260: Kick 録画の顔を、ライブの Kick で覚えた顔(slug → URL)から埋める。Twitch と同じ考え方。
 *   録画の人は kk:@slug(名前からの推測で _ を - にする)。ライブで覚えた slug は本物なので、
 *   _ のままの人(実測 kanata_2525)も当たるよう、名前をそのまま小文字にした形も引く。
 * @template {{ id: string, name?: string, avatarUrl?: string }} T
 * @param {T[]} authors
 * @param {Record<string, unknown> | null | undefined} icons slug → 顔の URL
 * @returns {{ authors: T[], filled: number }}
 */
export function fillKickVodAvatarsFromLiveIcons(authors, icons) {
  const list = Array.isArray(authors) ? authors : [];
  if (!icons || typeof icons !== 'object') return { authors: list, filled: 0 };
  let filled = 0;
  const out = list.map((a) => {
    if (!a || String(a.avatarUrl || '').trim()) return a;
    const m = /^kk:@(.+)$/.exec(String(a.id || ''));
    const name = String(a.name || '').trim().toLowerCase();
    const keys = [m ? m[1].trim().toLowerCase() : '', name, kickSlugOfName(name)];
    let url = '';
    for (const k of keys) {
      if (!k) continue;
      const v = String(icons[k] || '').trim();
      if (/^https:\/\//.test(v)) { url = v; break; }
    }
    if (!url) return a;
    filled += 1;
    return { ...a, avatarUrl: url };
  });
  return { authors: out, filled };
}

/**
 * v0.1.2260: 録画のサービスに合わせて、ライブで覚えた顔で埋める(Twitch・Kick)。ほかのサービスは何もしない。
 * @template {{ id: string, name?: string, avatarUrl?: string }} T
 * @param {string} platform
 * @param {T[]} authors
 * @param {Record<string, unknown> | null | undefined} icons
 * @returns {{ authors: T[], filled: number } | null}
 */
export function fillVodAvatarsFromLiveIcons(platform, authors, icons) {
  if (platform === 'twitch') return fillTwitchVodAvatarsFromLiveIcons(authors, icons);
  if (platform === 'kick') return fillKickVodAvatarsFromLiveIcons(authors, icons);
  return null;
}
