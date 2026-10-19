import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * サイドパネルが「どの配信を見せるか」を決める経路の【配線】検査。
 *
 * ■ 経緯
 *   2026-08-18: 描画関数が一度も呼ばれない(lidMiss=4)。iframe に配信ID(lv)が渡っていなかった。
 *   v0.1.1439〜1695: background が watch タブごとに setOptions({tabId, path:'sidepanel.html?lv='}) で lv を焼いていた(タブ専用のパネル)。
 *   v0.1.1696: 公式の仕様(タブ専用のパネルはタブを移ると隠れ・戻ると再表示される)で、タブ切り替えのたびに縞が出ていたため、
 *   パネルを【グローバル】にした。lv の決定はパネル自身(sidepanel-iframe-boot-entry・pickPanelLv)が担う。
 *   この検査は「lv が必ずパネルに届く」ことを、新しい構造で固定する(旧い『setOptions が3か所』の固定は、意図ごと置き換えた)。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('サイドパネルがグローバルで、lv をパネル自身が決める', () => {
  it('★background は sidePanel.setOptions を呼ばない(タブ専用にしない)', () => {
    const code = stripComments(read('extension/background.js'));
    expect(code).not.toMatch(/setOptions\s*\(/);
  });

  it('★ツールバー経路・パネル内ボタン経路は open({tabId}) だけ(グローバルのパネルを開く)', () => {
    const code = stripComments(read('extension/background.js'));
    const opens = code.match(/chrome\.sidePanel\.open\(\{ tabId(?:: tid)? \}\)/g) || [];
    expect(opens.length).toBe(2);
  });

  it('★ツールバー経路は tab.url から lv を取り出して【押下の記録】に残す(パネルの黒い幕の記録が使う)', () => {
    const code = stripComments(read('extension/background.js'));
    const at = code.indexOf('chrome.action.onClicked');
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at);
    // watch URL から lv を抜く正規表現が在る
    expect(body).toMatch(/\\\/watch\\\/\(lv/);
    expect(body).toContain('hasLv: !!lvFromTab');
  });

  it('★lv の形式規約は1つ(SIDE_PANEL_LV_RE)を共用する — 片方だけ通る穴を作らない', () => {
    const code = stripComments(read('extension/background.js'));
    const defs = code.match(/const SIDE_PANEL_LV_RE\s*=/g) || [];
    expect(defs.length).toBe(1);
    const uses = code.match(/SIDE_PANEL_LV_RE\.test\(/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });

  it('★受け取り側(sidepanel-iframe-boot-entry)が iframe に lv を載せる。本体 sidepanel-entry は src に触れない(二重に付けない)', () => {
    const boot = stripComments(read('src/extension/sidepanel-iframe-boot-entry.js'));
    expect(boot).toContain('buildSidePanelIframeSrc');
    const entry = stripComments(read('src/extension/sidepanel-entry.js'));
    expect(entry).not.toMatch(/setAttribute\('src'/);
  });
});

describe('★パネル自身が lv を決める(v0.1.1696)', () => {
  /*
   * 掟: 「速いが違う配信」より「遅いが正しい」(ユーザー確定)。曖昧なら選ばない=別の配信のコメントが出るのは、使う人にとって壊れている。
   */
  it('パネルが自力で lv を決める経路を持つ(アクティブなタブ・watch タブ一覧)', () => {
    const boot = stripComments(read('src/extension/sidepanel-iframe-boot-entry.js'));
    expect(boot).toContain('pickPanelLv');
    expect(boot).toContain('chrome.tabs.query(SIDE_PANEL_WATCH_TAB_QUERY)');
    expect(boot).toContain('chrome.tabs.query({ active: true, currentWindow: true })');
  });

  it('★①(?lv=)が在るときは自力探索を走らせない(順序の固定)', () => {
    const boot = stripComments(read('src/extension/sidepanel-iframe-boot-entry.js'));
    expect(boot).toMatch(/const hasLv = readSidePanelLv\(search\) !== '';/);
    expect(boot).toMatch(/needsPick: !hasLv,/);
    const loader = stripComments(read('src/lib/sidepanelIframeLoader.js'));
    expect(loader).toMatch(/if \(!needsPick \|\| typeof pickSrc !== 'function'\) \{/);
  });

  it('★タブの切り替えに追従する: アクティブなタブが【別の watch】になったときだけ付け替え・同じ配信なら何もしない', () => {
    const boot = stripComments(read('src/extension/sidepanel-iframe-boot-entry.js'));
    expect(boot).toContain('chrome.tabs.onActivated.addListener');
    expect(boot).toContain('chrome.tabs.onUpdated.addListener');
    expect(boot).toMatch(/if \(!lv \|\| lv === shownLv\(\)\) return;/);
    expect(boot).toContain('loader.update(buildSidePanelIframeSrc(base, `?lv=${lv}`));');
    // このパネルが居るウィンドウのタブだけ
    expect(boot).toContain('tab.windowId !== ownWindowId');
  });

  it('★active を使うのは pickPanelLv の中だけ・watch 以外へ移ったら直前の配信を保つ(隠さない・作り直さない)', () => {
    const lib = stripComments(read('src/lib/sidePanelLvFromTabs.js'));
    expect(lib).toContain("reason: 'keep'");
    // 一覧(pickLvFromTabs)の問い合わせ条件は url だけ(active を根拠にしない)
    expect(lib).toContain('SIDE_PANEL_WATCH_TAB_QUERY');
    expect(lib).not.toMatch(/active:\s*true/);
  });

  it('★曖昧(watchタブ複数)なら選ばない= ambiguous を返す', () => {
    const lib = stripComments(read('src/lib/sidePanelLvFromTabs.js'));
    expect(lib).toContain("'ambiguous'");
    expect(lib).toMatch(/found\.size > 1/);
  });

  it('★失敗しても素の src に倒れる(描画をJSに依存させない)', () => {
    const boot = stripComments(read('src/extension/sidepanel-iframe-boot-entry.js'));
    expect(boot).toContain('chrome.tabs.query(SIDE_PANEL_WATCH_TAB_QUERY)');
    // 探索の失敗(reject)は、ローダーが握って素の src で読み込む
    const loader = stripComments(read('src/lib/sidepanelIframeLoader.js'));
    expect(loader).toMatch(/pickedSrc = '';/);
    // 極小スクリプトの catch でも素の src を付ける
    expect(boot).toMatch(/\} catch \{[\s\S]*setAttribute\('src'/);
  });
});
