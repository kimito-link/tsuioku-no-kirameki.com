import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** 再表示の記録(showToFrameLedger)は、サイドパネルの自己診断に載り、状態速報の行になる(v0.1.1695)。 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('再表示の記録の配線', () => {
  const sp = read('src/extension/sidepanel-entry.js');
  const ai = read('src/lib/aiShareFullText.js');
  it('★sidepanel-entry: 隠れた/戻ったを控え、診断に showToFrameLine として載せる', () => {
    expect(sp).toContain("from '../lib/showToFrameLedger.js'");
    expect(sp).toMatch(/_hiddenAtMs = Date\.now\(\);/);
    expect(sp).toMatch(/showToFrameLine:\s*formatShowToFrameLine\(_showEvents,\s*Date\.now\(\)\)/);
    expect(sp).toMatch(/requestAnimationFrame\(\(\) => \{\s*const toFrameMs/);
  });
  it('★aiShareFullText が showToFrameLine を行にする', () => {
    expect(ai).toMatch(/sidepanelSelfDiag\?\.showToFrameLine/);
    expect(ai).toMatch(/if \(showLine\) lines\.push\(showLine\);/);
  });
});
