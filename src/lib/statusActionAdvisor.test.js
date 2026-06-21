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

  it('取得率が低い: 放送中(追いつき中)は🟡を出さない・終了済みで低%だけ出す(v0.1.885)', () => {
    const live = (pct, ended) => ({ liveId: 'lvX', officialRatePct: pct, endedAt: ended });
    // 放送中で低% = 過去ログ追いつき中=正常な途中 → 出さない(statusFormat の「⏳追いつき中」と一致)。
    expect(ids(buildStatusActions({ livesData: [live(20, null)] }))).not.toContain('capture-low-lvX');
    // 終了済みで低% = もう増えないのに取りこぼしたまま=本当の問題 → 出す。
    expect(ids(buildStatusActions({ livesData: [live(20, 1700000000000)] }))).toContain('capture-low-lvX');
    // 終了済みでも高%(>=40)は出さない。
    expect(ids(buildStatusActions({ livesData: [live(95, 1700000000000)] }))).not.toContain('capture-low-lvX');
  });

  it('取得率が低い: 放送中でも取り込みが本当に止まった(最終取り込みが古い)なら capture-stalled を出す(v0.1.886)', () => {
    const live = (pct, ago) => ({ liveId: 'lvY', officialRatePct: pct, endedAt: null, lastIngestAgoMs: ago });
    // 放送中×低%×最終取り込みが古い(3分超) = 本当の stall → 出す。
    expect(ids(buildStatusActions({ livesData: [live(20, 200000)] }))).toContain('capture-stalled-lvY');
    // 放送中×低%だが最終取り込みが新しい(数秒前) = 正常な追いつき中 → 出さない。
    expect(ids(buildStatusActions({ livesData: [live(20, 3000)] }))).not.toContain('capture-stalled-lvY');
    // lastIngestAgoMs が無い(値なし)= 追いつき中とみなす → 出さない(放送中低%を一律に黄にしない)。
    expect(ids(buildStatusActions({ livesData: [{ liveId: 'lvY', officialRatePct: 20, endedAt: null }] }))).not.toContain('capture-stalled-lvY');
    // 100%到達済みは古くても出さない(取り切った=止まって正常)。
    expect(ids(buildStatusActions({ livesData: [live(100, 999999)] }))).not.toContain('capture-stalled-lvY');
    // 終了済みは capture-low の管轄=capture-stalled は出さない。
    expect(ids(buildStatusActions({ livesData: [{ liveId: 'lvY', officialRatePct: 20, endedAt: 1700000000000, lastIngestAgoMs: 999999 }] }))).not.toContain('capture-stalled-lvY');
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

  it('v0.1.849 北極星 state=ok・count0 でも apiRows>0(Koken/Nicoad実取得)なら lane-empty を出さない', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', officialRatePct: 90 }],
      fastDiag: { content: { giftDiagnostics: { '北極星レーン': {
        '1_貢献度ランキング': { state: 'ok', count: 0, apiRows: 31 },
        '+α_広告ランキング': { state: 'ok', count: 0, apiRows: 10 }
      } } } }
    });
    expect(ids(cards)).not.toContain('lane-empty');
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

  it('数字の自己矛盾(コメントした人>来場)を対処カードに出す(v0.1.859)', () => {
    const cards = buildStatusActions({
      reportPreview: { totalComments: 100, commenters: 900, visitors: 800 }
    });
    const card = cards.find((c) => c.id === 'consistency-commenters-gt-visitors');
    expect(card).toBeTruthy();
    expect(card.severity).toBe('bad');
    expect(card.symptom).toContain('数字の食い違いを検知');
    expect(card.symptom).toContain('コメントした人');
  });

  it('数字が整合していれば consistency カードは出さない', () => {
    const cards = buildStatusActions({
      livesData: [{ liveId: 'lv1', recordedCount: 194, officialCommentCount: 193 }],
      reportPreview: { totalComments: 188, uniqueUsers: 127, commenters: 26, visitors: 811 }
    });
    expect(cards.find((c) => c.id?.startsWith('consistency-'))).toBeUndefined();
  });

  it('時系列トレンドの findings を対処カードに出す(v0.1.862)', () => {
    const cards = buildStatusActions({
      trendFindings: [
        { id: 'records-stalled', severity: 'bad', message: '記録が約4分前から増えていません(公式は 20 件増加)。…F5' }
      ]
    });
    const card = cards.find((c) => c.id === 'trend-records-stalled');
    expect(card).toBeTruthy();
    expect(card.severity).toBe('bad');
    expect(card.symptom).toContain('時間変化で検知');
    expect(card.action).toContain('F5');
  });

  it('trendFindings が空/未指定なら trend カードは出さない', () => {
    expect(buildStatusActions({}).find((c) => c.id?.startsWith('trend-'))).toBeUndefined();
    expect(buildStatusActions({ trendFindings: [] }).find((c) => c.id?.startsWith('trend-'))).toBeUndefined();
  });
});
