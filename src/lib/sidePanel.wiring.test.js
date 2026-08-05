import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const swSrc = read('extension/background.js');
const manifest = JSON.parse(read('extension/manifest.json'));

/**
 * ★v0.1.1259 の配線断言。
 *   最重要は「過去の撤退理由を繰り返さない」こと。
 *   background.js:3200 の記録:
 *     「0.1.67 では sidePanel.open を試したが、環境・タブ種別で空／未表示に見え
 *       『いつもの POP が出ない』報告があり popup 窓へ戻した」
 */

/**
 * サイドパネル用ハンドラの本体だけを切り出す。
 * ★固定長 slice(i, i+N) だと隣接する別ハンドラを巻き込み、偽の赤/緑になる
 *   (2026-08-05 に実際に発生)。次のハンドラ定義の直前で切る。
 */
function sidePanelBlock() {
  const i = swSrc.indexOf("const OPEN_SIDE_PANEL_MESSAGE_TYPE");
  if (i < 0) return '';
  const next = swSrc.indexOf("const OPEN_VENUE_MESSAGE_TYPE", i);
  return next < 0 ? swSrc.slice(i) : swSrc.slice(i, next);
}

describe('サイドパネルの配線', () => {
  it('manifest に side_panel が宣言されている', () => {
    expect(manifest.side_panel?.default_path).toBe('sidepanel.html');
    expect(manifest.permissions).toContain('sidePanel');
  });

  it('★ツールバー押下をサイドパネルに奪わせない(過去の事故の直接原因)', () => {
    // openPanelOnActionClick を true にすると「いつもの POP が出ない」が再発する。
    expect(swSrc).toContain('setPanelBehavior({ openPanelOnActionClick: false })');
    expect(swSrc).not.toMatch(/openPanelOnActionClick:\s*true/);
  });

  it('★タブ固有に設定している(全タブ共有のままだと別配信を掴む)', () => {
    const block = sidePanelBlock();
    expect(block).not.toBe('');
    // ★存在の断言だけだと `if (false) await ...` を通してしまう(2026-08-05 に実際に通した)。
    //   無条件に実行される文であることまで断言する。
    expect(block).toMatch(
      /\n\s*await chrome\.sidePanel\.setOptions\(\{\n\s*tabId,/
    );
    expect(block).toMatch(/\n\s*await chrome\.sidePanel\.open\(\{ tabId \}\);/);
    // setOptions を条件で無効化していないこと。
    expect(block).not.toMatch(/if\s*\([^)]*\)\s*await chrome\.sidePanel\.setOptions/);
  });

  it('★配信IDを正規化してから path に載せている(injection 面を作らない)', () => {
    const block = sidePanelBlock();
    expect(block).toMatch(/SIDE_PANEL_LV_RE\.test\(String\(msg\.liveId \|\| ''\)\)/);
    // 生値をそのまま埋めていないこと。
    expect(block).not.toMatch(/\$\{msg\.liveId\}/);
  });

  it('★送信元を検証している(既存 NLS_OPEN_COMEVIEW と同じ作法)', () => {
    const block = sidePanelBlock();
    expect(block).toContain('sender.id !== chrome.runtime.id');
  });

  it('★失敗しても popup 窓へ落とさない(従来動作を変えない)', () => {
    const block = sidePanelBlock();
    expect(block).not.toContain('openOrFocusPopupWindow');
    expect(block).not.toContain('windows.create');
  });

  it('★既存のツールバー動作に手を入れていない', () => {
    // action.onClicked のハンドラは1つのまま。
    const handlers = swSrc.match(/chrome\.action\.onClicked\.addListener/g) || [];
    expect(handlers.length).toBe(1);
  });

  it('contextMenus 権限を増やしていない(審査面を広げない)', () => {
    expect(manifest.permissions).not.toContain('contextMenus');
  });
});
