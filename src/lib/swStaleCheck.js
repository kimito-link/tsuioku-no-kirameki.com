/**
 * service worker が古い中身のまま動いていないかを確かめ、古ければ1回だけ拡張を読み込み直す(v0.1.1972)。
 *
 * ★経緯(PC 実測 2026-11-10): 新しい版を配置しても、配置後の最初の起動では service worker が前の版の
 *   background.js / dist/yt-background.js のまま動いた(2回目の起動で入れ替わった)。v0.1.1971 で本体に指紋を
 *   刻んでも同じだった。→ 起動時にディスクの dist/yt-background.js を読み、自分の build id が入っているかを見る。
 *   入っていなければ古い中身なので chrome.runtime.reload() で入れ替える。読み込み直しが続かないよう、
 *   最短 SW_STALE_RELOAD_MIN_GAP_MS に1回まで。ストア版(manifest に update_url)では何もしない。
 */
export const SW_STALE_RELOAD_MIN_GAP_MS = 30 * 60 * 1000;

/**
 * @param {{ runningBuildId: string, diskText: string | null, isStore: boolean, lastReloadAt: number, now: number }} s
 * @returns {'fresh' | 'reload' | 'stale-wait' | 'unknown' | 'store'}
 */
export function swStaleDecision(s) {
  if (!s) return 'unknown';
  if (s.isStore) return 'store';
  const id = String(s.runningBuildId || '');
  if (!id || typeof s.diskText !== 'string' || !s.diskText) return 'unknown';
  if (s.diskText.includes(JSON.stringify(id))) return 'fresh';
  const last = Number(s.lastReloadAt) || 0;
  return Number(s.now) - last >= SW_STALE_RELOAD_MIN_GAP_MS ? 'reload' : 'stale-wait';
}
