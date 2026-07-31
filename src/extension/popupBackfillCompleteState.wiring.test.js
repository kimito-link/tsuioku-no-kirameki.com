import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const popupEntrySrc = fs.readFileSync(path.join(here, 'popup-entry.js'), 'utf8');

describe('popup backfill completion restore wiring', () => {
  it('restores official comparison state from recent stored progress', () => {
    const restoreStart = popupEntrySrc.indexOf('async function refreshBackfillRecordCardHint');
    const restoreEnd = popupEntrySrc.indexOf('function markCaughtUpIfComplete', restoreStart);
    const restoreBlock = popupEntrySrc.slice(restoreStart, restoreEnd);
    expect(restoreStart).toBeGreaterThanOrEqual(0);
    expect(restoreEnd).toBeGreaterThan(restoreStart);
    expect(restoreBlock).toContain('_backfillStateForOfficial = {');
    expect(restoreBlock).toContain("stopReason: String(prog.stopReason || '')");
    expect(restoreBlock).toContain('repaintOfficialComparisonFromCurrentCount();');
    expect(restoreBlock.indexOf('_backfillStateForOfficial = {')).toBeLessThan(
      restoreBlock.indexOf('markCaughtUpIfComplete(prog)')
    );
    expect(restoreBlock.indexOf('repaintOfficialComparisonFromCurrentCount();')).toBeLessThan(
      restoreBlock.indexOf('markCaughtUpIfComplete(prog)')
    );
  });

  it('keeps the live onChanged completion path wired', () => {
    const listenerStart = popupEntrySrc.indexOf('function bindBackfillProgressListenerOnce');
    const listenerBlock = popupEntrySrc.slice(listenerStart);
    expect(listenerStart).toBeGreaterThanOrEqual(0);
    expect(listenerBlock).toContain('_backfillStateForOfficial = {');
    expect(listenerBlock).toContain('running: !(prog.done === 1 || prog.done === true)');
    expect(listenerBlock).toContain('repaintOfficialComparisonFromCurrentCount();');
    expect(listenerBlock.indexOf('_backfillStateForOfficial = {')).toBeLessThan(
      listenerBlock.indexOf('repaintOfficialComparisonFromCurrentCount();')
    );
    expect(listenerBlock.indexOf('repaintOfficialComparisonFromCurrentCount();')).toBeLessThan(
      listenerBlock.indexOf('if (_backfillCaughtUpForLiveId === _backfillHintLiveId) return;')
    );
  });
});
