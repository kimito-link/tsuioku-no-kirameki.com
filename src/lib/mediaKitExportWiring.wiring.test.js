import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1711: メディアキット生成は lib/mediaKitExport.js に1本化(popup に同じ約120行を持たない)。
 * 統合レポート(マーケレポート側から同じ生成を呼ぶ)の前提。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const popup = readFileSync(path.join(repoRoot, 'src/extension/popup-entry.js'), 'utf8').replace(/\r\n/g, '\n');

describe('★メディアキット生成の共有化', () => {
  it('popup は buildMediaKitDocument を呼び、生成の中身(統計・HTML組み立て)を自分では持たない', () => {
    expect(popup).toContain("from '../lib/mediaKitExport.js'");
    expect(popup).toContain('await buildMediaKitDocument({');
    expect(popup).not.toContain('buildMediaKitStats(');
    expect(popup).not.toContain('buildMediaKitSupporters(');
    expect(popup).not.toContain('buildMediaKitHtml(');
  });

  it('popup は依存(storage・コメント全件読み・タイムアウト・辞書)を注入する', () => {
    const body = popup.slice(popup.indexOf('async function downloadMediaKitHtml()'));
    const head = body.slice(0, 900);
    expect(head).toContain('storageGet: (keys) => chrome.storage.local.get(keys)');
    expect(head).toContain('readAllCommentsForLive,');
    expect(head).toContain('withTimeout,');
    expect(head).toContain('resolveProfileMap');
  });
});
