// self-update.test.js — キット(web-ios-android templates/extension-self-update)の試験をそのまま走らせる。
//   試験本体 self-update.kit-test.mjs はキットの写し(import 先も同じ ./self-update.js なので無改変)。
import { it, expect } from 'vitest';

it('キットの self-update 試験(版の比較・待つ・ストア版・読めない時)が通る', async () => {
  await import('./self-update.kit-test.mjs');
});

it('サイトのページに埋め込んだ拡張の iframe だけなら「使っていない」(入れ替わる)', async () => {
  const saved = globalThis.chrome;
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 7 }] },
    runtime: {
      getURL: (p) => 'chrome-extension://x/' + p,
      getContexts: async () => [{ contextType: 'TAB', tabId: 7, frameId: 520, documentUrl: 'chrome-extension://x/popup.html?inline=1' }]
    }
  };
  try {
    const { extensionPageInFront } = await import('./self-update.js');
    expect(await extensionPageInFront()).toBe(false);
    globalThis.chrome.runtime.getContexts = async () => [{ contextType: 'TAB', tabId: 7, frameId: 0 }];
    expect(await extensionPageInFront()).toBe(true);
  } finally {
    globalThis.chrome = saved;
  }
});
