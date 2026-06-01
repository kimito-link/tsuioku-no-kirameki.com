import { describe, it, expect } from 'vitest';
import {
  shouldRearmBackfillForOfficialGap,
  computeEffectiveBackfillRearmMinGap,
  BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS
} from './shouldRearmBackfillForOfficialGap.js';

/** 既定で「再開してよい」状態の引数を作るヘルパ（各テストで一部だけ崩す）。 */
function baseArgs(overrides = {}) {
  return {
    backfillRunning: false,
    backfillFinishedOnce: true,
    guardMatchesLiveId: true,
    stopReason: 'no_progress',
    gap: 500,
    minGap: 170,
    rearmCount: 0,
    maxRearms: 12,
    ...overrides
  };
}

describe('shouldRearmBackfillForOfficialGap（公式ギャップ残存時の NDGR 再開判定・2026-05-30）', () => {
  it('未完了 stop（no_progress）でギャップが大きく上限内なら再開してよい', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs())).toBe(true);
  });

  it('巡回中（backfillRunning）は再開しない（二重起動防止）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ backfillRunning: true }))).toBe(false);
  });

  it('まだ一度も終了していない（backfillFinishedOnce=false）なら待つ', () => {
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ backfillFinishedOnce: false }))
    ).toBe(false);
  });

  it('この liveId で guard 未セット（guardMatchesLiveId=false）なら再開不要（初回起動に委ねる）', () => {
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ guardMatchesLiveId: false }))
    ).toBe(false);
  });

  it('reached_start（配信開始まで到達＝埋め切った）では再開しない', () => {
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'reached_start' }))
    ).toBe(false);
  });

  it('容量ガード（cap_rows / cap_bytes）では再開しない', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'cap_rows' }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'cap_bytes' }))).toBe(false);
  });

  it('ギャップが minGap 未満（十分埋まった）なら再開しない', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: 169, minGap: 170 }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: 0 }))).toBe(false);
  });

  it('ちょうど minGap のギャップなら再開してよい（境界）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: 170, minGap: 170 }))).toBe(true);
  });

  it('再開回数が上限に達したら再開しない（no_progress 無限ループ抑止）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ rearmCount: 12, maxRearms: 12 }))).toBe(
      false
    );
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ rearmCount: 11, maxRearms: 12 }))).toBe(
      true
    );
  });

  it('gap / minGap / maxRearms が数値でなければ安全側（false）', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ gap: NaN }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ minGap: undefined }))).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ maxRearms: NaN }))).toBe(false);
  });

  it('aborted（タブ非表示で中断）は未完了扱い＝ギャップが残れば再開してよい', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'aborted' }))).toBe(true);
  });

  it('cap_elapsed（長尺で時間切れ）も続きから再開してよい', () => {
    expect(shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'cap_elapsed' }))).toBe(true);
  });

  it('引数なし / null は false', () => {
    expect(shouldRearmBackfillForOfficialGap(undefined)).toBe(false);
    expect(shouldRearmBackfillForOfficialGap(null)).toBe(false);
  });

  it('ブロック集合は reached_start / cap_rows / cap_bytes を含む', () => {
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('reached_start')).toBe(true);
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('cap_rows')).toBe(true);
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('cap_bytes')).toBe(true);
    expect(BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has('no_progress')).toBe(false);
  });

  describe('reachedStartGapOverride（reached_start 誤完了の大ギャップ救済・fix/broadcast-bulk-catchup）', () => {
    it('reached_start でも override 以上の大ギャップなら再 sweep を許可する', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'reached_start', gap: 1169, reachedStartGapOverride: 627 })
        )
      ).toBe(true);
    });

    it('reached_start でギャップが override 未満なら従来どおりブロック（near-complete を尊重）', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'reached_start', gap: 200, reachedStartGapOverride: 627 })
        )
      ).toBe(false);
    });

    it('override 未指定/0 なら reached_start は従来どおりブロック（後方互換）', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'reached_start', gap: 5000, reachedStartGapOverride: 0 })
        )
      ).toBe(false);
      expect(
        shouldRearmBackfillForOfficialGap(baseArgs({ stopReason: 'reached_start', gap: 5000 }))
      ).toBe(false);
    });

    it('override を指定しても cap_rows / cap_bytes（容量ガード）は再開しない', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'cap_rows', gap: 99999, reachedStartGapOverride: 100 })
        )
      ).toBe(false);
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({ stopReason: 'cap_bytes', gap: 99999, reachedStartGapOverride: 100 })
        )
      ).toBe(false);
    });

    it('reached_start 大ギャップでも上限到達なら再開しない（暴走防止）', () => {
      expect(
        shouldRearmBackfillForOfficialGap(
          baseArgs({
            stopReason: 'reached_start',
            gap: 5000,
            reachedStartGapOverride: 627,
            rearmCount: 40,
            maxRearms: 40
          })
        )
      ).toBe(false);
    });
  });
});

describe('computeEffectiveBackfillRearmMinGap（放送サイズで再アーム停止しきい値を実効化・fix/backfill-all-sizes 2026-06-01）', () => {
  // 本番定数（OFFICIAL_GAP_DEEP_TIMING）に合わせる。
  const PROD = {
    minGapAbsolute: 170,
    gapRatioOfOfficial: 0.058,
    smallFloor: 8
  };
  /** 本番定数 + official だけ差し替えるヘルパ。 */
  function eff(official, overrides = {}) {
    return computeEffectiveBackfillRearmMinGap({ official, ...PROD, ...overrides });
  }

  it('大型（official 14000 → ratio 812）は絶対上限 170 に収束（従来不変）', () => {
    expect(eff(14000)).toBe(170);
  });

  it('中規模（official 2000 → 116）は割合しきい値をそのまま使う', () => {
    expect(eff(2000)).toBe(116);
  });

  it('小規模（official 344 → 20）は割合しきい値（49%停滞を約94%まで追える）', () => {
    expect(eff(344)).toBe(20);
  });

  it('極小（official 50 → round(2.9)=3 < smallFloor）は smallFloor(8) で底打ち', () => {
    expect(eff(50)).toBe(8);
  });

  it('clamp 上限の境界: round(official×0.058) が 170 を跨ぐ前後で頭打ちする', () => {
    // 2922 × 0.058 = 169.476 → round 169（< 170）
    expect(eff(2922)).toBe(169);
    // 2923 × 0.058 = 169.534 → round 170（= 170）
    expect(eff(2923)).toBe(170);
    // 3000 × 0.058 = 174 → clamp で 170
    expect(eff(3000)).toBe(170);
  });

  it('smallFloor の境界: ちょうど smallFloor になる official で底打ちが効く', () => {
    // 138 × 0.058 = 8.004 → round 8（= smallFloor）
    expect(eff(138)).toBe(8);
    // 121 × 0.058 = 7.018 → round 7（< smallFloor）→ 8
    expect(eff(121)).toBe(8);
  });

  it('official が不明/非正なら従来どおり minGapAbsolute を返す（後方互換＝挙動不変）', () => {
    expect(eff(null)).toBe(170);
    expect(eff(undefined)).toBe(170);
    expect(eff(0)).toBe(170);
    expect(eff(-100)).toBe(170);
    expect(eff(NaN)).toBe(170);
  });

  it('ratio が不正（0/負/NaN）なら絶対上限にフォールバック（割合計算しない）', () => {
    expect(eff(2000, { gapRatioOfOfficial: 0 })).toBe(170);
    expect(eff(2000, { gapRatioOfOfficial: -0.1 })).toBe(170);
    expect(eff(2000, { gapRatioOfOfficial: NaN })).toBe(170);
  });

  it('smallFloor が不正（負/NaN）なら 0 扱い＝割合しきい値をそのまま使う', () => {
    // 50 × 0.058 = 2.9 → round 3。smallFloor 無効なら底打ちせず 3。
    expect(eff(50, { smallFloor: NaN })).toBe(3);
    expect(eff(50, { smallFloor: -5 })).toBe(3);
  });

  it('minGapAbsolute が不正（0/NaN）なら絶対上限 0 扱い＝clamp 上限なし', () => {
    // absolute=0 のとき clamp 上限が効かないので ratioGap がそのまま返る。
    expect(eff(14000, { minGapAbsolute: 0 })).toBe(812);
    expect(eff(14000, { minGapAbsolute: NaN })).toBe(812);
  });

  it('引数なし / null は安全に 0 を返す（official も absolute も取れない）', () => {
    expect(computeEffectiveBackfillRearmMinGap(undefined)).toBe(0);
    expect(computeEffectiveBackfillRearmMinGap(null)).toBe(0);
  });

  it('実効しきい値を shouldRearm の minGap に渡すと、小規模でも記録174件相当で追い続ける', () => {
    // official 344・記録 174 → gap 170。固定170なら gap170>=170 で「ギリ再開」だが、
    //   記録が増えて gap169 になると固定170では打ち切り（49%停滞）。
    //   effectiveMinGap=20 なら gap169 でも再開し続け、約94%まで追える。
    const effective = eff(344); // 20
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ gap: 169, minGap: effective }))
    ).toBe(true);
    // それでも gap が effectiveMinGap 未満まで埋まれば停止する（暴走しない）。
    expect(
      shouldRearmBackfillForOfficialGap(baseArgs({ gap: 19, minGap: effective }))
    ).toBe(false);
  });
});
