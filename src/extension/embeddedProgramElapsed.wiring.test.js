import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v0.1.1557: タイムシフト(終了済み枠)で経過が「26703時間」になる不具合の配線テスト。
//   純関数 describeEmbeddedProgramElapsed は embeddedDataExtract.test.js で固定済み。
//   ここでは content-entry.js の【2 箇所】(snapshot の streamAgeMin / resolvePanelSummaryStreamAgeMin)が
//   その結果を実際に使って return しているかをソース文字列で固定する
//   (memory: wiring-test-must-check-the-result-is-used。片方だけ配線を落とすと popup と panel の経過が割れる)。

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'content-entry.js'), 'utf8');

describe('content-entry.js は終了済み枠の経過を describeEmbeddedProgramElapsed で固定する', () => {
  it('embeddedDataExtract.js から import している', () => {
    const imp = src.indexOf("from '../lib/embeddedDataExtract.js'");
    expect(imp).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, imp - 300), imp)).toContain('describeEmbeddedProgramElapsed');
  });

  it('呼び出しが 2 箇所以上あり、各箇所で .ended を条件に elapsedMin を return している', () => {
    const callSites = [...src.matchAll(/describeEmbeddedProgramElapsed\(/g)].map((m) => m.index);
    expect(callSites.length).toBeGreaterThanOrEqual(2);
    for (const i of callSites) {
      const near = src.slice(i, i + 400);
      expect(near).toMatch(/if \((\w+)\.ended\) return \1\.elapsedMin;/);
    }
  });

  it('snapshot の streamAgeMin IIFE 先頭と resolvePanelSummaryStreamAgeMin の両方に入っている', () => {
    const snap = src.indexOf('streamAgeMin: (() => {');
    expect(snap).toBeGreaterThanOrEqual(0);
    expect(src.slice(snap, snap + 400)).toContain('describeEmbeddedProgramElapsed(');
    const panel = src.indexOf('function resolvePanelSummaryStreamAgeMin(');
    expect(panel).toBeGreaterThanOrEqual(0);
    expect(src.slice(panel, panel + 700)).toContain('describeEmbeddedProgramElapsed(');
  });
});
