import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildHtmlReportDocument } from './htmlReportDocument.js';

/**
 * characterization test(移設の物理移動が挙動を変えていないことの検証・Fable設計G2)。
 * buildHtmlReportDocument は多数の chrome.storage/fetch 依存を持つため、固定 fixture を
 * 与えて「例外を投げず HTML を返す」「主要セクションが出力に含まれる」ことを固定する。
 * ISO 日時など非決定な部分は正規表現で検知して個別に assert する(hash 完全一致はしない)。
 */
function installChromeStub() {
  globalThis.chrome = {
    runtime: {
      getURL: (p) => `chrome-extension://fake/${p}`,
      sendMessage: (_msg, cb) => {
        if (typeof cb === 'function') cb(null);
      },
      lastError: undefined
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {})
      }
    }
  };
  globalThis.fetch = vi.fn(async () => ({ ok: false }));
}

function makeDeps() {
  return {
    readOfficialEventDomBundleFromStorage: vi.fn(async () => null),
    resolveBroadcasterProfileModel: vi.fn(async () => null),
    withTimeout: (p) => p,
    readAllCommentsForLive: vi.fn(async () => []),
    yieldToBrowserPaint: vi.fn(async () => {}),
    getCachedAnonymousIdenticonDataUrl: vi.fn(() => ''),
    watchMetaSnapshot: null,
    inlinePassive: false
  };
}

function makeComments(n) {
  return Array.from({ length: n }, (_, i) => ({
    userId: String(1000 + (i % 3)),
    text: `コメント${i}`,
    capturedAt: Date.parse('2026-05-29T12:00:00.000Z') + i * 1000,
    commentNo: i + 1
  }));
}

const snapshot = {
  url: 'https://live.nicovideo.jp/watch/lv1',
  title: 'テスト配信',
  broadcastTitle: 'テスト配信タイトル',
  broadcasterName: 'テスト配信者',
  broadcasterUserId: '999',
  startAtText: '2026年5月29日 12:00',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  tags: ['タグ1', 'タグ2'],
  metas: [{ key: 'description', value: 'テスト説明' }],
  noopenerLinks: [],
  links: [],
  scripts: []
};

describe('buildHtmlReportDocument (characterization)', () => {
  beforeEach(() => {
    installChromeStub();
  });

  it('例外を投げずHTML文字列を返す', async () => {
    const html = await buildHtmlReportDocument(
      makeComments(5),
      snapshot,
      '',
      'lv1',
      'https://live.nicovideo.jp/watch/lv1',
      null,
      makeDeps()
    );
    expect(typeof html).toBe('string');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.endsWith('</html>')).toBe(true);
  });

  it('liveIdとタイトルが出力に含まれる', async () => {
    const html = await buildHtmlReportDocument(
      makeComments(3),
      snapshot,
      '',
      'lv1',
      'https://live.nicovideo.jp/watch/lv1',
      null,
      makeDeps()
    );
    expect(html).toContain('lv1');
    expect(html).toContain('テスト配信タイトル');
  });

  it('保存コメント数が実数と一致する', async () => {
    const html = await buildHtmlReportDocument(
      makeComments(7),
      snapshot,
      '',
      'lv1',
      'https://live.nicovideo.jp/watch/lv1',
      null,
      makeDeps()
    );
    expect(html).toMatch(/保存コメント数<\/th><td>7<\/td>/);
  });

  it('snapshotError があれば警告文言が出る', async () => {
    const html = await buildHtmlReportDocument(
      makeComments(1),
      snapshot,
      'スナップショット取得に失敗しました',
      'lv1',
      'https://live.nicovideo.jp/watch/lv1',
      null,
      makeDeps()
    );
    expect(html).toContain('スナップショット取得に失敗しました');
  });

  it('snapshotがnullでも記録コメントだけでレポートを組み立てる(degrade)', async () => {
    const html = await buildHtmlReportDocument(
      makeComments(2),
      null,
      'エラー',
      'lv1',
      'https://live.nicovideo.jp/watch/lv1',
      null,
      makeDeps()
    );
    expect(typeof html).toBe('string');
    expect(html).toContain('lv1');
  });
});
