import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * サイドパネルに配信ID(lv)を渡す経路の【配線】検査。
 *
 * ■ なぜ要るか(2026-08-18 実機で真因確定)
 *   状態速報: 🔴 描画関数が一度も呼ばれていません
 *             laneTickProbe: lidMiss=4 / lidFromInline=0 / lidFromSnapshot=0 /
 *                            lidFromLastPainted=0
 *
 *   v0.1.1419 は「パネル内ボタン」経路にだけ ?lv= を焼いていた。
 *   ★サイドパネルを開く入口は【2つ】あり、
 *     ②ツールバーのアイコン(chrome.action.onClicked)は素の 'sidepanel.html' のままだった。
 *   ＝いちばん普通の開き方をすると必ずレーンが描かれない状態が残っていた。
 *
 * ★このテストは「入口の数」を固定する。入口が増えたのに lv を焼き忘れたら赤にする
 *   ([[wiring-test-must-assert-counts-2026-08-04]]: 配線が複数箇所なら数で断言する)。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('サイドパネルへの lv 受け渡し', () => {
  it('★setOptions で path を設定する箇所は【2つ】(パネル内ボタン / ツールバーアイコン)', () => {
    const code = stripComments(read('extension/background.js'));
    const hits = code.match(/setOptions\s*\(/g) || [];
    expect(hits.length).toBe(2);
  });

  it('★どの setOptions も、lv が取れたら ?lv= を焼く(素の sidepanel.html で終わらせない)', () => {
    const code = stripComments(read('extension/background.js'));
    // `sidepanel.html?lv=${...}` の形が2箇所に在ること＝両方の入口が lv を渡す。
    const baked = code.match(/sidepanel\.html\?lv=\$\{/g) || [];
    expect(baked.length).toBe(2);
  });

  it('★ツールバー経路は tab.url から lv を取り出す(取れなければ素の path に倒す)', () => {
    const code = stripComments(read('extension/background.js'));
    const at = code.indexOf('chrome.action.onClicked');
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at);
    // watch URL から lv を抜く正規表現が在る
    expect(body).toMatch(/\\\/watch\\\/\(lv/);
    // 取れないときのフォールバック(素の path)も残す＝watch以外のタブで壊さない
    expect(body).toMatch(/:\s*'sidepanel\.html'/);
  });

  it('★lv の形式規約は1つ(SIDE_PANEL_LV_RE)を共用する — 片方だけ通る穴を作らない', () => {
    const code = stripComments(read('extension/background.js'));
    const defs = code.match(/const SIDE_PANEL_LV_RE\s*=/g) || [];
    expect(defs.length).toBe(1);
    // 2箇所(パネル内ボタン / ツールバー)から参照される
    const uses = code.match(/SIDE_PANEL_LV_RE\.test\(/g) || [];
    expect(uses.length).toBe(2);
  });

  it('★受け取り側(sidepanel-entry)は iframe に lv を載せ替える', () => {
    const entry = stripComments(read('src/extension/sidepanel-entry.js'));
    expect(entry).toContain('buildSidePanelIframeSrc');
  });
});
