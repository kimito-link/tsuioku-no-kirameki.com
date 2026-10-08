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
import { laneMirrorWriteSignature, laneMirrorStructureKey } from './laneMirrorWriteGate.js';

/**
 * 配信ごとの鏡と受領証を1回の set にまとめて書く。
 *
 * @param {any} snap buildLaneMirrorSnapshot の戻り
 * @param {number} nowMs
 * @param {{ set: (obj: Record<string, unknown>) => unknown }} storage storage.local 相当(注入)
 * @param {{ shouldWrite: (lid: string, sig: string, nowMs: number, structKey?: string) => { write: boolean, reason: string }, forget?: (lid: string) => void }} [gate]
 *   書き込み抑制ゲート(laneMirrorWriteGate.js)。渡すと「同じ内容なら60秒に1回まで」に絞る。
 *   ★省略時は従来どおり毎回書く(後方互換)。stats/pulse の変化は署名に入っているので必ず書かれる。
 * @returns {{ written: boolean, reason: string, mirrorKey: string, receiptKey: string }}
 *   written=false のときは reason に理由(呼び手は握りつぶしてよい=best-effort)
 */
export function publishLaneMirrorPerLive(snap, nowMs, storage, gate) {
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
  // ★同じ内容なら書かない(書くたびに開いている全拡張ページへ onChanged が全文で配られる)。
  if (gate && typeof gate.shouldWrite === 'function') {
    const d = gate.shouldWrite(lid, laneMirrorWriteSignature(snap), nowMs, laneMirrorStructureKey(snap));
    if (!d.write) return { written: false, reason: d.reason, mirrorKey, receiptKey };
  }
  // ★contentHash は【渡さない】(v0.1.1301・Codex レビュー指摘): 指紋が測ったのは
  //   前回 paint 時の内容で、その内容アドレスは domSelf.fingerprintFor が既に持っている。
  //   現在の snapshot の hash で上書きすると「別内容の指紋」を比較可と誤認させる。
  const receipt = buildLaneReceipt(
    { liveId: lid, domSelf: snap?.domSelf },
    { nowMs, surface: 'popup' }
  );
  // ★鏡と受領証を【同じ set】で書く=片方だけ新しい状態を作らない。
  const setResult = storage.set({ [mirrorKey]: snap, [receiptKey]: receipt });
  const r = /** @type {any} */ (setResult);
  // ★書き込みが失敗(reject)したら、ゲートに「書いていない」と伝える(失敗を書いたと見なして最大60秒止まらない)。
  //   set が Promise を返さない呼び手(テストのスパイ等)には何もしない。reject は握る(best-effort)。
  if (r && typeof r.catch === 'function') {
    r.catch(() => {
      try {
        if (gate && typeof gate.forget === 'function') gate.forget(lid);
      } catch {
        /* no-op */
      }
    });
  }
  return { written: true, reason: '', mirrorKey, receiptKey };
}
