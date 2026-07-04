/**
 * ギフト/広告の「検知→演出(投擲)→効果音」が揃っているかの純観測値を組み立てる純関数群。
 * 記録/演出/音には一切触れない(voiceDiag.js / venueSeatsDiag.js と同思想=venueBar.js が書き
 * status が読んで状態速報に再表示する)。
 *
 * 目的(2026-07-04 ユーザー要望): 「ギフトがちゃんと飛ぶか・タイミングよく音が出るか」を実機で
 *   毎回目視せずとも状態速報1枚で確認できるようにする。3段階のカウンタを比較し、
 *   検知はしたのに演出/音が出ない取りこぼしを数値のズレとして可視化する。
 *
 * @typedef {{
 *   giftDetected: number,      // ギフトを検知した回数(resolveGiftProjectile 呼び出し前)
 *   giftThrown: number,        // ギフトの投擲演出(launchGiftThrow)が実際に走った回数
 *   giftSoundPlayed: number,   // ギフト効果音の再生を試みた回数(ガード通過後)
 *   adDetected: number,        // 広告を検知した回数
 *   adThrown: number,          // 広告の投擲演出が実際に走った回数
 *   adSoundPlayed: number,     // 広告効果音の再生を試みた回数
 *   soundEnabled: boolean,     // 効果音設定が ON か(OFF なら鳴らないのが正常=誤診断防止)
 *   lastEventAt: number        // 最後にギフト/広告いずれかを検知した時刻(epoch ms・0=未検知)
 * }} GiftEffectDiagState
 */

/** 初期 ギフト効果診断 state。 */
export function makeInitialGiftEffectDiag() {
  return {
    giftDetected: 0,
    giftThrown: 0,
    giftSoundPlayed: 0,
    adDetected: 0,
    adThrown: 0,
    adSoundPlayed: 0,
    soundEnabled: true,
    lastEventAt: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット。
 * @param {Partial<GiftEffectDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {GiftEffectDiagState & { capturedAt: number }}
 */
export function buildGiftEffectDiagSnapshot(diag, nowMs) {
  const base = makeInitialGiftEffectDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    giftDetected: num(d.giftDetected, base.giftDetected),
    giftThrown: num(d.giftThrown, base.giftThrown),
    giftSoundPlayed: num(d.giftSoundPlayed, base.giftSoundPlayed),
    adDetected: num(d.adDetected, base.adDetected),
    adThrown: num(d.adThrown, base.adThrown),
    adSoundPlayed: num(d.adSoundPlayed, base.adSoundPlayed),
    soundEnabled: d.soundEnabled !== false,
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    capturedAt: now
  };
}

/**
 * 1系統(ギフト or 広告)の取りこぼし判定。
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
 * 状態速報に出す行群を作る純関数。一度もギフト/広告が検知されていない(未観測)なら空配列
 * (ノイズにしない・voiceDiag と同方針)。
 * @param {(GiftEffectDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildGiftEffectDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const giftDetected = Number(snap.giftDetected) || 0;
  const adDetected = Number(snap.adDetected) || 0;
  if (giftDetected === 0 && adDetected === 0) return []; // 未観測=このセッションでギフト/広告が無かった
  const soundEnabled = snap.soundEnabled !== false;
  const lines = [];
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  lines.push(`ギフト/広告演出・効果音: 効果音設定=${soundEnabled ? 'ON' : 'OFF'}${agoText}`);

  if (giftDetected > 0) {
    const giftThrown = Number(snap.giftThrown) || 0;
    const giftSoundPlayed = Number(snap.giftSoundPlayed) || 0;
    const { throwMissing, soundMissing } = diffCounts(giftDetected, giftThrown, giftSoundPlayed);
    const throwMark = throwMissing > 0 ? `⚠${throwMissing}件飛んでいない` : '✅';
    // 効果音 OFF は鳴らないのが正常=🔴にしない(誤診断防止)。ON なのに鳴っていない時だけ警告。
    const soundMark = !soundEnabled ? '(OFF)' : soundMissing > 0 ? `⚠${soundMissing}件鳴っていない` : '✅';
    lines.push(`  → ギフト: 検知${giftDetected} → 演出${giftThrown} ${throwMark} → 音${giftSoundPlayed} ${soundMark}`);
  }
  if (adDetected > 0) {
    const adThrown = Number(snap.adThrown) || 0;
    const adSoundPlayed = Number(snap.adSoundPlayed) || 0;
    const { throwMissing, soundMissing } = diffCounts(adDetected, adThrown, adSoundPlayed);
    const throwMark = throwMissing > 0 ? `⚠${throwMissing}件飛んでいない` : '✅';
    const soundMark = !soundEnabled ? '(OFF)' : soundMissing > 0 ? `⚠${soundMissing}件鳴っていない` : '✅';
    lines.push(`  → 広告: 検知${adDetected} → 演出${adThrown} ${throwMark} → 音${adSoundPlayed} ${soundMark}`);
  }
  return lines;
}

/**
 * 致命カード(症状→原因→次の一手)用の判定。buildStatusActions の結果に結合する形。
 * @param {(GiftEffectDiagState & { capturedAt?: number })|null|undefined} snap
 * @returns {Array<{id:string,severity:string,symptom:string,cause:string,action:string,fixableHere:string}>}
 */
export function giftEffectDiagToActionCards(snap) {
  if (!snap || typeof snap !== 'object') return [];
  const soundEnabled = snap.soundEnabled !== false;
  /** @type {Array<{id:string,severity:string,symptom:string,cause:string,action:string,fixableHere:string}>} */
  const cards = [];
  /** @param {'gift'|'ad'} kind @param {number} detected @param {number} thrown @param {number} soundPlayed */
  const check = (kind, detected, thrown, soundPlayed) => {
    const { throwMissing, soundMissing } = diffCounts(detected, thrown, soundPlayed);
    if (throwMissing > 0) {
      cards.push({
        id: `gift-effect-throw-missing-${kind}`,
        severity: 'warn',
        symptom: `${kind === 'gift' ? 'ギフト' : '広告'}を検知したのに投擲演出が出ていません(検知${detected}件 → 演出${thrown}件)`,
        cause: 'resolveGiftProjectile が null を返している(point が不正/未対応アイテム等)か、launchGiftThrow の呼び出し漏れの疑いです。',
        action: 'この状態速報を開発者(Claude)に共有してください。取りこぼし箇所を実コードで特定して直します。',
        fixableHere: 'no'
      });
    }
    if (soundEnabled && soundMissing > 0) {
      cards.push({
        id: `gift-effect-sound-missing-${kind}`,
        severity: 'warn',
        symptom: `${kind === 'gift' ? 'ギフト' : '広告'}の演出は出たのに効果音が鳴っていません(演出${thrown}件 → 音${soundPlayed}件)`,
        cause: '会場優先の二重再生ガードで意図的にスキップされたか、効果音再生自体が呼ばれていない疑いです。',
        action: 'この状態速報を開発者(Claude)に共有してください。効果音の呼び出し漏れを実コードで特定して直します。',
        fixableHere: 'no'
      });
    }
  };
  check('gift', Number(snap.giftDetected) || 0, Number(snap.giftThrown) || 0, Number(snap.giftSoundPlayed) || 0);
  check('ad', Number(snap.adDetected) || 0, Number(snap.adThrown) || 0, Number(snap.adSoundPlayed) || 0);
  return cards;
}
