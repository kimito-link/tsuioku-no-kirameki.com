import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * マーケの書き出しが、広告の「気づいた時刻」の記録(nls_ad_obs_<lv>)を読んでレポートへ渡す配線(v0.1.1673)。
 * 読むだけ・失敗しても書き出しは止めない(無ければ章が出ないだけ)。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(root, 'src/extension/marketing-export-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('マーケ書き出しの広告観測の配線', () => {
  it('★storage の読み出しに adObservationStorageKey のキーを足している', () => {
    expect(src).toContain("from '../lib/adObservationLog.js'");
    expect(src).toContain('adObservationStorageKey(lid)');
    const i = src.indexOf('chrome.storage.local.get([gKey');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 200)).toContain('adObsKey');
  });
  it('★レポートの組み立てに adObservations を渡している', () => {
    expect(src).toMatch(/adObservations:\s*data\[adObsKey\]/);
  });
});
