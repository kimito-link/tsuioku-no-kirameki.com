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

/**
 * ★v0.1.1403: 「最大入力でも na のまま」＝ fixture が実フィールド名を
 *   与えられていないセル(＝判定ロジックが一度も走っていない)。
 *
 * ★これは **借金の可視化** であって、正常の宣言ではない。
 *   v1403 で capture-rate / match の2件を返済した(fixture が
 *   `savedCount`/`officialCount` という存在しない名前を与えていた)。
 *   残りは実フィールド名を1件ずつ突き止めて減らす。**増やさないこと**。
 *
 * ★なぜ即座に全部直さないか: 各セルの実フィールド名を製品コードから
 *   確定する作業が要り(推測で書くと [[check-what-the-number-counts]] を踏む)、
 *   第1弾の範囲を超えるため。数で固定して次セッションへ引き継ぐ。
 */
const KNOWN_NA_DEBT = new Set([
  'uid-rate', 'ingest', 'backfill', 'backfill-bottleneck', 'avatar', 'paint',
  'diag-stability', 'console', 'storage', 'ndgr-chats', 'voice-coverage',
  'venue-broadcaster', 'lane-count', 'preview-gen-sync'
]);

/** 全セルが出るように、あらゆる入力を「異常あり」で与える。 */
function maximalInput() {
  return {
    nowMs: Date.now(),
    /*
     * ★v0.1.1403 修正: 従来の fixture は `savedCount` / `officialCount` という
     *   **存在しないフィールド名**を与えていた(実名は recordedCount /
     *   officialCommentCount = healthCells.js:522-523)。
     *   そのためコア中のコアである capture-rate・match が
     *   「最大入力」でも na のままだった＝**判定ロジックが一度も走っていなかった**。
     *   旧ゲートは「出力に現れるか」しか見ないので気づけなかった
     *   ([[check-what-the-number-counts-2026-08-09]] の型)。
     */
    livesData: [{
      recording: true, liveId: 'lv1',
      recordedCount: 10, officialCommentCount: 100, officialRatePct: 10,
      paintCount: 999, commentCount: 30, repaintReasons: { storage_changed: 500 },
      lastPaintMs: 1200, tabCount: 2,
      ended: true, backfillDone: false,
      // ★v0.1.1412: 取得経路(content が既に付けている値)。dom=弱い経路へ落ちた状態
      viewerCountSource: 'dom'
    }],
    /*
     * ★v0.1.1412: 前回までの経路の履歴。embedded で取れていた記録があるので、
     *   上の 'dom' は **降格** と判定される＝セルが na を脱する。
     */
    sourceProvenanceStored: {
      viewerCount: { best: 'embedded-data', current: 'embedded-data', samples: 5, lastAt: 1 }
    },
    fastDiag: { content: {
      networkErrorProbe: { ndgrConnectStatus: 'connected' },
      // ★v0.1.1408: スクロール白化の犯人(移動 vs 描き直し)
      scrollWhiteoutDiag: { whiteoutCount: 3, culpritMove: 2, culpritRepaint: 1 },
      styleReattach: { count: 1 },
      hostMoveDiag: { moveCount: 3 },
      giftDiagnostics: {
        '北極星レーン': {
        // ★v0.1.1407: foundCountLifetime = 「一度でも取れたか」(ns-ever-got の入力)
        '1_貢献度ランキング': { state: 'ok', apiRows: 5, foundCountLifetime: 3 },
        '+α_広告ランキング': { state: 'ok', apiRows: 5 },
        '2_ギフト履歴': { state: 'iframe_unrendered', count: 0, foundCountLifetime: 0 },
        '3_イベント累計スコア': {
          state: 'ok', value: 10, bannerFoundCountLifetime: 2, balloonFoundCountLifetime: 0
        },
        '4_番組累計ポイント': { state: 'ok', value: 100 },
        '5_イベント現在順位': { state: 'ok', value: 3 }
        },
        // ★v0.1.1407: 外部API(貢献度/広告)の生死セルの入力
        externalFetchProbe: {
          intervalTicks: 20, leaderRan: 15, leaderSkipped: 5,
          kokenSent: 10, kokenLastOk: true, kokenLastStatus: 200, kokenLastRows: 5,
          kokenLastError: '', kokenLastAgoMs: 4000,
          nicoadSent: 8, nicoadLastOk: false, nicoadLastStatus: 500,
          nicoadLastRows: 0, nicoadLastError: 'server error'
        },
        // ★実際の速報と同じ入れ子(giftDiagnostics の中)。ここを間違えると出ない。
        commentObservability: {
          savedCommentsUidStats: { withUidPercent: 50, totalSaved: 100, withUid: 50 },
          dedupeSeedDiag: { addedTotalCount: 100, suspiciousAddedCount: 2 },
          // ★v0.1.1408: 受信から保存までのセルの入力
          ndgrChatToPersistRatio: { decodedChats: 100, ndgrPersistedRows: 40, ratioPercent: 40 }
        },
        // ★v0.1.1408: 多タブ混線セルの入力
        multiTabDiag: { eventDomLvCount: 2, staleDomBundleSuspected: true }
      }
    } },
    popupDiag: { popup: {
      storyUserLaneRenderProbe: {
        started: 5, domTilesPainted: 10, heavySettleState: 'race',
        laneTileOscillation: {
          samples: 3, drops: 1,
          // ★v0.1.1406: 振れ幅・最悪の落ち込みセルの入力
          reversals: 5, amplitude: 14, maxTiles: 20, minTiles: 6,
          worstDrop: 12, worstDropFrom: 20, worstDropTo: 8, worstDropOrigin: 'light_summary'
        }
      },
      // ★v0.1.1408: 識別セルの入力(匿名は分母から外す=掟2)
      identityAcquisition: {
        total: 10, anonymous: 5, identifiable: 5, withThumb: 1, withName: 2, withAll: 1,
        guessedThumb: 4, thumbPercent: 20, namePercent: 40, allPercent: 20,
        missingThumb: 4, missingName: 3
      },
      avatarLoadDiag: { usericonFailed: 1, usericonSucceeded: 5 },
      mainThreadBlocker: { count: 3, worstMs: 900, worstName: 'grid' },
      // ★v0.1.1400 で掘り起こした14セルの入力(埋もれていた観測群)
      // ★v0.1.1406: 分解セルの入力(lastRunAgoMs / cappedOut / maxDroppedAtOnce ほか)
      laneTickProbe: { ticks: 10, runs: 7, lastReason: 'defer-heavy', lastRunAgoMs: 200_000 },
      laneRosterDelta: {
        everSeenMax: 20, droppedTotal: 2,
        cappedOutTotal: 5, maxDroppedAtOnce: 12, droppedEventCount: 3
      },
      lanePublishSkip: { noEls: 2, entriesEmpty: 1, lastSkipReason: 'els無し', lastPublishAgoSec: 3 },
      lightSupplyGuard: { observedCount: 2, skipCount: 1 },
      // ★v0.1.1408: 起動段階・作り直し回数(黒画面の追い込み)
      loadShadeProbe: {
        shadeAgeMs: 2500, shadePresent: true, dismissCalls: 6,
        lastLoadPhase: { phase: 'awaiting-first-paint', agoMs: 8000 }
      },
      tickerPick: { domWriteTotal: 12, filteredTooShort: 30 },
      storyGrowthChurn: { rebuilds: 2, maxMs: 150 },
      avatarRememberedDiag: { hitProfileCache: 10, hitSynth: 40 },
      storyUserLaneClickAffordanceParity: { checked: 20, mismatched: 1 },
      northStarRenderProbe: { refreshAllStarted: 3, refreshAllCompleted: 2 },
      northStarMirrorPublishRace: { publishCalls: 3, flushSkipped: 1 }
    } },
    voiceDiag: {
      enabled: true, spokenTotal: 10, lastE2eMs: 6000, staleDropTotal: 2,
      // ★v0.1.1403: ON失敗と再生ブロック(無音で死ぬ系)
      enableFailTotal: 2, lastEnableFailReason: 'refused', audioBlockedTotal: 3,
      // ★v0.1.1407: 読み上げの内訳セルの入力
      synthFailReasons: { timeout: 3, http: 1 }, synthNullTotal: 2, synthNullNearTimeout: 1,
      mergeTotal: 12, rateClampTotal: 4, sustainedBoostTotal: 2,
      dropCountGateTotal: 6, dropHeadStaleTotal: 1, dropSweepStaleTotal: 1,
      queueNow: 9, queueMax: 10, effectiveQueueMax: 10, playbackTimeoutTotal: 6
    },
    // ★v0.1.1406: 即時表示の取りこぼし / 送信から表示まで / 再試行 の入力
    instantPushDiag: { lastGapMs: 20, avgGapMs: 30, sentCount: 10, rejectedCount: 6 },
    commentPostDiag: {
      attempts: 4, okCount: 1, failCount: 0, timeoutCount: 3, revertCount: 1,
      avgEchoMs: 3500, lastEchoMs: 4000, totalRetryAttempts: 5
    },
    venueSeatsDiag: {
      enabled: true, lastUpdateAt: Date.now() - 1000, participantCount: 20, seatsShown: 20,
      perRow: 12, venueMaxRows: 30, seatAreaWidth: 958, capReason: 'participant',
      broadcasterMixedIn: 0,
      // ★venue-parity / venue-yukkuri-face はここ(venueSeatsDiag)の中を見る
      laneParity: { verdict: '✅', unexplained: 0, dom: { ghost: 0 } },
      yukkuriNamedCensus: {
        checked: 5, yukkuriNamed: 2, yukkuriNamedAnonymousStyle: 0, yukkuriNamedNoUid: 1
      },
      // ★v0.1.1405: 会場の鏡うけとり(b=別配信の鏡を見ている の再現)
      mirrorIntake: {
        changedEvents: 5, keyMatched: 0, keyMissed: 3, accepted: 0, rejectedByGate: 0,
        lastMissedKeys: ['nls_lane_mirror_lv999'], lastExpectedKey: 'nls_lane_mirror_lv1',
        lastAcceptedAt: 0, lastRejectReason: ''
      }
    },
    venueOpen: true, venueMirrorAgeMs: 5000,
    venueTiers: { link: 5, gift: 2, ad: 3, konta: 1, tanu: 4 }, venueHasGiftData: true,
    liveElapsedMs: 60 * 60 * 1000,
    giftEffectDiag: {
      detected: 8, played: 5, sound: 5,
      giftDetected: 8, adDetected: 2, giftThrown: 8, giftSoundPlayed: 5,
      adThrown: 2, adSoundPlayed: 2, soundEnabled: true,
      lastEventAt: Date.now() - 1000,
      // ★v0.1.1403: 鳴らそうとして失敗した件数(防御=coalesced/guarded は異常にしない)
      giftSoundError: 1, giftSoundNoPath: 2,
      // ★v0.1.1406: 到着演出・間引きセルの入力
      arrivalDetected: 10, arrivalThrown: 6, arrivalSkippedCd: 2,
      giftSoundCoalesced: 4, giftSoundGuarded: 3, giftThrowCapGuarded: 1, adThrowCapGuarded: 1
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
    mainThreadBlocker: {
      count: 3, worstMs: 900, worstName: 'grid-rebuild', totalMs: 2400,
      byName: {
        'grid-rebuild': { ms: 1800, count: 2, worstMs: 900 },
        // ★v0.1.1408: 2番目の当人・種類数セルの入力(2種類以上が必要)
        'lane-paint': { ms: 600, count: 4, worstMs: 200 }
      },
      afterResumeMs: 1500, afterResumeCount: 2
    },
    // ★v0.1.1403「無音で死ぬ」セルの入力(silentFailureCells.js)。
    //   ここを足し忘れると registry に登録しても出力されず、上のゲートが赤くなる。
    customSoundDiag: {
      dbAvailable: true, assignedKeyCount: 0, totalKeyCount: 38,
      localBundledCount: 90, blobCount: 0, rev: 0
    },
    // ★v0.1.1404: 黒画面の当人セル(blackScreenOwnerCells.js)の入力。
    //   mainThreadBlocker は上でも与えているが、byName/afterResume まで持たせる。
    buildId: '0101-000000',
    appVersion: '0.1.1404',
    // ★v0.1.1408: 操作音 / BGM セルの入力
    opSoundEffectDiag: { handlePressed: 10, handleFired: 7, noPathCount: 2, soundEnabled: true },
    bgmPhaseDiag: { bgmEnabled: true, phase: 'fever', reachCount: 3, jackpotCount: 1 }
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

  it('★全セルが「入力を与えれば na を脱する」(存在するだけの緑を却下)', () => {
    /*
     * ★v0.1.1403: 上の検査だけでは **足りない** ことが実際に判明した。
     *
     *   v1401 の掟5「観測が無くても ⚪『—』で必ず出す」に従うセルは、
     *   **入力が配線されていなくても出力に現れる**(na で出る)。
     *   よって「出力に現れるか」だけを見る上の検査は、
     *   silentFailureCells 系に対しては **恒真** になる。
     *   実際に fixture から customSoundDiag を外しても 6件緑のままだった
     *   ＝ v0.1.1390 の「registry も純関数も test もあるのに画面に出ない」を
     *   検出できない。**ゲートが守っているつもりで守っていない**。
     *
     *   maximalInput は全項目を異常値で与えているので、
     *   **na のままのセルがあれば入力の配線漏れ**と断定できる。
     */
    const stillNa = cells
      .filter((c) => c.level === 'na')
      .map((c) => c.id)
      .filter((id) => !KNOWN_NA_DEBT.has(id));
    expect(
      stillNa,
      `入力を与えたのに na のまま(=入力の配線漏れの疑い): ${stillNa.join(', ')}`
    ).toEqual([]);
  });

  it('★取得経路の履歴が届いていること(降格を判定できる状態か)', () => {
    /*
     * ★v0.1.1412: このセルは履歴が無くても `warn`(脆い)で出るため、
     *   「na を脱するか」の検査では **履歴の配線漏れを検出できない**。
     *   ＝ 上のゲートを通っても「降格を判定できない状態」がありうる。
     *   降格(bad)まで到達することを別に断言する。
     */
    const cell = cells.find((c) => c.id === 'source-provenance');
    expect(cell, 'source-provenance セルが出ていない').toBeTruthy();
    expect(
      cell?.level,
      '履歴(sourceProvenanceStored)が届いていないと bad にならない＝降格を検出できない'
    ).toBe('bad');
  });

  it('★借金リストが増えていない(減らすのは歓迎・増やすのは禁止)', () => {
    /*
     * 借金を「隠す」のではなく **数で固定** する。
     * 新しいセルが na のまま紛れ込むのを防ぐ
     * ([[fail-open-recurs-under-new-names-2026-08-12]]: 個別に塞ぐと別名で再発する)。
     */
    expect(KNOWN_NA_DEBT.size).toBeLessThanOrEqual(14);
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
