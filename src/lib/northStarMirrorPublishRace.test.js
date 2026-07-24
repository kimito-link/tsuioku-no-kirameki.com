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
import { createSingleFlightByKey } from './singleFlightByKey.js';

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

  // v0.1.1184: single-flight合流累計の併記(joinが効いているかを状態速報から直接検証できるようにする)。
  it('singleFlightJoinCountを渡すと行末に併記される', () => {
    const state = createNorthStarMirrorPublishRaceState();
    beginNorthStarRefreshAll(state);
    observeNorthStarPublishCall(state);
    endNorthStarRefreshAll(state);
    const diag = toNorthStarMirrorPublishRaceDiag(state, 5);
    expect(diag.line).toContain('single-flight合流5');
    expect(diag.singleFlightJoinCount).toBe(5);
  });

  it('singleFlightJoinCountを省略すると0扱い(既存呼び出し元との後方互換)', () => {
    const state = createNorthStarMirrorPublishRaceState();
    beginNorthStarRefreshAll(state);
    observeNorthStarPublishCall(state);
    const diag = toNorthStarMirrorPublishRaceDiag(state);
    expect(diag.line).toContain('single-flight合流0');
    expect(diag.singleFlightJoinCount).toBe(0);
  });
});

describe('single-flight化との統合(v0.1.1184の効果検証・本番singleFlightByKey.jsを実際にimportして使う)', () => {
  it('同一key(liveId)への多重並行呼び出しはjoinし、inflightMaxが1に留まる', async () => {
    // popup-entry.js の refreshAllNorthStarMirrorLanes と同じ配線:
    // const _northStarRefreshSingleFlight = createSingleFlightByKey();
    // async function refreshAllNorthStarMirrorLanes(liveId) {
    //   return _northStarRefreshSingleFlight.run(lid, () => _refreshAllNorthStarMirrorLanesImpl(lid));
    // }
    // を本番コードそのまま(createSingleFlightByKeyをimportして使用)で再現する。
    const raceState = createNorthStarMirrorPublishRaceState();
    const singleFlight = createSingleFlightByKey();

    async function _refreshAllNorthStarMirrorLanesImpl() {
      beginNorthStarRefreshAll(raceState);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        observeNorthStarPublishCall(raceState);
      } finally {
        endNorthStarRefreshAll(raceState);
      }
    }

    async function refreshAllNorthStarMirrorLanes(liveId) {
      const lid = String(liveId || '').trim().toLowerCase();
      return singleFlight.run(lid, () => _refreshAllNorthStarMirrorLanesImpl(lid));
    }

    // v0.1.989のtickIndependentNorthStar(setTimeout×3 + setInterval + onChanged)を模した
    // 「呼び出し自体は複数回起きる」同時発火を再現する。
    await Promise.all([
      refreshAllNorthStarMirrorLanes('lv1'),
      refreshAllNorthStarMirrorLanes('lv1'),
      refreshAllNorthStarMirrorLanes('lv1'),
      refreshAllNorthStarMirrorLanes('lv1')
    ]);

    expect(raceState.inflightMax).toBe(1); // 呼び出しは4回起きたが実行は1本化=joinが効いている
    expect(raceState.publishCalls).toBe(1); // implの中身も1回しか走っていない
    expect(singleFlight.joinCount()).toBe(3); // 4回中3回はjoinで合流(呼び出し自体は減らしていない=v0.1.989の意図を保持)

    // 状態速報の診断行に反映されることも確認(toNorthStarMirrorPublishRaceDiagへの配線契約)。
    const diag = toNorthStarMirrorPublishRaceDiag(raceState, singleFlight.joinCount());
    expect(diag.line).toContain('同時実行最大1');
    expect(diag.line).toContain('single-flight合流3');
    expect(diag.line).toContain('✅'); // inflightMax=1なので競合マークは出ない
  });

  it('異なるliveIdへの呼び出しはjoinせずそれぞれ独立実行される(配信切り替えを壊さない)', async () => {
    const raceState = createNorthStarMirrorPublishRaceState();
    const singleFlight = createSingleFlightByKey();

    async function _refreshAllNorthStarMirrorLanesImpl() {
      beginNorthStarRefreshAll(raceState);
      try {
        observeNorthStarPublishCall(raceState);
      } finally {
        endNorthStarRefreshAll(raceState);
      }
    }

    async function refreshAllNorthStarMirrorLanes(liveId) {
      const lid = String(liveId || '').trim().toLowerCase();
      return singleFlight.run(lid, () => _refreshAllNorthStarMirrorLanesImpl(lid));
    }

    await refreshAllNorthStarMirrorLanes('lv1');
    await refreshAllNorthStarMirrorLanes('lv2');

    expect(raceState.publishCalls).toBe(2); // 別liveIdはjoinせず両方実行される
    expect(singleFlight.joinCount()).toBe(0); // joinは一度も起きていない
  });
});
