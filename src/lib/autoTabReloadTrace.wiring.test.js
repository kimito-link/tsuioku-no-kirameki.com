import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1384: 「拡張更新時に watch タブが自動リロードされたか」を計器にする。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * なぜ要るか(2026-08-13 ユーザーの困りごと)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ユーザーの言葉:
 *   「なんか動作させるために毎回ここを読み込みして繰り返すことが多いなんとかならない？」
 *   「サービスワーカーが無効になっている状態を戻したりする作業が大変」
 *
 * 実態: 拡張を更新するたび「chrome://extensions で🔄 → watch タブで F5」を手作業。
 * 2026-08-12 は **1日11版**出荷したので、同じ作業を11回やらせていた。
 *
 * ★しかし `reloadExistingWatchTabs()`(background.js)が効いているなら **F5 は不要**。
 *   ところが「効いているか」を測る計器が無く、司令塔(私)は毎回 F5 を依頼し続けた。
 *   ＝**余計な1手を私が生み出していた**疑いがある。
 *
 * この計器が出れば、反映手順から F5 を**消せる**。
 * [[instrument-value-is-measured-by-fixes-2026-08-12]]:
 *   読んで「次から依頼しなくてよい」と判断できる＝価値がある計器。
 * [[never-make-user-run-commands-i-can-run]]: ユーザーにやらせている作業は原則こちらでやる。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const bgSrc = read('extension/background.js');
const statusSrc = read('src/extension/status-entry.js');

describe('★自動タブリロードの実行痕跡(手動F5が要るかを判定する)', () => {
  it('background が痕跡を書く', () => {
    expect(bgSrc).toContain('nls_last_auto_tab_reload');
    expect(bgSrc).toMatch(/reloaded\s*\+=\s*1;/);
  });

  it('★痕跡は【リロードの後】に書く(失敗したのに「やった」と嘘をつかない)', () => {
    const fnStart = bgSrc.indexOf('async function reloadExistingWatchTabs(');
    expect(fnStart).toBeGreaterThan(-1);
    const body = bgSrc.slice(fnStart, fnStart + 2200);
    const reloadIdx = body.indexOf('chrome.tabs.reload(');
    const traceIdx = body.indexOf('nls_last_auto_tab_reload');
    expect(reloadIdx).toBeGreaterThan(-1);
    expect(traceIdx).toBeGreaterThan(reloadIdx);
  });

  it('★どの経路で呼ばれたか(reason)を残す(install だと自動リロードに乗らないため)', () => {
    expect(bgSrc).toMatch(/async function reloadExistingWatchTabs\(reason = ''\)/);
    expect(bgSrc).toMatch(/await reloadExistingWatchTabs\(String\(details\?\.reason \|\| ''\)\)/);
  });

  it('status が読んで速報の行に出す(出ない計器は無いのと同じ)', () => {
    expect(statusSrc).toContain('nls_last_auto_tab_reload');
    expect(statusSrc).toContain('autoTabReloadLine');
    // ★概要行の連結に入っていること。
    expect(statusSrc).toMatch(/channelSwitchLine \+ autoTabReloadLine/);
  });

  it('★成功時は「手動F5は不要」と明言する(読んで行動が変わる文言)', () => {
    expect(statusSrc).toContain('手動F5は不要です');
  });

  it('★status の読みは extras 側(コアに足すと大配信で固まる)', () => {
    const idx = statusSrc.indexOf("step = 'autoTabReload'");
    expect(idx).toBeGreaterThan(-1);
    const around = statusSrc.slice(idx, idx + 400);
    // 有界化(timeout)されていること。
    expect(around).toContain('runStorageOpWithTimeout');
    // 1キーだけ読む(全件読みを持ち込まない)。
    expect(around).toContain("get('nls_last_auto_tab_reload')");
    expect(around).not.toMatch(/\.get\(\s*null\s*\)/);
  });
});
