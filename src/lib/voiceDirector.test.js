import { describe, expect, it } from 'vitest';
import {
  makeInitialVoiceGateState,
  resetVoiceGateStateForLiveIfChanged,
  voiceGate,
  planBreakthroughChain,
  planJackpotChain,
  VOICE_GLOBAL_COOLDOWN_MS,
  VOICE_GLOBAL_CAP_PER_LIVE,
  VOICE_KEY_LIMITS,
  isUnassignedVoiceKey
} from './voiceDirector.js';

describe('makeInitialVoiceGateState', () => {
  it('全カウンタ0・liveId空の初期値', () => {
    const s = makeInitialVoiceGateState();
    expect(s.liveId).toBe('');
    expect(s.totalFired).toBe(0);
    expect(s.lastFiredAtAny).toBe(0);
    expect(s.perKey).toEqual({});
  });
});

describe('voiceGate 決定論', () => {
  it('同じ(state, key, nowMs, opts)には常に同じ結果を返す', () => {
    const state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', 1000, { liveId: 'lv1' });
    const r2 = voiceGate(state, 'voice_chance', 1000, { liveId: 'lv1' });
    expect(r1.allowed).toBe(r2.allowed);
    expect(r1.reason).toBe(r2.reason);
    expect(r1.nextState).toEqual(r2.nextState);
  });

  it('初回呼び出しは許可される(ok)', () => {
    const r = voiceGate(makeInitialVoiceGateState(), 'voice_chance', 1000, { liveId: 'lv1' });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('ok');
    expect(r.nextState.totalFired).toBe(1);
    expect(r.nextState.perKey.voice_chance.firedCount).toBe(1);
  });
});

// 起点は非ゼロのepoch(0は「未発火」の規約・実運用は常にDate.now())。effectDirector.test.jsと同じ。
const T = 1_000_000;

describe('個別クールダウン', () => {
  it('voice_chance 90秒CD内の連続呼び出しは2回目が拒否される', () => {
    let state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', T, { liveId: 'lv1' });
    expect(r1.allowed).toBe(true);
    state = r1.nextState;
    // 90秒未満(89秒後)はCD内だが、グローバルCD(45秒)にも先に引っかかりうるので
    // グローバルCDを避けるため89秒後かつ他キーではなく同キーで確認する。
    const r2 = voiceGate(state, 'voice_chance', T + 89_000, { liveId: 'lv1' });
    expect(r2.allowed).toBe(false);
    // グローバルCD(45秒)は既に経過しているため、拒否理由は個別CDのはず。
    expect(r2.reason).toBe('cooldown');
  });

  it('90秒経過後は許可される', () => {
    let state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', T, { liveId: 'lv1' });
    state = r1.nextState;
    const r2 = voiceGate(state, 'voice_chance', T + 90_000, { liveId: 'lv1' });
    expect(r2.allowed).toBe(true);
  });
});

describe('1配信合計20回上限', () => {
  it('20回鳴らした後の21回目は拒否される(global_cap)', () => {
    let state = makeInitialVoiceGateState();
    let now = T;
    // キー別上限(chance 8 / atsui 6 / kamitsumi 5 / breakthrough 4)に当たらないよう配分して
    // 合計ちょうど20回鳴らす(8+6+5+1)。間隔は個別CD・グローバルCDを両方クリアする400秒。
    const keys = [
      ...Array(8).fill('voice_chance'),
      ...Array(6).fill('voice_atsui'),
      ...Array(5).fill('voice_kamitsumi'),
      'voice_breakthrough'
    ];
    expect(keys.length).toBe(VOICE_GLOBAL_CAP_PER_LIVE);
    for (const key of keys) {
      const r = voiceGate(state, key, now, { liveId: 'lv1' });
      expect(r.allowed).toBe(true);
      state = r.nextState;
      now += 400_000;
    }
    expect(state.totalFired).toBe(VOICE_GLOBAL_CAP_PER_LIVE);
    // 21回目はどのキーでも(個別上限に余裕があるvoice_maxでも)合計上限で拒否される。
    const r21 = voiceGate(state, 'voice_max', now, { liveId: 'lv1' });
    expect(r21.allowed).toBe(false);
    expect(r21.reason).toBe('global_cap');
  });
});

describe('グローバル45秒CD', () => {
  it('異なるkeyでも45秒以内なら拒否される', () => {
    let state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', T, { liveId: 'lv1' });
    expect(r1.allowed).toBe(true);
    state = r1.nextState;
    const r2 = voiceGate(state, 'voice_atsui', T + 44_000, { liveId: 'lv1' });
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toBe('global_cooldown');
  });

  it('45秒経過後は別keyでも許可される', () => {
    let state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', T, { liveId: 'lv1' });
    state = r1.nextState;
    const r2 = voiceGate(state, 'voice_atsui', T + VOICE_GLOBAL_COOLDOWN_MS, { liveId: 'lv1' });
    expect(r2.allowed).toBe(true);
  });
});

describe('キー個別の1配信上限回数', () => {
  it('voice_max(上限2回・CD無し)は2回まで許可され3回目は拒否される', () => {
    let state = makeInitialVoiceGateState();
    let now = T;
    const r1 = voiceGate(state, 'voice_max', now, { liveId: 'lv1' });
    expect(r1.allowed).toBe(true);
    state = r1.nextState;
    now += VOICE_GLOBAL_COOLDOWN_MS + 1;
    const r2 = voiceGate(state, 'voice_max', now, { liveId: 'lv1' });
    expect(r2.allowed).toBe(true);
    state = r2.nextState;
    now += VOICE_GLOBAL_COOLDOWN_MS + 1;
    const r3 = voiceGate(state, 'voice_max', now, { liveId: 'lv1' });
    expect(r3.allowed).toBe(false);
    expect(r3.reason).toBe('cap');
  });
});

describe('liveId切替でリセット', () => {
  it('liveIdが変わるとカウンタ/CDがリセットされる', () => {
    let state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', 0, { liveId: 'lv1' });
    state = r1.nextState;
    expect(state.totalFired).toBe(1);
    // 別のliveIdへ切替。まだ45秒CD内の時刻だが、live切替で全カウンタが0に戻るため許可される。
    const r2 = voiceGate(state, 'voice_chance', 1000, { liveId: 'lv2' });
    expect(r2.allowed).toBe(true);
    expect(r2.nextState.liveId).toBe('lv2');
    expect(r2.nextState.totalFired).toBe(1);
  });

  it('resetVoiceGateStateForLiveIfChanged: 同じliveIdなら状態を維持する', () => {
    let state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', 0, { liveId: 'lv1' });
    state = r1.nextState;
    const reset = resetVoiceGateStateForLiveIfChanged(state, 'lv1');
    expect(reset).toEqual(state);
  });

  it('resetVoiceGateStateForLiveIfChanged: liveId変化で初期化される', () => {
    let state = makeInitialVoiceGateState();
    const r1 = voiceGate(state, 'voice_chance', 0, { liveId: 'lv1' });
    state = r1.nextState;
    const reset = resetVoiceGateStateForLiveIfChanged(state, 'lv2');
    expect(reset.liveId).toBe('lv2');
    expect(reset.totalFired).toBe(0);
    expect(reset.perKey).toEqual({});
  });
});

describe('isNarrating(VOICEVOX発話中)スキップ', () => {
  it('isNarrating=trueのとき、voice_jackpot以外はスキップされる', () => {
    const state = makeInitialVoiceGateState();
    const r = voiceGate(state, 'voice_chance', 0, { liveId: 'lv1', isNarrating: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('narrating');
  });

  it('isNarrating=trueでも voice_jackpot だけは許可される(唯一の例外)', () => {
    const state = makeInitialVoiceGateState();
    const r = voiceGate(state, 'voice_jackpot', 0, { liveId: 'lv1', isNarrating: true });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('isNarrating=falseなら通常通り判定される', () => {
    const state = makeInitialVoiceGateState();
    const r = voiceGate(state, 'voice_chance', 0, { liveId: 'lv1', isNarrating: false });
    expect(r.allowed).toBe(true);
  });
});

describe('VOICE_KEY_LIMITS の表(§4.1)', () => {
  it('7キー全てが定義されている', () => {
    expect(Object.keys(VOICE_KEY_LIMITS).sort()).toEqual(
      [
        'voice_atsui',
        'voice_breakthrough',
        'voice_chance',
        'voice_jackpot',
        'voice_kamitsumi',
        'voice_max',
        'voice_stage'
      ].sort()
    );
  });

  it('設計書の数値と一致する', () => {
    expect(VOICE_KEY_LIMITS.voice_chance).toEqual({ cooldownMs: 90_000, capPerLive: 8 });
    expect(VOICE_KEY_LIMITS.voice_atsui).toEqual({ cooldownMs: 120_000, capPerLive: 6 });
    expect(VOICE_KEY_LIMITS.voice_breakthrough).toEqual({ cooldownMs: 180_000, capPerLive: 4 });
    expect(VOICE_KEY_LIMITS.voice_kamitsumi).toEqual({ cooldownMs: 120_000, capPerLive: 5 });
    expect(VOICE_KEY_LIMITS.voice_jackpot).toEqual({ cooldownMs: 300_000, capPerLive: 3 });
    expect(VOICE_KEY_LIMITS.voice_max).toEqual({ cooldownMs: 0, capPerLive: 2 });
    expect(VOICE_KEY_LIMITS.voice_stage).toEqual({ cooldownMs: 0, capPerLive: 3 });
  });
});

describe('チェーン計画関数(直列であること)', () => {
  it('planBreakthroughChain: breakthrough SE → 300ms → voice_breakthrough の順', () => {
    const chain = planBreakthroughChain();
    expect(chain).toEqual([
      { kind: 'breakthrough', delayMs: 0 },
      { kind: 'voice_breakthrough', delayMs: 300 }
    ]);
  });

  it('planJackpotChain: voice_jackpot → payout の順(既定delay)', () => {
    const chain = planJackpotChain();
    expect(chain.map((s) => s.kind)).toEqual(['voice_jackpot', 'payout']);
    // 直列であること = 後続ステップのdelayMsが0でない(同時発音でない)ことを固定する。
    expect(chain[1].delayMs).toBeGreaterThan(0);
  });

  it('planJackpotChain: delayMsをoptsで上書きできる', () => {
    const chain = planJackpotChain({ voiceDelayMs: 100, payoutDelayMs: 500 });
    expect(chain).toEqual([
      { kind: 'voice_jackpot', delayMs: 100 },
      { kind: 'payout', delayMs: 500 }
    ]);
  });

  it('同時発音なし: 全ステップの合計はdelayMsを跨いだ直列実行を表す(kindが1本ずつ順番に並ぶ)', () => {
    const chain = [...planBreakthroughChain(), ...planJackpotChain()];
    // 各ステップは単一のkindのみ(配列や複数音の同時指定を許さない形)。
    for (const step of chain) {
      expect(typeof step.kind).toBe('string');
      expect(Number.isFinite(step.delayMs)).toBe(true);
    }
  });
});

// 修正1(状態速報で確定した不具合): voice_*はマイ効果音でのみ鳴る新設キー(effectSoundPlayer.js
//   同梱の合成音フォールバックを持たない)。未割当キーはゲートを消費せず諦めるべき(§本体)。
describe('isUnassignedVoiceKey(修正1)', () => {
  it('customVariantPathsにキーが無ければ未割当(true)', () => {
    expect(isUnassignedVoiceKey('voice_chance', {})).toBe(true);
    expect(isUnassignedVoiceKey('voice_chance', null)).toBe(true);
    expect(isUnassignedVoiceKey('voice_chance', undefined)).toBe(true);
  });

  it('空配列は未割当扱い(安全側)', () => {
    expect(isUnassignedVoiceKey('voice_chance', { voice_chance: [] })).toBe(true);
  });

  it('1件以上の配列があれば割当済み(false)', () => {
    expect(isUnassignedVoiceKey('voice_chance', { voice_chance: ['blob:abc'] })).toBe(false);
  });

  it('他キーの割当は無関係(該当キーだけを見る)', () => {
    expect(isUnassignedVoiceKey('voice_jackpot', { voice_chance: ['blob:abc'] })).toBe(true);
  });
});

describe('voiceGate自体はunassigned判定を持たない(呼び出し側の責務であることの確認)', () => {
  it('voiceGateはcustomVariantPathsを見ないので、未割当でも通常どおりallowedを返す', () => {
    // 呼び出し側(venueBar.js/popup-entry.js)がisUnassignedVoiceKeyで先に諦めることで
    //   ゲートstateの消費を防ぐ構造(voiceGate自体は音源の有無を知らない決定論の純関数のまま)。
    const r = voiceGate(makeInitialVoiceGateState(), 'voice_jackpot', 1000, { liveId: 'lv1' });
    expect(r.allowed).toBe(true);
  });
});
