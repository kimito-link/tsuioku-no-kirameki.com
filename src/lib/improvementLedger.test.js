import { describe, it, expect } from 'vitest';
import {
  IMPROVEMENT_METRICS,
  judgeImprovement,
  formatImprovementLine,
  detectRegressions,
  buildSubmissionSummary
} from './improvementLedger.js';

/**
 * ★版ごとの「改善記録」— 数字で退化を止め、申請にも使える形にする。
 *
 * ■ ★ユーザー指示(2026-08-21)
 *   「計器にバージョンにより改善記録つくれますか？退化させないように」
 *   「申請のときにもつかえるように」
 *
 * ■ ★実データで確かめた現状(推測ではない)
 *   changelog は **1,349版**あるが、キーは version/date/summary/items の**4つだけ**。
 *   実測値の欄が無い＝「軽くしました」と書いてあっても**数字で証明できない**。
 *   数字を含む版は 390(29%)、うち before→after の形は **18版だけ**。
 *
 * ■ ★設計の要(実データが教えてくれた)
 *   抽出した18件を見ると、**小さいほど良いとは限らない**:
 *     0.1.887  100% → 0%   ★改善(エラー率が消えた)
 *     0.1.1298 2回 → 13回   ★改善(描画が動くようになった)
 *     0.1.1102 3秒 → 12秒   ★改善(間引きを緩めて取りこぼしを無くした)
 *   ＝ ★**方向は数字から推測できない**。指標ごとに「どちらが良いか」を宣言する。
 *   これを間違えると、改善を退化と誤判定して**直した人を止める**。
 */
describe('★指標の宣言(方向を数字から推測しない)', () => {
  it('★全ての指標に「どちらが良いか」がある', () => {
    expect(IMPROVEMENT_METRICS.length).toBeGreaterThan(0);
    for (const m of IMPROVEMENT_METRICS) {
      expect(m.id, '指標にidが無い').toBeTruthy();
      expect(m.label, `${m.id} にラベルが無い`).toBeTruthy();
      expect(['lower', 'higher'], `${m.id} の方向が未宣言`).toContain(m.better);
      expect(m.unit, `${m.id} に単位が無い`).toBeTruthy();
    }
  });

  it('★idが重複していない(同じ指標が2つあると比較が壊れる)', () => {
    const ids = IMPROVEMENT_METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('★改善/退化の判定', () => {
  it('★★「小さいほど良い」指標: 減れば改善', () => {
    const v = judgeImprovement({ metric: 'diag-ms', before: 817000, after: 5 });
    expect(v.direction).toBe('improved');
  });

  it('★★「大きいほど良い」指標: 増えれば改善(小さい=良い、と決めつけない)', () => {
    /*
     * ★実データ 0.1.1298「2回 → 13回」は**改善**(描画が動くようになった)。
     *   方向を数字から推測すると、これを退化と誤判定する。
     */
    const v = judgeImprovement({ metric: 'lane-repaint', before: 2, after: 13 });
    expect(v.direction).toBe('improved');
  });

  it('★★退化を名指しする(これが「退化させない」の芯)', () => {
    const v = judgeImprovement({ metric: 'diag-ms', before: 5, after: 900 });
    expect(v.direction).toBe('regressed');
    expect(v.line).toContain('退化');
  });

  it('★変化なしは improved とも regressed とも言わない', () => {
    expect(judgeImprovement({ metric: 'diag-ms', before: 5, after: 5 }).direction).toBe('same');
  });

  it('★★測れていないものを「改善」と言わない(根拠なき緑を作らない)', () => {
    /*
     * ★45リポから収穫した規約と同じ: 測れなかったものは緑ではない
     *   ([[zero-count-may-mean-unmeasured-2026-08-04]])。
     */
    for (const bad of [null, undefined, NaN, 'x']) {
      const v = judgeImprovement({ metric: 'diag-ms', before: bad, after: 5 });
      expect(v.direction, `before=${bad}`).toBe('unknown');
    }
    expect(judgeImprovement({ metric: 'diag-ms', before: 5, after: null }).direction).toBe('unknown');
  });

  it('★知らない指標は unknown(勝手に方向を決めない)', () => {
    const v = judgeImprovement({ metric: 'no-such-metric', before: 1, after: 2 });
    expect(v.direction).toBe('unknown');
    expect(v.line).toContain('未宣言');
  });

  it('★Number(null)=0 の穴を塞ぐ(今日3回踏んだ型)', () => {
    // null が 0 に化けて「0ms へ改善」と読まれてはいけない
    const v = judgeImprovement({ metric: 'diag-ms', before: 900, after: null });
    expect(v.direction).not.toBe('improved');
  });
});

describe('★退化の検出(版をまたいで見る)', () => {
  const hist = [
    { version: '0.1.100', metric: 'diag-ms', value: 817000 },
    { version: '0.1.101', metric: 'diag-ms', value: 5 },
    { version: '0.1.102', metric: 'diag-ms', value: 900 }
  ];

  it('★★過去最良より悪くなった版を名指しする', () => {
    const r = detectRegressions(hist);
    expect(r.length).toBe(1);
    expect(r[0].version).toBe('0.1.102');
    expect(r[0].best).toBe(5);
    expect(r[0].value).toBe(900);
  });

  it('★改善し続けていれば退化なし', () => {
    expect(detectRegressions(hist.slice(0, 2))).toEqual([]);
  });

  it('★「大きいほど良い」指標でも正しく判定する', () => {
    const up = [
      { version: '0.1.1', metric: 'lane-repaint', value: 13 },
      { version: '0.1.2', metric: 'lane-repaint', value: 2 }
    ];
    const r = detectRegressions(up);
    expect(r.length, '増えるほど良い指標で減ったのに見逃した').toBe(1);
  });

  it('★壊れた入力でも落ちない', () => {
    for (const bad of [null, undefined, 'x', [null], [{}]]) {
      expect(() => detectRegressions(bad)).not.toThrow();
    }
  });
});

describe('★申請(ストア審査)に使える形', () => {
  const entries = [
    { version: '0.1.101', metric: 'diag-ms', before: 817000, after: 5, note: '読み取りを1バッチに' },
    { version: '0.1.102', metric: 'bundle-kb', before: 2400, after: 1360, note: '更新履歴を分割' }
  ];

  it('★★審査で読める1枚になる(何を測って、どう良くなったか)', () => {
    const s = buildSubmissionSummary(entries);
    expect(s).toContain('0.1.101');
    expect(s, '何の指標か書いていない').toMatch(/診断|diag/i);
    expect(s, 'before/after が無い').toContain('817');
    expect(s).toContain('5');
  });

  it('★★根拠が無い項目を審査文に混ぜない', () => {
    /*
     * ★審査に「良くなりました」とだけ書くのは通らない。
     *   測っていないものは載せない(載せると嘘になる)。
     */
    const s = buildSubmissionSummary([
      ...entries,
      { version: '0.1.103', metric: 'diag-ms', before: null, after: null, note: '未計測' }
    ]);
    expect(s).not.toContain('0.1.103');
  });

  it('★空でも落ちない(まだ記録が無い時期)', () => {
    expect(() => buildSubmissionSummary([])).not.toThrow();
    expect(buildSubmissionSummary([])).toContain('まだ');
  });
});

describe('★人が読む1行', () => {
  it('★改善は単位つきで出る', () => {
    const l = formatImprovementLine({ metric: 'diag-ms', before: 817000, after: 5 });
    expect(l).toContain('ms');
    expect(l).toMatch(/改善|✅/);
  });

  it('★★退化は目立つ形で出る(見落とさせない)', () => {
    const l = formatImprovementLine({ metric: 'diag-ms', before: 5, after: 900 });
    expect(l).toMatch(/🔴|退化/);
  });
});
