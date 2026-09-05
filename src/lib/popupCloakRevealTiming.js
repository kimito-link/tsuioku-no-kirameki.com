/**
 * 幕(cloak)をいつ外してよいかを決める純関数(v0.1.1315)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜこれが要るか（2026-08-10・サイドパネル黒画面の【本当の】真因）
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 実機の自己診断(v0.1.1314)がこう出していた:
 *
 *     🔴黒くなりうる / 531x1063 / 外✅ iframe✅ 中✅
 *       / 中央の塗り主=iframe → rgb(255, 250, 242)
 *       / 原因=幕(cloak)が残っている ★出た直後だけ黒い(t+60ms時点で検知)
 *       / 幕(cloak) ✅ t+1238ms で解除
 *
 * つまり t+60ms の時点で【窓に面積があり・全層が塗っており・地の色はクリーム】。
 * それでも幕だけが t+1238ms まで残り、約1.2秒「中身が見えない」状態が続いていた。
 *
 * ★幕は `.nl-popup-primary { opacity: 0 }` で【中身だけ】を隠す(背景は塗られる)。
 *   だから見え方は「真っ黒」ではなく【地の色だけで中身が無い】。
 *   暗いブラウザ枠の中でこれを見ると「黒いのが出た」と感じる。
 *   ＝過去に「真っ黒」を前提に探し続けたのが空振りの一因だった。
 *
 * ■ なぜ 1.2 秒もかかっていたか（構造の穴）
 *   幕を外す指示は次の2箇所にしか無かった:
 *     (a) refresh() 内の `if (!snapshotCacheHit)` ブロックの中
 *     (b) refresh() のずっと下（storage の heavy read の後）
 *   ★snapshot がキャッシュに当たると (a) は【ブロックごと飛ばされる】ので、
 *     解除は (b) まで来ない＝heavy read を待たされる。
 *   パネルを開き直すときは基本キャッシュに当たるため、この遅い経路が常用されていた。
 *
 * ■ 判定の考え方
 *   幕を外してよい条件は「中身が描けたか」であって「データを読み終えたか」ではない。
 *   表示に必要な snapshot が既に手元にある（キャッシュヒット）なら、待っても
 *   同じものが描かれるだけ＝待つ理由が無い。
 *
 * @module popupCloakRevealTiming
 */

/**
 * 最初の paint 直後に幕を外してよいか。
 *
 * @param {{ snapshotCacheHit?: boolean, freshRefresh?: boolean }} input
 * @returns {{ revealNow: boolean, reason: string }}
 */
export function shouldRevealCloakAfterFirstPaint(input) {
  const inp = input && typeof input === 'object' ? input : {};
  const cacheHit = Boolean(inp.snapshotCacheHit);
  const fresh = Boolean(inp.freshRefresh);

  // 古い refresh の結果で画面を触らない（既存規律）。
  if (!fresh) return { revealNow: false, reason: 'stale-refresh' };

  // ★キャッシュヒット＝必要な snapshot が手元にある＝描けるので待たない。
  if (cacheHit) return { revealNow: true, reason: 'snapshot-cache-hit' };

  // キャッシュミスは従来どおり: fetch 中の paint 後に外す（呼び出し側の別経路）。
  return { revealNow: false, reason: 'cache-miss-uses-fetch-path' };
}
