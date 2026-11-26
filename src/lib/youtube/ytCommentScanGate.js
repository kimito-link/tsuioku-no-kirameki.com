/**
 * v0.1.2249: YouTube 動画のコメント欄の読み直し(既存の 5 秒ごとの sendMeta)を、変わっていないときは省く。
 *
 * - 新しいタイマー・見張り・通信は持たない。呼び出し側の既存の間隔の中で、1回ぶんの重い読み取り
 *   (ページの世界への顔の合図 + 投稿者 + コメント)を、前回と同じなら前回の結果で済ませるだけ。
 * - 省く条件: (1) 同じ動画で、タブが裏にある(document.hidden) (2) 同じ動画で、コメントの並びの印が前回と同じ。
 * - 印 = スレッド数 / 返信を含むコメント数 / 最後のスレッドのコメント id(lc=) / 顔の img に src が入った数。
 *   スクロールで新しいスレッドや返信が出る・顔が読み込まれると印が変わり、従来どおり読み直す。
 * - 動画が変わったとき・まだ1回も読んでいないときは必ず読む。
 */

/**
 * @param {any} doc
 * @returns {string}
 */
export function ytCommentScanSignature(doc) {
  try {
    if (!doc || typeof doc.querySelectorAll !== 'function') return '';
    const threads = doc.querySelectorAll('ytd-comment-thread-renderer');
    const all = doc.querySelectorAll('ytd-comment-view-model, ytd-comment-renderer, yt-comment-view-model');
    let lastId = '';
    const last = threads.length ? threads[threads.length - 1] : all.length ? all[all.length - 1] : null;
    if (last && typeof last.querySelector === 'function') {
      const a = last.querySelector('a[href*="lc="]');
      const href = String(a?.getAttribute?.('href') || '');
      const m = href.match(/[?&]lc=([^&#]+)/);
      lastId = m ? m[1] : href;
    }
    const withSrc = doc.querySelectorAll('ytd-comment-thread-renderer #author-thumbnail img[src]').length;
    return `${threads.length}|${all.length}|${lastId}|${withSrc}`;
  } catch {
    return '';
  }
}

/**
 * @template T
 * @returns {{ read: (doc: any, videoId: string, readFn: () => T) => T, stats: { reads: number, skips: number } }}
 */
export function createYtCommentScanGate() {
  /** @type {{ videoId: string, sig: string, value: T } | null} */
  let last = null;
  const stats = { reads: 0, skips: 0 };
  return {
    stats,
    read(doc, videoId, readFn) {
      const vid = String(videoId || '');
      if (last && vid && last.videoId === vid) {
        if (doc?.hidden === true) {
          stats.skips += 1;
          return last.value;
        }
        const sig = ytCommentScanSignature(doc);
        if (sig && sig === last.sig) {
          stats.skips += 1;
          return last.value;
        }
      }
      const value = readFn();
      stats.reads += 1;
      // 読んだ直後の印を覚える(合図で属性が付いたあとの状態)
      last = { videoId: vid, sig: ytCommentScanSignature(doc), value };
      return value;
    },
  };
}
