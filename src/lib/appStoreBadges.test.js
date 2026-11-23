import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// トップ（tsuioku-no-kirameki/index.html）のスマホアプリへの導線。決まり: web-ios-android docs/ai-rules/15_APP_LINK_FROM_WEB.md
const source = readFileSync(new URL('../../tsuioku-no-kirameki/assets/js/app-store-badges.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const { storesForUserAgent, isInsideApp, ASC_APP_ID, PLAY_PACKAGE } = sandbox.AppStoreBadges;
const mobileConfig = JSON.parse(readFileSync(new URL('../../mobile/app.config.json', import.meta.url), 'utf8'));
const topHtml = readFileSync(new URL('../../tsuioku-no-kirameki/index.html', import.meta.url), 'utf8');

const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.kimito.link.tsuioku';

const kinds = (stores) => Array.from(stores, (s) => s.kind);

describe('スマホアプリのストアへの導線', () => {
  it('ID が mobile/app.config.json の stores と一致する（ずれたら別のアプリに飛ぶ）', () => {
    expect(ASC_APP_ID).toBe(mobileConfig.stores.ascAppId);
    expect(PLAY_PACKAGE).toBe(mobileConfig.stores.playPackageName);
  });

  it('PC は公開中のストアだけ（いまは Google Play だけ）', () => {
    const stores = storesForUserAgent(PC);
    expect(kinds(stores)).toEqual(['android']);
    expect(stores[0].href).toBe(PLAY_URL);
    expect(stores[0].img).toBe('images/store-badges/google-play-ja.png');
  });

  it('Android は Google Play だけ', () => {
    expect(kinds(storesForUserAgent(ANDROID))).toEqual(['android']);
  });

  it('iPhone は App Store が公開前なので何も出さない（Google Play で代わりにしない・公開前のリンクは 404）', () => {
    expect(kinds(storesForUserAgent(IPHONE))).toEqual([]);
    expect(kinds(storesForUserAgent(PC, true))).toEqual([]); // iPadOS（Mac を名乗る）
  });

  it('アプリ（Capacitor 殻）の中では出さない', () => {
    expect(isInsideApp({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(isInsideApp({})).toBe(false);
  });

  it('トップに冒頭と下部の導線があり、スクリプトと CSS を読み込んでいる', () => {
    expect((topHtml.match(/data-app-store-badges/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(topHtml).toContain('<script src="assets/js/app-store-badges.js"></script>');
    expect(topHtml).toContain('<link rel="stylesheet" href="assets/css/app-download.css">');
  });
});
