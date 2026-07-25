import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const contentEntrySrc = fs.readFileSync(path.join(here, 'content-entry.js'), 'utf8');

/**
 * v0.1.1186: 「記録が本家を上回る」異常の切り分け計器(commentObservabilityDiag.js の
 *   dedupeSeedDiag系)が、実際に ensureLiveDedupeStateSeeded の各分岐と incrementalAdded
 *   確定箇所に配線されているかをソース文字列で断言する([[fastdiag-lite-is-the-printer-subset]]
 *   と同型の「計器を足してもwiring忘れで永久に0のまま」を防ぐ)。
 */
describe('dedupeSeedDiag wiring (content-entry.js)', () => {
  it('ensureLiveDedupeStateSeeded の3分岐(skip/rebuild/requeue)すべてに計器が刺さっている', () => {
    const start = contentEntrySrc.indexOf('async function ensureLiveDedupeStateSeeded');
    const end = contentEntrySrc.indexOf('\n}', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = contentEntrySrc.slice(start, end);
    expect(block).toContain("noteDedupeSeedOutcome(_dedupeSeedDiag, 'skip')");
    expect(block).toContain("noteDedupeSeedOutcome(_dedupeSeedDiag, 'rebuild')");
    expect(block).toContain("noteDedupeSeedOutcome(_dedupeSeedDiag, 'requeue')");
  });

  it('incrementalAdded 確定直後に noteIncrementalAddedCount が呼ばれている', () => {
    const idx = contentEntrySrc.indexOf('incrementalAdded = incMerged.added;');
    expect(idx).toBeGreaterThanOrEqual(0);
    const after = contentEntrySrc.slice(idx, idx + 400);
    expect(after).toContain('noteIncrementalAddedCount(_dedupeSeedDiag');
  });

  it('fastDiag の commentObservability に dedupeSeedDiag が snapshot 済みで乗っている', () => {
    const idx = contentEntrySrc.indexOf('savedCommentsUidStats: { ..._lastSavedCommentsUidStats },');
    expect(idx).toBeGreaterThanOrEqual(0);
    const after = contentEntrySrc.slice(idx, idx + 300);
    expect(after).toContain('dedupeSeedDiag: snapshotDedupeSeedDiag(_dedupeSeedDiag)');
  });

  it('_dedupeSeedDiag state が createDedupeSeedDiagState() で初期化されている', () => {
    expect(contentEntrySrc).toContain('const _dedupeSeedDiag = createDedupeSeedDiagState();');
  });

  it('必要な関数群が commentObservabilityDiag.js から import されている', () => {
    const importStart = contentEntrySrc.indexOf("from '../lib/commentObservabilityDiag.js'");
    expect(importStart).toBeGreaterThanOrEqual(0);
    const importBlockStart = contentEntrySrc.lastIndexOf('import {', importStart);
    const importBlock = contentEntrySrc.slice(importBlockStart, importStart);
    expect(importBlock).toContain('createDedupeSeedDiagState');
    expect(importBlock).toContain('noteDedupeSeedOutcome');
    expect(importBlock).toContain('noteIncrementalAddedCount');
    expect(importBlock).toContain('snapshotDedupeSeedDiag');
  });
});
