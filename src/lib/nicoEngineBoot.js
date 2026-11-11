/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ニコ生のフレームに記録エンジン(大きい content.js)を載せるかの判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】どのフレームで content.js を解析するかはここだけ
 *
 * nicoEngineBoot.js — content.js は約 1.5MB。全フレームで解析すると、
 * 低スペックの PC ではインストール直後やページを開いた瞬間に Chrome が固まる。
 * 配信の視聴・ギフトの子フレーム・広告の貢献度だけに載せる。
 */

/**
 * @param {string} href
 * @param {{ isTop?: boolean, hasCommentPanel?: boolean }} [opts]
 * @returns {boolean}
 */
export function needsNicoEngineFrame(href, opts = {}) {
  if (opts.hasCommentPanel) return true;
  let url;
  try {
    url = new URL(String(href || ''));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname || '';
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (
    url.protocol === 'http:' &&
    (host === '127.0.0.1' || host === 'localhost') &&
    port === '3456' &&
    /\/watch\//.test(path)
  ) {
    return true;
  }
  if (!host.endsWith('nicovideo.jp') && host !== 'nicovideo.jp') return false;
  if (host === 'koken.nicovideo.jp' || host === 'audition.nicovideo.jp') return true;
  if (host === 'nicoad.nicovideo.jp') return /\/live\/publish\/lv\d+/i.test(path);
  if (host === 'live.nicovideo.jp' || host === 'sp.live.nicovideo.jp') {
    return /\/watch\//.test(path) || /\/embed\//.test(path);
  }
  return /\/watch\/(lv|ch)\d+/i.test(path);
}

/**
 * まだ配信ページでない親フレームは、SPA で視聴へ移るまで URL を見る。
 * 子フレームではタイマーを積まない。
 * @param {string} href
 * @param {boolean} isTop
 * @returns {boolean}
 */
export function shouldPollNicoEngine(href, isTop) {
  if (!isTop) return false;
  let url;
  try {
    url = new URL(String(href || ''));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (url.protocol === 'http:' && (host === '127.0.0.1' || host === 'localhost') && port === '3456') {
    return true;
  }
  return host === 'nicovideo.jp' || host.endsWith('.nicovideo.jp');
}
