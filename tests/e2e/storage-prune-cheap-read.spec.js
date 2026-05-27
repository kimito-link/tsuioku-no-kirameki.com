/**
 * v0.1.419: 定期 prune の cheap read（get(null)→prefix 絞り）が実 Chrome で機能することを確認。
 *
 * 背景（[[reference_storage_local_live_db_perf_overhaul]] ①）:
 *   従来 persistOfficialEventDomBundleNow は 5 秒ごとに chrome.storage.local.get(null) で
 *   全 storage（巨大な nls_comments_<lv> 配列含む）を読んでいた。これを「prune 対象 prefix の
 *   キーだけ読む」cheap read に置換した。ここでは実拡張の SW コンテキストで:
 *     - chrome.storage.local.getKeys() が使えること（Chrome 130+。テスト Chromium で確認）
 *     - prune 対象 prefix のキーだけを get でき、巨大コメント配列キーを読まずに済むこと
 *   を検証する（cheap read の前提が実環境で成立する回帰ガード）。
 */

import { test, expect } from './fixtures.js';
import {
  pickPrunableStorageKeys,
  PRUNABLE_STORAGE_KEY_PREFIXES
} from '../../src/lib/prunableStorageKeys.js';

test.describe('storage prune cheap read (v0.1.419)', () => {
  test('getKeys() でキー名一覧を取り、prune 対象 prefix だけ読める（巨大配列を読まない）', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });

    // 実 storage に「巨大コメント配列っぽいキー」と「prune 対象キー」を混ぜて seed。
    await sw.evaluate(async () => {
      const bigArray = Array.from({ length: 500 }, (_, i) => ({
        id: `lv999::row-${i}`,
        text: `row ${i}`.padEnd(50, 'x')
      }));
      await chrome.storage.local.set({
        nls_comments_lv999: bigArray, // ← 読みたくない巨大配列
        nls_event_dom_lv999: { capturedAt: Date.now() },
        nls_koken_api_contrib_lv999: { capturedAt: Date.now() },
        nls_nicoad_ranking_lv999: { foo: 1 },
        nls_recording_enabled: true // 無関係キー
      });
    });

    // getKeys() の存在と、prefix 絞りの結果を SW 内で評価。
    const result = await sw.evaluate(async () => {
      const local = chrome.storage.local;
      const hasGetKeys = typeof local.getKeys === 'function';
      const allKeys = hasGetKeys ? await local.getKeys() : Object.keys(await local.get(null));
      return { hasGetKeys, allKeys };
    });

    // テスト Chromium では getKeys() が使えるはず（cheap read の本命パス）。
    expect(result.hasGetKeys).toBe(true);
    expect(result.allKeys).toContain('nls_comments_lv999');
    expect(result.allKeys).toContain('nls_event_dom_lv999');

    // 純関数で prefix 絞り → 巨大配列キーは除外され、prune 対象だけが残る。
    const wanted = pickPrunableStorageKeys(result.allKeys);
    expect(wanted).toContain('nls_event_dom_lv999');
    expect(wanted).toContain('nls_koken_api_contrib_lv999');
    expect(wanted).toContain('nls_nicoad_ranking_lv999');
    expect(wanted).not.toContain('nls_comments_lv999'); // ← 巨大配列を読まずに済む
    expect(wanted).not.toContain('nls_recording_enabled');

    // 実際に絞ったキーだけ get → 値が読め、巨大配列キーは bag に含まれない。
    const bag = await sw.evaluate(async (keys) => {
      return chrome.storage.local.get(keys);
    }, wanted);
    expect(bag['nls_event_dom_lv999']).toBeTruthy();
    expect(bag['nls_comments_lv999']).toBeUndefined();

    // 正本 prefix 一覧の sanity。
    expect(PRUNABLE_STORAGE_KEY_PREFIXES.length).toBeGreaterThanOrEqual(6);
  });
});
