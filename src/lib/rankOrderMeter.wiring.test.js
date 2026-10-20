import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1703: 順位計(上位10の並び変化の回数)の配線。popup が描画のたびに数え → サイドパネルが読んで状態速報の1行にする。
 * 直した版(v0.1.1702)の効果を、実機の数字で前後比較するための計器(読むだけ・描画に触れない)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const popup = read('src/extension/popup-entry.js');
const side = read('src/extension/sidepanel-entry.js');

describe('★順位計の配線', () => {
  it('popup: noteRankOrder を import し、renderUserRooms で並びを決めた直後に上位10の userKey を渡す', () => {
    expect(popup).toMatch(/import \{ noteRankOrder \} from '\.\.\/lib\/rankOrderMeterBoot\.js';/);
    const start = popup.indexOf('function renderUserRooms(');
    const end = popup.indexOf('\nfunction ', start + 20);
    const body = popup.slice(start, end);
    const orderAt = body.indexOf('const rankedRooms = rankOrder.ordered;');
    const noteAt = body.indexOf('noteRankOrder(');
    expect(orderAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(orderAt);
    expect(body).toMatch(/noteRankOrder\(rankedRooms\.slice\(0, TOP_SUPPORT_RANK_STRIP_MAX\)\.map\(\(r\) => r\.userKey\)\);/);
  });

  it('サイドパネル: session の順位計を読み、ちらつき計の行に続けて状態速報へ出す', () => {
    expect(side).toMatch(/import \{ RANK_ORDER_METER_STORAGE_KEY, formatRankOrderLine \} from '\.\.\/lib\/rankOrderMeter\.js';/);
    expect(side).toContain('chrome?.storage?.session?.get?.(RANK_ORDER_METER_STORAGE_KEY)');
    expect(side).toContain('refreshRankOrderLine();');
    expect(side).toMatch(/flickerMeterLine: \[_flickerLine, _rankOrderLine\]\.filter\(Boolean\)\.join\(' \/ '\),/);
  });

  it('描画を壊さない: 計器は読むだけ(storage.local には書かない・session だけ)', () => {
    const boot = read('src/lib/rankOrderMeterBoot.js');
    expect(boot).not.toContain('storage.local');
    expect(boot).toContain('globalThis).chrome?.storage?.session');
  });
});
