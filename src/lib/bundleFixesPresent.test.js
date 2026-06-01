import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const popupBundlePath = path.join(repoRoot, 'extension', 'dist', 'popup.js');
const contentBundlePath = path.join(repoRoot, 'extension', 'dist', 'content.js');
const manifestPath = path.join(repoRoot, 'extension', 'manifest.json');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const popupBundle = readFileSync(popupBundlePath, 'utf8');
const contentBundle = readFileSync(contentBundlePath, 'utf8');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const backgroundSrc = readFileSync(backgroundPath, 'utf8');
const buildReminder = '該当 fix を src に入れたら npm run build を忘れるな';

describe('dist bundle fix ガード', () => {
  it.each([
    {
      symbol: 'userLaneCandidatesFromStorage',
      targetName: 'extension/dist/popup.js',
      bundle: popupBundle
    },
    {
      symbol: 'mergeStoredCommentDedupeVariants',
      targetName: 'extension/dist/popup.js',
      bundle: popupBundle
    },
    {
      symbol: 'resolveUserEntryAvatarSignals',
      targetName: 'extension/dist/content.js',
      bundle: contentBundle
    }
  ])('$targetName に $symbol を含む', ({ symbol, targetName, bundle }) => {
    expect(
      bundle.includes(symbol),
      `${targetName} に ${symbol} が見つからない。${buildReminder}`
    ).toBe(true);
  });

  it('toolbar click は default_popup を持たず background onClicked から inline focus / popup 窓へつなぐ', () => {
    // 2026-05-31: default_popup を付けると環境によりツールバーが無反応（起動しない）になる
    //   報告があったため撤去。ツールバー押下は background.js の chrome.action.onClicked で
    //   インライン前面化 → 失敗時は popup 窓 fallback、という経路に統一した。
    expect(
      manifest.action?.default_popup,
      'default_popup は付けない（onClicked 経路でツールバーを起動する）'
    ).toBeUndefined();
    expect(
      /chrome\.action\.onClicked\.addListener/.test(backgroundSrc),
      'extension/background.js に chrome.action.onClicked ハンドラが見つからない'
    ).toBe(true);
    expect(
      backgroundSrc.includes('NLS_FOCUS_INLINE_PANEL'),
      'extension/background.js に inline focus bridge が見つからない'
    ).toBe(true);
    // popup 窓 fallback から inline 前面化へつなぐ bridge は popup 側にも残す。
    expect(
      popupBundle.includes('NLS_FOCUS_INLINE_PANEL_FROM_POPUP'),
      `extension/dist/popup.js に toolbar bridge が見つからない。${buildReminder}`
    ).toBe(true);
  });
});
