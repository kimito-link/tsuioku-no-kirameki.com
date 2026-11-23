import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const ytChat = readFileSync(join(root, '../../extension-youtube/src/content-chat-entry.js'), 'utf8');
const abEntry = readFileSync(join(root, '../../extension-youtube/src/ab-content-entry.js'), 'utf8');

describe('P0-2: YouTube チャットの MutationObserver ハブ統合と回収契約', () => {
  it('content-chat-entry.js は裸の new MutationObserver を持たず、4 箇所すべて createMutationObserverHub を通る', () => {
    expect(ytChat).toContain("from '../../src/lib/mutationObserverHub.js'");
    expect(ytChat).not.toMatch(/new\s+MutationObserver\s*\(/);
    const hubCalls = ytChat.match(/createMutationObserverHub\(/g) || [];
    expect(hubCalls.length).toBeGreaterThanOrEqual(4);
  });

  it('混雑チャット時のスクロール見送り・overflow 時の scanAllExisting 回収・裏タブ間引きが配線されている', () => {
    expect(ytChat).toContain('getLastScrollAt: () => lastChatScrollAt');
    expect(ytChat).toContain('if (meta.overflow) scanAllExisting(document);');
    expect(ytChat).toContain("id: 'yt-chat-scan'");
    expect(ytChat).toContain("hiddenMode: 'throttle'");
    expect(ytChat).toContain('chatHub.detach()');
    expect(ytChat).toContain('chatHub.kick()');
  });

  it('ABEMA の onBatch は同じ streamKey のセッション表記揺れで seen をリセットしない', () => {
    expect(abEntry).toContain('const sameSession = !!(streamKey && key === streamKey);');
    expect(abEntry).toContain('if (!sameSession)');
  });
});
