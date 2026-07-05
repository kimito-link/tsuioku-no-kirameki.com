/**
 * voiceDirector.js
 * council/pachinko-ultimate-SYNTHESIS.md §4(ボイスの歯止め)+§6 Phase B の実装。
 *
 * 「voice_*(パチンコボイス)を鳴らしてよいか」を事象履歴だけで判定する純関数層。
 *   DOM・storage・音の再生には一切触れない(呼び出し元=venueBar.js/popup-entry.jsが使う)。
 *   effectDirector.js(コンボ判定)と同じ設計原則:
 *     - 決定論のみ。乱数は一切使わない(同じ入力には常に同じ結果)。
 *     - 副作用ゼロ。呼び出し側が nowMs/isNarrating/liveId を注入する。
 *
 * 歯止めの構造(§4.1/§4.2):
 *   1. 個別キーのクールダウン(CD)+1配信あたりの上限回数。
 *   2. 全voice_*共通のグローバル45秒CD(どれかが鳴ったら全キーが45秒沈黙)。
 *   3. 1配信合計20回の上限。
 *   4. liveId切替で全カウンタ/CDをリセット。
 *   5. VOICEVOX発話中は voice_jackpot 以外をスキップ(§4.3・唯一の例外=voice_jackpotは重なり許容)。
 */

/** 全voice_*共通のグローバル最短間隔(ms)。どれかが鳴ったら全キーがこの間沈黙する(§4.2)。 */
export const VOICE_GLOBAL_COOLDOWN_MS = 45_000;

/** 1配信あたりのボイス合計上限回数(§4.2)。liveId切替でリセット。 */
export const VOICE_GLOBAL_CAP_PER_LIVE = 20;

/**
 * キーごとの個別クールダウン(ms)+1配信上限回数(§4.1の表そのもの)。
 * voice_max/voice_stage はCD無し(上限回数のみで歯止め)。
 * voice_stage は「フィーバー再入ガードに従属」(設計書注記)でPhase Bでは呼ばれない想定だが、
 *   表だけは実装しておく(Phase Cで呼び出しが追加されてもゲート側の変更は不要にする)。
 * @type {Readonly<Record<string, Readonly<{ cooldownMs: number, capPerLive: number }>>>}
 */
export const VOICE_KEY_LIMITS = Object.freeze({
  voice_chance: Object.freeze({ cooldownMs: 90_000, capPerLive: 8 }),
  voice_atsui: Object.freeze({ cooldownMs: 120_000, capPerLive: 6 }),
  voice_breakthrough: Object.freeze({ cooldownMs: 180_000, capPerLive: 4 }),
  voice_kamitsumi: Object.freeze({ cooldownMs: 120_000, capPerLive: 5 }),
  voice_jackpot: Object.freeze({ cooldownMs: 300_000, capPerLive: 3 }),
  voice_max: Object.freeze({ cooldownMs: 0, capPerLive: 2 }),
  voice_stage: Object.freeze({ cooldownMs: 0, capPerLive: 3 })
});

/** voice_jackpotだけが「重なり許容」= isNarrating中でもスキップされない唯一の例外(§4.3)。 */
export const VOICE_NARRATING_EXEMPT_KEY = 'voice_jackpot';

/**
 * 修正1(状態速報で確定した不具合): voice_*キーは effectSoundPlayer.js に同梱の合成音フォールバック
 *   を持たない新設キー(customSoundPreset.js経由のマイ効果音でのみ鳴る)。従来はvoiceGateが
 *   allowedを返してCD/カウンタを消費した後、playEffectSoundが'no-path'(未割当)で無音に終わって
 *   いた=「一度も鳴っていないのにCDスキップ30」という嘘の状態を生む根本原因だった。
 *   ゲート判定の前にこの関数でキーが割当済みかを確認し、未割当ならゲートstateを一切消費せず
 *   早期returnする(呼び出し側の責務・§本体)。
 * @param {string} key voice_*等のキー
 * @param {Readonly<Record<string, ReadonlyArray<string>>>|null|undefined} customVariantPaths
 *   customSoundStore.loadCustomSoundRuntimeState() が返す customVariantPaths(割当済みキーのみ含む)。
 * @returns {boolean} true=このキーはカスタム未割当(鳴らせない=ゲートを消費せず諦めるべき)
 */
export function isUnassignedVoiceKey(key, customVariantPaths) {
  const paths = customVariantPaths && typeof customVariantPaths === 'object' ? customVariantPaths : {};
  const variants = paths[String(key)];
  return !(Array.isArray(variants) && variants.length > 0);
}

/**
 * @typedef {{
 *   liveId: string,                          // このstateが対象にしているliveId('' = 未設定)
 *   totalFired: number,                      // この配信で鳴らした合計回数(1配信20回上限用)
 *   lastFiredAtAny: number,                  // 直近にどれかのvoice_*が鳴った時刻(グローバル45秒CD用・0=未発火)
 *   perKey: Record<string, { lastFiredAt: number, firedCount: number }> // キーごとの直近発火時刻+回数
 * }} VoiceGateState
 */

/** voiceGateの初期state。 */
export function makeInitialVoiceGateState() {
  return {
    liveId: '',
    totalFired: 0,
    lastFiredAtAny: 0,
    perKey: /** @type {Record<string, { lastFiredAt: number, firedCount: number }>} */ ({})
  };
}

/**
 * @param {VoiceGateState|null|undefined} state
 * @param {string} key
 * @returns {{ lastFiredAt: number, firedCount: number }}
 */
function perKeyOf(state, key) {
  const rec = state?.perKey?.[key];
  return {
    lastFiredAt: Math.max(0, Number(rec?.lastFiredAt) || 0),
    firedCount: Math.max(0, Math.floor(Number(rec?.firedCount) || 0))
  };
}

/**
 * liveId切替を検知し、切替なら初期stateへリセットする純関数。voiceGate内部で使う他、
 *   呼び出し側が明示的に呼んでもよい(挙動は同じ)。
 * @param {Partial<VoiceGateState>|null|undefined} prev
 * @param {string} liveId
 * @returns {VoiceGateState}
 */
export function resetVoiceGateStateForLiveIfChanged(prev, liveId) {
  const lid = String(liveId || '');
  const p = prev && typeof prev === 'object' ? prev : null;
  const prevLid = String(p?.liveId || '');
  if (p && prevLid === lid) {
    return {
      liveId: prevLid,
      totalFired: Math.max(0, Math.floor(Number(p.totalFired) || 0)),
      lastFiredAtAny: Math.max(0, Number(p.lastFiredAtAny) || 0),
      perKey: p.perKey && typeof p.perKey === 'object' ? p.perKey : {}
    };
  }
  // liveIdが変わった(または未設定→設定) = 全カウンタ0にリセット(§4.2)。
  const fresh = makeInitialVoiceGateState();
  fresh.liveId = lid;
  return fresh;
}

/**
 * @typedef {'ok'|'cooldown'|'cap'|'narrating'|'global_cooldown'|'global_cap'} VoiceGateReason
 */

/**
 * voice_*を鳴らしてよいかを事象履歴だけで判定する純関数(§4)。
 * 決定論: 同じ(state, key, nowMs, opts)には常に同じ結果を返す(乱数不使用)。
 *
 * 判定順序(先に当たったreasonを返す。全部通過したときだけ allowed:true):
 *   1. liveId切替があればまずstateをリセットしてから判定する。
 *   2. isNarrating===true かつ key !== voice_jackpot → 'narrating'。
 *   3. 1配信合計20回上限 → 'global_cap'。
 *   4. グローバル45秒CD → 'global_cooldown'。
 *   5. キー個別の1配信上限回数 → 'cap'。
 *   6. キー個別のクールダウン → 'cooldown'。
 *   7. 上記いずれにも当たらなければ 'ok'(nextStateはカウンタを進めた状態)。
 * allowed:false の場合、nextState は「liveIdリセットだけ反映した状態」(カウンタは進めない)。
 *
 * @param {Partial<VoiceGateState>|null|undefined} state 前回までの履歴(null=初期状態から)
 * @param {string} key voice_chance等のキー
 * @param {number} nowMs 現在時刻(epoch ms)
 * @param {{ isNarrating?: boolean, liveId?: string }} [opts]
 * @returns {{ allowed: boolean, reason: VoiceGateReason, nextState: VoiceGateState }}
 */
export function voiceGate(state, key, nowMs, opts = {}) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const liveId = String(opts.liveId || state?.liveId || '');
  const resetState = resetVoiceGateStateForLiveIfChanged(state, liveId);
  const isNarrating = opts.isNarrating === true;

  if (isNarrating && key !== VOICE_NARRATING_EXEMPT_KEY) {
    return { allowed: false, reason: 'narrating', nextState: resetState };
  }

  if (resetState.totalFired >= VOICE_GLOBAL_CAP_PER_LIVE) {
    return { allowed: false, reason: 'global_cap', nextState: resetState };
  }

  if (resetState.lastFiredAtAny > 0 && now - resetState.lastFiredAtAny < VOICE_GLOBAL_COOLDOWN_MS) {
    return { allowed: false, reason: 'global_cooldown', nextState: resetState };
  }

  const limits = VOICE_KEY_LIMITS[key] || { cooldownMs: 0, capPerLive: Infinity };
  const per = perKeyOf(resetState, key);

  if (per.firedCount >= limits.capPerLive) {
    return { allowed: false, reason: 'cap', nextState: resetState };
  }

  if (limits.cooldownMs > 0 && per.lastFiredAt > 0 && now - per.lastFiredAt < limits.cooldownMs) {
    return { allowed: false, reason: 'cooldown', nextState: resetState };
  }

  // 通過: カウンタを進めたnextStateを返す(呼び出し側はこれを次回のstateとして保持する)。
  const nextPerKey = { ...resetState.perKey, [key]: { lastFiredAt: now, firedCount: per.firedCount + 1 } };
  const nextState = {
    liveId,
    totalFired: resetState.totalFired + 1,
    lastFiredAtAny: now,
    perKey: nextPerKey
  };
  return { allowed: true, reason: 'ok', nextState };
}

/* ============================================================================
 * 直列チェーン計画(§3.3+§6 Phase B「絶対制約=同時発音なし・積み増しなし・チェーンは直列」)
 * ========================================================================== */

/**
 * @typedef {{ kind: string, delayMs: number }} VoiceChainStep
 *   kind: 鳴らす効果音/ボイスキー。
 *   delayMs: 直前のステップからの遅延(ms)。先頭ステップは0(=呼び出し即時)。
 */

/**
 * 「リーチ→突破」チェーン(§3.3): breakthrough SE → (300ms) → voice_breakthrough。
 * 呼び出し側は各ステップを順にsetTimeoutで直列実行する(同時発音にしない)。
 * @returns {VoiceChainStep[]}
 */
export function planBreakthroughChain() {
  return [
    { kind: 'breakthrough', delayMs: 0 },
    { kind: 'voice_breakthrough', delayMs: 300 }
  ];
}

/** 大当たりSE(イベント側 jackpot/mega)開始→voice_jackpot までの既定間隔(ms・決定論の固定値)。 */
export const JACKPOT_SE_TO_VOICE_MS = 1_000;

/** voice_jackpot 開始→payout SE までの既定間隔(ms。ボイス素材は短尺のため1.5秒で直列になる)。 */
export const JACKPOT_VOICE_TO_PAYOUT_MS = 1_500;

/** 節目500のイベントSE(milestone_hard)開始→突破チェーン開始までの直列間隔(ms・イベント音と重ねない)。 */
export const MILESTONE_HARD_TO_BREAKTHROUGH_MS = 800;

/**
 * 「突破→大当たり→払い出し」チェーン(§3.3)。
 * precedingKind(jackpot/mega SE)は呼び出し元が既にイベント直結層で鳴らしている前提のため、
 *   ここでは voice_jackpot → payout の2手だけを直列計画する(Phase Bの絶対制約=BGMはPhase C対象)。
 *   既定delayはイベントSEの頭とボイスが重ならない値(試聴フィードバックでの調整は都度別patch)。
 * @param {{ voiceDelayMs?: number, payoutDelayMs?: number }} [opts]
 * @returns {VoiceChainStep[]}
 */
export function planJackpotChain(opts = {}) {
  const voiceDelayMs = Number.isFinite(Number(opts.voiceDelayMs)) ? Number(opts.voiceDelayMs) : JACKPOT_SE_TO_VOICE_MS;
  const payoutDelayMs = Number.isFinite(Number(opts.payoutDelayMs)) ? Number(opts.payoutDelayMs) : JACKPOT_VOICE_TO_PAYOUT_MS;
  return [
    { kind: 'voice_jackpot', delayMs: voiceDelayMs },
    { kind: 'payout', delayMs: payoutDelayMs }
  ];
}
