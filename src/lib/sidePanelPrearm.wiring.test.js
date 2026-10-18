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

  it('★v0.1.1674: 拡張更新・起動・SW再起動・タブ切替でも既存の watch タブを用意する(onUpdated だけに頼らない)', () => {
    const s = sw();
    expect(s).toContain('function prearmAllWatchTabs');
    // 関数の外(トップレベル)で SW が起きるたびに1回呼ぶ
    expect(s).toMatch(/\nprearmAllWatchTabs\(\);/);
    expect(s).toContain('chrome.tabs.onActivated.addListener');
    const i = s.indexOf('function prearmAllWatchTabs');
    const body = s.slice(i, i + 1000);
    expect(body).toContain('chrome.tabs');
    expect(body).toContain('prearmSidePanelForTab(t.id, t.url)');
  });

  it('★v0.1.1674: 押下時、用意済みと分かる lv では path に触らない(差し替え競合を作らない)', () => {
    const s = sw();
    expect(s).toMatch(/lvFromTab && __sidePanelArmedLv\.get\(tid\) !== lvFromTab/);
    // 用意に成功したときだけ「用意済み」と覚える(失敗を成功扱いにしない)
    const i = s.indexOf('function prearmSidePanelForTab');
    const body = s.slice(i, i + 1100);
    expect(body).toMatch(/\.then\(\(\) => \{\s*__sidePanelArmedLv\.set\(tabId, lv\);/);
    // タブが閉じたら忘れる
    expect(s).toMatch(/chrome\.tabs\.onRemoved\.addListener\(\(tabId\) => \{\s*__sidePanelArmedLv\.delete\(tabId\);/);
  });

  it('★v0.1.1674: 押下ハンドラに await を足していない(ユーザー操作の文脈を切らない)', () => {
    const s = sw();
    const i = s.indexOf('__sidePanelArmedLv.get(tid)');
    const j = s.indexOf('chrome.sidePanel.open({ tabId: tid })', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(s.slice(i, j)).not.toContain('await');
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
