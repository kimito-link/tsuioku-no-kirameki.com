// pfLastStreamUrl.js — YouTube 系(YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・TikTok・ABEMA)の配信ページが、
//   「最後に見た配信」を自分で記録する部品(0.1.1948・council/panel-stream-selection-SPEC.md §4-C1)。
//
// ★ニコ生版の content-entry.js `rememberWatchPageUrl` の完全コピー(同じ決まり):
//   - URL が変わったときと、このタブが前面に来たとき(focus / visibilitychange→visible)だけ書く
//   - 400ms 待ってから書く(続けて変わったら最後の1回だけ)
//   - 同じ URL は前面に来たとき以外は書き直さない(見えているタブ同士が書き合って描き直しを繰り返さない・v0.1.1607 の教訓)
// ★書く先は yt_last_stream_url = { url, key, at }。ニコ生の nls_last_watch_url には書かない
//   (ニコ生側は URL 全体から /lv\d{1,15}/ を緩く探すので、YouTube の動画 id に lv123 が混ざると偽の lv を拾い得る)。
//   横の欄・コメビュは shim(ytNicoShim.js)がこのキーを読み、疑似 lv の nls_last_watch_url に翻訳して渡す。
// ★掟: 描画・DOM に触れない。拡張が切れていたら何もしない。失敗しても会場や記録を止めない。

export const YT_LAST_STREAM_URL_KEY = 'yt_last_stream_url';
export const REMEMBER_DELAY_MS = 400;

/**
 * @param {{
 *   getUrl: () => string,
 *   getKey: (url: string) => string,
 *   isAlive: () => boolean,
 *   write: (value: { url: string, key: string, at: number }) => void,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (t: any) => void,
 * }} deps
 */
export function createLastStreamUrlRemember(deps) {
  const now = deps.now || (() => Date.now());
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || ((t) => clearTimeout(t));
  let lastWritten = '';
  /** @type {any} */
  let timer = null;
  /** @param {boolean} [force] 前面に来たとき等、同じ URL でも書き直す */
  const remember = (force = false) => {
    if (!deps.isAlive()) return;
    const url = String(deps.getUrl() || '');
    if (!url || !deps.getKey(url)) return; // 配信のページでなければ書かない
    if (force !== true && url === lastWritten) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (!deps.isAlive()) return;
      const u = String(deps.getUrl() || '');
      const key = u ? deps.getKey(u) : '';
      if (!key) return;
      lastWritten = u;
      try {
        deps.write({ url: u, key, at: now() });
      } catch {
        /* 書けなくても会場・記録は止めない */
      }
    }, REMEMBER_DELAY_MS);
  };
  return { remember };
}

/**
 * 配信ページ(上の枠)で動かす。URL の変化は呼び出し側の見回り(venue-inline-entry.js の sync)が remember() を呼ぶ。
 * @param {{ getKey: (url: string) => string, isAlive: () => boolean }} opts
 */
export function installLastStreamUrlRemember(opts) {
  const r = createLastStreamUrlRemember({
    getUrl: () => String(location.href || ''),
    getKey: opts.getKey,
    isAlive: opts.isAlive,
    write: (value) => {
      void Promise.resolve(chrome.storage.local.set({ [YT_LAST_STREAM_URL_KEY]: value })).catch(() => {});
    },
  });
  try {
    window.addEventListener('focus', () => r.remember(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') r.remember(true);
    });
  } catch {
    /* no-op */
  }
  // 開いた時点で前面なら記録する(ニコ生版はページ読み込みで URL が「変わった」扱いになり書く)
  r.remember(document.visibilityState === 'visible');
  return r;
}
