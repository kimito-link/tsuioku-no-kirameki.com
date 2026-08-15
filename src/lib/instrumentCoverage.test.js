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
import { groupHealthCells, HEALTH_CELL_GROUPS } from './healthCellGroups.js';
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
      hostMoveDiag: { moveCount: 3 },
      giftDiagnostics: {
        '北極星レーン': {
        '1_貢献度ランキング': { state: 'ok', apiRows: 5 },
        '+α_広告ランキング': { state: 'ok', apiRows: 5 },
        '2_ギフト履歴': { state: 'iframe_unrendered', count: 0 },
        '3_イベント累計スコア': { state: 'ok', value: 10 },
        '4_番組累計ポイント': { state: 'ok', value: 100 },
        '5_イベント現在順位': { state: 'ok', value: 3 }
        },
        // ★実際の速報と同じ入れ子(giftDiagnostics の中)。ここを間違えると出ない。
        commentObservability: {
          savedCommentsUidStats: { withUidPercent: 50, totalSaved: 100 },
          dedupeSeedDiag: { addedTotalCount: 100, suspiciousAddedCount: 2 }
        }
      }
    } },
    popupDiag: { popup: {
      storyUserLaneRenderProbe: {
        started: 5, domTilesPainted: 10, heavySettleState: 'race',
        laneTileOscillation: { samples: 3, drops: 1 }
      },
      identityAcquisition: { identifiable: 5, withThumb: 1, anonymous: 2 },
      avatarLoadDiag: { usericonFailed: 1, usericonSucceeded: 5 },
      mainThreadBlocker: { count: 3, worstMs: 900, worstName: 'grid' },
      // ★v0.1.1400 で掘り起こした14セルの入力(埋もれていた観測群)
      laneTickProbe: { ticks: 10, runs: 7, lastReason: 'defer-heavy' },
      laneRosterDelta: { everSeenMax: 20, droppedTotal: 2 },
      lightSupplyGuard: { observedCount: 2, skipCount: 1 },
      loadShadeProbe: { shadeAgeMs: 2500, shadePresent: true },
      tickerPick: { domWriteTotal: 12, filteredTooShort: 30 },
      storyGrowthChurn: { rebuilds: 2, maxMs: 150 },
      avatarRememberedDiag: { hitProfileCache: 10, hitSynth: 40 },
      storyUserLaneClickAffordanceParity: { checked: 20, mismatched: 1 },
      northStarRenderProbe: { refreshAllStarted: 3, refreshAllCompleted: 2 },
      northStarMirrorPublishRace: { publishCalls: 3, flushSkipped: 1 }
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
    /*
     * ★v0.1.1402: 【実際に出たセル】だけを見る。
     *   v1401 の固定テーブル化で、枠に無いセルは ⚪「—」のプレースホルダで
     *   埋まるようになった。その結果、旧実装の
     *     expect(total).toBe(cells.length)
     *   は **入力に関係なく常に registry 総数** になり、恒真＝何も検査して
     *   いなかった(空配列を渡しても 53 セルが返る)。
     *   ＝ v1390/v1400 で踏んだ「作ったのに画面に出ない」を検出できない状態に
     *   静かに戻っていた。プレースホルダと実セルを **id で区別** して数える。
     */
    const groups = groupHealthCells(cells);
    const producedInGroups = groups
      .flatMap((g) => g.cells)
      .filter((c) => producedIds.has(c.id));
    const foundIds = new Set(producedInGroups.map((c) => c.id));
    const lost = [...producedIds].filter((id) => !foundIds.has(id));
    expect(lost, `出力されたのに枠から消えたセル: ${lost.join(', ')}`).toEqual([]);
    // 実セルが1枚も欠けず、水増しもされていない(プレースホルダは除外して数える)
    expect(producedInGroups.length).toBe(cells.length);
  });

  it('★プレースホルダは registry のセルだけ(知らない id を捏造しない)', () => {
    /*
     * 固定テーブルは「観測が無くても枠を残す」ための仕組みだが、
     * 枠側に registry 未登録の id を書くと **永久に埋まらない空セル** が
     * 画面に居座る(ユーザーには「壊れている項目」に見える)。
     */
    const groups = groupHealthCells(cells);
    const known = new Set(DIAGNOSIS_REGISTRY.map((r) => r.id));
    const ghosts = groups
      .flatMap((g) => g.cells)
      .map((c) => c.id)
      .filter((id) => !known.has(id));
    expect(ghosts, `registry に無い枠セル: ${ghosts.join(', ')}`).toEqual([]);
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

  it('★registry の全セルが【枠にも】登録されている(片肺を作らない)', () => {
    /*
     * ★v0.1.1402: registry と healthCellGroups の**両方**に入って初めて
     *   画面に出る。片方だけの登録は、固定テーブル化以降
     *   「その他」検査にも引っかからない(出力されなければ stray にならない)。
     *   ＝ 100個へ増やす作業で最も踏みやすい穴なので、id 集合を直接突き合わせる。
     */
    const inGroups = new Set(HEALTH_CELL_GROUPS.flatMap((g) => [...g.cellIds]));
    const missing = DIAGNOSIS_REGISTRY
      .map((r) => r.id)
      .filter((id) => !inGroups.has(id));
    expect(missing, `registry にあるが枠に無い: ${missing.join(', ')}`).toEqual([]);
  });
});
