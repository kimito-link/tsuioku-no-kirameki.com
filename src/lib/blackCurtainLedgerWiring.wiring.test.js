import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 黒い幕の記録(blackCurtainLedger)は、サイドパネルの自己診断に載り、状態速報の行になる(v0.1.1690)。
 *   ユーザーが「黒い幕が出た」と言わなくても、直近N回の黒かった時間・最長・時間を食った区間が速報から読める。
 *   途中で配線が切れると、記録は作られても誰にも届かない(画面にしか出さない情報は報告に乗らない)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('黒い幕の記録の配線', () => {
  const sp = read('src/extension/sidepanel-entry.js');
  const ai = read('src/lib/aiShareFullText.js');
  it('★sidepanel-entry が履歴を保持し、診断に blackCurtainLine として載せる', () => {
    expect(sp).toContain("from '../lib/blackCurtainLedger.js'");
    expect(sp).toMatch(/_curtainOpens = merged;/);
    expect(sp).toMatch(/blackCurtainLine:\s*formatBlackCurtainLedger\(_curtainOpens,\s*Date\.now\(\)\)/);
  });
  it('★aiShareFullText が blackCurtainLine を行にし、openTimingLine より先に出す', () => {
    const a = ai.indexOf('sidepanelSelfDiag?.blackCurtainLine');
    const b = ai.indexOf('sidepanelSelfDiag?.openTimingLine');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(ai).toMatch(/if \(curtainLine\) lines\.push\(curtainLine\);/);
  });
});
