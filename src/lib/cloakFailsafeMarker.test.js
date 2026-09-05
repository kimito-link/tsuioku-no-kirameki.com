import { describe, expect, it } from 'vitest';
import { hasCloakFailsafeFired, CLOAK_FAILSAFE_FIRED_FLAG } from './cloakFailsafeMarker.js';

/**
 * ★v0.1.1381: 外部保険と本体が「もう幕を外した」という判定を共有する鍵の単体テスト。
 */
describe('cloakFailsafeMarker', () => {
  it('印が立っていれば true', () => {
    expect(hasCloakFailsafeFired({ [CLOAK_FAILSAFE_FIRED_FLAG]: true })).toBe(true);
  });

  it('★印が無ければ false(=従来動作へ倒す)', () => {
    expect(hasCloakFailsafeFired({})).toBe(false);
    expect(hasCloakFailsafeFired(null)).toBe(false);
    expect(hasCloakFailsafeFired(undefined)).toBe(false);
  });

  it('★window に触れない環境でも throw しない(保険は本体を止めない)', () => {
    const hostile = {
      get [CLOAK_FAILSAFE_FIRED_FLAG]() {
        throw new Error('blocked');
      }
    };
    expect(() => hasCloakFailsafeFired(hostile)).not.toThrow();
    expect(hasCloakFailsafeFired(hostile)).toBe(false);
  });

  it('★鍵の名前は正本1つ(両側の直書きを禁じるための定数)', () => {
    expect(CLOAK_FAILSAFE_FIRED_FLAG).toBe('__nlPopupCloakFailsafeFired');
  });
});
