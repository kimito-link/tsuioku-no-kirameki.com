/**
 * ★v0.1.1399: 「登録＝表示」を機械的に保証するゲート。
 *
 * ■ なぜ要るか(会議 lead/critic が一致した最優先項目)
 *   v0.1.1390 で registry 登録・純関数・test まで作ったのに、
 *   status-entry が入力を渡し忘れていて **実機で4セルが出ていなかった**。
 *   セルが40個の今でも起きた事故が、**100個になれば必ず破滅する**。
 *
 * ■ このゲートが見るもの(静的 grep では不十分)
 *   1. registry の全 id が healthCells の出力に**実際に現れうる**か
 *      (= 入力を与えれば出るか。文字列が存在するだけでは不合格)
 *   2. 出たセルが**必ずどこかの枠**に入るか(その他へ落ちても消えない)
 *   3. 枠の合計セル数 = 出力セル数(取りこぼし・二重表示ゼロ)
 */
import { describe, it, expect } from 'vitest';
import { buildHealthCells } from './healthCells.js';
import { groupHealthCells } from './healthCellGroups.js';
import { DIAGNOSIS_REGISTRY } from './diagnosisRegistry.js';

/** 全セルが出るように、あらゆる入力を「異常あり」で与える。 */
function maximalInput() {
  return {
    nowMs: Date.now(),
    livesData: [{
      recording: true, liveId: 'lv1', savedCount: 10, officialCount: 100,
      paintCount: 999, commentCount: 30, repaintReasons: { storage_changed: 500 },
      ended: true, backfillDone: false
    }],
    fastDiag: { content: {
      networkErrorProbe: { ndgrConnectStatus: 'connected' },
      scrollWhiteoutDiag: { whiteoutCount: 3 },
      styleReattach: { count: 1 },
      giftDiagnostics: { '北極星レーン': {
        '1_貢献度ランキング': { state: 'ok', apiRows: 5 },
        '+α_広告ランキング': { state: 'ok', apiRows: 5 },
        '2_ギフト履歴': { state: 'iframe_unrendered', count: 0 },
        '3_イベント累計スコア': { state: 'ok', value: 10 },
        '4_番組累計ポイント': { state: 'ok', value: 100 },
        '5_イベント現在順位': { state: 'ok', value: 3 }
      } },
      commentObservability: { savedCommentsUidStats: { withUidPercent: 50, totalSaved: 100 } }
    } },
    popupDiag: { popup: {
      storyUserLaneRenderProbe: { started: 5, domTilesPainted: 10, heavySettleState: 'race' },
      identityAcquisition: { identifiable: 5, withThumb: 1, anonymous: 2 },
      avatarLoadDiag: { usericonFailed: 1, usericonSucceeded: 5 },
      mainThreadBlocker: { count: 3, worstMs: 900, worstName: 'grid' }
    } },
    voiceDiag: { enabled: true, spokenTotal: 10, lastE2eMs: 6000, staleDropTotal: 2 },
    instantPushDiag: { lastGapMs: 20, avgGapMs: 30 },
    commentPostDiag: { attempts: 4, okCount: 1, failCount: 0, timeoutCount: 3 },
    venueSeatsDiag: {
      enabled: true, lastUpdateAt: Date.now() - 1000, participantCount: 20, seatsShown: 20,
      perRow: 12, venueMaxRows: 30, seatAreaWidth: 958, capReason: 'participant',
      broadcasterMixedIn: 0,
      // ★venue-parity / venue-yukkuri-face はここ(venueSeatsDiag)の中を見る
      laneParity: { verdict: '✅', unexplained: 0, dom: { ghost: 0 } },
      yukkuriNamedCensus: {
        checked: 5, yukkuriNamed: 2, yukkuriNamedAnonymousStyle: 0, yukkuriNamedNoUid: 1
      }
    },
    venueOpen: true, venueMirrorAgeMs: 5000,
    venueTiers: { link: 5, gift: 2, ad: 3, konta: 1, tanu: 4 }, venueHasGiftData: true,
    liveElapsedMs: 60 * 60 * 1000,
    giftEffectDiag: {
      detected: 8, played: 5, sound: 5,
      giftDetected: 8, adDetected: 2, giftThrown: 8, giftSoundPlayed: 5,
      adThrown: 2, adSoundPlayed: 2, soundEnabled: true,
      lastEventAt: Date.now() - 1000
    },
    milestoneEffectDiag: {
      detected: 3, played: 3, sound: 3,
      milestoneDetected: 3, milestoneDirected: 3, milestoneThrown: 3,
      milestoneSoundPlayed: 3, soundEnabled: true,
      lastEventAt: Date.now() - 1000
    },
    // ★実際のフィールド名で与える(名前が違うとセルが出ない=このゲートの検出対象)
    laneDiag: {
      liveId: 'lv1', identified: 20, laneShown: 10, paintMs: 12,
      milestoneThrown: 3, milestoneSoundPlayed: 3
    },
    laneMirror: { capturedAt: Date.now() - 1000, link: [1], gift: [1], ad: [1], konta: [], tanu: [1] },
    statCardsMirror: { capturedAt: Date.now() },
    northStarMirror: { capturedAt: Date.now() },
    previewRenderAck: { gen: 5, ackGen: 4 },
    backfillLiveMetric: { stalled: true, remaining: 100 },
    mainThreadBlocker: { count: 3, worstMs: 900, worstName: 'grid-rebuild' }
  };
}

describe('計器の網羅ゲート(登録=表示)', () => {
  const cells = buildHealthCells(maximalInput());
  const producedIds = new Set(cells.map((c) => c.id));

  it('★registry の全セルが「入力を与えれば出る」', () => {
    const never = DIAGNOSIS_REGISTRY
      .map((r) => r.id)
      .filter((id) => !producedIds.has(id));
    // 出ないセルがあれば、それは入力の配線漏れか、生成コードの欠落。
    expect(never, `出力に現れないセル: ${never.join(', ')}`).toEqual([]);
  });

  it('★出たセルは1枚も失われず、必ずどれかの枠に入る', () => {
    const groups = groupHealthCells(cells);
    const total = groups.reduce((a, g) => a + g.cells.length, 0);
    expect(total).toBe(cells.length);
  });

  it('★二重表示しない(同じidが2つの枠に出ない)', () => {
    const groups = groupHealthCells(cells);
    const seen = new Set();
    for (const g of groups) {
      for (const c of g.cells) {
        expect(seen.has(c.id), `${c.id} が重複`).toBe(false);
        seen.add(c.id);
      }
    }
  });

  it('★「その他」へ落ちたセルがあれば、それは枠への登録漏れ', () => {
    const other = groupHealthCells(cells).find((g) => g.id === 'other');
    const stray = other ? other.cells.map((c) => c.id) : [];
    expect(stray, `枠に未登録: ${stray.join(', ')}`).toEqual([]);
  });
});
