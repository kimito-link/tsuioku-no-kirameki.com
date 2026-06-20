import { describe, it, expect } from 'vitest';
import { buildStatusActions } from './statusActionAdvisor.js';
import { findHarmWordsInInfoCards } from './diagWordingGuard.js';

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

  it('content/popup の記録エラー → recorded-errors(bad・サンプル併記)', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { consoleErrorProbe: {
        recentErrors: [{ message: 'TypeError: x is undefined', source: 'content' }],
        totalCount: 1, ignoredCount: 0
      } } }
    });
    const c = cards.find((x) => x.id === 'recorded-errors');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('bad');
    expect(c.cause).toContain('TypeError');
  });

  it('recentErrors 空なら recorded-errors は出ない(ノイズで鳴らさない)', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { consoleErrorProbe: { recentErrors: [], totalCount: 0, ignoredCount: 5 } } }
    });
    expect(cards.find((x) => x.id === 'recorded-errors')).toBeFalsy();
  });

  it('複数記録中+他タブDOM混入 → multitab-heavy(warn・タブを絞る案内)', () => {
    const cards = buildStatusActions({
      livesData: [
        { liveId: 'lv1', officialRatePct: 90, recording: true },
        { liveId: 'lv2', officialRatePct: 90, recording: true }
      ],
      fastDiag: { content: { giftDiagnostics: { multiTabDiag: { staleDomBundleSuspected: true } } } }
    });
    const c = cards.find((x) => x.id === 'multitab-heavy');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('warn');
    expect(c.action).toContain('1配信が安定してから');
  });

  it('複数記録中+大型backfill実行中 → multitab-heavy', () => {
    const cards = buildStatusActions({
      livesData: [
        { liveId: 'lv1', officialRatePct: 90, recording: true },
        { liveId: 'lv2', officialRatePct: 5, recording: true }
      ],
      fastDiag: { content: { romiDebug: { backfill: { running: true, rows: 14000 } } } }
    });
    expect(cards.find((x) => x.id === 'multitab-heavy')).toBeTruthy();
  });

  it('1配信だけなら multitab-heavy は出ない(単独は安全)', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90, recording: true }],
      fastDiag: { content: { giftDiagnostics: { multiTabDiag: { staleDomBundleSuspected: true } } } }
    });
    expect(cards.find((x) => x.id === 'multitab-heavy')).toBeFalsy();
  });

  it('複数タブでも重い兆候が無ければ multitab-heavy は出ない', () => {
    const cards = buildStatusActions({
      livesData: [
        { liveId: 'lv1', officialRatePct: 90, recording: true },
        { liveId: 'lv2', officialRatePct: 90, recording: true }
      ],
      fastDiag: { content: {} }
    });
    expect(cards.find((x) => x.id === 'multitab-heavy')).toBeFalsy();
  });

  it('多タブ DOM 名残 → stale-dom', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { giftDiagnostics: { multiTabDiag: { staleDomBundleSuspected: true } } } }
    });
    expect(ids(cards)).toContain('stale-dom');
  });

  it('stale-dom の cause は「混乱」と煽らず実害なしを明示する（v0.1.834 誤解の除去）', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { giftDiagnostics: { multiTabDiag: { staleDomBundleSuspected: true } } } }
    });
    const card = cards.find((c) => c.id === 'stale-dom');
    expect(card).toBeTruthy();
    // 旧文言「公式値レーンが混乱することがある」は事実誤認だったので回帰防止。
    expect(card.cause).not.toContain('混乱');
    expect(card.cause).toContain('影響しません');
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

  it('info カードに実害語(混乱/混入/汚染…)を入れない（diagWordingGuard・v0.1.835）', () => {
    // self-verifying loop の取り込み: 全カードを発火させ、info(実害なし位置づけ)カードに不安語が
    // 混ざっていないか機械照合。混ざっていたら「実コードでその因果を裏取りせよ」のサイン=ここで落ちる。
    // 多種カードを同時に出すシナリオ。
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 20 }],
      fastDiag: {
        content: {
          networkErrorProbe: { ndgrConnectStatus: 'disconnected' },
          giftDiagnostics: {
            multiTabDiag: { staleDomBundleSuspected: true },
            commentObservability: { savedCommentsUidStats: { withUidPercent: 10 } }
          }
        }
      }
    });
    const hits = findHarmWordsInInfoCards(cards);
    expect(hits, `info カードに実害語: ${JSON.stringify(hits)}`).toEqual([]);
  });
});
