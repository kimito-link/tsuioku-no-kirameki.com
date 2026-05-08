import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  AI_DIAG_MAX_PAYLOAD_CHARS,
  buildPopupAiShareDiagnosticsPayload
} from './popupAiShareDiagnosticsPayload.js';

function minimalDeps(over = {}) {
  return {
    manifest: { name: 't', version: '0.0.1', manifest_version: 3 },
    nlBuildId: 'test',
    embedded: false,
    popupMode: 'standalone',
    surfaceResult: 'ok',
    documentVisibility: 'visible',
    navigatorOnLine: true,
    userAgent: 'Mozilla/5.0 test',
    resolvedWatchUrlSanitized: 'https://live.nicovideo.jp/watch/lv1',
    liveId: 'lv1',
    watchUrlSource: 'activeTab',
    activeTabUrlSanitized: '',
    lastFocusedNormalUrlSanitized: '',
    storageLastWatchUrlSanitized: '',
    openWatchTabsCount: 0,
    openWatchTabsList: [],
    selectedTargetTabId: null,
    mismatchReasons: [],
    storageLastWatchLiveId: '',
    resolvedVsStorageLiveIdMatch: true,
    watchPopupRefreshGeneration: 1,
    refreshDiagGeneration: 1,
    refreshStartedAt: 1,
    refreshEndedAt: 2,
    refreshDurationMs: 1,
    treatAsNoActiveWatch: false,
    treatExplainInput: {
      resolvedWatchUrl: 'https://live.nicovideo.jp/watch/lv1',
      watchUrlSource: 'activeTab',
      hasOpenMatchingWatchTab: false,
      embedWatchIframe: false,
      sidePanel: false
    },
    hasOpenMatchingWatchTab: false,
    lastStorageOnChangedKeys: [],
    watchMetaKey: '',
    watchMetaSnapshot: null,
    watchMetaFetchInflight: false,
    watchMetaFetchError: '',
    lastSnapshotFetchMs: null,
    staleSnapshotUsed: false,
    lastPaintMarkedAt: null,
    uiSnapshot: { ok: true },
    messagingRecent: [],
    contentDiagnostics: { ok: true },
    watchSnapshotMeta: null,
    note: '',
    contentDiagSource: 'live_only',
    fastCacheSchemaVersion: 2,
    fastOnlyStale: false,
    ...over
  };
}

describe('buildPopupAiShareDiagnosticsPayload', () => {
  beforeEach(() => {
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({}))
        }
      }
    };
  });

  it(`JSON が ${AI_DIAG_MAX_PAYLOAD_CHARS} 字超なら meta.truncated と content 省略`, async () => {
    const junk = 'x'.repeat(450_000);
    const out = await buildPopupAiShareDiagnosticsPayload(
      minimalDeps({
        contentDiagnostics: { ok: true, junk }
      })
    );
    expect(out.meta && /** @type {Record<string, unknown>} */ (out.meta).truncated).toBe(true);
    const content = /** @type {Record<string, unknown>} */ (out.content);
    expect(content.truncated).toBe(true);
    expect(Array.isArray(content.topLevelKeys)).toBe(true);
  }, 15_000);
});
