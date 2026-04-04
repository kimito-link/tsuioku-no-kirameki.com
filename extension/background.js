/**
 * MV3 Service Worker — 拡張のインストール/更新時に、すでに開いている
 * ニコ生タブへコンテンツスクリプトを注入する。
 * これにより、ページをリロードしなくてもログ記録を開始できる。
 */

const MATCH_PATTERNS = [
  'https://live.nicovideo.jp/*'
];

async function injectIntoExistingTabs() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: MATCH_PATTERNS });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/page-intercept.js'],
        world: 'MAIN'
      });
    } catch { /* タブがクラッシュ済み等 */ }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/content.js']
      });
    } catch { /* no-op */ }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectIntoExistingTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoExistingTabs();
});
