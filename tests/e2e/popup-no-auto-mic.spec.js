import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

/*
 * v0.1.321: 拡張の popup を開いた瞬間にマイク（getUserMedia）へアクセスしないことを
 * 実ブラウザで実証する。
 *
 * 旧実装は popup 初期化で refreshVoiceInputDeviceList()→navigator.mediaDevices
 * .getUserMedia({audio:true}) を自動呼び出ししており、ESET 等が「Chrome がマイクに
 * アクセス」と警告し、拡張アイコンにカメラマークが付いていた。音声入力は opt-in 機能
 * なので、起動時には絶対にマイクを掴まないことを保証する。
 *
 * 検証方法: popup ページで getUserMedia / enumerateDevices を計測ラッパに差し替え、
 * popup を開いて初期化が一通り走った後でも呼び出し回数が 0 であることを確認する。
 */

test('popup を開いてもマイク（getUserMedia）へ自動アクセスしない', async ({ context }) => {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;

  const popup = await context.newPage();

  // popup スクリプト実行前に getUserMedia / enumerateDevices を計測ラッパへ。
  await popup.addInitScript(() => {
    /** @type {any} */
    const w = window;
    w.__nlsMicCalls = { getUserMedia: 0, enumerateDevices: 0 };
    try {
      const md = navigator.mediaDevices;
      if (md) {
        const origGUM = md.getUserMedia ? md.getUserMedia.bind(md) : null;
        md.getUserMedia = (...args) => {
          w.__nlsMicCalls.getUserMedia += 1;
          // 実際には掴ませない（テスト環境でマイクが無くても reject になるだけ）。
          return origGUM
            ? origGUM(...args)
            : Promise.reject(new Error('no mic in test'));
        };
        const origEnum = md.enumerateDevices ? md.enumerateDevices.bind(md) : null;
        md.enumerateDevices = (...args) => {
          w.__nlsMicCalls.enumerateDevices += 1;
          return origEnum ? origEnum(...args) : Promise.resolve([]);
        };
      }
    } catch {
      /* no-op */
    }
  });

  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);

  // 初期化が一通り走る猶予（boolean設定同期・各 refresh 等）。
  await popup.waitForTimeout(2500);

  const calls = await popup.evaluate(() => /** @type {any} */ (window).__nlsMicCalls);
  console.log('popup mic access calls:', JSON.stringify(calls));

  // 起動だけでマイクを掴まない（getUserMedia 0 回）。
  expect(calls.getUserMedia).toBe(0);
});
