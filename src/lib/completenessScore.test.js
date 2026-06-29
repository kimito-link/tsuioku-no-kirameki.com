import { describe, it, expect } from 'vitest';
import { buildHealthCells } from './healthCells.js';
import {
  DIAGNOSIS_REGISTRY,
  DIAGNOSIS_BY_ID,
  DIAGNOSIS_CATEGORY_IDS
} from './diagnosisRegistry.js';
import { buildCompletenessScore, formatCompletenessScoreLines } from './completenessScore.js';

describe('diagnosisRegistry の網羅性(これが「抜けを構造的に無くす」核心)', () => {
  it('全 healthCell id がレジストリに存在する(ズレ=網羅の穴)', () => {
    // 全カテゴリ(会場/読み上げ等)のセルが出る入力を作る。
    const cells = buildHealthCells({
      livesData: [{ lv: 'lv1', recordedCount: 10, officialCommentCount: 10, officialRatePct: 100, lastIngestAgoMs: 1000 }],
      fastDiag: {
        content: {
          scrollWhiteoutDiag: { whiteoutCount: 0 },
          networkErrorProbe: { ndgrConnectStatus: 'connected' },
          giftDiagnostics: { '北極星レーン': { '1_貢献度ランキング': { state: 'ok' } } }
        }
      },
      voiceDiag: { enabled: true, spokenTotal: 5, lastSpokenBase: 1, staleDropTotal: 0 },
      venueSeatsDiag: { enabled: true, broadcasterKnown: true, broadcasterInSeats: false, seatsShown: 8, participantCount: 8, lastUpdateAt: 1 },
      laneDiag: { liveId: 'lv1', identified: 3, laneShown: 3 },
      nowMs: 1000
    });
    const ids = cells.map((c) => c.id);
    const missing = ids.filter((id) => !DIAGNOSIS_BY_ID[id]);
    expect(missing).toEqual([]); // レジストリに無いセルがあれば、ここで落ちる=追加漏れの番犬
  });

  it('レジストリの category は5カテゴリのいずれか(1観点1カテゴリ)', () => {
    for (const e of DIAGNOSIS_REGISTRY) {
      expect(DIAGNOSIS_CATEGORY_IDS).toContain(e.category);
      expect(typeof e.weight).toBe('number');
      expect(typeof e.mandatory).toBe('boolean');
    }
  });

  it('id に重複が無い', () => {
    const ids = DIAGNOSIS_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildCompletenessScore', () => {
  it('全 ok・必須も ok・processing 無し → complete(✅完璧)', () => {
    const cells = [
      { id: 'capture-rate', label: '取得率', level: 'ok' },
      { id: 'match', label: '記録↔公式一致', level: 'ok' },
      { id: 'ndgr', label: 'NDGR接続', level: 'ok' },
      { id: 'storage', label: 'storage安定', level: 'ok' }
    ];
    const s = buildCompletenessScore(cells);
    expect(s.verdict).toBe('complete');
    expect(s.overallPct).toBe(100);
    expect(s.remainingToComplete).toBe(0);
  });

  it('warn が混じる → incomplete・不合格に名前が出る', () => {
    const cells = [
      { id: 'capture-rate', label: '取得率', level: 'ok' },
      { id: 'scroll-whiteout', label: 'スクロール白化', level: 'warn' }
    ];
    const s = buildCompletenessScore(cells);
    expect(s.verdict).toBe('incomplete');
    expect(s.failing.map((f) => f.label)).toContain('スクロール白化');
    expect(s.remainingToComplete).toBe(1);
  });

  it('processing が残る → complete を名乗らない(processing 判定)', () => {
    const cells = [
      { id: 'capture-rate', label: '取得率', level: 'ok' },
      { id: 'backfill', label: '過去ログ取得', level: 'processing' }
    ];
    const s = buildCompletenessScore(cells);
    expect(s.verdict).toBe('processing'); // 永遠 backfill で 100% 詐称しない
  });

  it('na は母数から除外・対象外として数える(嘘の赤を出さない/隠さない)', () => {
    const cells = [
      { id: 'capture-rate', label: '取得率', level: 'ok' },
      { id: 'ns-erank', label: 'イベント順位', level: 'na' }
    ];
    const s = buildCompletenessScore(cells);
    expect(s.overallPct).toBe(100); // na は母数外=100%
    expect(s.naCount).toBe(1); // でも対象外として数える(隠さない)
    expect(s.verdict).toBe('complete');
  });

  it('mandatory が ok でない → complete にならない', () => {
    const cells = [
      { id: 'capture-rate', label: '取得率', level: 'warn' } // 必須が warn
    ];
    const s = buildCompletenessScore(cells);
    expect(s.verdict).toBe('incomplete');
  });

  it('集計対象ゼロ(全 na/未起動) → unknown', () => {
    const s = buildCompletenessScore([{ id: 'ns-erank', label: 'イベント順位', level: 'na' }]);
    expect(s.verdict).toBe('unknown');
  });
});

describe('formatCompletenessScoreLines', () => {
  it('見出し+総合+カテゴリ行を出す', () => {
    const s = buildCompletenessScore([
      { id: 'capture-rate', label: '取得率', level: 'ok' },
      { id: 'scroll-whiteout', label: 'スクロール白化', level: 'warn' }
    ]);
    const lines = formatCompletenessScoreLines(s);
    expect(lines[0]).toBe('### 完全性スコア');
    expect(lines.some((l) => l.startsWith('総合:'))).toBe(true);
    expect(lines.some((l) => l.includes('コメント記録の完全性'))).toBe(true);
    expect(lines.some((l) => l.includes('不合格の項目') && l.includes('スクロール白化'))).toBe(true);
  });
});
