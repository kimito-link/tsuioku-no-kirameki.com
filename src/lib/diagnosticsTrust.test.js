import { describe, it, expect } from 'vitest';
import {
  POPUP_DIAG_FRESH_MS,
  buildDiagnosticsTrust,
  formatDiagnosticsTrustLines
} from './diagnosticsTrust.js';

const NOW = 1_000_000_000_000;

function freshPopupDiag(lid = 'lv1', agoMs = 5000) {
  return {
    persistedAt: new Date(NOW - agoMs).toISOString(),
    popup: { watchSnapshotMeta: { liveId: lid } }
  };
}
function blob(lid = 'lv1', agoMs = 5000) {
  return {
    laneMirror: { liveId: lid, capturedAt: NOW - agoMs },
    statCardsMirror: { liveId: lid, capturedAt: NOW - agoMs },
    northStarMirror: { liveId: lid, capturedAt: NOW - agoMs }
  };
}

describe('buildDiagnosticsTrust verdict', () => {
  it('watch タブ無し=no_watch_tab', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: false, currentLiveId: 'lv1', nowMs: NOW });
    expect(t.verdict).toBe('no_watch_tab');
  });

  it('watch あり・popup 未取得=popup_not_opened', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: true, currentLiveId: 'lv1', popupDiag: null, nowMs: NOW });
    expect(t.verdict).toBe('popup_not_opened');
  });

  it('popup が別配信=popup_other_live', () => {
    const t = buildDiagnosticsTrust({
      hasWatchTab: true, currentLiveId: 'lv1', popupDiag: freshPopupDiag('lv999'), nowMs: NOW
    });
    expect(t.verdict).toBe('popup_other_live');
    expect(t.popup.lidMatch).toBe(false);
  });

  it('popup が古い=popup_stale', () => {
    const t = buildDiagnosticsTrust({
      hasWatchTab: true, currentLiveId: 'lv1', popupDiag: freshPopupDiag('lv1', 4 * 60 * 1000), nowMs: NOW
    });
    expect(t.verdict).toBe('popup_stale');
    expect(t.popup.fresh).toBe(false);
  });

  it('全部新鮮・現配信=trustable', () => {
    const t = buildDiagnosticsTrust({
      hasWatchTab: true, currentLiveId: 'lv1', popupDiag: freshPopupDiag('lv1'), jsonBlob: blob('lv1'),
      publishOutcome: { everSent: true, ageSec: 10, liveId: 'lv1' }, nowMs: NOW
    });
    expect(t.verdict).toBe('trustable');
    expect(t.popupTrustable).toBe(true);
  });
});

describe('buildDiagnosticsTrust mirrors/publish', () => {
  it('鏡の present/鮮度/liveId 一致を出す', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: true, currentLiveId: 'lv1', jsonBlob: blob('lv1'), nowMs: NOW });
    expect(t.mirrors.lane.present).toBe(true);
    expect(t.mirrors.lane.fresh).toBe(true);
    expect(t.mirrors.lane.lidMatch).toBe(true);
  });

  it('鏡が別配信なら lidMatch=false', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: true, currentLiveId: 'lv1', jsonBlob: blob('lv999'), nowMs: NOW });
    expect(t.mirrors.lane.lidMatch).toBe(false);
  });

  it('鏡が古ければ fresh=false', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: true, currentLiveId: 'lv1', jsonBlob: blob('lv1', 4 * 60 * 1000), nowMs: NOW });
    expect(t.mirrors.lane.fresh).toBe(false);
  });

  it('送信結果(storage 由来)を要約', () => {
    const t = buildDiagnosticsTrust({
      hasWatchTab: true, currentLiveId: 'lv1', publishOutcome: { everSent: true, ageSec: 30, liveId: 'lv1' }, nowMs: NOW
    });
    expect(t.publish.everSent).toBe(true);
    expect(t.publish.ageSec).toBe(30);
  });

  it('送信結果が無ければ everSent=false', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: true, currentLiveId: 'lv1', nowMs: NOW });
    expect(t.publish.everSent).toBe(false);
  });
});

describe('formatDiagnosticsTrustLines', () => {
  it('冒頭見出しと verdict 行を出す', () => {
    const t = buildDiagnosticsTrust({
      hasWatchTab: true, currentLiveId: 'lv1', popupDiag: freshPopupDiag('lv1'), jsonBlob: blob('lv1'),
      publishOutcome: { everSent: true, ageSec: 10, liveId: 'lv1' }, nowMs: NOW
    });
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).toContain('### この診断の信頼性（最初に読んでください）');
    expect(text).toContain('🟢');
    expect(text).toContain('そのまま信頼できます');
    expect(text).toContain('応援レーン鏡');
    expect(text).toContain('純Web公開送信: ✅送信済み');
  });

  it('watch 無しは「空/古くて当然」を明示', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: false, currentLiveId: 'lv1', nowMs: NOW });
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).toContain('空・古くて当然');
    expect(text).toContain('watch タブ（視聴中）: 🔴なし');
  });

  it('別配信の popup 混入を警告', () => {
    const t = buildDiagnosticsTrust({
      hasWatchTab: true, currentLiveId: 'lv1', popupDiag: freshPopupDiag('lv999'), nowMs: NOW
    });
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).toContain('別配信の古い popup 診断');
  });

  it('未送信を明示', () => {
    const t = buildDiagnosticsTrust({ hasWatchTab: true, currentLiveId: 'lv1', popupDiag: freshPopupDiag('lv1'), nowMs: NOW });
    const text = formatDiagnosticsTrustLines(t).join('\n');
    expect(text).toContain('純Web公開送信: 🟡 まだ送信していない');
  });

  it('trust 無しなら空配列', () => {
    expect(formatDiagnosticsTrustLines(null)).toEqual([]);
  });
});

describe('POPUP_DIAG_FRESH_MS', () => {
  it('3分', () => {
    expect(POPUP_DIAG_FRESH_MS).toBe(3 * 60 * 1000);
  });
});
