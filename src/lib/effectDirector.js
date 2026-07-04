// effectDirector.js
// 「演出ディレクター」層(パチンコ的ゲーム性 Phase 1・Fable設計 2026-07-04)。
//   新エンジンは作らず、リアルタイムイベント(ギフト/コメント数マイルストーン)を
//   「盛り上がりメーター(溜め)」と「コンボ昇格(畳み掛け)」に変換する薄い純関数層。
//
// 設計原則(council/sound-and-pachinko-gamification.md・ユーザー確定):
//   - 決定論のみ。乱数・確率的な激アツ演出は禁止(ギャンブル前提に抵触)。
//   - コンボは「加算でなく置換」: 連続Hitは個別演出を並べず、昇格後ティア1本に置き換える。
//   - この層は計算だけ。DOM・storage・音の再生には一切触れない(呼び出し元が使う)。

/** 盛り上がりメーターの半減期(ms)。60秒でメーター値が半分に減衰する。 */
export const METER_HALF_LIFE_MS = 60_000;

/** コンボ窓(ms)。前のHitから30秒以内の次Hitはコンボ継続=ティア昇格の対象。 */
export const COMBO_WINDOW_MS = 30_000;

/**
 * マイルストーン音のティア梯子(弱→強)。値は effectSoundPlayer.js の EFFECT_SOUND_KINDS /
 * EFFECT_SOUND_VARIANT_PATHS のキーそのもの(directHit の結果をそのまま playEffectSound に渡せる)。
 */
export const MILESTONE_TIER_LADDER = Object.freeze([
  'milestone_soft',
  'milestone_hard',
  'milestone_jackpot'
]);

/** ギフト音のティア梯子(弱→強)。giftThrowProjectile.js の tier(small〜mega)に対応。 */
export const GIFT_TIER_LADDER = Object.freeze([
  'gift_small',
  'gift_medium',
  'gift_large',
  'gift_mega'
]);

/**
 * @typedef {{ value: number, updatedAt: number }} ExcitementMeterState
 *   value: 現在のメーター値(0以上・単位は呼び出し元が足す重みの累積)。
 *   updatedAt: 最後に更新した時刻(epoch ms・0=未更新)。
 */

/** 初期メーター state。 */
export function makeInitialExcitementMeter() {
  return { value: 0, updatedAt: 0 };
}

/**
 * 減衰付き積算メーターを1歩進める純関数。
 *   前回値を経過時間ぶん指数減衰(半減期 METER_HALF_LIFE_MS)させてから addWeight を足す。
 *   決定論: 同じ(prev, nowMs, addWeight)には常に同じ結果。時計が逆行したら減衰0として扱う。
 * @param {Partial<ExcitementMeterState>|null|undefined} prev 前回 state(null=初期状態から)
 * @param {number} nowMs 現在時刻(epoch ms)
 * @param {number} [addWeight] 今回のイベントの重み(省略=0で減衰のみ)
 * @param {{ halfLifeMs?: number }} [opts]
 * @returns {ExcitementMeterState}
 */
export function meterStateFor(prev, nowMs, addWeight = 0, opts = {}) {
  const halfLife = Number(opts.halfLifeMs) > 0 ? Number(opts.halfLifeMs) : METER_HALF_LIFE_MS;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const p = prev && typeof prev === 'object' ? prev : null;
  const prevValue = Math.max(0, Number(p?.value) || 0);
  const prevAt = Math.max(0, Number(p?.updatedAt) || 0);
  const elapsed = prevAt > 0 ? Math.max(0, now - prevAt) : 0;
  const decayed = prevValue > 0 ? prevValue * Math.pow(0.5, elapsed / halfLife) : 0;
  const add = Math.max(0, Number(addWeight) || 0);
  return { value: decayed + add, updatedAt: now };
}

/**
 * @typedef {{ lastHitAt: number, comboCount: number, kind: string, promotedSteps: number }} ComboHitState
 *   lastHitAt: このHitの時刻(epoch ms)。次回の directHit にそのまま渡す。
 *   comboCount: コンボ窓内で続いたHit数(窓を外れたら1に戻る)。
 *   kind: 置換再生すべき効果音キー(昇格済み)。EFFECT_SOUND_VARIANT_PATHS のキー。
 *   promotedSteps: 基準ティアから何段昇格したか(0=昇格なし)。
 */

/** 初期コンボ state(まだ一度もHitしていない)。 */
export function makeInitialComboState() {
  return { lastHitAt: 0, comboCount: 0, kind: '', promotedSteps: 0 };
}

/**
 * Hit 1件をディレクターに通し、コンボ判定+ティア昇格を決める純関数。
 *   前のHitから COMBO_WINDOW_MS 以内ならコンボ継続: 窓内2発目は+1段、3発目は+2段…と
 *   梯子の上限まで昇格する(soft→hard→jackpot)。音は昇格後ティア1本のみ=置換。
 *   baseKind が梯子に無い(例: 'gift' 単一音)場合は昇格せずそのまま返す(コンボ数は数える)。
 * @param {Partial<ComboHitState>|null|undefined} prev 前回の directHit 結果(null=初Hit)
 * @param {string} baseKind このイベント単体でのティア(effectSoundKindForGiftTier 等の結果)
 * @param {number} nowMs 現在時刻(epoch ms)
 * @param {{ ladder?: ReadonlyArray<string>, windowMs?: number }} [opts]
 * @returns {ComboHitState}
 */
export function directHit(prev, baseKind, nowMs, opts = {}) {
  const ladder = Array.isArray(opts.ladder) ? opts.ladder : MILESTONE_TIER_LADDER;
  const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : COMBO_WINDOW_MS;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const p = prev && typeof prev === 'object' ? prev : null;
  const lastAt = Math.max(0, Number(p?.lastHitAt) || 0);
  const prevCombo = Math.max(0, Math.floor(Number(p?.comboCount) || 0));
  const inWindow = lastAt > 0 && now - lastAt >= 0 && now - lastAt <= windowMs;
  const comboCount = inWindow ? prevCombo + 1 : 1;

  const base = String(baseKind || '');
  const baseIdx = ladder.indexOf(base);
  if (baseIdx < 0) {
    // 梯子外の音種は昇格対象外(そのまま鳴らす)。コンボ数だけ数えて次に備える。
    return { lastHitAt: now, comboCount, kind: base, promotedSteps: 0 };
  }
  const idx = Math.min(baseIdx + (comboCount - 1), ladder.length - 1);
  return {
    lastHitAt: now,
    comboCount,
    kind: ladder[idx],
    promotedSteps: idx - baseIdx
  };
}
