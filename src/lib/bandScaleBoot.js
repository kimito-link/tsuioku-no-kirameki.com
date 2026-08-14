/**
 * bandScaleBoot.js — PICK UP 帯の倍率を起動時に適用する(副作用モジュール)。
 *
 * ★popup-entry.js は max-lines 上限(22343行)に張り付いているため、
 *   初期化本体をここに置き、呼ぶ側は `import './bandScaleBoot.js'` の1行だけにする。
 *
 * ★storage を待たず【先に既定(1.6倍)】を当てる。
 *   read を待ってから当てると、遅い環境で一瞬小さいまま出る＝
 *   「顔を近づけないと読めない」瞬間を自分で作ってしまう。
 *   その後 storage の値で上書きする(ユーザーが変えていればそちらが勝つ)。
 *
 * @module bandScaleBoot
 */
import { KEY_BAND_SCALE, applyBandScale, DEFAULT_BAND_SCALE } from './bandScale.js';
// ★v0.1.1394: 会場が開いているかの購読もここで起動する(popup-entry は max-lines 上限のため)。
import { watchVenueOpen } from './venueOpenCache.js';

try {
  const doc = typeof document !== 'undefined' ? document : null;
  if (doc) {
    applyBandScale(doc, DEFAULT_BAND_SCALE);
    const local = globalThis.chrome?.storage?.local;
    if (local?.get) {
      void local.get(KEY_BAND_SCALE)
        .then((bag) => {
          const v = bag?.[KEY_BAND_SCALE];
          if (v != null) applyBandScale(doc, v);
        })
        .catch(() => { /* 既定のままで良い */ });
    }
  }
} catch {
  /* 適用に失敗しても画面は出す */
}

// ★v0.1.1394: 会場の開閉を購読(隠れていても会場が開いていれば鏡を書き続けるため)。
try { watchVenueOpen(globalThis.chrome); } catch { /* 既定で動く */ }
