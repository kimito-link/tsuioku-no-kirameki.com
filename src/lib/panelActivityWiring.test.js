import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 「見えていない間は定期処理を止める」配線の固定(2026-10-08)。
 *   部品(panelActivity.js)を作っても、content が伝え忘れる・popup の定期処理が document.hidden のままだと、
 *   視聴ページの popup は閉じていても動き続けて拡張プロセスを占有する(実機 CPU 100〜140%)。
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const popup = read('extension/popup-entry.js');
const content = read('extension/content-entry.js');

/** 対応する波括弧までの本体を返す。 */
function body(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let d = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1);
  }
  return '';
}

describe('content: パネルの表示/非表示を iframe へ伝える', () => {
  it('★display を書く唯一の入口 setInlineHostDisplay が通知する(経路ごとの配線漏れを防ぐ)', () => {
    const b = body(content, 'function setInlineHostDisplay(');
    expect(b.length).toBeGreaterThan(100);
    expect(b).toMatch(/notifyInlineIframeOfPanelVisibility\(display !== 'none'\)/);
  });
  it('iframe の load 後に最後の状態を再送する(display:none で先読みされた iframe が隠れていると知れる)', () => {
    expect(content).toMatch(/iframe\.addEventListener\('load', \(\) => \{ if \(_panelVisibilityIntent !== null\) notifyInlineIframeOfPanelVisibility\(_panelVisibilityIntent\); \}\);/);
  });
});

describe('popup: 定期処理は全部 _panelHidden() 経由で止まる', () => {
  it('受信ハンドラが登録され、復帰時に追いつき描画する', () => {
    expect(popup).toMatch(/window\.addEventListener\('message', handlePanelVisibilityMessage\);/);
    const b = body(popup, 'function handlePanelVisibilityMessage(');
    expect(b).toMatch(/isPanelVisibilityMessageValid\(event, _instantPushExpectedNonce, window\.parent\)/);
    expect(b).toMatch(/\.resumed/);
    expect(b).toMatch(/refresh\(\)\.catch/);
  });
  it('★3秒 refresh・10秒ギフト同期・3秒北極星 tick・30秒鮮度・5秒巡回が _panelHidden() で止まる', () => {
    for (const marker of [
      "tagRefreshReason('interval_poll');", // 3秒 refresh は直前の gate を含むブロックで確認
    ]) expect(popup).toContain(marker);
    const poll = popup.slice(popup.indexOf('popupPollIntervalId = /** @type {number} */'), popup.indexOf("tagRefreshReason('interval_poll');"));
    expect(poll).toMatch(/if \(_panelHidden\(\)\) return;/);
    expect(popup).toMatch(/if \(_panelHidden\(\)\) return;\n {4}const lid = String\(watchPopupLastPaintedLiveId/);
    expect(popup).toMatch(/if \(_panelHidden\(\)\) \{/); // 北極星 tick
    expect(popup).toMatch(/if \(_panelHidden\(\)\) return;\n {4}const body = document\.getElementById\('northStarLaneBody-giftHistory'\)/);
    expect(popup).toMatch(/setInterval\(\(\) => \{ if \(!_panelHidden\(\)\) refreshAutopatrolStatusLine\(\); \}, 5000\);/);
  });
  it('★storage 変化の再描画ゲート(decideVisibilityAction)も _panelHidden() を見る', () => {
    expect(popup).toMatch(/hidden: _panelHidden\(\),/);
  });
  it('★popup 内の定期処理ゲートに生の document.hidden を残さない(許可: 計器・フラッシュ・状態表示のみ)', () => {
    const allowed = [/tabVisible:/, /if \(document\.hidden\) flushReceivedDiagFlushersNow\(\);/, /isDocHidden: \(\) =>/];
    const lines = popup
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*\*|\*)/.test(l)) // コメント行は対象外
      .filter((l) => /document\.hidden/.test(l) && !allowed.some((re) => re.test(l)));
    expect(lines).toEqual([]);
  });
});
