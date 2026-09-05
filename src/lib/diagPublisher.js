// diagPublisher.js
// 計器の「書き手」を一本化する共有ヘルパー。HANDOFF-instrument-channels-2026-08-12.md §3 のゲートG4。
//
// ★塞ぐ失敗(#6・2026-08-12 実例): 成功が0件のとき storage に**何も書かない**書き手があった。
//   読み手は「キーが無い」を受け取るが、それが「まだ起きていない」なのか「壊れて書けていない」
//   なのか区別できない。しかも異常時ほど書かれないので、困っているときだけ計器が消える。
//   → publish は **無条件**。件数が0でも source と時点(timeAuthority の正本フィールド)を
//     持つ snapshot を必ず書く。時点の名前は buildSnapshot 側が正本から取る。
//
// ★source(面名)を必ず載せる(失敗#8): バンドルが面ごとに別なのでインスタンス共有はできない。
//   同名フィールドが popup と venue の両方に存在しうるため、書き手の面名を snapshot に持たせ、
//   読み手は source 不一致を R層で 🔴 にできるようにする。

/**
 * @typedef {(items: Record<string, unknown>) => (void|Promise<unknown>)} DiagSetter
 */

/**
 * 無条件 publish 関数を作る(ゲートG4が「書き手はこれ経由」を断言する対象)。
 *
 * 返る関数は **常に** setter を呼ぶ。呼び出し側で `if (count > 0)` の内側に置くことは禁止
 *   (registry の contract test が writerFile を静的検査して弾く)。
 *
 * @param {object} cfg
 * @param {string} cfg.key storage キー
 * @param {string} cfg.source 書き手の面名('popup'|'content'|'venue'|'sidepanel'|'status' 等)
 * @param {(state: unknown, nowMs: number) => Record<string, unknown>} cfg.buildSnapshot
 *   schema 方式の snapshot 組み立て(copyDiagBySchema 経由であること)
 * @param {DiagSetter} cfg.setItems storage 書き込み(safeStorageLocalSet 等)
 * @param {() => number} [cfg.now] 現在時刻(既定 Date.now・テストで差し替える)
 * @returns {(state: unknown) => void} publish(state)
 */
export function createDiagPublisher(cfg) {
  const key = cfg && typeof cfg.key === 'string' ? cfg.key : '';
  const source = cfg && typeof cfg.source === 'string' ? cfg.source : '';
  const buildSnapshot = cfg && typeof cfg.buildSnapshot === 'function' ? cfg.buildSnapshot : null;
  const setItems = cfg && typeof cfg.setItems === 'function' ? cfg.setItems : null;
  const now = cfg && typeof cfg.now === 'function' ? cfg.now : () => Date.now();

  return function publishDiag(state) {
    if (!key || !buildSnapshot || !setItems) return;
    let snap;
    try {
      const at = Number(now());
      snap = buildSnapshot(state, Number.isFinite(at) ? at : 0);
    } catch {
      // snapshot 組み立てが落ちても「書かない」で終わらせない(異常時ほど計器が要る)。
      snap = {};
    }
    const payload =
      snap && typeof snap === 'object' ? { ...snap, source } : { source };
    try {
      void setItems({ [key]: payload });
    } catch {
      /* storage 書き込み失敗は握る(計器が本体を壊さない) */
    }
  };
}
