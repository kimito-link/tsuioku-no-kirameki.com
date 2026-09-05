/**
 * voiceBubbleRealtimeParity.js — 「読み上げ」と「吹き出し(画面表示)」が
 * **同じコメントを・同じタイミングで**出せているかを判定する(純関数)。
 *
 * ★なぜ要るか(2026-08-14 ユーザー要望)
 *   「読み上げ特化(の枠がほしい)。よみあげと吹き出しはリアルタイム一致がいい」
 *
 *   従来の速報は【読み上げ】と【表示】を**別々の行**で出していた:
 *       読み上げ到達: ⚪担当する画面が開いていません
 *       即時プッシュ: 表示遅延 直近5ms(平均451ms)
 *   ＝どちらも単独では「正常」に見えるのに、
 *     **声だけ遅れている / 声だけ落ちている**という【ズレ】は誰も見ていなかった。
 *   ユーザーが求めているのは個々の速さではなく **2つが揃っていること**。
 *
 * ■ 判定の考え方(嘘をつかない)
 *   - 読み上げが**そもそも動いていない**なら「ズレ」ではなく「未使用」と言う
 *     (面が開いていないのに赤くしない=直せない赤を作らない)。
 *   - 声と表示の**差**を見る。片方だけ速くても意味がない。
 *   - 間引き(staleDrop)は**リアルタイム維持のために意図的に捨てた**もの。
 *     捨てた事実は隠さないが、「壊れた」とは呼ばない。
 *
 * ■ 出典(既存計器を束ねるだけ・新しい観測は増やさない)
 *   - voiceDiag: lastE2eMs / e2eAvgMs / staleDropTotal / spokenTotal / voicedRatio
 *   - instantPushDiag: 表示遅延(直近/平均)
 *
 * @module voiceBubbleRealtimeParity
 */

/** 声と表示の差がこれを超えたら「ズレている」[ms]。 */
export const PARITY_WARN_GAP_MS = 1500;
/** 明確にズレている[ms]。 */
export const PARITY_BAD_GAP_MS = 4000;

/** @param {unknown} v @returns {number|null} */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @typedef {{
 *   state: 'unused'|'ok'|'warn'|'bad',
 *   voiceMs: number|null,
 *   bubbleMs: number|null,
 *   gapMs: number|null,
 *   droppedForRealtime: number,
 *   spoken: number,
 *   line: string
 * }} VoiceBubbleParity
 */

/**
 * 読み上げ⇄吹き出しのリアルタイム一致を判定する。
 *
 * @param {object} input
 * @param {any} [input.voiceDiag] 読み上げ計器(voiceDiag のスナップショット)
 * @param {any} [input.instantPush] 表示側(instantPushDiag のスナップショット)
 * @returns {VoiceBubbleParity}
 */
export function buildVoiceBubbleParity(input) {
  const v = input && typeof input.voiceDiag === 'object' ? input.voiceDiag : null;
  const p = input && typeof input.instantPush === 'object' ? input.instantPush : null;

  const spoken = num(v?.spokenTotal) ?? 0;
  const enabled = v?.enabled === true;
  const dropped = num(v?.staleDropTotal) ?? 0;

  // 声側の体感遅延(到着→発声)。直近が無ければ平均で代替する。
  const voiceMs = pickMs(v?.lastE2eMs, v?.e2eAvgMs);
  // 表示側の遅延(到着→画面)。
  const bubbleMs = pickMs(p?.lastDisplayGapMs ?? p?.lastGapMs, p?.avgDisplayGapMs ?? p?.avgGapMs);

  /*
   * ★読み上げが動いていない場合は「ズレ」と言わない。
   *   面(会場/コメビュ)が開いていなければ spoken=0・enabled=false になる。
   *   ここを赤にすると「読んでも直せない赤」が居座り、本物のズレが埋もれる。
   */
  if (!enabled && spoken <= 0) {
    return {
      state: 'unused',
      voiceMs,
      bubbleMs,
      gapMs: null,
      droppedForRealtime: dropped,
      spoken,
      line: '読み上げ⇄吹き出し ⚪ 読み上げを使っていません(会場モードかコメビュを開くと判定します)'
    };
  }

  if (voiceMs == null || bubbleMs == null) {
    return {
      state: 'unused',
      voiceMs,
      bubbleMs,
      gapMs: null,
      droppedForRealtime: dropped,
      spoken,
      line: '読み上げ⇄吹き出し ⚪ まだ測れていません(どちらかの遅延が未計測)'
    };
  }

  const gapMs = Math.round(voiceMs - bubbleMs);
  const absGap = Math.abs(gapMs);
  const state = absGap >= PARITY_BAD_GAP_MS ? 'bad' : absGap >= PARITY_WARN_GAP_MS ? 'warn' : 'ok';
  const mark = state === 'bad' ? '🔴' : state === 'warn' ? '🟡' : '✅';

  const who = gapMs > 0 ? '声が遅れています' : '声が先行しています';
  const head =
    state === 'ok'
      ? `読み上げ⇄吹き出し ${mark} 揃っています(差${absGap}ms)`
      : `読み上げ⇄吹き出し ${mark} ${who}(差${absGap}ms)`;

  const parts = [
    head,
    `  → 声 ${Math.round(voiceMs)}ms / 表示 ${Math.round(bubbleMs)}ms`
  ];
  if (dropped > 0) {
    parts.push(
      `  → リアルタイム維持のため ${dropped}件を読み飛ばしています(遅れを取り戻すための正常な動作)`
    );
  }
  if (state !== 'ok') {
    parts.push(
      gapMs > 0
        ? '  → 次の一手: 読み上げ速度を上げるか、間引き(古い分を捨てる)を強めると追いつきます'
        : '  → 次の一手: 表示側が遅れています。応援レーンの描画が重くないか確認してください'
    );
  }
  return { state, voiceMs, bubbleMs, gapMs, droppedForRealtime: dropped, spoken, line: parts.join('\n') };
}

/**
 * 直近値を優先し、無ければ平均で代替(どちらも無ければ null)。
 * ★-1 は「未計測」の約束(voiceDiag/instantPushDiag 共通)なので 0 と区別する。
 * @param {unknown} last @param {unknown} avg @returns {number|null}
 */
function pickMs(last, avg) {
  const l = num(last);
  if (l != null && l >= 0) return l;
  const a = num(avg);
  if (a != null && a >= 0) return a;
  return null;
}
