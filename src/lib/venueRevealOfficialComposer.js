// venueRevealOfficialComposer.js — 会場モードから公式のコメント欄へ送るとき、会場が欄を覆っていたら一時的にしまう。
//   ニコ生・YouTube・Twitch・ツイキャス・SHOWROOM・ミクチャ・Kick・ふわっち・ABEMA・TikTok など、
//   会場の「ここから発言」はどのサービスでもここを通す。しまう印だけ付け、js の tucked 状態は触らない
//   (送り終わるまでの短い間に、読み上げを止めたりトグルの文言を変えたりしない)。
//   入れ子で呼ばれても回数を数え、一番外側の戻しで印を外す。前回の失敗で印だけ残っていても、
//   次の送り終わりで外す(失敗したまま会場が閉じて見える、を残さない)。
// @layer L1 — 会場の印を付け外しするだけ

/** @type {WeakMap<object, number>} */
const NEST = new WeakMap();

/**
 * 会場が公式の欄を覆っているとき、一時的にしまって欄を出してから戻す。
 * 会場が閉じていれば何もしない。既にしまっている・前回の印が残っていても、戻す関数は印を外す。
 * @param {Document | null | undefined} [doc]
 * @returns {() => void} 元に戻す関数
 */
export function revealVenueOfficialComposer(doc = typeof document !== 'undefined' ? document : /** @type {any} */ (null)) {
  if (!doc) return () => {};
  const html = doc.documentElement;
  const root = doc.getElementById && doc.getElementById('nlsb-venue-root');
  const open = !!(html && html.classList && html.classList.contains('nlsb-venue-open'));
  if (!open || !root || !root.classList) return () => {};
  const prev = Number(NEST.get(root) || 0);
  NEST.set(root, prev + 1);
  root.classList.add('nlsb-is-tucked');
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = Number(NEST.get(root) || 1) - 1;
    if (left <= 0) {
      NEST.delete(root);
      try {
        root.classList.remove('nlsb-is-tucked');
      } catch {
        /* 戻し損なっても送信の本体は止めない */
      }
    } else {
      NEST.set(root, left);
    }
  };
}

/**
 * 公式の欄へ送るあいだだけ会場をしまう。終わったら(失敗しても)必ず戻す。
 * @template T
 * @param {Document | null | undefined} doc
 * @param {() => (T | Promise<T>)} fn
 * @returns {Promise<T>}
 */
export async function withRevealedVenueOfficialComposer(doc, fn) {
  const restore = revealVenueOfficialComposer(doc);
  try {
    return await fn();
  } finally {
    restore();
  }
}
