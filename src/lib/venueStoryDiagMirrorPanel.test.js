/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { renderVenueStoryDiagMirrorPanel } from './venueStoryDiagMirrorPanel.js';

const SNAP = {
  liveId: 'lv123',
  capturedAt: 10_000,
  total: 12,
  withUid: 10,
  withAvatar: 9,
  uniqueAvatar: 8,
  resolvedAvatar: 7,
  resolvedUniqueAvatar: 6,
  selfShown: 0,
  selfSaved: 0,
  selfPending: 0,
  selfPendingMatched: 0,
  interceptItems: 2,
  interceptWithUid: 2,
  interceptWithAvatar: 1,
  mergedPatched: 1,
  mergedUidReplaced: 0,
  stripped: 0,
  interceptMapOnPage: 4,
  interceptExportRows: 3,
  interceptExportCode: 'ok',
  interceptExportDetail: '',
  userLaneDeduped: 9,
  userLaneTier3: 3,
  userLaneTier2: 4,
  userLaneTier1: 2,
  userLaneStrongNick: 5,
  userLanePersonalThumb: 6
};

describe('renderVenueStoryDiagMirrorPanel', () => {
  it('同一 snap の再描画は innerHTML を触らない(diff-skip)', () => {
    const host = document.createElement('div');
    const first = renderVenueStoryDiagMirrorPanel(host, SNAP, {
      liveId: 'lv123',
      nowMs: 14_000,
      lastSig: ''
    });
    const html = host.innerHTML;
    const second = renderVenueStoryDiagMirrorPanel(host, SNAP, {
      liveId: 'lv123',
      nowMs: 14_000,
      lastSig: first.sig
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(host.hidden).toBe(false);
    expect(host.innerHTML).toBe(html);
    expect(host.textContent).toContain('①の診断(4秒前)');
    expect(host.innerHTML).toContain('nl-story-diag--compact');
    expect(host.innerHTML).toContain('nl-story-diag--verbose');
  });

  it('liveId が会場対象配信と不一致なら非表示', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>old</p>';
    host.hidden = false;
    const result = renderVenueStoryDiagMirrorPanel(host, SNAP, {
      liveId: 'lv999',
      nowMs: 14_000,
      lastSig: 'old'
    });

    expect(result.sig).toBe('__hidden__');
    expect(result.changed).toBe(true);
    expect(host.hidden).toBe(true);
    expect(host.innerHTML).toBe('');
  });
});
