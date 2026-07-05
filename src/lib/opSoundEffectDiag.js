/**
 * 操作音(opSoundDirector.js・Phase D1)の「押下→成功→発音」観測値を組み立てる純関数群。
 * 記録/演出/音には一切触れない(voiceEffectDiag.js / giftEffectDiag.js と同思想=
 * popup-entry.js が書き、status が読んで状態速報に再表示する)。
 *
 * 目的(council/operation-sound-SYNTHESIS.md Phase D1): 「押下は鳴るのに成功が無い」
 *   「成功しているのに発音が無い(op_shot_*未割当)」を状態速報1枚で見分けられるようにする。
 *   **嘘をつかない**: `fired` は playEffectSound の戻り値が 'played' のときだけ加算する
 *   (voiceEffectDiag.js と同じ規律。「鳴らそうとした」ではなく「実際に鳴った」だけを数える)。
 *
 * @typedef {{
 *   handlePressed: number,   // 押下/Enter/音声送信で送信処理に入った回数(op_handle トリガ回数)
 *   handleFired: number,     // op_handle が実際に鳴った回数(戻り値'played'のみ)
 *   shotSucceeded: number,   // result.ok=true になった回数(自分の投稿成功数の生カウント)
 *   shotFired: number,       // op_shot_* が実際に鳴った回数(戻り値'played'のみ)
 *   milestoneFired: number,  // op_self_milestone が実際に鳴った回数
 *   guardedCount: number,    // opSoundGate に弾かれた回数(family_guard/global_floor/p1_active合算)
 *   noPathCount: number,     // playEffectSound が 'no-path' を返した回数(未割当=無音)
 *   soundEnabled: boolean,   // 操作音マスタートグルがONか
 *   selfPostCount: number,   // 現在のliveIdでの自分の投稿成功数n(直近値)
 *   lastKind: string,        // 最後に鳴らそうとした/鳴ったop_*キー
 *   lastEventAt: number      // 最後にイベントが起きた時刻(epoch ms・0=未観測)
 * }} OpSoundEffectDiagState
 */

/** 初期 操作音診断 state。 */
export function makeInitialOpSoundEffectDiag() {
  return {
    handlePressed: 0,
    handleFired: 0,
    shotSucceeded: 0,
    shotFired: 0,
    milestoneFired: 0,
    guardedCount: 0,
    noPathCount: 0,
    soundEnabled: true,
    selfPostCount: 0,
    lastKind: '',
    lastEventAt: 0
  };
}

/**
 * playEffectSound の戻り値をカウンタのフィールド名に変換する純関数(嘘をつかない集計の核)。
 * @param {'played'|'guarded'|'no-path'|'error'} playResult
 * @returns {'fired'|'guarded'|'no-path'|null} null=数えない('error'は失敗理由不明のため計上しない)
 */
export function opSoundDiagFieldForPlayResult(playResult) {
  const r = String(playResult || '');
  if (r === 'played') return 'fired';
  if (r === 'guarded') return 'guarded';
  if (r === 'no-path') return 'no-path';
  return null;
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。
 * @param {Partial<OpSoundEffectDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {OpSoundEffectDiagState & { capturedAt: number }}
 */
export function buildOpSoundEffectDiagSnapshot(diag, nowMs) {
  const base = makeInitialOpSoundEffectDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    handlePressed: num(d.handlePressed, base.handlePressed),
    handleFired: num(d.handleFired, base.handleFired),
    shotSucceeded: num(d.shotSucceeded, base.shotSucceeded),
    shotFired: num(d.shotFired, base.shotFired),
    milestoneFired: num(d.milestoneFired, base.milestoneFired),
    guardedCount: num(d.guardedCount, base.guardedCount),
    noPathCount: num(d.noPathCount, base.noPathCount),
    soundEnabled: d.soundEnabled !== false,
    selfPostCount: num(d.selfPostCount, base.selfPostCount),
    lastKind: String(d.lastKind || ''),
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    capturedAt: now
  };
}

/**
 * 状態速報に出す行群を作る純関数。一度も操作音イベントが無ければ空配列
 * (ノイズにしない・voiceEffectDiag.js と同方針)。
 * @param {(OpSoundEffectDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildOpSoundEffectDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const handlePressed = Number(snap.handlePressed) || 0;
  const shotSucceeded = Number(snap.shotSucceeded) || 0;
  const total = handlePressed + shotSucceeded;
  if (total === 0) return []; // 未観測=このセッションで投稿操作が無かった
  const handleFired = Number(snap.handleFired) || 0;
  const shotFired = Number(snap.shotFired) || 0;
  const milestoneFired = Number(snap.milestoneFired) || 0;
  const guardedCount = Number(snap.guardedCount) || 0;
  const noPathCount = Number(snap.noPathCount) || 0;
  const soundEnabled = snap.soundEnabled !== false;
  const selfPostCount = Number(snap.selfPostCount) || 0;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const lastKindText = snap.lastKind ? `(${snap.lastKind})` : '';
  const lines = [];
  lines.push(`操作音: 効果音設定=${soundEnabled ? 'ON' : 'OFF'} / 自分の投稿数n=${selfPostCount}${agoText}${lastKindText}`);
  lines.push(
    `  → 押下${handlePressed}(発音${handleFired}) / 送信成功${shotSucceeded}(発音${shotFired}・節目${milestoneFired}) / ガード${guardedCount} / 未割当${noPathCount}`
  );
  return lines;
}
