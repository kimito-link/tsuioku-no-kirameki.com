import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatusFastDiagLite } from './statusFastDiagLite.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★メモリ計器が「採取 → 印字 → ユーザーのコピペ」まで通っていることを数で固定する。
 *
 * ■ このリポの前科([[fastdiag-lite-is-the-printer-subset]])
 *   v0.1.1124 で hostMoveDiag を作ったのに、`statusFastDiagLite` に通していなかったため
 *   **実機のコピペに永久に出なかった**(v0.1.1125 で塞いだ)。
 *   ★計器は「作った」ではなく「**出力に現れた**」で完成
 *   ([[verify-output-appears-before-shipping-2026-08-09]])。
 */
describe('★メモリ計器が採取から印字まで配線されている', () => {
  it('★content-entry が watch ページで採取している(凍る当のページ)', () => {
    const src = read('src/extension/content-entry.js');
    expect(src, 'judgeMemoryPressure を import していない').toContain(
      "from '../lib/memoryPressureProbe.js'"
    );
    // ★fastDiag payload に載っていること(ここに無いと status へ届かない)。
    expect(src).toMatch(/memoryPressure:\s*\(\(\)\s*=>\s*\{/);
    // ★DOM総数も一緒に採る(メモリがokでもDOMだけで凍るため)。
    expect(src).toContain("getElementsByTagName('*').length");
  });

  it('★★printer(statusFastDiagLite)を通る=コピペに現れる', () => {
    const lite = buildStatusFastDiagLite({
      content: {
        memoryPressure: {
          level: 'bad', usedMB: 3800, limitMB: 4192, pct: 90,
          domNodes: 13682, domLevel: 'bad', text: 'メモリ: 3800MB / 上限4192MB (90%)'
        }
      }
    });
    expect(
      lite?.content?.memoryPressure,
      'lite に通っていない=ユーザーのコピペに永久に出ない'
    ).toBeTruthy();
    expect(lite.content.memoryPressure.usedMB).toBe(3800);
    expect(lite.content.memoryPressure.domNodes).toBe(13682);
  });

  it('★計器が無い入力でも壊れない(古いビルド/採取失敗)', () => {
    const lite = buildStatusFastDiagLite({ content: {} });
    expect(lite?.content).toBeTruthy();
    expect(lite.content.memoryPressure).toBeNull();
  });

  it('★採取は storage read を増やしていない(計器が症状を作らない)', () => {
    /*
     * ★[[instrument-can-kill-the-page-it-measures-2026-08-16]]:
     *   read を1本増やすだけで体感が壊れた前科がある。
     *   memoryPressure は既存 payload に相乗りするだけで storage を触らない。
     */
    const src = read('src/extension/content-entry.js');
    const block = src.slice(
      src.indexOf('memoryPressure: (() => {'),
      src.indexOf('memoryPressure: (() => {') + 700
    );
    expect(block).not.toMatch(/storage\.(local|sync)\.(get|set)/);
  });
});
