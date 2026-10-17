import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 発言パネルの本文・見出しが狭く折り返されないこと(v0.1.1656)。
 *   ユーザー指摘(2026-10-18): 「このコメントの幅がせまいのかもなおして」(本文が1行5文字ほどで折り返されていた)。
 *   実測(修正前・実配信): 行の列が `44px 457px 0px`・本文の幅 44px・時刻が 457px の列・見出しのタイトルは幅160px・3行。
 *   原因: 発言パネルの行(本文と時刻の2つ)が名簿の行 `.nlsb-roster-row`(3列 `44px 1fr auto`=順位|名前|バッジ)のままで、
 *   本文が 44px の列に入っていた。見出しは、注記(flex:1 1 100%)が1行目でタイトルを押しつぶしていた。
 *   名簿・状態パネルの見た目は変えない(`.nlsb-speech-panel` 配下だけ)。レイアウトの実測は実ブラウザ(別途 前後比較済み)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

/** @param {string} selectorLine */
const ruleBody = (selectorLine) => {
  const a = src.indexOf(selectorLine);
  expect(a, `${selectorLine} が見つからない`).toBeGreaterThan(0);
  return src.slice(a, src.indexOf('\n  }\n', a));
};

describe('発言パネルの行は2列(本文|時刻)', () => {
  const body = ruleBody('  .nlsb-speech-panel .nlsb-roster-row {');

  it('★本文の列は縮められる 1fr(名簿の 44px 列のままにしない)', () => {
    expect(body).toContain('grid-template-columns: minmax(0, 1fr) auto;');
  });

  it('★長い語・URL でも枠から出ない', () => {
    expect(ruleBody('  .nlsb-speech-panel .nlsb-roster-who {\n    overflow-wrap: anywhere;')).toContain('overflow-wrap: anywhere;');
  });

  it('★名簿(.nlsb-roster-row)側の3列は変えない(一覧パネルの順位|名前|バッジ)', () => {
    expect(ruleBody('  .nlsb-roster-row {')).toContain('grid-template-columns: 44px 1fr auto;');
  });
});

describe('発言パネルの見出しはタイトルが残りの幅を使う', () => {
  it('★見出しは折り返し可(注記を次の行へ送る)', () => {
    expect(ruleBody('  .nlsb-speech-panel .nlsb-roster-head {')).toContain('flex-wrap: wrap;');
  });

  it('★タイトルは flex:1 1 0・min-width:0(押しつぶされない・長い名前は折り返す)', () => {
    const body = ruleBody('  .nlsb-speech-panel .nlsb-roster-title {');
    expect(body).toContain('flex: 1 1 0;');
    expect(body).toContain('min-width: 0;');
    expect(body).toContain('overflow-wrap: anywhere;');
  });

  it('★名簿・状態パネルの見出しは変えない(.nlsb-roster-head の本体に flex-wrap を足さない)', () => {
    expect(ruleBody('  .nlsb-roster-head {')).not.toContain('flex-wrap');
  });
});
