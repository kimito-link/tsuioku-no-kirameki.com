import { describe, it, expect } from 'vitest';
import {
  makeInitialVoiceDiag,
  buildVoiceDiagSnapshot,
  buildVoiceDiagLine,
  VOICE_DIAG_FRESH_MS
} from './voiceDiag.js';

/*
 * ★v0.1.1328 化石値ガード。2026-08-11 に司令塔が実際に2回誤診してから入れた。
 *   KEY_VOICE_DIAG は永続化されリセット経路が無いため、コメビュ/会場を閉じると
 *   スナップショットが凍り、状態速報は8日前の数字を「今の値」として表示していた。
 */
describe('buildVoiceDiagLine 化石値ガード', () => {
  const FRESH = {
    enabled: true, spokenTotal: 5, queueNow: 1, queueMax: 3,
    serviceTimeEmaMs: 900, effectiveQueueMax: 8, capturedAt: 1_000_000
  };

  it('新鮮な値はそのまま数値を出す', () => {
    const line = buildVoiceDiagLine(FRESH, FRESH.capturedAt + 5_000);
    expect(line).toContain('読み上げ:ON');
    expect(line).toContain('実効上限8');
    expect(line).not.toContain('化石値');
  });

  it('★8日前の実データ形状は化石値として数値を伏せる(実際に誤診した状況)', () => {
    const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;
    const fossil = {
      ...FRESH,
      // 当時の実測値。床5の現行コードでは実効上限2も coldsynth も到達不能=化石の証明。
      effectiveQueueMax: 2, serviceTimeEmaMs: 4405, lagVerdict: 'coldsynth',
      source: 'venue'
    };
    const line = buildVoiceDiagLine(fossil, fossil.capturedAt + EIGHT_DAYS);
    expect(line).toContain('化石値');
    // ★数値を出さない(出すから読んでしまう)。
    expect(line).not.toContain('実効上限2');
    expect(line).not.toContain('coldsynth');
    expect(line).not.toContain('4405');
    // どちらの面が書いたかは残す(調査の出発点)。
    expect(line).toContain('venue');
  });

  it('10分ちょうど超で化石値に切り替わる(judgeValueFreshness の閾値に従う)', () => {
    const line = buildVoiceDiagLine(FRESH, FRESH.capturedAt + 11 * 60_000);
    expect(line).toContain('化石値');
  });

  it('しきい値内(60秒)は通常表示', () => {
    const line = buildVoiceDiagLine(FRESH, FRESH.capturedAt + VOICE_DIAG_FRESH_MS - 1);
    expect(line).not.toContain('化石値');
  });

  it('capturedAt が無い古いスナップショットは従来どおり表示(後方互換)', () => {
    const noCaptured = { ...FRESH };
    delete noCaptured.capturedAt;
    const line = buildVoiceDiagLine(noCaptured, 9_999_999);
    expect(line).not.toContain('化石値');
    expect(line).toContain('読み上げ:ON');
  });
});

describe('buildVoiceDiagSnapshot source', () => {
  it('source を載せる(どちらの面が書いたか)', () => {
    expect(buildVoiceDiagSnapshot({ source: 'comeview' }, 1).source).toBe('comeview');
  });
  it('未指定なら空文字(壊れない)', () => {
    expect(buildVoiceDiagSnapshot({}, 1).source).toBe('');
  });
});

describe('makeInitialVoiceDiag', () => {
  it('全項目が安全な初期値', () => {
    const d = makeInitialVoiceDiag();
    expect(d.enabled).toBe(false);
    expect(d.queueNow).toBe(0);
    expect(d.lastSynthMs).toBe(-1);
    expect(d.lastSpokenBase).toBe(0);
  });
});

describe('buildVoiceDiagSnapshot', () => {
  it('数値以外は初期値にフォールバック・capturedAt を載せる', () => {
    const snap = buildVoiceDiagSnapshot({ enabled: true, queueNow: 'x', queueMax: 8 }, 1000);
    expect(snap.enabled).toBe(true);
    expect(snap.queueNow).toBe(0); // 'x' は不正→0。
    expect(snap.queueMax).toBe(8);
    expect(snap.capturedAt).toBe(1000);
  });
  it('null/undefined でも落ちない', () => {
    expect(buildVoiceDiagSnapshot(null, 0).enabled).toBe(false);
    expect(buildVoiceDiagSnapshot(undefined, 0).queueNow).toBe(0);
  });
});

describe('buildVoiceDiagLine', () => {
  it('会場モード未使用(OFF・発話0・ピーク0)は空文字=ノイズにしない', () => {
    expect(buildVoiceDiagLine({ enabled: false, spokenTotal: 0, queueMax: 0 }, 1000)).toBe('');
    expect(buildVoiceDiagLine(null, 1000)).toBe('');
  });

  it('ON で待機・間引き・最終発話経過・合成msを出す', () => {
    const now = 100000;
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 3, queueMax: 8, spokenTotal: 50,
      staleDropTotal: 12, lastSpokenBase: now - 4000, lastSynthMs: 120
    }, now);
    expect(line).toContain('会場読み上げ:');
    expect(line).toContain('読み上げ:ON');
    expect(line).toContain('待機3(最大8)');
    expect(line).toContain('間引き12件'); // 遅延の傍証。
    expect(line).toContain('最終発話4秒前');
    expect(line).toContain('合成120ms');
  });

  it('再生TO(playbackTimeoutTotal>0)は固着の傍証として必ず出す', () => {
    const now = 100000;
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 6, queueMax: 8, spokenTotal: 3,
      staleDropTotal: 23, playbackTimeoutTotal: 2, lastSpokenBase: now - 2234000, lastSynthMs: 0
    }, now);
    expect(line).toContain('再生TO2件');
    // snapshot 経由でも欠落しない。
    const snap = buildVoiceDiagSnapshot({ playbackTimeoutTotal: 5 }, 0);
    expect(snap.playbackTimeoutTotal).toBe(5);
  });

  it('再生TO0なら再生TO項目は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      staleDropTotal: 0, playbackTimeoutTotal: 0, lastSpokenBase: 0, lastSynthMs: -1
    }, 1000);
    expect(line).not.toContain('再生TO');
  });

  it('間引き0なら間引き項目は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, staleDropTotal: 0,
      lastSpokenBase: 0, lastSynthMs: -1
    }, 1000);
    expect(line).not.toContain('間引き');
    expect(line).not.toContain('合成'); // -1 は未計測=出さない。
  });

  it('発話済みなら OFF でも表示(使用後に止めた状態も見える)', () => {
    const line = buildVoiceDiagLine({ enabled: false, spokenTotal: 10, queueMax: 5, queueNow: 0 }, 1000);
    expect(line).toContain('読み上げ:OFF');
  });

  describe('v0.1.1088計器(voice-tempo-realtime-SYNTHESIS §3 Phase 1): 体感遅延/統合', () => {
    it('lastE2eMs/e2eAvgMsがあれば体感遅延を秒表示する', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 3, queueMax: 8, spokenTotal: 50,
        lastE2eMs: 1800, e2eAvgMs: 2400
      }, 1000);
      expect(line).toContain('体感遅延1.8秒(平均2.4秒)');
    });

    it('平均が未計測(-1)なら直近値だけ表示する', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 1, queueMax: 1, spokenTotal: 1,
        lastE2eMs: 900, e2eAvgMs: -1
      }, 1000);
      expect(line).toContain('体感遅延0.9秒');
      expect(line).not.toContain('平均');
    });

    it('lastE2eMsが未計測(-1)なら体感遅延は出さない(ノイズにしない)', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
        lastE2eMs: -1, e2eAvgMs: -1
      }, 1000);
      expect(line).not.toContain('体感遅延');
    });

    it('mergeTotal>0なら統合件数を表示する', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, mergeTotal: 7
      }, 1000);
      expect(line).toContain('統合7件');
    });

    it('mergeTotal=0なら統合項目は出さない', () => {
      const line = buildVoiceDiagLine({
        enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, mergeTotal: 0
      }, 1000);
      expect(line).not.toContain('統合');
    });
  });
});

describe('makeInitialVoiceDiag / buildVoiceDiagSnapshot: v0.1.1088計器の初期値・フォールバック', () => {
  it('初期stateはlastE2eMs/e2eAvgMs=-1・mergeTotal=0', () => {
    const d = makeInitialVoiceDiag();
    expect(d.lastE2eMs).toBe(-1);
    expect(d.e2eAvgMs).toBe(-1);
    expect(d.mergeTotal).toBe(0);
  });

  it('スナップショットが欠損フィールドを初期値で埋める', () => {
    const snap = buildVoiceDiagSnapshot({}, 0);
    expect(snap.lastE2eMs).toBe(-1);
    expect(snap.e2eAvgMs).toBe(-1);
    expect(snap.mergeTotal).toBe(0);
  });

  it('実測値を保持する', () => {
    const snap = buildVoiceDiagSnapshot({ lastE2eMs: 1234, e2eAvgMs: 2000, mergeTotal: 3 }, 0);
    expect(snap.lastE2eMs).toBe(1234);
    expect(snap.e2eAvgMs).toBe(2000);
    expect(snap.mergeTotal).toBe(3);
  });
});

describe('2026-07-24計器(段階0=shadow・council-fable設計venue-bubble-voice-realtime-max-DESIGN.md)', () => {
  it('初期stateはserviceTimeEmaMs=-1・effectiveQueueMax=8・rateClampTotal=0・voicedRatio=-1', () => {
    const d = makeInitialVoiceDiag();
    expect(d.serviceTimeEmaMs).toBe(-1);
    expect(d.effectiveQueueMax).toBe(8);
    expect(d.rateClampTotal).toBe(0);
    expect(d.voicedRatio).toBe(-1);
  });

  it('スナップショットが欠損フィールドを初期値で埋める', () => {
    const snap = buildVoiceDiagSnapshot({}, 0);
    expect(snap.serviceTimeEmaMs).toBe(-1);
    expect(snap.effectiveQueueMax).toBe(8);
    expect(snap.rateClampTotal).toBe(0);
    expect(snap.voicedRatio).toBe(-1);
  });

  it('実測値を保持する', () => {
    const snap = buildVoiceDiagSnapshot(
      { serviceTimeEmaMs: 1500, effectiveQueueMax: 4, rateClampTotal: 2, voicedRatio: 0.75 },
      0
    );
    expect(snap.serviceTimeEmaMs).toBe(1500);
    expect(snap.effectiveQueueMax).toBe(4);
    expect(snap.rateClampTotal).toBe(2);
    expect(snap.voicedRatio).toBe(0.75);
  });

  it('voicedRatio計測済みなら%表示する(生存者バイアス潰し・D章)', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, voicedRatio: 0.8
    }, 1000);
    expect(line).toContain('voiced率80%');
  });

  it('voicedRatio未計測(-1)なら出さない(ノイズにしない)', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, voicedRatio: -1
    }, 1000);
    expect(line).not.toContain('voiced率');
  });

  it('serviceTimeEmaMs計測済みなら処理時間と実効上限を表示する(v0.1.1181段階1=apply、未適用表記は出さない)', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      serviceTimeEmaMs: 1500, effectiveQueueMax: 4
    }, 1000);
    expect(line).toContain('処理時間1500ms/件');
    expect(line).toContain('実効上限4');
    expect(line).not.toContain('未適用');
  });

  it('serviceTimeEmaMs未計測(-1)なら処理時間/実効上限は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, serviceTimeEmaMs: -1
    }, 1000);
    expect(line).not.toContain('処理時間');
    expect(line).not.toContain('実効上限');
  });

  it('rateClampTotal>0なら速度飽和件数を表示する', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, rateClampTotal: 3
    }, 1000);
    expect(line).toContain('速度飽和3件');
  });

  it('rateClampTotal=0なら速度飽和項目は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, rateClampTotal: 0
    }, 1000);
    expect(line).not.toContain('速度飽和');
  });
});

describe('2026-07-28計器(段階0=shadow・council-fable設計voice-lag-decomposition-DESIGN.md)', () => {
  it('初期stateの全新フィールドが安全な初期値', () => {
    const d = makeInitialVoiceDiag();
    expect(d.synthWaitEmaMs).toBe(-1);
    expect(d.playPrepEmaMs).toBe(-1);
    expect(d.playbackEmaMs).toBe(-1);
    expect(d.expectedPlayEmaMs).toBe(-1);
    expect(d.arrivalPerMin).toBe(-1);
    expect(d.voicedRecentRatio).toBe(-1);
    expect(d.dropCountGateTotal).toBe(0);
    expect(d.dropHeadStaleTotal).toBe(0);
    expect(d.dropSweepStaleTotal).toBe(0);
    expect(d.lagVerdict).toBe('');
    expect(d.diagBornAt).toBe(0);
  });

  it('スナップショットが欠損フィールドを初期値で埋める(allowlist漏れ防止・地雷G-1)', () => {
    const snap = buildVoiceDiagSnapshot({}, 0);
    expect(snap.synthWaitEmaMs).toBe(-1);
    expect(snap.playPrepEmaMs).toBe(-1);
    expect(snap.playbackEmaMs).toBe(-1);
    expect(snap.expectedPlayEmaMs).toBe(-1);
    expect(snap.arrivalPerMin).toBe(-1);
    expect(snap.voicedRecentRatio).toBe(-1);
    expect(snap.dropCountGateTotal).toBe(0);
    expect(snap.dropHeadStaleTotal).toBe(0);
    expect(snap.dropSweepStaleTotal).toBe(0);
    expect(snap.lagVerdict).toBe('');
    expect(snap.diagBornAt).toBe(0);
  });

  it('スナップショットが全新フィールドの実測値を保持する', () => {
    const snap = buildVoiceDiagSnapshot({
      synthWaitEmaMs: 3000, playPrepEmaMs: 120, playbackEmaMs: 1800, expectedPlayEmaMs: 1700,
      arrivalPerMin: 233.7, voicedRecentRatio: 0.62, dropCountGateTotal: 5, dropHeadStaleTotal: 2,
      dropSweepStaleTotal: 8, lagVerdict: 'coldsynth', diagBornAt: 12345
    }, 0);
    expect(snap.synthWaitEmaMs).toBe(3000);
    expect(snap.playPrepEmaMs).toBe(120);
    expect(snap.playbackEmaMs).toBe(1800);
    expect(snap.expectedPlayEmaMs).toBe(1700);
    expect(snap.arrivalPerMin).toBeCloseTo(233.7, 5);
    expect(snap.voicedRecentRatio).toBeCloseTo(0.62, 5);
    expect(snap.dropCountGateTotal).toBe(5);
    expect(snap.dropHeadStaleTotal).toBe(2);
    expect(snap.dropSweepStaleTotal).toBe(8);
    expect(snap.lagVerdict).toBe('coldsynth');
    expect(snap.diagBornAt).toBe(12345);
  });

  it('内訳(合成待/準備/実再生)が1つでも計測済みならまとめて表示する', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      synthWaitEmaMs: 3000, playPrepEmaMs: 120, playbackEmaMs: 1800
    }, 1000);
    expect(line).toContain('内訳(合成待3000/準備120/実再生1800ms)');
  });

  it('内訳が全て未計測(-1)なら内訳項目自体を出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      synthWaitEmaMs: -1, playPrepEmaMs: -1, playbackEmaMs: -1
    }, 1000);
    expect(line).not.toContain('内訳');
  });

  it('需要/供給は両方(arrivalPerMinとserviceTimeEmaMs)が計測済みのときだけ表示する', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      arrivalPerMin: 233.7, serviceTimeEmaMs: 5769
    }, 1000);
    // 供給 = 60000/5769 ≈ 10.4/分
    expect(line).toContain('需要233.7/分vs供給10.4/分');
  });

  it('arrivalPerMinが未計測(-1)なら需要/供給行は出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      arrivalPerMin: -1, serviceTimeEmaMs: 5769
    }, 1000);
    expect(line).not.toContain('需要');
  });

  it('直近voiced率(voicedRecentRatio)が計測済みなら%表示する', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, voicedRecentRatio: 0.038
    }, 1000);
    expect(line).toContain('直近voiced率3.8%');
  });

  it('直近voiced率が未計測(-1)なら出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, voicedRecentRatio: -1
    }, 1000);
    expect(line).not.toContain('直近voiced率');
  });

  it('drop内訳は1件でも計上があれば3種まとめて出す', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      dropCountGateTotal: 5, dropHeadStaleTotal: 0, dropSweepStaleTotal: 2
    }, 1000);
    expect(line).toContain('drop内訳(件数5/鮮度0/全stale2)');
  });

  it('drop内訳が全て0なら出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5,
      dropCountGateTotal: 0, dropHeadStaleTotal: 0, dropSweepStaleTotal: 0
    }, 1000);
    expect(line).not.toContain('drop内訳');
  });

  it('判定(lagVerdict)がcoldsynth等なら表示する', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, lagVerdict: 'coldsynth'
    }, 1000);
    expect(line).toContain('判定=coldsynth');
  });

  it('判定がokなら表示しない(間引きは偶発でノイズにしない)', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, lagVerdict: 'ok'
    }, 1000);
    expect(line).not.toContain('判定=');
  });

  it('判定がinsufficientなら表示しない(データ不足でノイズにしない)', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, lagVerdict: 'insufficient'
    }, 1000);
    expect(line).not.toContain('判定=');
  });

  it('計測経過分(diagBornAt)が設定されていれば表示する', () => {
    const now = 1000 * 60 * 5; // 5分後
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, diagBornAt: 1
    }, now);
    expect(line).toContain('計測5分');
  });

  it('diagBornAtが未設定(0)なら計測経過分を出さない', () => {
    const line = buildVoiceDiagLine({
      enabled: true, queueNow: 0, queueMax: 2, spokenTotal: 5, diagBornAt: 0
    }, 0);
    expect(line).not.toContain('計測');
  });
});
