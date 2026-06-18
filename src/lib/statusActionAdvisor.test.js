import { describe, it, expect } from 'vitest';
import { buildStatusActions } from './statusActionAdvisor.js';

const ids = (cards) => cards.map((c) => c.id);

describe('buildStatusActions', () => {
  it('健全(配信あり・全部正常)なら該当カードなし', () => {
    const data = {
      livesData: [{ liveId: 'lv1', officialRatePct: 93, recordedCount: 25, officialCommentCount: 27 }],
      fastDiag: {
        content: {
          giftDiagnostics: {
            commentObservability: { savedCommentsUidStats: { withUidPercent: 100 } },
            '北極星レーン': { '4_番組累計ポイント': { state: 'ok', ndgrValue: 110 } }
          },
          networkErrorProbe: { ndgrConnectStatus: 'connected' }
        }
      }
    };
    expect(buildStatusActions(data)).toEqual([]);
  });

  it('視聴中の配信なし → no-live カード', () => {
    expect(ids(buildStatusActions({}))).toContain('no-live');
  });

  it('取得率が低い放送中 → capture-low(配信終了は対象外)', () => {
    const live = (pct, ended) => ({ liveId: 'lvX', officialRatePct: pct, endedAt: ended });
    expect(ids(buildStatusActions({ livesData: [live(20, null)] }))).toContain('capture-low-lvX');
    // 配信終了は出さない
    expect(ids(buildStatusActions({ livesData: [live(20, 1700000000000)] }))).not.toContain('capture-low-lvX');
  });

  it('userId 率が低い → uid-low(原理的=fixableHere:no)', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { giftDiagnostics: { commentObservability: { savedCommentsUidStats: { withUidPercent: 10 } } } } }
    });
    const c = cards.find((x) => x.id === 'uid-low');
    expect(c).toBeTruthy();
    expect(c.fixableHere).toBe('no');
  });

  it('北極星 state=ok だが空 → lane-empty', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { giftDiagnostics: { '北極星レーン': { '1_貢献度ランキング': { state: 'ok', count: 0 } } } } }
    });
    expect(ids(cards)).toContain('lane-empty');
  });

  it('北極星描画が詰まる(started>0,completed=0) → northstar-stuck(severity bad)', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      popupDiag: { popup: { northStarRenderProbe: { refreshAllStarted: 2, refreshAllCompleted: 0, lastError: 'boom' } } }
    });
    const c = cards.find((x) => x.id === 'northstar-stuck');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('bad');
  });

  it('アバターが追いつかない → avatar-lagging', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { giftDiagnostics: {
        avatarNicknameMatchDiag: { avatarMapSize: 1 },
        avatarUidDiag: { interceptedUsersTotal: 5 }
      } } }
    });
    expect(ids(cards)).toContain('avatar-lagging');
  });

  it('NDGR 接続断 → ndgr-disconnected(bad・fixableHere:no=ブラックボックス)', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { networkErrorProbe: { ndgrConnectStatus: 'disconnected' } } }
    });
    const c = cards.find((x) => x.id === 'ndgr-disconnected');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('bad');
    expect(c.fixableHere).toBe('no');
  });

  it('多タブ DOM 混入 → stale-dom', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { giftDiagnostics: { multiTabDiag: { staleDomBundleSuspected: true } } } }
    });
    expect(ids(cards)).toContain('stale-dom');
  });

  it('重大度順(bad → warn → info)に並ぶ', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 20 }], // warn: capture-low
      fastDiag: { content: {
        networkErrorProbe: { ndgrConnectStatus: 'disconnected' }, // bad: ndgr
        giftDiagnostics: { commentObservability: { savedCommentsUidStats: { withUidPercent: 10 } } } // info: uid-low
      } }
    });
    const sev = cards.map((c) => c.severity);
    expect(sev[0]).toBe('bad');
    expect(sev[sev.length - 1]).toBe('info');
  });
});
