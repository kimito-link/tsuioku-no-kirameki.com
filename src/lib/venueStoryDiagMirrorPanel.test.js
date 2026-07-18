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
    expect(host.textContent).toContain('①の診断(内訳 4秒前)');
    expect(host.innerHTML).toContain('nl-story-diag--compact');
    expect(host.innerHTML).toContain('nl-story-diag--verbose');
  });

  it('liveId が会場対象配信と不一致なら非表示(panelSummary 未指定=挙動不変)', () => {
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

  it('鏡が無くても panelSummary(件数の正本)があれば件数行だけ描画する(story-diag-realtime-sync §C-3)', () => {
    const host = document.createElement('div');
    const result = renderVenueStoryDiagMirrorPanel(host, null, {
      liveId: 'lv123',
      nowMs: 14_000,
      lastSig: '',
      panelSummary: { liveId: 'lv123', recordedCount: 400, updatedAt: 12_000 }
    });

    expect(result.changed).toBe(true);
    expect(host.hidden).toBe(false);
    expect(host.innerHTML).toContain('記録している応援コメント <strong>400</strong> 件です');
    expect(host.innerHTML).toContain('内訳は①ポップアップを開くと表示されます');
    expect(host.innerHTML).not.toContain('nl-story-diag--verbose');
  });

  it('鏡が別配信でも panelSummary が現配信一致なら件数行だけ描画する', () => {
    const host = document.createElement('div');
    const result = renderVenueStoryDiagMirrorPanel(host, SNAP, {
      liveId: 'lv999',
      nowMs: 14_000,
      lastSig: '',
      panelSummary: { liveId: 'lv999', recordedCount: 55, updatedAt: 13_000 }
    });

    expect(result.changed).toBe(true);
    expect(host.hidden).toBe(false);
    expect(host.innerHTML).toContain('記録している応援コメント <strong>55</strong> 件です');
  });

  it('panelSummary も鏡も無ければ従来通り非表示', () => {
    const host = document.createElement('div');
    host.innerHTML = '<p>old</p>';
    host.hidden = false;
    const result = renderVenueStoryDiagMirrorPanel(host, null, {
      liveId: 'lv123',
      nowMs: 14_000,
      lastSig: 'old',
      panelSummary: null
    });

    expect(result.sig).toBe('__hidden__');
    expect(host.hidden).toBe(true);
    expect(host.innerHTML).toBe('');
  });
});
