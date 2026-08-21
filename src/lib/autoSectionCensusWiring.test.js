import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStoryUserLaneRenderDiag, formatStoryUserLaneRenderDiagLines } from './storyUserLaneRenderProbe.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★「計器を足したのに速報に出ない」を塞ぐ(printer subset の掟)。
 *   `statusFastDiagLite` に通らない値はユーザーのコピペに**永久に出ない**
 *   ([[fastdiag-lite-is-the-printer-subset]])。
 */
describe('★拡張の処理時間が速報に届く(配線)', () => {
  it('★popup が区間を実測して snapshot に載せている', () => {
    const src = read('src/extension/popup-entry.js');
    expect(src).toContain("from '../lib/autoSectionCensus.js'");
    expect(src, 'snapshot に載せていない').toContain('snap.autoSection = formatAutoSectionLines(');
  });

  it('★★実測する包み(_measuredSection)が全ての囲みで使われている', () => {
    /*
     * ★markBlockerSection は【ラベルを置くだけ】で自分では測らない。
     *   さらに finally で区間を抜けた瞬間にラベルを戻すため、
     *   250msごとのハートビートが鳴る頃には抜けていて「(拡張の外)」と出る。
     *   → 実測する包みへ全部置き換わっていることを数で固定する。
     */
    const src = read('src/extension/popup-entry.js');
    const measured = (src.match(/_measuredSection\(\s*'/g) || []).length;
    expect(measured, `実測の囲みが ${measured} 箇所しかない`).toBeGreaterThanOrEqual(5);

    // ★生の markBlockerSection を直接呼ぶ箇所は _measuredSection の中だけ
    /*
     * ★生の呼び出しが許されるのは `_measuredSection` の中の1回だけ。
     *   (import 文は `markBlockerSection(` に一致しないので数に入らない)
     *   ここが2以上に増えたら「実測されない囲み」が生えた合図＝赤にする。
     */
    const rawCalls = (src.match(/return markBlockerSection\(/g) || []).length;
    expect(rawCalls, '生の markBlockerSection 呼び出しが残っている(実測されない)').toBe(1);
  });

  it('★区間名が具体的(どこを直すか分かる名前)', () => {
    const src = read('src/extension/popup-entry.js');
    const names = [...src.matchAll(/_measuredSection\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(5);
    for (const n of names) {
      expect(n.length, `区間名が短すぎる: ${n}`).toBeGreaterThan(3);
      expect(n, `無意味な区間名: ${n}`).not.toMatch(/^(heavy|slow|work|task)$/i);
    }
    expect(new Set(names).size, `重複した区間名: ${names.join(', ')}`).toBe(names.length);
  });

  it('★★速報の印字に出る(printer subset を通る)', () => {
    const diag = buildStoryUserLaneRenderDiag({
      autoSection: {
        level: 'warn',
        coveragePct: 12,
        uncoveredMs: 8800,
        worstName: 'rebuildStoryGrowth',
        line: '拡張の処理時間: 🟡 12%しか測れていない'
      }
    });
    expect(diag.autoSection).toBeTruthy();
    const text = formatStoryUserLaneRenderDiagLines(diag).join('\n');
    expect(text, '速報に出ない=ユーザーのコピペに永久に現れない')
      .toContain('12%しか測れていない');
  });

  it('★値が無いときは null(「0」と偽らない)', () => {
    expect(buildStoryUserLaneRenderDiag({}).autoSection).toBeNull();
  });
});
