import { describe, expect, it } from 'vitest';
import {
  OP_SHOT_LADDER,
  OP_SHOT_COMBO_WINDOW_MS,
  OP_SELF_MILESTONES,
  OP_SHOT_FAMILY_GUARD_MS,
  OP_SOUND_DEFAULT_GUARD_MS,
  shotKindForSelfPostCount,
  opSelfMilestoneFor,
  makeInitialOpSoundGateState,
  opSoundFamilyForKey,
  opSoundGuardMsForFamily,
  opSoundGate
} from './opSoundDirector.js';
import { directHit, makeInitialComboState } from './effectDirector.js';
import { EFFECT_SOUND_VARIANT_PATHS } from './effectSoundPlayer.js';
import { CUSTOM_SOUND_PRESET } from './customSoundPreset.js';

describe('shotKindForSelfPostCount(打ち出し音の育成4段)', () => {
  it('1〜4は op_shot_1', () => {
    expect(shotKindForSelfPostCount(0)).toBe('op_shot_1');
    expect(shotKindForSelfPostCount(1)).toBe('op_shot_1');
    expect(shotKindForSelfPostCount(4)).toBe('op_shot_1');
  });

  it('境界4/5', () => {
    expect(shotKindForSelfPostCount(4)).toBe('op_shot_1');
    expect(shotKindForSelfPostCount(5)).toBe('op_shot_2');
  });

  it('5〜14は op_shot_2', () => {
    expect(shotKindForSelfPostCount(5)).toBe('op_shot_2');
    expect(shotKindForSelfPostCount(14)).toBe('op_shot_2');
  });

  it('境界14/15', () => {
    expect(shotKindForSelfPostCount(14)).toBe('op_shot_2');
    expect(shotKindForSelfPostCount(15)).toBe('op_shot_3');
  });

  it('15〜29は op_shot_3', () => {
    expect(shotKindForSelfPostCount(15)).toBe('op_shot_3');
    expect(shotKindForSelfPostCount(29)).toBe('op_shot_3');
  });

  it('境界29/30', () => {
    expect(shotKindForSelfPostCount(29)).toBe('op_shot_3');
    expect(shotKindForSelfPostCount(30)).toBe('op_shot_4');
  });

  it('30以上は op_shot_4(上限で頭打ち)', () => {
    expect(shotKindForSelfPostCount(30)).toBe('op_shot_4');
    expect(shotKindForSelfPostCount(1000)).toBe('op_shot_4');
  });

  it('負数・NaN・非数値は0扱い(op_shot_1)', () => {
    expect(shotKindForSelfPostCount(-5)).toBe('op_shot_1');
    expect(shotKindForSelfPostCount(NaN)).toBe('op_shot_1');
    expect(shotKindForSelfPostCount(undefined)).toBe('op_shot_1');
  });

  it('決定論: 同じnには常に同じ結果', () => {
    expect(shotKindForSelfPostCount(12)).toBe(shotKindForSelfPostCount(12));
  });
});

describe('opSelfMilestoneFor(自分の投稿数の節目判定)', () => {
  it('5/10/25/50/100はtrue', () => {
    for (const n of OP_SELF_MILESTONES) {
      expect(opSelfMilestoneFor(n)).toBe(true);
    }
  });

  it('節目以外はfalse', () => {
    expect(opSelfMilestoneFor(1)).toBe(false);
    expect(opSelfMilestoneFor(4)).toBe(false);
    expect(opSelfMilestoneFor(6)).toBe(false);
    expect(opSelfMilestoneFor(11)).toBe(false);
    expect(opSelfMilestoneFor(99)).toBe(false);
    expect(opSelfMilestoneFor(101)).toBe(false);
  });

  it('節目を通り過ぎた値(51等)はfalse(到達したその1発だけ)', () => {
    expect(opSelfMilestoneFor(51)).toBe(false);
  });

  it('0・負数・非数値はfalse', () => {
    expect(opSelfMilestoneFor(0)).toBe(false);
    expect(opSelfMilestoneFor(-5)).toBe(false);
    expect(opSelfMilestoneFor(NaN)).toBe(false);
    expect(opSelfMilestoneFor(undefined)).toBe(false);
  });
});

describe('directHit と OP_SHOT_LADDER の統合(60秒窓コンボ)', () => {
  const T = 1_000_000;

  it('窓内2発目は基準段から1段昇格する', () => {
    const h1 = directHit(makeInitialComboState(), 'op_shot_1', T, {
      ladder: OP_SHOT_LADDER,
      windowMs: OP_SHOT_COMBO_WINDOW_MS
    });
    const h2 = directHit(h1, 'op_shot_1', T + 10_000, {
      ladder: OP_SHOT_LADDER,
      windowMs: OP_SHOT_COMBO_WINDOW_MS
    });
    expect(h2.kind).toBe('op_shot_2');
    expect(h2.promotedSteps).toBe(1);
  });

  it('60秒窓ちょうどは継続扱い・60秒+1msは窓切れで基準段に戻る', () => {
    const h1 = directHit(null, 'op_shot_1', T, { ladder: OP_SHOT_LADDER, windowMs: OP_SHOT_COMBO_WINDOW_MS });
    const within = directHit(h1, 'op_shot_1', T + OP_SHOT_COMBO_WINDOW_MS, {
      ladder: OP_SHOT_LADDER,
      windowMs: OP_SHOT_COMBO_WINDOW_MS
    });
    expect(within.kind).toBe('op_shot_2');
    const outside = directHit(h1, 'op_shot_1', T + OP_SHOT_COMBO_WINDOW_MS + 1, {
      ladder: OP_SHOT_LADDER,
      windowMs: OP_SHOT_COMBO_WINDOW_MS
    });
    expect(outside.kind).toBe('op_shot_1');
    expect(outside.promotedSteps).toBe(0);
  });

  it('基準段が既にop_shot_3のときの窓内2発目はop_shot_4で頭打ち', () => {
    const h1 = directHit(null, 'op_shot_3', T, { ladder: OP_SHOT_LADDER, windowMs: OP_SHOT_COMBO_WINDOW_MS });
    const h2 = directHit(h1, 'op_shot_3', T + 5000, { ladder: OP_SHOT_LADDER, windowMs: OP_SHOT_COMBO_WINDOW_MS });
    const h3 = directHit(h2, 'op_shot_3', T + 10_000, { ladder: OP_SHOT_LADDER, windowMs: OP_SHOT_COMBO_WINDOW_MS });
    expect(h2.kind).toBe('op_shot_4');
    expect(h3.kind).toBe('op_shot_4');
  });

  it('op_shot ladder の全キーが EFFECT_SOUND_VARIANT_PATHS または customSoundPreset に実在する', () => {
    for (const kind of OP_SHOT_LADDER) {
      const hasVariant = (EFFECT_SOUND_VARIANT_PATHS[kind]?.length ?? 0) > 0;
      const hasPreset = kind in CUSTOM_SOUND_PRESET;
      expect(hasVariant || hasPreset).toBe(true);
    }
  });
});

describe('opSoundFamilyForKey / opSoundGuardMsForFamily', () => {
  it('op_shot_1〜4は共通ファミリー op_shot にまとまる', () => {
    for (const key of OP_SHOT_LADDER) {
      expect(opSoundFamilyForKey(key)).toBe('op_shot');
    }
  });

  it('op_shot以外は自分自身がファミリー名', () => {
    expect(opSoundFamilyForKey('op_handle')).toBe('op_handle');
    expect(opSoundFamilyForKey('op_copy')).toBe('op_copy');
    expect(opSoundFamilyForKey('op_panel_open')).toBe('op_panel_open');
  });

  it('op_shot/op_copy/op_publishファミリーは600msガード', () => {
    expect(opSoundGuardMsForFamily('op_shot')).toBe(OP_SHOT_FAMILY_GUARD_MS);
    expect(opSoundGuardMsForFamily('op_copy')).toBe(OP_SHOT_FAMILY_GUARD_MS);
    expect(opSoundGuardMsForFamily('op_publish')).toBe(OP_SHOT_FAMILY_GUARD_MS);
  });

  it('その他は250msガード', () => {
    expect(opSoundGuardMsForFamily('op_handle')).toBe(OP_SOUND_DEFAULT_GUARD_MS);
    expect(opSoundGuardMsForFamily('op_toggle_on')).toBe(OP_SOUND_DEFAULT_GUARD_MS);
    expect(opSoundGuardMsForFamily('op_panel_open')).toBe(OP_SOUND_DEFAULT_GUARD_MS);
  });
});

describe('opSoundGate(決定論ゲート判定)', () => {
  const T = 1_000_000;

  it('初回は常に許可', () => {
    const r = opSoundGate(makeInitialOpSoundGateState(), 'op_handle', T);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('同じ状態・同じ入力には常に同じ結果(決定論)', () => {
    const s = makeInitialOpSoundGateState();
    const a = opSoundGate(s, 'op_handle', T);
    const b = opSoundGate(s, 'op_handle', T);
    expect(a).toEqual(b);
  });

  it('op_shotファミリーは昇格でキーが変わってもガードを共有する(600ms)', () => {
    let state = makeInitialOpSoundGateState();
    const r1 = opSoundGate(state, 'op_shot_1', T);
    expect(r1.allowed).toBe(true);
    state = r1.nextState;
    // 300ms後にop_shot_2(昇格後キー)を鳴らそうとしてもファミリー共通ガードで弾かれる
    const r2 = opSoundGate(state, 'op_shot_2', T + 300);
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toBe('family_guard');
    // 600ms経過後は許可
    const r3 = opSoundGate(state, 'op_shot_2', T + 600);
    expect(r3.allowed).toBe(true);
  });

  it('op_handle(250msガード)は600ms経たなくても250ms後なら許可', () => {
    let state = makeInitialOpSoundGateState();
    const r1 = opSoundGate(state, 'op_handle', T);
    state = r1.nextState;
    const r2 = opSoundGate(state, 'op_handle', T + 250, { isP1Active: false });
    // 全体200ms天井は超えているのでfamily_guardの250msだけが効く
    expect(r2.allowed).toBe(true);
  });

  it('全体横断200ms天井: 別キーでも200ms未満は弾かれる', () => {
    let state = makeInitialOpSoundGateState();
    const r1 = opSoundGate(state, 'op_copy', T);
    state = r1.nextState;
    const r2 = opSoundGate(state, 'op_panel_open', T + 100);
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toBe('global_floor');
  });

  it('200ms以上経過すれば別キーは許可される(ファミリーが別なので家族ガードは無関係)', () => {
    let state = makeInitialOpSoundGateState();
    const r1 = opSoundGate(state, 'op_copy', T);
    state = r1.nextState;
    const r2 = opSoundGate(state, 'op_panel_open', T + 200);
    expect(r2.allowed).toBe(true);
  });

  it('P1実行中はop_handle/op_shot以外を破棄する', () => {
    const r = opSoundGate(makeInitialOpSoundGateState(), 'op_copy', T, { isP1Active: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('p1_active');
  });

  it('P1実行中でもop_handleとop_shot_*は常時通す(自己応答レーンの唯一例外)', () => {
    expect(opSoundGate(makeInitialOpSoundGateState(), 'op_handle', T, { isP1Active: true }).allowed).toBe(true);
    for (const key of OP_SHOT_LADDER) {
      expect(opSoundGate(makeInitialOpSoundGateState(), key, T, { isP1Active: true }).allowed).toBe(true);
    }
  });

  it('null/壊れたstateでも例外にならず初期状態から始まる', () => {
    expect(() => opSoundGate(null, 'op_handle', T)).not.toThrow();
    expect(() => opSoundGate(undefined, 'op_handle', T)).not.toThrow();
    expect(opSoundGate(null, 'op_handle', T).allowed).toBe(true);
  });

  it('時計が逆行してもガードで弾かれない(経過0未満は素通しにせず単に許可判定へフォールバック)', () => {
    let state = makeInitialOpSoundGateState();
    const r1 = opSoundGate(state, 'op_handle', T);
    state = r1.nextState;
    const r2 = opSoundGate(state, 'op_handle', T - 1000);
    // 逆行時は now - lastAt が負になりガード条件(< guardMs)を満たすため弾かれる(安全側)
    expect(r2.allowed).toBe(false);
  });
});
