/**
 * コメント数マイルストーン(100/200/500/1000/2000/3000/5000/10000件)の
 * 「検知→演出→効果音」が揃っているかの純観測値を組み立てる純関数群。
 * giftEffectDiag.js と同じ思想(記録/演出/音には一切触れない・popup-entry.js が書き
 * status が読んで状態速報に再表示する)。
 *
 * 目的(2026-07-04): 762件まで到達した配信でも状態速報に「コメント節目」「マイルストーン」の
 *   記述が一切出ず、発火したか外部から確認する手段がゼロだった穴を埋める(実装漏れ・バグではない)。
 *
 * @typedef {{
 *   milestoneDetected: number,     // コメント数マイルストーンを検知した回数(pickCommentMilestoneCelebrationがspecを返した回数)
 *   milestoneThrown: number,       // 演出(playSupportCelebrationDom)が実際に走った回数
 *   milestoneSoundPlayed: number,  // 効果音の再生を試みた回数(ガード通過後)
 *   soundEnabled: boolean,         // 効果音設定がONか(OFFなら鳴らないのが正常=誤診断防止)
 *   lastEventAt: number            // 最後にマイルストーンを検知した時刻(epoch ms・0=未検知)
 * }} MilestoneEffectDiagState
 */

/** 初期 マイルストーン効果診断 state。 */
export function makeInitialMilestoneEffectDiag() {
  return {
    milestoneDetected: 0,
    milestoneThrown: 0,
    milestoneSoundPlayed: 0,
    soundEnabled: true,
    lastEventAt: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット。
 * @param {Partial<MilestoneEffectDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {MilestoneEffectDiagState & { capturedAt: number }}
 */
export function buildMilestoneEffectDiagSnapshot(diag, nowMs) {
  const base = makeInitialMilestoneEffectDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    milestoneDetected: num(d.milestoneDetected, base.milestoneDetected),
    milestoneThrown: num(d.milestoneThrown, base.milestoneThrown),
    milestoneSoundPlayed: num(d.milestoneSoundPlayed, base.milestoneSoundPlayed),
    soundEnabled: d.soundEnabled !== false,
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    capturedAt: now
  };
}

/**
 * 取りこぼし判定。
 * @param {number} detected
 * @param {number} thrown
 * @param {number} soundPlayed
 * @returns {{ throwMissing: number, soundMissing: number }}
 */
function diffCounts(detected, thrown, soundPlayed) {
  return {
    throwMissing: Math.max(0, detected - thrown),
    soundMissing: Math.max(0, thrown - soundPlayed)
  };
}

/**
 * 状態速報に出す行群を作る純関数。一度もマイルストーンが検知されていない(未観測)なら空配列
 * (ノイズにしない・giftEffectDiag/voiceDiag と同方針)。
 * @param {(MilestoneEffectDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildMilestoneEffectDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const detected = Number(snap.milestoneDetected) || 0;
  if (detected === 0) return []; // 未観測=このセッションでマイルストーン到達が無かった
  const soundEnabled = snap.soundEnabled !== false;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const thrown = Number(snap.milestoneThrown) || 0;
  const soundPlayed = Number(snap.milestoneSoundPlayed) || 0;
  const { throwMissing, soundMissing } = diffCounts(detected, thrown, soundPlayed);
  const throwMark = throwMissing > 0 ? `⚠${throwMissing}件出ていない` : '✅';
  // 効果音 OFF は鳴らないのが正常=🔴にしない(誤診断防止)。ON なのに鳴っていない時だけ警告。
  const soundMark = !soundEnabled ? '(OFF)' : soundMissing > 0 ? `⚠${soundMissing}件鳴っていない` : '✅';
  return [
    `コメント数マイルストーン演出・効果音: 効果音設定=${soundEnabled ? 'ON' : 'OFF'}${agoText}`,
    `  → 検知${detected} → 演出${thrown} ${throwMark} → 音${soundPlayed} ${soundMark}`
  ];
}

/**
 * 致命カード(症状→原因→次の一手)用の判定。buildStatusActions の結果に結合する形。
 * @param {(MilestoneEffectDiagState & { capturedAt?: number })|null|undefined} snap
 * @returns {Array<{id:string,severity:string,symptom:string,cause:string,action:string,fixableHere:string}>}
 */
export function milestoneEffectDiagToActionCards(snap) {
  if (!snap || typeof snap !== 'object') return [];
  const detected = Number(snap.milestoneDetected) || 0;
  if (detected === 0) return [];
  const soundEnabled = snap.soundEnabled !== false;
  const thrown = Number(snap.milestoneThrown) || 0;
  const soundPlayed = Number(snap.milestoneSoundPlayed) || 0;
  const { throwMissing, soundMissing } = diffCounts(detected, thrown, soundPlayed);
  /** @type {Array<{id:string,severity:string,symptom:string,cause:string,action:string,fixableHere:string}>} */
  const cards = [];
  if (throwMissing > 0) {
    cards.push({
      id: 'milestone-effect-throw-missing',
      severity: 'warn',
      symptom: `コメント数マイルストーンを検知したのに演出が出ていません(検知${detected}件 → 演出${thrown}件)`,
      cause: 'popupCelebrationGate のブロック判定、または dedupe(同一マイルストーンの二重発火防止)で捨てられている疑いです。',
      action: 'この状態速報を開発者(Claude)に共有してください。取りこぼし箇所を実コードで特定して直します。',
      fixableHere: 'no'
    });
  }
  if (soundEnabled && soundMissing > 0) {
    cards.push({
      id: 'milestone-effect-sound-missing',
      severity: 'warn',
      symptom: `コメント数マイルストーンの演出は出たのに効果音が鳴っていません(演出${thrown}件 → 音${soundPlayed}件)`,
      cause: 'effectSoundKindForPikaTier が対応する音種を返していない、または効果音再生自体が呼ばれていない疑いです。',
      action: 'この状態速報を開発者(Claude)に共有してください。効果音の呼び出し漏れを実コードで特定して直します。',
      fixableHere: 'no'
    });
  }
  return cards;
}
