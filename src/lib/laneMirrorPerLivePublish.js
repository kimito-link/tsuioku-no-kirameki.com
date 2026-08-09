/**
 * laneMirrorPerLivePublish — 配信ごとの鏡(v2)と実DOM受領証を storage へ書く薄いグルー。
 *
 * ★なぜ popup-entry.js から分けるか
 *   popup-entry.js には max-lines ラチェット(eslint.config.js:250)があり
 *   「増やすのは禁止・抽出が進んだら下げること」と明記されている。
 *   ここは chrome.storage I/O を含むので純関数にはできないが、
 *   【依存を引数で受け取る】ことでテスト可能にする(chrome を直接触らない)。
 *
 * ★なぜ合流バッファ(mirrorBundleFlushScheduler)を通さないか
 *   あのスケジューラは section 単位で値を保持し、takeFlushPayload が
 *   【全 section を毎回同梱】する。配信が切り替わっても前の配信の lane が
 *   次の flush で再同梱され、新しい配信の鏡を巻き戻しうる。
 *   配信ごとキーは「その配信の値だけ」を書くので、この経路に混ぜてはいけない。
 *
 * ★受領証(Receipt)を別キーにする理由
 *   domSelf は「①が実際に描いた DOM の要約」= 表示面固有の受領証であって、
 *   配信の共通データではない。会場は別ドキュメントの DOM を持つので、
 *   データ本体に同梱したままだと「同じデータなのに hash が違う」を構造的に作る。
 *
 * @module laneMirrorPerLivePublish
 */

import { buildLaneReceipt } from './laneMirror.js';
import { laneMirrorKeyFor, laneReceiptKeyFor } from './laneMirrorKey.js';

/**
 * 配信ごとの鏡と受領証を1回の set にまとめて書く。
 *
 * @param {any} snap buildLaneMirrorSnapshot の戻り
 * @param {number} nowMs
 * @param {{ set: (obj: Record<string, unknown>) => unknown }} storage storage.local 相当(注入)
 * @returns {{ written: boolean, reason: string, mirrorKey: string, receiptKey: string }}
 *   written=false のときは reason に理由(呼び手は握りつぶしてよい=best-effort)
 */
export function publishLaneMirrorPerLive(snap, nowMs, storage) {
  const lid = String(snap?.liveId || '').trim().toLowerCase();
  const mirrorKey = laneMirrorKeyFor(lid);
  const receiptKey = laneReceiptKeyFor(lid);
  // liveId を名乗れない鏡は書かない(どの配信のものか分からない値を残さない)。
  if (!mirrorKey || !receiptKey) {
    return { written: false, reason: 'liveIdが無い', mirrorKey: '', receiptKey: '' };
  }
  if (!storage || typeof storage.set !== 'function') {
    return { written: false, reason: 'storageが無い', mirrorKey, receiptKey };
  }
  // ★contentHash は【渡さない】(v0.1.1301・Codex レビュー指摘): 指紋が測ったのは
  //   前回 paint 時の内容で、その内容アドレスは domSelf.fingerprintFor が既に持っている。
  //   現在の snapshot の hash で上書きすると「別内容の指紋」を比較可と誤認させる。
  const receipt = buildLaneReceipt(
    { liveId: lid, domSelf: snap?.domSelf },
    { nowMs, surface: 'popup' }
  );
  // ★鏡と受領証を【同じ set】で書く=片方だけ新しい状態を作らない。
  storage.set({ [mirrorKey]: snap, [receiptKey]: receipt });
  return { written: true, reason: '', mirrorKey, receiptKey };
}
