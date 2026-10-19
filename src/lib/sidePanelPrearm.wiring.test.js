import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * サイドパネルがグローバルであることの配線検査(v0.1.1696。旧「事前用意」の検査を、新しい構造と意図ごと置き換えた)。
 *
 * ■ 経緯
 *   v0.1.1439〜1695 は watch タブごとに setOptions({tabId, path:'sidepanel.html?lv='}) で【タブ専用】にしていた(事前用意)。
 *   公式の仕様では、タブ専用のパネルはタブを移ると【隠れ】、戻ると【再表示】される。再表示のたびに Chrome 標準の
 *   読み込み中表示(黒地に灰色の横縞)が最初のフレームまで見え、タブ切り替えの縞になっていた(実機で確認)。
 *   → タブ専用の path を焼かない(グローバル)。どの配信を見せるかはパネル自身が決める(sidepanel-iframe-boot-entry)。
 *
 * ★守っていること: ①タブ専用に戻していない ②ツールバーの禁(openPanelOnActionClick:true にしない)を破らない
 *   ③押下ハンドラの同期性(await を挟まない=ユーザー操作の文脈を切らない)と、事前用意の撤去で押下経路が壊れていないこと。
 */

const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sw = () => read('extension/background.js')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('グローバルのパネル(タブ専用の path を焼かない)', () => {
  it('★★background.js は sidePanel.setOptions を一度も呼ばない(タブ専用にすると、タブ切り替えで隠れて再表示=縞)', () => {
    const s = sw();
    expect(s).not.toMatch(/sidePanel\s*\.\s*setOptions\s*\(/);
    expect(s).not.toMatch(/sidepanel\.html\?lv=/);
  });

  it('★事前用意(prearm)と用意済みメモは撤去されている(戻すと、タブ専用に戻る)', () => {
    const s = sw();
    expect(s).not.toContain('prearmSidePanelForTab');
    expect(s).not.toContain('prearmAllWatchTabs');
    expect(s).not.toContain('__sidePanelArmedLv');
  });

  it('★★openPanelOnActionClick を true にしていない(埋め込み派のツールバーを殺さない)', () => {
    const s = sw();
    expect(s).toContain('setPanelBehavior({ openPanelOnActionClick: false })');
    expect(s).not.toMatch(/openPanelOnActionClick:\s*true/);
  });

  it('★押下ハンドラ: open は同期的に(await を挟まない=ユーザー操作の文脈を切らない)・tabId を渡す', () => {
    const s = sw();
    const i = s.indexOf('const wantsInline');
    const j = s.indexOf('chrome.sidePanel.open({ tabId: tid })', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(s.slice(i, j)).not.toContain('await');
  });

  it('★押下の経路(onClicked)は残る・押下の記録の形は保つ(armed は常に false)', () => {
    const raw = read('extension/background.js');
    expect(raw).toContain('chrome.action.onClicked');
    expect(raw).toContain('nls_sp_click_at_v1');
    expect(raw).toMatch(/armed: false,/);
  });

  it('★manifest の default_path がグローバルのパネルの文書(sidepanel.html)', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));
    expect(manifest.side_panel && manifest.side_panel.default_path).toBe('sidepanel.html');
  });
});
