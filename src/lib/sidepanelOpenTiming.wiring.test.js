import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SP_CLICK_KEY, SP_OPEN_TIMING_KEY } from './sidepanelOpenTiming.js';

/**
 * 「押してからサイドパネルが描かれるまで」の実機計測の配線(v0.1.1675)。
 *   SW(押した時刻を控える) → パネル(読んで区間を出す) → 状態速報の1行。1か所でも切れると速報に何も出ない
 *   (=「測っていない」を「問題なし」と読ませる)ので、3か所の接続を固定する。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('SW: 押した時刻を控える', () => {
  const sw = stripComments(read('extension/background.js'));

  it('★控えるキーが lib の SP_CLICK_KEY と同じ文字列(SW は import できないので照合する)', () => {
    expect(sw).toContain(`${SP_CLICK_KEY}: {`);
    // 別の綴りの控えが紛れていない
    expect((sw.match(/nls_sp_click_at_v\d+/g) || []).every((k) => k === SP_CLICK_KEY)).toBe(true);
  });

  it('★open() の【あと】に控える(押下の経路を遅らせない)・await しない・失敗は握る', () => {
    const i = sw.indexOf('chrome.sidePanel.open({ tabId: tid })');
    const j = sw.indexOf(SP_CLICK_KEY, i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    const between = sw.slice(i, j + 400);
    expect(between).not.toContain('await');
    expect(between).toMatch(/\.catch\(\(\) => \{\}\)/);
  });

  it('★押した時刻は押下ハンドラの先頭で取る(open の前・await の前)', () => {
    const i = sw.indexOf('const clickAtMs = Date.now()');
    const j = sw.indexOf('chrome.sidePanel.open({ tabId: tid })');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
    expect(sw.slice(i, j)).not.toContain('await');
  });
});

describe('パネル: 読んで履歴に出す', () => {
  const sp = stripComments(read('src/extension/sidepanel-entry.js'));

  it('★SW が控えたキー(session)と履歴のキー(local)を読む', () => {
    expect(sp).toContain('chrome?.storage?.session?.get?.(SP_CLICK_KEY)');
    expect(sp).toContain('chrome?.storage?.local?.get?.(SP_OPEN_TIMING_KEY)');
  });

  it('★履歴を読み終えるまで書かない(上書きで過去の計測を消さない)', () => {
    const i = sp.indexOf('function publishOpenTiming');
    expect(i).toBeGreaterThan(-1);
    expect(sp.slice(i, i + 200)).toContain('if (!_openHistoryLoaded) return;');
  });

  it('★観測のたびに呼ばれ、結果の行が自己診断オブジェクトに載る(使われないと速報に出ない)', () => {
    expect(sp).toMatch(/function collectAndPublish\(phase, schedMs = null\) \{\s*publishOpenTiming\(\);/);
    expect(sp).toMatch(/openTimingLine:\s*_openLine/);
  });

  it('★描画に関与しない(DOM・class を触らない)', () => {
    const i = sp.indexOf('function publishOpenTiming');
    const j = sp.indexOf('const pc = chrome');
    const body = sp.slice(i, j);
    expect(body).not.toMatch(/classList|appendChild|innerHTML|\.style\./);
  });

  it('履歴キーの定数は lib のものを使う(文字列を直書きしない)', () => {
    expect(sp).not.toContain(`'${SP_OPEN_TIMING_KEY}'`);
    expect(sp).not.toContain(`'${SP_CLICK_KEY}'`);
  });
});

describe('状態速報: 行が出る', () => {
  it('★aiShareFullText が sidepanelSelfDiag.openTimingLine を行にする', () => {
    const t = stripComments(read('src/lib/aiShareFullText.js'));
    expect(t).toMatch(/sidepanelSelfDiag\?\.openTimingLine/);
    const i = t.indexOf('sidepanelSelfDiag?.openTimingLine');
    expect(t.slice(i, i + 200)).toContain('lines.push(openLine)');
  });
});
