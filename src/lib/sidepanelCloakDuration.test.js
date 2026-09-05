import { describe, it, expect } from 'vitest';
import { summarizeCloakDuration, CLOAK_CSS_FAILSAFE_MS } from './sidepanelCloakDuration.js';

/**
 * ★この計器の存在理由(2026-08-10 実機):
 *   ユーザーのスクショは配信5時間45分経過時点で真っ黒だった=黒は【居座っている】。
 *   しかし従来の観測窓は 3500ms で打ち切りだったため、速報は必ず
 *   「★出た直後だけ黒い」としか言えず、5セッション決着しなかった。
 *   「1.5秒で解除されるのか / 永久に残るのか」を速報から読めるようにするのが目的。
 */
describe('summarizeCloakDuration', () => {
  it('一度も幕が立たなければ ✅', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '' },
      { t: 600, cloak: '' }
    ]);
    expect(r.everCloaked).toBe(false);
    expect(r.stillCloaked).toBe(false);
    expect(r.line).toContain('✅');
  });

  it('★居座る黒: 最後の観測でも幕が残っていれば 🔴 と名指しする', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 1500, cloak: '1' },
      { t: 8000, cloak: '1' }
    ]);
    expect(r.stillCloaked).toBe(true);
    expect(r.lastObservedAtMs).toBe(8000);
    expect(r.outlivedCssFailsafe).toBe(true);
    expect(r.line).toContain('🔴');
    expect(r.line).toContain('まだ残っている');
    // CSS では救えていないことを明示する(次の一手=JS側の解除経路を見る)
    expect(r.line).toContain('JSの解除が届いていない');
  });

  // ★v0.1.1352: CSS保険を 1500ms → 400ms に短縮したため、
  //   「保険より前」を表す観測時刻を 600ms → 200ms に合わせた(意図は不変)。
  it('CSSフェイルセーフより前しか観測していない場合は断定しない(偽陽性を作らない)', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 200, cloak: '1' }
    ]);
    expect(r.stillCloaked).toBe(true);
    expect(r.outlivedCssFailsafe).toBe(false);
    expect(r.line).toContain('断定できない');
  });

  it('途中で外れたら解除時刻を出す', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 100, cloak: '1' },
      { t: 300, cloak: '' },
      { t: 1500, cloak: '' }
    ]);
    expect(r.stillCloaked).toBe(false);
    expect(r.clearedAtMs).toBe(300);
    expect(r.outlivedCssFailsafe).toBe(false);
    expect(r.line).toContain('t+300ms で解除');
  });

  it('CSS自動解除より後に外れたら「JS解除が遅い」と分かる', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 1500, cloak: '1' },
      { t: 2000, cloak: '' }
    ]);
    expect(r.clearedAtMs).toBe(2000);
    expect(r.outlivedCssFailsafe).toBe(true);
    expect(r.line).toContain('JS解除が遅い');
  });

  it('観測列が順不同でも時刻順に扱う', () => {
    const r = summarizeCloakDuration([
      { t: 2000, cloak: '' },
      { t: 0, cloak: '1' },
      { t: 600, cloak: '1' }
    ]);
    expect(r.clearedAtMs).toBe(2000);
    expect(r.firstCloakedAtMs).toBe(0);
  });

  it('一度外れて再び立ったら「まだ残っている」側に倒す(安全側)', () => {
    const r = summarizeCloakDuration([
      { t: 0, cloak: '1' },
      { t: 600, cloak: '' },
      { t: 3000, cloak: '1' }
    ]);
    expect(r.stillCloaked).toBe(true);
    expect(r.line).toContain('🔴');
  });

  it('未観測・不正入力で落ちない', () => {
    expect(summarizeCloakDuration([]).line).toContain('⚪');
    expect(summarizeCloakDuration(null).observed).toBe(0);
    expect(summarizeCloakDuration(undefined).observed).toBe(0);
    // @ts-expect-error 異常系
    expect(summarizeCloakDuration(['x', null, { t: -1, cloak: '1' }]).observed).toBe(0);
  });

  /*
   * ★v0.1.1352: 1500 → 400 に短縮(実機で「JS解除1507ms / CSS保険1500ms」=
   *   0〜1500ms のあいだ誰も中身を見せておらず、パネルを開いた瞬間が真っ黒だった)。
   * ★popup.html の実値との一致は cloakFailsafeContract.test.js が機械で断言する
   *   (ここは「意図した値であること」だけを固定し、二重管理にしない)。
   */
  it('CSSフェイルセーフの定数は popup.html と同期(実値の照合は契約テスト側)', () => {
    expect(CLOAK_CSS_FAILSAFE_MS).toBe(400);
  });
});
