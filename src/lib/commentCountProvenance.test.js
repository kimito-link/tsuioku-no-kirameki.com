import { describe, it, expect } from 'vitest';
import {
  RECORD_OVER_OFFICIAL_NORMAL_MAX_PCT,
  buildCommentCountProvenance,
  formatCommentCountProvenanceLines,
  commentCountProvenanceToActionCards
} from './commentCountProvenance.js';

describe('buildCommentCountProvenance', () => {
  it('記録/本家の両方から出どころを組む', () => {
    const p = buildCommentCountProvenance({
      lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000
    });
    expect(p.recorded.value).toBe(1005);
    expect(p.official.value).toBe(926);
    expect(p.recorded.source).toContain('IndexedDB');
    expect(p.official.source).toContain('NDGR');
    expect(p.ratePct).toBe(Math.round((1005 / 926) * 100)); // 109
    expect(p.recordedExceedsOfficial).toBe(true);
  });

  it('本家の取得経過を秒/分でラベル化', () => {
    const p1 = buildCommentCountProvenance({ recordedCount: 10, officialCommentCount: 9, lastIngestAgoMs: 5000 });
    expect(p1.official.ageLabel).toBe('5秒前');
    const p2 = buildCommentCountProvenance({ recordedCount: 10, officialCommentCount: 9, lastIngestAgoMs: 5 * 60 * 1000 });
    expect(p2.official.ageLabel).toBe('5分前');
  });

  it('逆転していなければ recordedExceedsOfficial=false', () => {
    const p = buildCommentCountProvenance({ recordedCount: 800, officialCommentCount: 926 });
    expect(p.recordedExceedsOfficial).toBe(false);
  });

  it('数字が無ければ null', () => {
    expect(buildCommentCountProvenance({ lv: 'lv1' })).toBe(null);
    expect(buildCommentCountProvenance(null)).toBe(null);
  });

  it('片方だけでも組む(本家のみ)', () => {
    const p = buildCommentCountProvenance({ officialCommentCount: 926 });
    expect(p.recorded.value).toBe(null);
    expect(p.official.value).toBe(926);
    expect(p.ratePct).toBe(null);
    expect(p.recordedExceedsOfficial).toBe(false);
    expect(p.verdict).toBe('unknown'); // 材料不足=判定しない
  });

  it('official=0 のとき ratePct は出さない(ゼロ除算回避)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 5, officialCommentCount: 0 });
    expect(p.ratePct).toBe(null);
    expect(p.verdict).toBe('unknown');
  });
});

describe('buildCommentCountProvenance 3段階判定', () => {
  it('記録≤本家=ok(正常)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 800, officialCommentCount: 926, lastIngestAgoMs: 5000 });
    expect(p.verdict).toBe('ok');
  });

  it('記録>本家・本家遅延・130%以内=normal(正常範囲)', () => {
    // 109%・本家は5分前(遅延)→記録が即時単調で先行=正常
    const p = buildCommentCountProvenance({ recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 });
    expect(p.verdict).toBe('normal');
    expect(p.ratePct).toBe(109);
  });

  it('記録>本家・130%超=check(要確認)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 });
    expect(p.ratePct).toBeGreaterThan(RECORD_OVER_OFFICIAL_NORMAL_MAX_PCT);
    expect(p.verdict).toBe('check');
    expect(p.verdictReason).toContain('別配信');
  });

  it('記録>本家・本家が新鮮(60秒以内)なのに超過=check(遅延で説明できない)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 10 * 1000 });
    expect(p.verdict).toBe('check');
    expect(p.verdictReason).toContain('新鮮');
  });

  // ★v0.1.1003: 鮮度判定は公式統計の更新時刻(officialCommentStatsAgeMs)で測る。
  it('公式統計が古い(>60秒)なら、コメント取り込みが0秒前でも normal(遅延で説明可能)', () => {
    // 実機 lv350859008 型: lastIngestAgoMs=0(コメは毎秒来る)だが公式統計は3分前=遅延。
    //   従来は lastIngest を見て「0秒前=新鮮」→誤って check。新クロックで normal に。
    const p = buildCommentCountProvenance({
      recordedCount: 5974,
      officialCommentCount: 5633,
      lastIngestAgoMs: 0,
      officialCommentStatsAgeMs: 3 * 60 * 1000
    });
    expect(p.ratePct).toBe(106);
    expect(p.verdict).toBe('normal');
  });

  it('公式統計が本当に新鮮(60秒以内)で記録超なら check のまま(本物の食い違いは見逃さない)', () => {
    const p = buildCommentCountProvenance({
      recordedCount: 1005,
      officialCommentCount: 926,
      lastIngestAgoMs: 0,
      officialCommentStatsAgeMs: 5 * 1000
    });
    expect(p.verdict).toBe('check');
    expect(p.verdictReason).toContain('新鮮');
  });

  it('公式統計が古くても130%超は check のまま(別配信混入/二重計上の疑いは遅延では消さない)', () => {
    const p = buildCommentCountProvenance({
      recordedCount: 1400,
      officialCommentCount: 926,
      lastIngestAgoMs: 0,
      officialCommentStatsAgeMs: 10 * 60 * 1000
    });
    expect(p.verdict).toBe('check');
    expect(p.verdictReason).toContain('別配信');
  });

  // ★v0.1.1008: 本家新鮮でも、時系列で記録の過剰増が無ければ normal(遅延/母数差で説明可)。
  it('本家新鮮+時系列フラット(本家0/記録0)で101%=normal(実機lv350859704型・🟡誤報を消す)', () => {
    const p = buildCommentCountProvenance({
      recordedCount: 1179,
      officialCommentCount: 1169,
      officialCommentStatsAgeMs: 16 * 1000, // 本家新鮮
      officialStatisticsCommentsDelta: 0,
      officialReceivedCommentsDelta: 0,
      officialCommentSampleWindowMs: 60000
    });
    expect(p.ratePct).toBe(101);
    expect(p.verdict).toBe('normal');
    expect(p.verdictReason).toContain('過剰増');
  });

  it('本家新鮮+時系列で記録Δが本家Δを大きく上回る=check のまま(本物の二重は見逃さない)', () => {
    const p = buildCommentCountProvenance({
      recordedCount: 1100,
      officialCommentCount: 1000,
      officialCommentStatsAgeMs: 5 * 1000,
      officialStatisticsCommentsDelta: 10,
      officialReceivedCommentsDelta: 60, // 記録だけ過剰増
      officialCommentSampleWindowMs: 60000
    });
    expect(p.verdict).toBe('check');
    expect(p.verdictReason).toContain('新鮮');
  });

  it('時系列の材料が無ければ従来どおり(本家新鮮で超過=check・後方互換)', () => {
    const p = buildCommentCountProvenance({
      recordedCount: 1005, officialCommentCount: 926, officialCommentStatsAgeMs: 5 * 1000
    });
    expect(p.verdict).toBe('check');
  });
});

describe('formatCommentCountProvenanceLines', () => {
  it('セクション見出しと各数字の出どころ+判定を並べる', () => {
    const lines = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }
    ]);
    const text = lines.join('\n');
    expect(text).toContain('### 数字の出どころ（何を数えているか）');
    expect(text).toContain('正常/要確認の判定');
    expect(text).toContain('記録 1,005');
    expect(text).toContain('本家コメ 926');
    expect(text).toContain('一致度: 記録/本家 = 109%');
    expect(text).toContain('判定: 🟢 正常');
  });

  it('130%超は要確認🟡を出す', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }
    ]).join('\n');
    expect(text).toContain('判定: 🟡 要確認');
  });

  // ★v0.1.1008: 本家Δ≈記録Δ(過剰増なし)は v0.1.1008 の時系列ガードで normal に倒れる=🟡を出さない。
  //   (v0.1.1007 ではここで check+時系列行を出していたが、遅延型を正常判定するのが正しい挙動)。
  it('本家Δ≈記録Δ(過剰増なし)なら 🟢 正常(時系列ガードで🟡を出さない)', () => {
    const text = formatCommentCountProvenanceLines([
      {
        lv: 'lv1', recordedCount: 1178, officialCommentCount: 1169,
        officialCommentStatsAgeMs: 5000, // 本家新鮮だが…
        officialStatisticsCommentsDelta: 50, officialReceivedCommentsDelta: 51, // 過剰増なし
        officialCommentSampleWindowMs: 60000
      }
    ]).join('\n');
    expect(text).toContain('判定: 🟢 正常');
    expect(text).not.toContain('判定: 🟡 要確認');
    // 時系列行は check のときだけ出す=正常では出さない。
    expect(text).not.toContain('時系列(計器)');
  });

  it('要確認(記録Δが本家Δを大きく上回る)のとき、時系列で「二重計上寄り」を出す', () => {
    const text = formatCommentCountProvenanceLines([
      {
        lv: 'lv1', recordedCount: 1300, officialCommentCount: 1000,
        officialCommentStatsAgeMs: 5000,
        officialStatisticsCommentsDelta: 10, officialReceivedCommentsDelta: 60,
        officialCommentSampleWindowMs: 60000
      }
    ]).join('\n');
    expect(text).toContain('記録の過剰増(二重計上)寄り');
  });

  it('時系列の材料が無ければ時系列行は出さない(後方互換)', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }
    ]).join('\n');
    expect(text).not.toContain('時系列(計器)');
  });

  it('記録≤本家は正常🟢', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 800, officialCommentCount: 926, lastIngestAgoMs: 5000 }
    ]).join('\n');
    expect(text).toContain('判定: 🟢 正常');
  });

  it('数字が無ければ空配列(セクションごと出さない)', () => {
    expect(formatCommentCountProvenanceLines([{ lv: 'lv1' }])).toEqual([]);
    expect(formatCommentCountProvenanceLines([])).toEqual([]);
    expect(formatCommentCountProvenanceLines(null)).toEqual([]);
  });

  it('複数配信を順に並べる', () => {
    const lines = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 100, officialCommentCount: 90, lastIngestAgoMs: 5 * 60 * 1000 },
      { lv: 'lv2', recordedCount: 50, officialCommentCount: 80, lastIngestAgoMs: 5000 }
    ]);
    const text = lines.join('\n');
    expect(text).toContain('[lv1]');
    expect(text).toContain('[lv2]');
  });

  // v0.1.1001: 要確認(check)のとき fastDiag から commentNo 欠落割合の内訳を出す。
  it('要確認のとき fastDiag があれば commentNo 欠落の内訳を併記する', () => {
    const fastDiag = {
      content: { giftDiagnostics: { commentObservability: { savedCommentsUidStats: {
        totalSaved: 9757, commentNoLess: 9757, commentNoLessPercent: 100, withUidPercent: 0
      } } } }
    };
    const text = formatCommentCountProvenanceLines([
      // 本家が新鮮(5秒前)なのに記録超=check
      { lv: 'lv1', recordedCount: 9757, officialCommentCount: 9420, lastIngestAgoMs: 5000 }
    ], fastDiag).join('\n');
    expect(text).toContain('判定: 🟡 要確認');
    expect(text).toContain('内訳(計器)');
    expect(text).toContain('commentNo 欠落行 9,757件 (100%)');
  });

  it('正常(🟢)のときは内訳を出さない(fastDiag があっても)', () => {
    const fastDiag = {
      content: { giftDiagnostics: { commentObservability: { savedCommentsUidStats: {
        totalSaved: 100, commentNoLess: 100, commentNoLessPercent: 100
      } } } }
    };
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 800, officialCommentCount: 926, lastIngestAgoMs: 5000 }
    ], fastDiag).join('\n');
    expect(text).toContain('判定: 🟢 正常');
    expect(text).not.toContain('内訳(計器)');
  });

  it('fastDiag が無ければ要確認でも内訳は出さない(後方互換)', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }
    ]).join('\n');
    expect(text).toContain('判定: 🟡 要確認');
    expect(text).not.toContain('内訳(計器)');
  });
});

describe('commentCountProvenanceToActionCards', () => {
  it('check の配信だけ warn カードに昇格', () => {
    const cards = commentCountProvenanceToActionCards([
      { lv: 'lv1', recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }, // check
      { lv: 'lv2', recordedCount: 800, officialCommentCount: 926, lastIngestAgoMs: 5000 } // ok
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('comment-count-check-lv1');
    expect(cards[0].severity).toBe('warn');
  });

  it('ok/normal はカードゼロ(誤検知ゼロ)', () => {
    const cards = commentCountProvenanceToActionCards([
      { lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 } // normal
    ]);
    expect(cards).toEqual([]);
  });

  it('空入力でカードゼロ', () => {
    expect(commentCountProvenanceToActionCards([])).toEqual([]);
    expect(commentCountProvenanceToActionCards(null)).toEqual([]);
  });
});
