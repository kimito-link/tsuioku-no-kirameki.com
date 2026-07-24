import { describe, it, expect } from 'vitest';
import {
  createNorthStarMirrorPublishRaceState,
  beginNorthStarRefreshAll,
  endNorthStarRefreshAll,
  observeNorthStarPublishCall,
  observeNorthStarLiveIdReset,
  observeNorthStarFlushOutcome,
  toNorthStarMirrorPublishRaceDiag
} from './northStarMirrorPublishRace.js';

/**
 * northStarMirrorPublishRace.js — 北極星鏡publish取りこぼしの実害確定計器(診断先行アプローチ)。
 * 掟: 数えるだけ・DOM/データを触らない(venueSeatLinkParity.js等と同じ)。
 */

describe('createNorthStarMirrorPublishRaceState', () => {
  it('初期値は全部ゼロ', () => {
    const state = createNorthStarMirrorPublishRaceState();
    expect(state.inflight).toBe(0);
    expect(state.inflightMax).toBe(0);
    expect(state.publishCalls).toBe(0);
    expect(state.liveIdReset).toBe(0);
    expect(state.flushSuccess).toBe(0);
    expect(state.flushSkipped).toBe(0);
  });
});

describe('beginNorthStarRefreshAll / endNorthStarRefreshAll', () => {
  it('単発の開始→終了はinflightMax=1のまま', () => {
    const state = createNorthStarMirrorPublishRaceState();
    beginNorthStarRefreshAll(state);
    expect(state.inflight).toBe(1);
    expect(state.inflightMax).toBe(1);
    endNorthStarRefreshAll(state);
    expect(state.inflight).toBe(0);
    expect(state.inflightMax).toBe(1);
  });

  it('多重並行実行を検知するとinflightMaxが最大値を保持する', () => {
    const state = createNorthStarMirrorPublishRaceState();
    beginNorthStarRefreshAll(state);
    beginNorthStarRefreshAll(state);
    beginNorthStarRefreshAll(state);
    expect(state.inflight).toBe(3);
    expect(state.inflightMax).toBe(3);
    endNorthStarRefreshAll(state);
    endNorthStarRefreshAll(state);
    expect(state.inflight).toBe(1);
    expect(state.inflightMax).toBe(3); // 最大値は下がらない
  });

  it('endがbeginより多く呼ばれても0未満にならない(壊れたstateでも例外を投げない)', () => {
    const state = createNorthStarMirrorPublishRaceState();
    endNorthStarRefreshAll(state);
    endNorthStarRefreshAll(state);
    expect(state.inflight).toBe(0);
  });
});

describe('observeNorthStarPublishCall', () => {
  it('呼ぶたびpublishCallsが増える', () => {
    const state = createNorthStarMirrorPublishRaceState();
    observeNorthStarPublishCall(state);
    observeNorthStarPublishCall(state);
    expect(state.publishCalls).toBe(2);
  });
});

describe('observeNorthStarLiveIdReset', () => {
  it('prevとnextが異なればliveIdResetが増える', () => {
    const state = createNorthStarMirrorPublishRaceState();
    observeNorthStarLiveIdReset(state, { prevLiveId: 'lv1', nextLiveId: 'lv2' });
    expect(state.liveIdReset).toBe(1);
  });

  it('prevとnextが同じなら増えない', () => {
    const state = createNorthStarMirrorPublishRaceState();
    observeNorthStarLiveIdReset(state, { prevLiveId: 'lv1', nextLiveId: 'lv1' });
    expect(state.liveIdReset).toBe(0);
  });

  it('片方が空なら増えない(初回起動を誤検知しない)', () => {
    const state = createNorthStarMirrorPublishRaceState();
    observeNorthStarLiveIdReset(state, { prevLiveId: '', nextLiveId: 'lv1' });
    expect(state.liveIdReset).toBe(0);
  });
});

describe('observeNorthStarFlushOutcome', () => {
  it('succeeded=trueならflushSuccessが増える', () => {
    const state = createNorthStarMirrorPublishRaceState();
    observeNorthStarFlushOutcome(state, true);
    expect(state.flushSuccess).toBe(1);
    expect(state.flushSkipped).toBe(0);
  });

  it('succeeded=falseならflushSkippedが増える', () => {
    const state = createNorthStarMirrorPublishRaceState();
    observeNorthStarFlushOutcome(state, false);
    expect(state.flushSkipped).toBe(1);
    expect(state.flushSuccess).toBe(0);
  });
});

describe('toNorthStarMirrorPublishRaceDiag', () => {
  it('publishCalls=0は⚪未観測', () => {
    const diag = toNorthStarMirrorPublishRaceDiag(createNorthStarMirrorPublishRaceState());
    expect(diag.line).toBe('北極星鏡publish ⚪ 未観測');
  });

  it('inflightMax<2は✅', () => {
    const state = createNorthStarMirrorPublishRaceState();
    beginNorthStarRefreshAll(state);
    observeNorthStarPublishCall(state);
    endNorthStarRefreshAll(state);
    const diag = toNorthStarMirrorPublishRaceDiag(state);
    expect(diag.line).toContain('✅');
    expect(diag.line).toContain('同時実行最大1');
  });

  it('inflightMax>=2は🔴で競合を示す', () => {
    const state = createNorthStarMirrorPublishRaceState();
    beginNorthStarRefreshAll(state);
    beginNorthStarRefreshAll(state);
    observeNorthStarPublishCall(state);
    observeNorthStarLiveIdReset(state, { prevLiveId: 'lv1', nextLiveId: 'lv2' });
    observeNorthStarFlushOutcome(state, true);
    observeNorthStarFlushOutcome(state, false);
    const diag = toNorthStarMirrorPublishRaceDiag(state);
    expect(diag.line).toContain('🔴');
    expect(diag.line).toContain('同時実行最大2');
    expect(diag.line).toContain('publish累計1');
    expect(diag.line).toContain('liveIdリセット1');
    expect(diag.line).toContain('全鏡flush成功1・スキップ1');
    expect(diag.inflightMax).toBe(2);
  });

  it('壊れたstateでも例外を投げずnullを返す', () => {
    expect(toNorthStarMirrorPublishRaceDiag(null)).toBeNull();
    expect(toNorthStarMirrorPublishRaceDiag(undefined)).toBeNull();
  });
});
