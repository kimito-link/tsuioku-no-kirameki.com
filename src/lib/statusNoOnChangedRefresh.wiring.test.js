/**
 * 診断ページ(status)は、保存の通知(storage.onChanged)で描き直さない(設計 V2・2026-10-12)。
 *
 * ■ 設計(docs/handoff/stable-update-model-DESIGN.md): /live/ の「読み手は引く(pull)」。
 *   診断ページは2秒周期の自前ループ(startRefreshLoop)だけで描く。誰かの保存で『余分に』描き直さない。
 * ■ 実測(perf-ab・放送中・診断ページ60秒): 更新 38回/分(周期なら 30回/分)・保存の通知 668回/分。
 *   通知起因の描き直しが周期に上乗せされていた(再入防止で重なりは防いでいたが、実行は増える)。
 * ■ 鮮度は落ちない: 2秒周期は従来どおり動く。減るのは【重複した実行】だけ。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'extension', 'status-entry.js'), 'utf8').split('\r\n').join('\n');
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('診断ページは通知で描き直さない(設計 V2)', () => {
  it('★setupStorageChangeListener() を【呼んでいない】(通知起因の refresh を張らない)', () => {
    expect(code).not.toMatch(/\n\s*setupStorageChangeListener\(\);/);
  });

  it('関数本体は残してある(撤回しやすいよう・呼び出しだけを外した)', () => {
    expect(code).toContain('function setupStorageChangeListener() {');
  });

  it('★2秒周期の自前ループは残っている(鮮度はこれが担う)', () => {
    expect(code).toContain('startRefreshLoop();');
    expect(code).toContain('const REFRESH_INTERVAL_MS = 2000;');
    expect(code).toMatch(/function startRefreshLoop\(\) \{/);
  });

  it('初回の refresh と、可視に戻ったときの即時 refresh は残っている(反応性を落とさない)', () => {
    expect(code).toContain('void refresh({ timeoutMs: 1500 });');
    expect(src).toMatch(/可視に戻ったら即時 refresh して反応性を上げる/);
  });
});
