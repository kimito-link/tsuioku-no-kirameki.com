/**
 * popup / inline コメント再描画の可視性ゲート（v0.1.440）。
 *
 * 背景（実機・複数タブ「—」固まり）:
 *   多タブ(4-7 枚)で同じ拡張 popup を開くと、storage.onChanged が他タブの書込で N 倍に
 *   発火し、popup の refresh() reflow が N 倍走る。これが多タブ「—」固まりの主因の 1 つ
 *   （[[reference_multitab_scale_ultraC_leader_election]] の指摘・v0.1.337/0.1.398/0.1.437
 *   でも対症療法を重ねたが完全根治には至っていない）。
 *
 *   ただし「隠れタブ(document.hidden===true)」では描画結果は誰にも見えない＝再描画する
 *   必要が無い。世界標準(uBlock Origin / RxDB / DarkReader 共通)：見えないなら描画しない。
 *
 * 設計:
 *   - 純関数：可視性判定だけを返し、実 refresh 呼び出しは呼出側の責務（描画パスには触らない＝
 *     v0.1.421/422 パネル消失リグレッションを構造的に再発させない）。
 *   - 可視復帰時の catch-up は popup-entry の既存 `visibilitychange` listener が担う（既存パス）。
 *   - `gateEnabled=false` フォールバックを残し、緊急時は配線 1 行で v0.1.439 挙動へ戻せる。
 *   - 初回描画完了前は必ず 'run'＝初期化中の表示空白を避ける（initialDone ガード）。
 *
 * @typedef {'run'|'skip'} VisibilityAction
 *
 * @param {{
 *   hidden?: unknown,
 *   gateEnabled?: boolean,
 *   initialDone?: boolean
 * }} args
 *   hidden: 現在のドキュメントが hidden か（`document.hidden === true` で判定推奨）。
 *   gateEnabled: ゲートを有効化するか（既定 true・false で従来動作にフォールバック）。
 *   initialDone: 初回 refresh が完了済みか（既定 true・false で初期化中は必ず通す）。
 * @returns {VisibilityAction}
 */
export function decideVisibilityAction(args) {
  const gateEnabled = args && args.gateEnabled === false ? false : true;
  if (!gateEnabled) return 'run';
  const initialDone = args && args.initialDone === false ? false : true;
  if (!initialDone) return 'run';
  const hidden = !!(args && args.hidden === true);
  return hidden ? 'skip' : 'run';
}
