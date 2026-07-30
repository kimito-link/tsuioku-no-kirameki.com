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
 *   giftSoundPlayed: number,   // ギフト効果音を実際に鳴らした回数(v0.1.1061: 「試みた」でなく戻り値'played'のみ)
 *   giftSoundCoalesced: number, // v0.1.1061: バースト置換で予約済みの1本に統合(昇格)された件数=意図的な統合であり取りこぼしではない
 *   giftSoundGuarded: number,  // 修正3: playEffectSoundが'guarded'(同種600msガード)を返した回数=正常動作
 *   giftSoundNoPath: number,   // 修正3: playEffectSoundが'no-path'(未割当/パス解決失敗)を返した回数
 *   giftSoundError: number,    // 修正3: playEffectSoundが'error'(再生失敗)を返した回数
 *   giftSoundOff: number,      // v0.1.1091: 効果音設定OFFで即returnした回数。従来この'off'はどこにも計上されず「内訳が全部ゼロなのに音が消える」根因だった
 *   adDetected: number,        // 広告を検知した回数
 *   adThrown: number,          // 広告の投擲演出が実際に走った回数
 *   adSoundPlayed: number,     // 広告効果音の再生を試みた回数
 *   soundEnabled: boolean,     // 効果音設定が ON か(OFF なら鳴らないのが正常=誤診断防止)
 *   lastEventAt: number,       // 最後にギフト/広告いずれかを検知した時刻(epoch ms・0=未検知)
 *   lastSoundGapMs: number,    // v0.1.1088: 直近1件の「検知→音」体感遅延ms(-1=未計測)
 *   lastBurstGapMs: number,    // v0.1.1088: 直近1件の「検知→着弾演出」体感遅延ms(-1=未計測)
 *   avgSoundGapMs: number,     // v0.1.1088: 検知→音のEMA平均ms(-1=未計測)
 *   avgBurstGapMs: number,     // v0.1.1088: 検知→着弾のEMA平均ms(-1=未計測)
 *   deltaSynthesized: number,  // v0.1.1090: giftDeltaFallback.js の帳簿デルタで合成した件数(個別イベント欠落配信のフォールバック)
 *   deltaPoints: number,       // v0.1.1090: デルタ合成で計上した累計pt(嘘をつかない=本物と区別して表示するための内訳)
 *   arrivalDetected: number,   // 2026-07-06: 来場システムメッセージを検知した回数(parseArrivalCommentText がヒットした回数)
 *   arrivalThrown: number,     // 来場の入賞演出(launchGiftThrow)が実際に走った回数
 *   arrivalSoundPlayed: number, // 来場効果音を実際に鳴らした回数(戻り値'played'のみ)
 *   arrivalSkippedCd: number,  // 来場演出専用20秒CD中でスキップした回数(積み増し禁止=正常動作)
 *   throwPointFallbackUsed: number, // 2026-07-06: 投擲の起点/着弾座標が(0,0)/領域外/NaN等でresolveVisibleThrowPointの既定位置へ差し替わった回数(=「音は鳴るが飛翔が見えない」の元凶を可視の既定へ救済した回数)
 *   giftThrowCapGuarded: number, // 2026-07-30: ギフトがcanLaunchGiftThrow(同時投擲上限GIFT_THROW_MAX_CONCURRENT)超過でlaunchGiftThrowがfalseを返し、演出を意図的に捨てた回数(性能ガード=正常動作)
 *   adThrowCapGuarded: number   // 2026-07-30: 広告版のgiftThrowCapGuarded(投擲上限は種別を問わず共有=giftProjActiveが同一カウンタのため)
 * }} GiftEffectDiagState
 */

/** 初期 ギフト効果診断 state。 */
export function makeInitialGiftEffectDiag() {
  return {
    giftDetected: 0,
    giftThrown: 0,
    giftSoundPlayed: 0,
    giftSoundCoalesced: 0,
    giftSoundGuarded: 0,
    giftSoundNoPath: 0,
    giftSoundError: 0,
    giftSoundOff: 0,
    adDetected: 0,
    adThrown: 0,
    adSoundPlayed: 0,
    soundEnabled: true,
    lastEventAt: 0,
    lastSoundGapMs: -1,
    lastBurstGapMs: -1,
    avgSoundGapMs: -1,
    avgBurstGapMs: -1,
    deltaSynthesized: 0,
    deltaPoints: 0,
    arrivalDetected: 0,
    arrivalThrown: 0,
    arrivalSoundPlayed: 0,
    arrivalSkippedCd: 0,
    throwPointFallbackUsed: 0,
    giftThrowCapGuarded: 0,
    adThrowCapGuarded: 0
  };
}

/**
 * v0.1.1088計器: 「検知→音/着弾」のAVギャップをEMAで均す純関数。voicePlayer.js の
 *   computeVoiceE2eAverage と同じ考え方(窓バッファ無し=メモリ有界・純粋)をギフト側にも適用。
 * @param {unknown} prevAvgMs 直前の平均値(-1=未計測)
 * @param {unknown} sampleMs 今回の実測値(ms)
 * @param {number} [alpha] EMA係数(既定0.3)
 * @returns {number} 更新後の平均値(ms・整数丸め)
 */
export function computeGiftGapAverage(prevAvgMs, sampleMs, alpha = 0.3) {
  const sample = Number(sampleMs);
  if (!Number.isFinite(sample) || sample < 0) {
    const prev = Number(prevAvgMs);
    return Number.isFinite(prev) ? prev : -1;
  }
  const prev = Number(prevAvgMs);
  if (!Number.isFinite(prev) || prev < 0) return Math.round(sample);
  return Math.round(prev + alpha * (sample - prev));
}

/**
 * playEffectSound の戻り値をギフト診断カウンタのフィールド名に変換する純関数(修正3)。
 *   opSoundDiagFieldForPlayResult / voiceSkipFieldForGateReason と同じ「戻り値だけを見て
 *   数える」規律(嘘をつかない)。'played'は呼び出し側がgiftSoundPlayedへ直接加算する
 *   (既存の意図的な省略=coalesced経路との整合を保つため、ここでは非played分だけを扱う)。
 * @param {'played'|'guarded'|'no-path'|'error'} playResult
 * @returns {'giftSoundGuarded'|'giftSoundNoPath'|'giftSoundError'|null}
 */
export function giftSoundDiagFieldForPlayResult(playResult) {
  const r = String(playResult || '');
  if (r === 'guarded') return 'giftSoundGuarded';
  if (r === 'no-path') return 'giftSoundNoPath';
  if (r === 'error') return 'giftSoundError';
  return null;
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
    giftSoundCoalesced: num(d.giftSoundCoalesced, base.giftSoundCoalesced),
    giftSoundGuarded: num(d.giftSoundGuarded, base.giftSoundGuarded),
    giftSoundNoPath: num(d.giftSoundNoPath, base.giftSoundNoPath),
    giftSoundError: num(d.giftSoundError, base.giftSoundError),
    giftSoundOff: num(d.giftSoundOff, base.giftSoundOff),
    adDetected: num(d.adDetected, base.adDetected),
    adThrown: num(d.adThrown, base.adThrown),
    adSoundPlayed: num(d.adSoundPlayed, base.adSoundPlayed),
    soundEnabled: d.soundEnabled !== false,
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    lastSoundGapMs: num(d.lastSoundGapMs, base.lastSoundGapMs),
    lastBurstGapMs: num(d.lastBurstGapMs, base.lastBurstGapMs),
    avgSoundGapMs: num(d.avgSoundGapMs, base.avgSoundGapMs),
    avgBurstGapMs: num(d.avgBurstGapMs, base.avgBurstGapMs),
    deltaSynthesized: num(d.deltaSynthesized, base.deltaSynthesized),
    deltaPoints: num(d.deltaPoints, base.deltaPoints),
    arrivalDetected: num(d.arrivalDetected, base.arrivalDetected),
    arrivalThrown: num(d.arrivalThrown, base.arrivalThrown),
    arrivalSoundPlayed: num(d.arrivalSoundPlayed, base.arrivalSoundPlayed),
    arrivalSkippedCd: num(d.arrivalSkippedCd, base.arrivalSkippedCd),
    throwPointFallbackUsed: num(d.throwPointFallbackUsed, base.throwPointFallbackUsed),
    giftThrowCapGuarded: num(d.giftThrowCapGuarded, base.giftThrowCapGuarded),
    adThrowCapGuarded: num(d.adThrowCapGuarded, base.adThrowCapGuarded),
    capturedAt: now
  };
}

/**
 * 1系統(ギフト or 広告)の取りこぼし判定(修正3: guarded/noPath/errorの内訳で説明できる分を
 *   除外してから残りを計算する。「⚠N件鳴っていない」は内訳で説明できない分だけに絞る=
 *   意図した動き(600msガード等)を取りこぼしとして騙って警告しない)。
 * 2026-07-30: throwMissing側にも同じ思想を適用する。canLaunchGiftThrow(同時投擲上限)
 *   超過でlaunchGiftThrowがfalseを返した件数(throwExplained)は性能ガードによる正常動作
 *   なので、内訳で説明できる分だけ取りこぼしから除外する。
 * @param {number} detected
 * @param {number} thrown
 * @param {number} soundPlayed
 * @param {number} [soundCoalesced] バースト置換で統合された件数(意図的=取りこぼしに数えない)
 * @param {number} [soundExplained] guarded+noPath+errorの合計(内訳が判明している分=取りこぼしに数えない)
 * @param {number} [throwExplained] 同時投擲上限超過等、演出を意図的に捨てた件数(内訳が判明している分=取りこぼしに数えない)
 * @returns {{ throwMissing: number, soundMissing: number }}
 */
function diffCounts(detected, thrown, soundPlayed, soundCoalesced = 0, soundExplained = 0, throwExplained = 0) {
  return {
    throwMissing: Math.max(0, detected - thrown - Math.max(0, throwExplained)),
    soundMissing: Math.max(0, thrown - soundPlayed - Math.max(0, soundCoalesced) - Math.max(0, soundExplained))
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
  const deltaSynthesized = Number(snap.deltaSynthesized) || 0;
  const arrivalDetected = Number(snap.arrivalDetected) || 0;
  if (giftDetected === 0 && adDetected === 0 && deltaSynthesized === 0 && arrivalDetected === 0) return []; // 未観測=このセッションでギフト/広告/来場が無かった
  const soundEnabled = snap.soundEnabled !== false;
  const lines = [];
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  lines.push(`ギフト/広告演出・効果音: 効果音設定=${soundEnabled ? 'ON' : 'OFF'}${agoText}`);
  // 2026-07-06: 投擲座標の既定フォールバック使用回数(嘘をつかない=救済したことも見えるようにする)。
  //   0回なら出さない(ノイズにしない・他の行と同方針)。
  const throwPointFallbackUsed = Number(snap.throwPointFallbackUsed) || 0;
  if (throwPointFallbackUsed > 0) {
    lines.push(`  → 投擲座標フォールバック: ${throwPointFallbackUsed}件(起点/着弾が未確定で既定位置へ救済)`);
  }

  if (giftDetected > 0 || deltaSynthesized > 0) {
    const giftThrown = Number(snap.giftThrown) || 0;
    const giftSoundPlayed = Number(snap.giftSoundPlayed) || 0;
    const giftSoundCoalesced = Number(snap.giftSoundCoalesced) || 0;
    const giftSoundGuarded = Number(snap.giftSoundGuarded) || 0;
    const giftSoundNoPath = Number(snap.giftSoundNoPath) || 0;
    const giftSoundError = Number(snap.giftSoundError) || 0;
    const giftSoundOff = Number(snap.giftSoundOff) || 0;
    const giftThrowCapGuarded = Number(snap.giftThrowCapGuarded) || 0;
    const soundExplained = giftSoundGuarded + giftSoundNoPath + giftSoundError + giftSoundOff;
    const { throwMissing, soundMissing } = diffCounts(giftDetected, giftThrown, giftSoundPlayed, giftSoundCoalesced, soundExplained, giftThrowCapGuarded);
    const throwMark = throwMissing > 0 ? `⚠${throwMissing}件飛んでいない` : '✅';
    // 修正3: 内訳(guarded/noPath/error/off)で説明できる時は⚠にしない(意図した動き=嘘をつかない)。
    //   説明できない残りがある時だけ⚠にする(件数が本当に合わない時)。
    const soundMark = !soundEnabled ? '(OFF)' : soundMissing > 0 ? `⚠${soundMissing}件鳴っていない` : '✅';
    // v0.1.1061: 置換(バースト統合)は意図した動きなので件数を明記しつつ⚠にしない=嘘をつかない。
    const coalescedText = giftSoundCoalesced > 0 ? `(+置換${giftSoundCoalesced})` : '';
    // 2026-07-30: 同時投擲上限(GIFT_THROW_MAX_CONCURRENT)超過で捨てた件数=性能ガードによる
    //   正常動作。内訳として明記し、throwMissingの誤診断(⚠扱い)を防ぐ(音側と同じ思想)。
    const throwCapText = giftThrowCapGuarded > 0 ? ` / 上限超過${giftThrowCapGuarded}` : '';
    // 修正3: ガード(600ms同種ガード)は正常動作なので内訳を明記する。未割当/エラーも同様に内訳表示。
    // v0.1.1091: off(効果音設定OFFの瞬間に鳴らそうとした)も同じ思想で内訳に明記する
    //   (soundEnabled=ONの時にoff>0が出ることがある=設定が短時間OFF→ONだった痕跡)。
    const explainedParts = [];
    if (giftSoundGuarded > 0) explainedParts.push(`ガード${giftSoundGuarded}`);
    if (giftSoundNoPath > 0) explainedParts.push(`未割当${giftSoundNoPath}`);
    if (giftSoundError > 0) explainedParts.push(`エラー${giftSoundError}`);
    if (giftSoundOff > 0) explainedParts.push(`OFF時${giftSoundOff}`);
    const explainedText = explainedParts.length > 0 ? ` / ${explainedParts.join(' ')}` : '';
    // v0.1.1090: 個別イベント欠落配信のデルタ補完検知(giftDeltaFallback.js)。本物と合成を
    //   区別して表示する(嘘をつかない=合成であることを隠さない)。
    const deltaPoints = Number(snap.deltaPoints) || 0;
    const deltaText = deltaSynthesized > 0 ? `(うちデルタ補完${deltaSynthesized}件・${deltaPoints.toLocaleString('ja-JP')}pt)` : '';
    lines.push(`  → ギフト: 検知${giftDetected} → 演出${giftThrown} ${throwMark}${throwCapText} → 音${giftSoundPlayed}${coalescedText} ${soundMark}${explainedText}${deltaText}`);
    // v0.1.1088計器: 「検知→音/着弾」の体感ギャップ(実測)。未計測(-1)なら出さない(ノイズにしない)。
    const lastSoundGap = Number(snap.lastSoundGapMs);
    const lastBurstGap = Number(snap.lastBurstGapMs);
    const avgSoundGap = Number(snap.avgSoundGapMs);
    const avgBurstGap = Number(snap.avgBurstGapMs);
    const gapParts = [];
    if (Number.isFinite(lastSoundGap) && lastSoundGap >= 0) {
      const avgText = Number.isFinite(avgSoundGap) && avgSoundGap >= 0 ? `/平均${(avgSoundGap / 1000).toFixed(1)}秒` : '';
      gapParts.push(`音+${(lastSoundGap / 1000).toFixed(1)}秒${avgText}`);
    }
    if (Number.isFinite(lastBurstGap) && lastBurstGap >= 0) {
      const avgText = Number.isFinite(avgBurstGap) && avgBurstGap >= 0 ? `/平均${(avgBurstGap / 1000).toFixed(1)}秒` : '';
      gapParts.push(`着弾+${(lastBurstGap / 1000).toFixed(1)}秒${avgText}`);
    }
    if (gapParts.length > 0) lines.push(`  → 体感遅延: ${gapParts.join(' / ')}`);
  }
  if (adDetected > 0) {
    const adThrown = Number(snap.adThrown) || 0;
    const adSoundPlayed = Number(snap.adSoundPlayed) || 0;
    const adThrowCapGuarded = Number(snap.adThrowCapGuarded) || 0;
    const { throwMissing, soundMissing } = diffCounts(adDetected, adThrown, adSoundPlayed, 0, 0, adThrowCapGuarded);
    const throwMark = throwMissing > 0 ? `⚠${throwMissing}件飛んでいない` : '✅';
    const soundMark = !soundEnabled ? '(OFF)' : soundMissing > 0 ? `⚠${soundMissing}件鳴っていない` : '✅';
    // 2026-07-30: ギフトと同じ思想(同時投擲上限超過は性能ガード=正常動作の内訳表示)。
    const throwCapText = adThrowCapGuarded > 0 ? ` / 上限超過${adThrowCapGuarded}` : '';
    lines.push(`  → 広告: 検知${adDetected} → 演出${adThrown} ${throwMark}${throwCapText} → 音${adSoundPlayed} ${soundMark}`);
  }
  if (arrivalDetected > 0) {
    // 2026-07-06: 来場入賞演出の内訳。CDスキップは意図した動き(積み増し禁止)なので取りこぼしに
    //   数えず内訳として明記する(嘘をつかない=ギフト系のガード/未割当表示と同じ思想)。
    const arrivalThrown = Number(snap.arrivalThrown) || 0;
    const arrivalSoundPlayed = Number(snap.arrivalSoundPlayed) || 0;
    const arrivalSkippedCd = Number(snap.arrivalSkippedCd) || 0;
    const { throwMissing, soundMissing } = diffCounts(arrivalDetected, arrivalThrown, arrivalSoundPlayed, 0, 0);
    // CDでスキップした分は「検知はしたが意図的に演出しなかった」= throwMissing から差し引く。
    const explainedThrowMissing = Math.max(0, throwMissing - arrivalSkippedCd);
    const throwMark = explainedThrowMissing > 0 ? `⚠${explainedThrowMissing}件飛んでいない` : '✅';
    const soundMark = !soundEnabled ? '(OFF)' : soundMissing > 0 ? `⚠${soundMissing}件鳴っていない` : '✅';
    const cdText = arrivalSkippedCd > 0 ? ` / CD中${arrivalSkippedCd}件スキップ` : '';
    lines.push(`  → 来場入賞: 検知${arrivalDetected} → 演出${arrivalThrown} ${throwMark} → 音${arrivalSoundPlayed} ${soundMark}${cdText}`);
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
  /** @param {'gift'|'ad'} kind @param {number} detected @param {number} thrown @param {number} soundPlayed @param {number} [soundCoalesced] @param {number} [soundExplained] @param {number} [throwExplained] */
  const check = (kind, detected, thrown, soundPlayed, soundCoalesced = 0, soundExplained = 0, throwExplained = 0) => {
    const { throwMissing, soundMissing } = diffCounts(detected, thrown, soundPlayed, soundCoalesced, soundExplained, throwExplained);
    // 修正3と同じ思想(2026-07-30): 同時投擲上限超過(throwExplained)で説明できる分は
    //   diffCountsが既に取りこぼしから除外している。それでも残りがある時だけカードを出す。
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
    // 修正3: guarded/noPath/errorの内訳で説明できる分は取りこぼしから除外済み(diffCounts)。
    //   それでも残りがある(=内訳で説明できない)時だけカードを出す。
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
  check(
    'gift',
    Number(snap.giftDetected) || 0,
    Number(snap.giftThrown) || 0,
    Number(snap.giftSoundPlayed) || 0,
    Number(snap.giftSoundCoalesced) || 0,
    (Number(snap.giftSoundGuarded) || 0) + (Number(snap.giftSoundNoPath) || 0) + (Number(snap.giftSoundError) || 0) + (Number(snap.giftSoundOff) || 0),
    Number(snap.giftThrowCapGuarded) || 0
  );
  check(
    'ad',
    Number(snap.adDetected) || 0,
    Number(snap.adThrown) || 0,
    Number(snap.adSoundPlayed) || 0,
    0,
    0,
    Number(snap.adThrowCapGuarded) || 0
  );
  return cards;
}
