import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * サイドパネル「事前用意」の配線検査。
 *
 * ★守っているのは【速さのために既存を壊さないこと】。
 *   openPanelOnActionClick:true にすれば速いが、埋め込み派のツールバーが死ぬ。
 *   ここでは「事前用意は足す / その禁は破らない」を両方固定する。
 */

const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sw = () => read('extension/background.js')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('事前用意の配線', () => {
  it('watchページになった時点で用意する経路がある', () => {
    const s = sw();
    expect(s).toContain('chrome.tabs.onUpdated.addListener');
    expect(s).toContain('prearmSidePanelForTab');
  });

  it('★用意は setOptions で path と enabled を確定させる', () => {
    const s = sw();
    const i = s.indexOf('function prearmSidePanelForTab');
    expect(i).toBeGreaterThan(-1);
    const body = s.slice(i, i + 900);
    expect(body).toMatch(/setOptions\(\{\s*tabId,\s*path:\s*`sidepanel\.html\?lv=\$\{[^}]+\}`,\s*enabled:\s*true\s*\}\)/);
  });

  it('★watch以外では何もしない(空のパネルを出さない)', () => {
    const s = sw();
    const i = s.indexOf('function prearmSidePanelForTab');
    const body = s.slice(i, i + 900);
    // URL を正規表現で判定し、外れたら return している
    expect(body).toMatch(/SIDE_PANEL_PREARM_WATCH_RE\.exec/);
    expect(body).toMatch(/if \(!m \|\| !SIDE_PANEL_LV_RE\.test\(m\[1\]\)\) return;/);
  });

  it('★配信IDは既存の規約(SIDE_PANEL_LV_RE)で検査してから path に載せる', () => {
    const s = sw();
    const i = s.indexOf('function prearmSidePanelForTab');
    const body = s.slice(i, i + 900);
    expect(body).toContain('SIDE_PANEL_LV_RE.test');
  });

  it('★★openPanelOnActionClick を true にしていない(埋め込み派のツールバーを殺さない)', () => {
    const s = sw();
    expect(s).toContain('setPanelBehavior({ openPanelOnActionClick: false })');
    expect(s).not.toMatch(/openPanelOnActionClick:\s*true/);
  });

  it('★事前用意が失敗しても押下経路は残る(単一障害点にしない)', () => {
    const raw = read('extension/background.js');
    const i = raw.indexOf('function prearmSidePanelForTab');
    const body = raw.slice(i, i + 1200);
    expect(body).toMatch(/catch\s*\{/);
    // 押下経路(onClicked)は従来どおり存在する
    expect(raw).toContain('chrome.action.onClicked');
  });
});
