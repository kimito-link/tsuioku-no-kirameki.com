/**
 * v0.1.2253: Twitch の録画チャットには顔の画像が無い(実測 DOM)。ライブの Twitch でこの PC が覚えた顔
 *   (tw-content-entry.js が login ごとに storage の yt_tw_icons に置いたもの)を、録画の同じ login の人に使う。
 *   通信はしない。覚えていない人は今までどおり(横の欄がその人ごとのゆっくり顔を出す)。
 */
export const TW_LIVE_ICONS_KEY = 'yt_tw_icons';

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
