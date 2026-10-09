import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneStaleHighlightLedgers, HIGHLIGHT_LEDGER_TTL_MS } from './highlightLedger.js';

/** ハイライト台帳の配信別化の配線の固定(2026-10-09)。部品だけあって配線が外れると、また別配信の追記で台帳が消える。 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const popup = read('extension/popup-entry.js');
const venue = read('extension/venueBar.js');
const content = read('extension/content-entry.js');

describe('書き手(popup / 会場)は配信別キーへ追記する', () => {
  it('★popup: 読むキーは highlightLedgerReadKeys(liveId)、書く内容は planHighlightAppend の結果', () => {
    expect(popup).toMatch(/safeStorageLocalGet\(highlightLedgerReadKeys\(liveId\)\)\.then\(\(bag\) => \{\n\s+const plan = planHighlightAppend\(bag, \{ liveId, kind, atMs \}\);\n\s+if \(plan\) void safeStorageLocalSet\(plan\);/);
  });
  it('★会場: 同じ', () => {
    expect(venue).toMatch(/safeStorageLocalGet\(highlightLedgerReadKeys\(liveId\)\)\.then\(\(bag\) => \{\n\s+const plan = planHighlightAppend\(bag, \{ liveId, kind, atMs \}\);\n\s+if \(plan\) void safeStorageLocalSet\(plan\);/);
  });
  it('★どちらも共通キー単体への直接書込(appendHighlight の直呼び)は残っていない', () => {
    expect(popup).not.toMatch(/appendHighlight\(/);
    expect(venue).not.toMatch(/appendHighlight\(/);
  });
});

describe('読み手(popup のスコアパネル・発表)は自配信の台帳だけ使う', () => {
  it('★2箇所とも highlightLedgerReadKeys(lid) で読み、pickLedgerForLive(bag, lid) で選ぶ', () => {
    const reads = popup.match(/\.\.\.highlightLedgerReadKeys\(lid\)\]\);\n\s+const ledgerRaw = pickLedgerForLive\(bag, lid\);/g) || [];
    expect(reads.length).toBe(2);
  });
});

describe('掃除: 配信別台帳は消す人が居る', () => {
  it('★content の掃除経路が pruneStaleHighlightLedgers(all, lid, ...) を呼ぶ', () => {
    expect(content).toMatch(/await pruneStaleHighlightLedgers\(all, lid, Date\.now\(\), \(ks\) => chrome\.storage\.local\.remove\(ks\)\);/);
  });
  it('pruneStaleHighlightLedgers: 古い配信別台帳だけ remove に渡す(現配信・共通キーは渡さない)', async () => {
    const NOW = 1_700_000_000_000;
    const bag = {
      nls_highlight_ledger_v1_lv1: { capturedAt: NOW - HIGHLIGHT_LEDGER_TTL_MS - 1 },
      nls_highlight_ledger_v1_lv2: { capturedAt: NOW - 5 },
      nls_highlight_ledger_v1_lv9: { capturedAt: NOW - HIGHLIGHT_LEDGER_TTL_MS * 3 },
      nls_highlight_ledger_v1: { capturedAt: 1 }
    };
    const removed = [];
    const out = await pruneStaleHighlightLedgers(bag, 'lv9', NOW, async (ks) => { removed.push(...ks); });
    expect(out).toEqual(['nls_highlight_ledger_v1_lv1']);
    expect(removed).toEqual(['nls_highlight_ledger_v1_lv1']);
  });
});
