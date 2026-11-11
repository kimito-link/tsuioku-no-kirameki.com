/**
 * 「いま見ている配信」(yt_active_video_id) を書いてよいか。
 * 前面の窓で選ばれているタブ、または見えているタブだけが書いてよい。
 * 裏のタブが1秒ごとに印を取り替えると、配信のまとめ全体の書き直しが起きていた。
 */

export const YT_ACTIVE_VIDEO_MIN_GAP_MS = 2000;

/**
 * @param {{
 *   tabActive?: boolean,
 *   windowFocused?: boolean | null,
 *   currentId?: unknown,
 *   nextId?: unknown,
 *   lastSetAt?: number,
 *   now?: number,
 *   minGapMs?: number,
 * }} s
 * @returns {{ write: boolean, reason: string }}
 */
export function decideActiveVideoIdWrite(s) {
  const nextId = String(s?.nextId || '').trim();
  if (!nextId) return { write: false, reason: 'empty' };
  if (s?.tabActive !== true) return { write: false, reason: 'not-visible' };
  const currentId = String(s?.currentId || '').trim();
  const focusKnown = s?.windowFocused === true || s?.windowFocused === false;
  if (focusKnown && s.windowFocused !== true && currentId && currentId !== nextId) {
    return { write: false, reason: 'unfocused' };
  }
  if (currentId === nextId) return { write: false, reason: 'same' };
  const now = Number(s?.now) || 0;
  const last = Number(s?.lastSetAt) || 0;
  const gap = Number.isFinite(Number(s?.minGapMs)) ? Number(s.minGapMs) : YT_ACTIVE_VIDEO_MIN_GAP_MS;
  if (last > 0 && now - last < gap) return { write: false, reason: 'debounce' };
  return { write: true, reason: 'ok' };
}
