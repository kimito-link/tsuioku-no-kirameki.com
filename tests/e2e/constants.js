/**
 * E2E モック視聴ページ（playwright.config の webServer・manifest の host_permissions と一致させる）
 */
export const E2E_MOCK_WATCH_URL = 'http://127.0.0.1:3456/watch/lv888888888/';

/** background の chrome.tabs.query 等（オリジン + ワイルドカード） */
export const E2E_MOCK_ORIGIN_PATTERN = 'http://127.0.0.1:3456/*';
