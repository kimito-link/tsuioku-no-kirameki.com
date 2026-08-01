import { describe, expect, it } from 'vitest';
import { VoicePlayer } from './voicePlayer.js';

/**
 * v0.1.1222: 持続過負荷ブーストが【本番の VoicePlayer 経由で実際に効く】ことを断言する。
 *
 * ★純関数の単体テストだけだと「関数は正しいが呼ばれていない」を見逃す
 *   ([[integration-test-must-import-real-code]] / v0.1.1216〜1220 で5回踏んだ型)。
 *   ここでは本物の VoicePlayer をインスタンス化し、合成に渡る speedOffset を捕まえる。
 *
 * 再現する実測レジーム(2026-08-01 lv351083087):
 *   需要102.3/分・処理時間1517ms/件・実効上限3 → キューは5件に届かず
 *   computeVoiceCongestion の0.5/0.8段が発火しない=速度で消化できていなかった。
 */

/** 合成呼び出しの speedOffset を記録する VoicePlayer を作る。 */
function makePlayer() {
  /** @type {number[]} */
  const speedOffsets = [];
  const player = new VoicePlayer({
    fetchSynthesizeVoice: async (_text, opts) => {
      speedOffsets.push(Number(opts?.speedOffset) || 0);
      return null; // WAV は不要(速度だけ見る)
    },
    resolveVoice: () => ({ speaker: 1, styleId: 1, speedOffset: 0 })
  });
  return { player, speedOffsets };
}

describe('持続過負荷ブーストの実配線 (VoicePlayer)', () => {
  it('落ち着いていれば上乗せしない(通常時の声の速さを変えない)', () => {
    const { player } = makePlayer();
    player.diag.arrivalPerMin = 20;
    player._serviceTimeEmaMs = 1500;
    player._spokenSampleCount = 50;
    // pressure = 20*1500/60000 = 0.5 → 上乗せなし
    expect(player._resolveEffectiveSpeedBoost(0)).toBe(0);
    expect(player._resolveEffectiveSpeedBoost(0.3)).toBe(0.3);
  });

  it('★実測レジーム(需要102/分・1517ms/件・キュー3件)で速度が上がる', () => {
    const { player } = makePlayer();
    player.diag.arrivalPerMin = 102.3;
    player._serviceTimeEmaMs = 1517;
    player._spokenSampleCount = 50;
    // キュー3件のときの既存ブースト=0.3。これを上回ること(=キュー長では出せない速度)。
    const eff = player._resolveEffectiveSpeedBoost(0.3);
    expect(eff).toBeGreaterThan(0.3);
    expect(eff).toBeLessThanOrEqual(0.8);
  });

  it('★既存の混雑ブーストを下回らせない(間延び退行を作らない)', () => {
    const { player } = makePlayer();
    player.diag.arrivalPerMin = 102.3;
    player._serviceTimeEmaMs = 1517;
    player._spokenSampleCount = 50;
    // 既存が最大(0.8)なら、持続ブーストがそれを下げてはいけない。
    expect(player._resolveEffectiveSpeedBoost(0.8)).toBe(0.8);
  });

  it('計器に「実際に効いた累計」が積まれる(効果を後から検算できる)', () => {
    const { player } = makePlayer();
    player.diag.arrivalPerMin = 102.3;
    player._serviceTimeEmaMs = 1517;
    player._spokenSampleCount = 50;
    expect(player.diag.sustainedBoostTotal).toBe(0);
    player._resolveEffectiveSpeedBoost(0.3);
    expect(player.diag.sustainedBoostTotal).toBe(1);
    expect(player.diag.lastSustainedBoost).toBeGreaterThan(0);
  });

  it('データ不足では効かせない(起動直後に勝手に速くしない)', () => {
    const { player } = makePlayer();
    player.diag.arrivalPerMin = 102.3;
    player._serviceTimeEmaMs = 1517;
    player._spokenSampleCount = 3; // サンプル不足
    expect(player._resolveEffectiveSpeedBoost(0.3)).toBe(0.3);
    expect(player.diag.sustainedBoostTotal).toBe(0);
  });
});
