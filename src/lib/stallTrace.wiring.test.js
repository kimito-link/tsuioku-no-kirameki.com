import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const watchScripts = [
  'src/extension/content-boot.js',
  'src/extension/yt-page-boot.js',
  'extension-youtube/src/content-chat-entry.js',
  'extension-youtube/src/tw-content-entry.js',
  'extension-youtube/src/kick-content-entry.js',
  'extension-youtube/src/ww-content-entry.js',
  'extension-youtube/src/sr-content-entry.js',
  'extension-youtube/src/mx-content-entry.js',
  'extension-youtube/src/tt-content-entry.js',
];

describe('視聴ページの content script は固まり計器を持つ', () => {
  it('各入口が startPageStallWatch を呼ぶ', () => {
    for (const rel of watchScripts) {
      expect(read(rel), rel).toContain('startPageStallWatch');
    }
  });
  it('拡張の画面も計器を持ち、状態速報に出す', () => {
    expect(read('extension-youtube/src/ytNicoShim.js')).toContain('startPageStallWatch');
    expect(read('src/extension/status-entry.js')).toContain('nls_stall_summary_v1');
    expect(read('src/extension/status-entry.js')).toContain('stallOverviewLine');
  });
  it('タブ切替では配信が同じならパネルを作り直さない', () => {
    const boot = read('src/extension/sidepanel-iframe-boot-entry.js');
    expect(boot).toContain('if (!lv || lv === shownLv()) return');
    expect(boot).not.toContain('buildCommentsForLv');
  });
  it('開発版の自己更新は前面のタブだけ読み直す', () => {
    const bg = read('extension/background.js');
    expect(bg).toContain('foregroundIds');
    expect(bg).toContain("String(reason || '') === 'update'");
  });
  it('配信まとめの全体は chrome.storage に書き戻さない', () => {
    const src = read('extension-youtube/src/background-entry.js');
    expect(src).not.toContain('[STORAGE_KEYS.STREAM_SUMMARIES]: summaries');
    expect(src).toContain('publishOneSummary');
    expect(src).toContain('persistChangedVoices');
  });
});
