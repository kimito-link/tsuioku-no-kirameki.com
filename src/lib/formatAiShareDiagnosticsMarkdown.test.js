import { describe, expect, it } from 'vitest';
import { formatAiShareDiagnosticsMarkdown } from './formatAiShareDiagnosticsMarkdown.js';

describe('formatAiShareDiagnosticsMarkdown', () => {
  it('先頭に要約・ fenced JSON を含み、watch URL に query を載せない', () => {
    const md = formatAiShareDiagnosticsMarkdown({
      extensionName: '君斗りんくの追憶のきらめき',
      extensionVersion: '0.1.157',
      watchUrlNote: 'テスト',
      lastSendMessageError: '',
      payload: {
        diagSchemaVersion: '1.1',
        meta: {
          ok: true,
          extensionVersion: '0.1.157',
          popupSurfaceState: 'ok'
        },
        watchContext: {
          ok: true,
          resolvedWatchUrlSanitized: 'https://live.nicovideo.jp/watch/lv123',
          liveId: 'lv123'
        },
        recentErrors: {
          ok: true,
          entries: [
            {
              at: 1,
              context: 'popup',
              message: 'token=abc を含むが本文では redact 済み想定'
            }
          ]
        }
      }
    });
    expect(md).toContain('## nicolivelog 診断バンドル');
    expect(md).toContain('### 要約');
    expect(md).toContain('診断スキーマ: `1.1`');
    expect(md).toContain('### 完全 JSON');
    expect(md).toContain('```json');
    expect(md).toContain('https://live.nicovideo.jp/watch/lv123');
    expect(md).not.toMatch(/lv123\?/);
    expect(md).not.toMatch(/watch\/lv[^`\s]+\?/);
  });

  it('要約に content 取得元・refresh 所要・lv 不一致を含められる', () => {
    const payload = {
      meta: {
        ok: true,
        extensionVersion: '0.2.0',
        contentDiagSource: 'fast_only',
        fastOnlyStaleIncomplete: true,
        truncated: true,
        approxSerializedCharsBeforeTruncate: 400001
      },
      watchContext: {
        ok: true,
        liveId: 'lv999',
        storageLastWatchLiveId: 'lv111',
        resolvedVsStorageLiveIdMatch: false,
        watchUrlSource: 'storage',
        openWatchTabsCount: 1,
        mismatchReasons: []
      },
      popupRefresh: {
        ok: true,
        watchPopupRefreshGeneration: 3,
        refreshDiagGeneration: 3,
        refreshDurationMs: 120,
        snapshotInflight: false,
        snapshotCacheExists: true
      }
    };
    const md = formatAiShareDiagnosticsMarkdown({
      extensionName: 'Test',
      extensionVersion: '0.2.0',
      watchUrlNote: '',
      lastSendMessageError: '',
      payload
    });
    expect(md).toContain('content 診断取得元: fast_only');
    expect(md).toContain('fast キャッシュのみ');
    expect(md).toContain('refresh 所要: 120ms');
    expect(md).toContain('storage lv と解決 lv が不一致');
    expect(md).toContain('meta.truncated');
  });

  it('要約に commentPipeline.tailSourceHistogram があれば取り込み経路の内訳を出す', () => {
    const md = formatAiShareDiagnosticsMarkdown({
      extensionName: 'Test',
      extensionVersion: '0.1.0',
      watchUrlNote: '',
      lastSendMessageError: '',
      payload: {
        meta: { ok: true },
        commentPipeline: {
          ok: true,
          tailSourceHistogram: { ndgr: 10, mutation: 4 }
        }
      }
    });
    expect(md).toContain('取り込み経路(直近lvの末尾ログ・source内訳)');
    expect(md).toContain('mutation:4');
    expect(md).toContain('ndgr:10');
  });
});
