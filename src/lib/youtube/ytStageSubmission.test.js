import { describe, expect, it } from 'vitest';
import {
  buildYoutubeSubmissionManifest,
  createZipArchiveBuffer,
  extractLocalHtmlAssetRefs,
  extractRuntimePageRefs,
  isExcludedSubmissionPath,
  readZipArchiveBuffer,
  verifyYoutubeSubmissionFileMap,
} from '../../../scripts/stage-youtube-submission.mjs';

describe('stage-youtube-submission pure helpers', () => {
  it('buildYoutubeSubmissionManifest removes key and dev localhost except :50021', () => {
    const devManifest = {
      manifest_version: 3,
      name: '君斗りんくの追憶のきらめき（YouTube Live 試作版）',
      version: '0.1.0',
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...',
      host_permissions: [
        'https://www.youtube.com/*',
        'http://127.0.0.1:50021/*',
        'http://localhost:3456/*',
      ],
      content_scripts: [
        {
          matches: ['https://www.youtube.com/live_chat*', 'http://localhost:3456/*'],
          js: ['content-chat.js'],
        },
      ],
    };

    const out = buildYoutubeSubmissionManifest(devManifest, '0.1.2');
    expect(out.version).toBe('0.1.2');
    expect('key' in out).toBe(false);
    expect(out.host_permissions).toEqual([
      'https://www.youtube.com/*',
      'http://127.0.0.1:50021/*',
    ]);
    expect(out.content_scripts[0].matches).toEqual(['https://www.youtube.com/live_chat*']);
  });

  it('isExcludedSubmissionPath excludes src/ and map/test/dot files', () => {
    expect(isExcludedSubmissionPath('src/background-entry.js')).toBe(true);
    expect(isExcludedSubmissionPath('sidepanel.js.map')).toBe(true);
    expect(isExcludedSubmissionPath('foo.test.js')).toBe(true);
    expect(isExcludedSubmissionPath('.gitkeep')).toBe(true);
    expect(isExcludedSubmissionPath('images/.DS_Store')).toBe(true);
    expect(isExcludedSubmissionPath('sidepanel.html')).toBe(false);
    expect(isExcludedSubmissionPath('images/logo/konta-yukkuri-icon-128.png')).toBe(false);
  });

  it('extractLocalHtmlAssetRefs and extractRuntimePageRefs find local assets', () => {
    const html = `
      <img src="images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png" />
      <img src="https://yt3.ggpht.com/avatar.jpg" />
      <script src="./sidepanel.js?v=1"></script>
    `;
    expect(extractLocalHtmlAssetRefs(html)).toEqual([
      'images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png',
      'sidepanel.js',
    ]);

    const js = `
      const url = chrome.runtime.getURL('offscreen.html?mode=1');
    `;
    expect(extractRuntimePageRefs(js)).toEqual(['offscreen.html']);
  });

  it('createZipArchiveBuffer and readZipArchiveBuffer round-trip and verifyYoutubeSubmissionFileMap validates', () => {
    const fileMap = new Map([
      [
        'manifest.json',
        Buffer.from(
          JSON.stringify({
            manifest_version: 3,
            name: 'YouTube Ext',
            version: '0.1.0',
            background: { service_worker: 'background.js' },
            side_panel: { default_path: 'sidepanel.html' },
            icons: { 16: 'images/logo/icon16.png' },
            content_scripts: [{ matches: ['https://www.youtube.com/*'], js: ['content-chat.js'] }],
          }),
          'utf8',
        ),
      ],
      ['background.js', Buffer.from("chrome.runtime.getURL('offscreen.html');", 'utf8')],
      ['content-chat.js', Buffer.from('// content', 'utf8')],
      [
        'sidepanel.html',
        Buffer.from('<img src="images/logo/icon16.png"><script src="sidepanel.js"></script>', 'utf8'),
      ],
      ['sidepanel.js', Buffer.from('// sidepanel', 'utf8')],
      ['offscreen.html', Buffer.from('<script src="offscreen.js"></script>', 'utf8')],
      ['offscreen.js', Buffer.from('// offscreen', 'utf8')],
      ['images/logo/icon16.png', Buffer.from([137, 80, 78, 71])],
    ]);

    expect(() => verifyYoutubeSubmissionFileMap(fileMap)).not.toThrow();
    const zipBuf = createZipArchiveBuffer(fileMap);
    const readBack = readZipArchiveBuffer(zipBuf);
    expect([...readBack.keys()].sort()).toEqual([...fileMap.keys()].sort());
    expect(() => verifyYoutubeSubmissionFileMap(readBack)).not.toThrow();

    // Missing referenced asset should throw
    const brokenMap = new Map(fileMap);
    brokenMap.delete('images/logo/icon16.png');
    expect(() => verifyYoutubeSubmissionFileMap(brokenMap)).toThrow(/不足しています/);

    // Included src/ file should throw
    const leakedSrcMap = new Map(fileMap);
    leakedSrcMap.set('src/background-entry.js', Buffer.from('// src', 'utf8'));
    expect(() => verifyYoutubeSubmissionFileMap(leakedSrcMap)).toThrow(/除外すべき開発用ファイル/);
  });
});
