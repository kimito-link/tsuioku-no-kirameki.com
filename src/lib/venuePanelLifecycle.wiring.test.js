import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場のパネル(発言・状態・一覧)とホバーカードの開閉の配線ガード(v0.1.1645)。
 *   ・Esc は手前のパネルから1枚ずつ閉じ、全部閉じていて初めて会場を閉じる(以前は一覧パネルだけが特別扱いで、発言/状態パネルが
 *     開いていると会場ごと閉じた)。別窓(standalone)は閉じても戻る手段が無いので、パネルが無いときの Esc は何もしない。
 *   ・会場を閉じるとき、開いているパネル・カードも閉じる(以前は開いたまま残り、再オープンで復活した)。
 *   ・発言パネルは世代トークンで、遅れて返った古い読込結果が新しいパネルを上書きしない。
 * クロージャ内の関数なので実行時の単体テストは書けない=ここは文字列スキャン(順序とアンカーを固定する)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

/** @param {string} startMarker @param {string} endMarker */
const slice = (startMarker, endMarker) => {
  const a = src.indexOf(startMarker);
  expect(a, `${startMarker} が見つからない`).toBeGreaterThan(0);
  const b = src.indexOf(endMarker, a);
  expect(b, `${endMarker} が見つからない`).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('Esc は手前のパネルから1枚ずつ閉じる', () => {
  const body = slice('const onEscapeKey = (event) =>', 'const addEscapeListener');

  it('★発言 → 状態 → 一覧 → (standalone は何もしない) → 会場、の順', () => {
    const speech = body.indexOf('closeSpeechPanel()');
    const diag = body.indexOf('toggleDiagPanel(false)');
    const roster = body.indexOf('toggleRosterPanel(false)');
    const standalone = body.indexOf('if (isStandalone) return;');
    const closeVenue = body.indexOf('setOpen(false, true)');
    expect(speech).toBeGreaterThan(0);
    expect(diag).toBeGreaterThan(speech);
    expect(roster).toBeGreaterThan(diag);
    expect(standalone).toBeGreaterThan(roster);
    expect(closeVenue).toBeGreaterThan(standalone);
  });

  it('★各パネルを閉じたらその場で return する(同じ Esc で会場まで閉じない)', () => {
    expect(body.split('return;').length - 1).toBeGreaterThanOrEqual(4);
  });
});

describe('会場を閉じるとき、パネルとカードも閉じる', () => {
  const closeBranch = slice("removeEscapeListener();\n      removeBubbleReflowListener();", 'clearDisplay();');
  const before = src.slice(src.lastIndexOf('} else {', src.indexOf("removeEscapeListener();\n      removeBubbleReflowListener();")), src.indexOf("removeEscapeListener();\n      removeBubbleReflowListener();"));

  it('★閉じる側の分岐で speech・diag・roster・ホバーカードを閉じている', () => {
    expect(before).toContain('closeSpeechPanel()');
    expect(before).toContain('toggleRosterPanel(false)');
    expect(before).toContain('toggleDiagPanel(false)');
    expect(before).toContain('closeHoverCard()');
    expect(closeBranch.length).toBeGreaterThan(50);
  });
});

describe('発言パネルの世代トークン', () => {
  it('★開くたびに世代を進め、読込が戻ったとき世代が違えば捨てる', () => {
    expect(src).toContain('let speechOpenGen = 0;');
    const open = slice('const openSpeechPanelFor = async (who) =>', 'const toggleRosterPanel');
    expect(open).toContain('const gen = (speechOpenGen += 1);');
    expect(open).toContain('gen !== speechOpenGen');
  });

  it('★閉じたときも世代を進める(読込中に閉じた/別の人を開いた場合に古い結果を捨てる)', () => {
    const close = slice('const closeSpeechPanel = () =>', 'const buildSpeechPanelHeadHtml');
    expect(close).toContain('speechOpenGen += 1');
  });
});
