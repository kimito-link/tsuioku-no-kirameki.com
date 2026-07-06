import { describe, it, expect } from 'vitest';
import {
  planScoreAnnounce,
  scoreAnnounceTotalDurationMs,
  scoreAnnounceGate,
  scoreAnnounceGateFinish,
  makeInitialScoreAnnounceGateState,
  SCORE_ANNOUNCE_DRUMROLL_MS,
  SCORE_ANNOUNCE_COUNT_UP_MS,
  SCORE_ANNOUNCE_RESULT_TO_APPLAUSE_MS
} from './scoreAnnounce.js';

const RADAR = { axes: [{ key: 'commentDensity', label: 'コメント密度', value: 50 }] };
const HIGHLIGHTS = [
  { at: 1, kind: 'phase_jackpot', label: '大当たり到達' },
  { at: 2, kind: 'gift_mega', label: 'ギフト大波(mega)' },
  { at: 3, kind: 'milestone_hard', label: 'コメント節目(500件)' }
];

describe('planScoreAnnounce', () => {
  it('決定論: 同じ入力には常に同じstep列', () => {
    const a = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    const b = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    expect(a).toEqual(b);
  });

  it('①ドラムロールがatMs=0の先頭ステップ', () => {
    const steps = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    expect(steps[0]).toMatchObject({ atMs: 0, kind: 'score_drumroll', action: 'drumroll_start' });
  });

  it('②カウントアップ開始はドラムロール尺の直後', () => {
    const steps = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    const step = steps.find((s) => s.action === 'count_up_start');
    expect(step.atMs).toBe(SCORE_ANNOUNCE_DRUMROLL_MS);
  });

  it('③ジャーンはカウントアップ完了と同時刻', () => {
    const steps = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    const step = steps.find((s) => s.action === 'result_reveal');
    expect(step.atMs).toBe(SCORE_ANNOUNCE_DRUMROLL_MS + SCORE_ANNOUNCE_COUNT_UP_MS);
  });

  it('rank B以下ではapplauseステップが無い', () => {
    for (const rank of ['D', 'C', 'B']) {
      const steps = planScoreAnnounce({ rank }, RADAR, HIGHLIGHTS);
      expect(steps.some((s) => s.action === 'applause')).toBe(false);
      expect(steps.some((s) => s.action === 'jingle_s')).toBe(false);
    }
  });

  it('rank Aではapplauseが付くがjingle_sは付かない', () => {
    const steps = planScoreAnnounce({ rank: 'A' }, RADAR, HIGHLIGHTS);
    const applause = steps.find((s) => s.action === 'applause');
    expect(applause).toBeTruthy();
    expect(applause.kind).toBe('score_applause');
    expect(steps.some((s) => s.action === 'jingle_s')).toBe(false);
  });

  it('rank Sではapplauseとjingle_sの両方が付く(ジングルが後ろ)', () => {
    const steps = planScoreAnnounce({ rank: 'S' }, RADAR, HIGHLIGHTS);
    const applause = steps.find((s) => s.action === 'applause');
    const jingle = steps.find((s) => s.action === 'jingle_s');
    expect(applause).toBeTruthy();
    expect(jingle).toBeTruthy();
    expect(jingle.kind).toBe('score_jingle_s');
    expect(jingle.atMs).toBeGreaterThan(applause.atMs);
  });

  it('applauseはジャーンの400ms後', () => {
    const steps = planScoreAnnounce({ rank: 'A' }, RADAR, HIGHLIGHTS);
    const result = steps.find((s) => s.action === 'result_reveal');
    const applause = steps.find((s) => s.action === 'applause');
    expect(applause.atMs).toBe(result.atMs + SCORE_ANNOUNCE_RESULT_TO_APPLAUSE_MS);
  });

  it('④講評レーダーはradarが無ければステップ自体が無い', () => {
    const steps = planScoreAnnounce({ rank: 'B' }, null, HIGHLIGHTS);
    expect(steps.some((s) => s.action === 'radar_reveal')).toBe(false);
  });

  it('④講評レーダーはradarがあればステップとして積まれ、③以降に位置する', () => {
    const steps = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    const result = steps.find((s) => s.action === 'result_reveal');
    const radar = steps.find((s) => s.action === 'radar_reveal');
    expect(radar).toBeTruthy();
    expect(radar.atMs).toBeGreaterThan(result.atMs);
  });

  it('Sランクは非Sランクよりレーダー開始が遅い(ジングルの分だけ後ろにずれる)', () => {
    const stepsB = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    const stepsS = planScoreAnnounce({ rank: 'S' }, RADAR, HIGHLIGHTS);
    const radarB = stepsB.find((s) => s.action === 'radar_reveal');
    const radarS = stepsS.find((s) => s.action === 'radar_reveal');
    expect(radarS.atMs).toBeGreaterThan(radarB.atMs);
  });

  it('⑤ハイライトは最大3件・score_swooshで300ms間隔・atMs昇順', () => {
    const steps = planScoreAnnounce({ rank: 'B' }, RADAR, HIGHLIGHTS);
    const hl = steps.filter((s) => s.action.startsWith('highlight_'));
    expect(hl).toHaveLength(3);
    expect(hl.every((s) => s.kind === 'score_swoosh')).toBe(true);
    expect(hl[1].atMs - hl[0].atMs).toBe(300);
    expect(hl[2].atMs - hl[1].atMs).toBe(300);
  });

  it('ハイライトが4件以上渡されても3件までしか積まない', () => {
    const many = [...HIGHLIGHTS, { at: 4, kind: 'phase_reach', label: 'リーチ到達' }];
    const steps = planScoreAnnounce({ rank: 'B' }, RADAR, many);
    const hl = steps.filter((s) => s.action.startsWith('highlight_'));
    expect(hl).toHaveLength(3);
  });

  it('ハイライトが0件なら highlight_* ステップが無い', () => {
    const steps = planScoreAnnounce({ rank: 'B' }, RADAR, []);
    expect(steps.some((s) => s.action.startsWith('highlight_'))).toBe(false);
  });

  it('全ステップがatMs昇順(直列チェーン)', () => {
    const steps = planScoreAnnounce({ rank: 'S' }, RADAR, HIGHLIGHTS);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].atMs).toBeGreaterThanOrEqual(steps[i - 1].atMs);
    }
  });

  it('score/radar/highlightsが欠損/不正でも死なない', () => {
    expect(() => planScoreAnnounce(null, null, null)).not.toThrow();
    expect(() => planScoreAnnounce(undefined, undefined, undefined)).not.toThrow();
    expect(planScoreAnnounce(null, null, null)[0]).toMatchObject({ action: 'drumroll_start' });
  });
});

describe('scoreAnnounceTotalDurationMs', () => {
  it('最終ステップのatMsを返す', () => {
    const steps = planScoreAnnounce({ rank: 'S' }, RADAR, HIGHLIGHTS);
    const total = scoreAnnounceTotalDurationMs(steps);
    expect(total).toBe(steps[steps.length - 1].atMs);
  });

  it('空配列/不正入力は0', () => {
    expect(scoreAnnounceTotalDurationMs([])).toBe(0);
    expect(scoreAnnounceTotalDurationMs(null)).toBe(0);
    expect(scoreAnnounceTotalDurationMs(undefined)).toBe(0);
  });
});

describe('scoreAnnounceGate / scoreAnnounceGateFinish(二重起動ガード)', () => {
  it('liveId空は拒否', () => {
    const gate = scoreAnnounceGate(makeInitialScoreAnnounceGateState(), '', 'manual');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('no_live_id');
  });

  it('実行中は同じliveIdでも別liveIdでも拒否(二重起動ガード)', () => {
    const running = { runningLiveId: 'lv1', playedLiveIds: [] };
    const same = scoreAnnounceGate(running, 'lv1', 'manual');
    const other = scoreAnnounceGate(running, 'lv2', 'manual');
    expect(same.allowed).toBe(false);
    expect(same.reason).toBe('already_running');
    expect(other.allowed).toBe(false);
    expect(other.reason).toBe('already_running');
  });

  it('auto起動: 同一liveIdは1回きり(2回目は拒否)', () => {
    let state = makeInitialScoreAnnounceGateState();
    const first = scoreAnnounceGate(state, 'lv1', 'auto');
    expect(first.allowed).toBe(true);
    state = scoreAnnounceGateFinish(first.nextState, 'lv1', 'auto');
    const second = scoreAnnounceGate(state, 'lv1', 'auto');
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('already_played');
  });

  it('manual起動: 同一liveIdでも完走後なら何度でも許可', () => {
    let state = makeInitialScoreAnnounceGateState();
    const first = scoreAnnounceGate(state, 'lv1', 'manual');
    expect(first.allowed).toBe(true);
    state = scoreAnnounceGateFinish(first.nextState, 'lv1', 'manual');
    const second = scoreAnnounceGate(state, 'lv1', 'manual');
    expect(second.allowed).toBe(true);
  });

  it('auto発表済みでもmanualは許可される(手動は何度でも見返せる)', () => {
    let state = makeInitialScoreAnnounceGateState();
    const auto = scoreAnnounceGate(state, 'lv1', 'auto');
    state = scoreAnnounceGateFinish(auto.nextState, 'lv1', 'auto');
    const manual = scoreAnnounceGate(state, 'lv1', 'manual');
    expect(manual.allowed).toBe(true);
  });

  it('別liveIdのauto起動は互いに影響しない', () => {
    let state = makeInitialScoreAnnounceGateState();
    const a = scoreAnnounceGate(state, 'lv1', 'auto');
    state = scoreAnnounceGateFinish(a.nextState, 'lv1', 'auto');
    const b = scoreAnnounceGate(state, 'lv2', 'auto');
    expect(b.allowed).toBe(true);
  });

  it('scoreAnnounceGateFinishは実行中フラグを必ず下ろす(中断でも完走でも)', () => {
    const running = { runningLiveId: 'lv1', playedLiveIds: [] };
    const next = scoreAnnounceGateFinish(running, 'lv1', 'manual');
    expect(next.runningLiveId).toBe('');
  });

  it('state/liveIdが不正でも死なない', () => {
    expect(() => scoreAnnounceGate(null, null, 'auto')).not.toThrow();
    expect(() => scoreAnnounceGateFinish(null, null, 'auto')).not.toThrow();
  });
});
