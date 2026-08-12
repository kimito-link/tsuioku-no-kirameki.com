// backfillBottleneckWiring.test.js
// ★「判定はあるが配線されていない」片肺を出荷しないための通し検査。
//
// ■ なぜ要るか(2026-08-12 に同じ型を2回踏んだ)
//   - v0.1.1358: 計器に checkedNoUid を足したのに、健全度セル側のゲートが
//     `checked > 0` のままで【広告列だけの症状ではセルごと出なかった】
//   - v0.1.1295: 自己診断を入れ「これで原因が分かります」と出荷したが、
//     renderAll の引数リストに無く実機の速報に【1行も出なかった】
//   ★判定関数の単体テストが緑でも、繋がっていなければ画面には何も出ない。
//   だから「端から端まで」を静的に検査する。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHealthCells } from './healthCells.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const statusSrc = readFileSync(path.join(REPO, 'src', 'extension', 'status-entry.js'), 'utf8');
const healthSrc = readFileSync(path.join(REPO, 'src', 'lib', 'healthCells.js'), 'utf8');

const cellById = (cells, id) => cells.find((c) => c.id === id);

describe('★配線: status → healthCells → セル', () => {
  it('healthCells が判定の正本を import している(再判定していない)', () => {
    expect(healthSrc).toContain("from './backfillBottleneck.js'");
    expect(healthSrc).toContain('judgeBackfillBottleneck');
  });

  it('★status-entry が renderHealthCells に backfillLiveMetric を渡している', () => {
    const idx = statusSrc.indexOf('renderHealthCells({');
    expect(idx).toBeGreaterThan(0);
    const call = statusSrc.slice(idx, idx + 400);
    expect(call).toContain('backfillLiveMetric');
  });

  it('★判定の呼び出しは1箇所だけ(二重判定を作らない)', () => {
    const hits = healthSrc.match(/judgeBackfillBottleneck\(/g) || [];
    // import 文の1回 + 呼び出し1回 = 2。3回以上あれば別経路で再判定している。
    expect(hits.length).toBe(1);
  });

  it('既存の文章行は数値の羅列のまま(名指しはセルだけ=判定の二重実装を避ける)', () => {
    const narration = readFileSync(path.join(REPO, 'src', 'lib', 'backfillRinkuNarration.js'), 'utf8');
    expect(narration).not.toContain('judgeBackfillBottleneck');
  });
});

describe('★端から端まで: 入力を入れたらセルが出る', () => {
  const NOW = 1_700_000_000_000;

  it('裏タブの metric を渡すとセルが出て warn で名指しする', () => {
    const cells = buildHealthCells({
      backfillLiveMetric: {
        running: 1, ts: NOW - 1000, fg: 0,
        dataSegs: 100, bridgingSteps: 10, yieldWaitMsTotal: 100, elapsedMs: 10000
      },
      nowMs: NOW
    });
    const c = cellById(cells, 'backfill-bottleneck');
    expect(c).toBeDefined();
    expect(c.level).toBe('warn');
    expect(c.text).toContain('裏タブ');
  });

  /*
   * ★異常時必出(設計 A-3)。入力が無くてもセルは出す。
   *   「値が無いから行ごと消す」は、異常のときに限って計器が消える型の入口。
   */
  it('★入力が無くてもセルは出る(死にセルにしない・灰で対象外と言う)', () => {
    const cells = buildHealthCells({});
    const c = cellById(cells, 'backfill-bottleneck');
    expect(c).toBeDefined();
    expect(c.level).toBe('na');
    expect(c.text.startsWith('— 対象なし:')).toBe(true);
  });

  it('★走行中の沈黙は bad として総合判定にも乗る', () => {
    const cells = buildHealthCells({
      backfillLiveMetric: { running: 1, ts: NOW - 60_000, fg: 1 },
      nowMs: NOW
    });
    const c = cellById(cells, 'backfill-bottleneck');
    expect(c.level).toBe('bad');
    expect(c.text).toContain('沈黙');
  });

  it('★na は総合判定を汚さない(取り込み停止中で「注意」を出さない)', () => {
    const cells = buildHealthCells({
      backfillLiveMetric: { running: 0, ts: NOW - 600_000 },
      nowMs: NOW
    });
    const c = cellById(cells, 'backfill-bottleneck');
    expect(c.level).toBe('na');
  });
});
