import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場ヘッダーの右側ボタン(一覧/状態/コメビュ/読み上げ/別窓化/閉じる)が、狭い幅で画面の外へ出ないことの CSS ガード(v0.1.1647)。
 *   実測: 表示幅 640px 以下だとヘッダーが 855px 幅のままになり、『✕閉じる』が画面の外(右端 841px > 表示幅 405/625px)へ出た。
 *   原因は .nlsb-header-right の flex: 0 0 auto(縮めない)と、.nlsb-header が折り返さないこと。
 *   レイアウトの実測は実ブラウザでしかできない(別途 headless で前後比較済み)ので、ここは再発させない規則だけを固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

/** @param {string} selectorLine */
const ruleBody = (selectorLine) => {
  const a = src.indexOf(selectorLine);
  expect(a, `${selectorLine} が見つからない`).toBeGreaterThan(0);
  return src.slice(a, src.indexOf('\n  }\n', a));
};

describe('会場ヘッダーは狭い幅で折り返して収まる', () => {
  it('★.nlsb-header は折り返す(flex-wrap: wrap)', () => {
    expect(ruleBody('  .nlsb-header {')).toContain('flex-wrap: wrap;');
  });

  it('★.nlsb-header-right は縮められ・折り返し・親の幅に従う', () => {
    const body = ruleBody('  .nlsb-header-right {');
    expect(body).toContain('flex-wrap: wrap;');
    expect(body).toContain('min-width: 0;');
    expect(body).toContain('max-width: 100%;');
    expect(body).toContain('flex: 0 1 auto;');
  });

  it('★縮めない指定(flex: 0 0 auto)に戻っていない', () => {
    expect(ruleBody('  .nlsb-header-right {')).not.toContain('flex: 0 0 auto;');
  });
});
