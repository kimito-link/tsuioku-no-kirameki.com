import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ギフト列を公式貢献度で補う配線の固定(2026-10-08)。
 *   部品を作っても popup が読まない/足さないと、「公式にはいるのにギフト列が空」が黙って残る。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const popup = readFileSync(path.join(root, 'extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('popup: ギフト列は公式貢献度で補う', () => {
  it('★koken の公式行を storage から読む(同じ1回の get に相乗り)', () => {
    expect(popup).toMatch(/const kokenKey = kokenContribStorageKey\(lid\);/);
    expect(popup).toMatch(/chrome\.storage\.local\.get\(\[gk, adKey, kokenKey\]\)/);
    expect(popup).toMatch(/officialGiftRows = pickKokenStorageRows\(bag\[kokenKey\], lid\) \|\| \[\];/);
  });
  it('★記録済みの人を先に、公式を足して giftThrowerPicks に入れる', () => {
    expect(popup).toMatch(/STORY_SOURCE_STATE\.giftThrowerPicks = Object\.freeze\(mergeGiftPicksWithOfficial\(\n\s+buildStoryGiftThrowerLanePicks\(giftUsers, lid, storageRows, giftLimit\),\n\s+officialGiftPicksFromRows\(officialGiftRows,/);
  });
  it('読み込み失敗時は公式行も空に戻す(前の配信の人を残さない)', () => {
    expect(popup).toMatch(/nicoadApiRows = \[\];\n\s+officialGiftRows = \[\];/);
  });
});
