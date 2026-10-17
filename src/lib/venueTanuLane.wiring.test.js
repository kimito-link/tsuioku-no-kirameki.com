import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場のたぬ姉段に修飾クラス nl-story-userlane--tanu が付くこと(v0.1.1651)。
 *   後列LOD(25人目以降の匿名はアイコンのみ・v0.1.1376)の CSS は .nl-story-userlane--tanu を前提に書かれているが、
 *   popup は静的HTML(#sceneStoryUserLaneTanu)に最初から書いてある一方、会場の makeLane は一度も付けなかった。
 *   そのため CSS は【会場では一度も効かず】(実測: 552人すべて名前つきの横長タイル・列の高さ 1474px → 修正後 656px)、
 *   面の差を宣言する既存の検査(laneCssSync.parity.test.js)も「意図した差」と登録していたため素通りしていた。
 *   「CSS にセレクタがある」だけでは足りない=【そのクラスを実際に付けるコードがあること】をここで固定する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8').replace(/\r\n/g, '\n');

describe('会場のたぬ姉段の修飾クラス', () => {
  const a = src.indexOf('const makeLane = (laneName) =>');
  const body = src.slice(a, src.indexOf('const makeWrap', a));

  it('★範囲の切り出しが空でない', () => {
    expect(a).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(100);
  });

  it('★makeLane は tanu のときだけ nl-story-userlane--tanu を付ける', () => {
    expect(body).toContain("laneName === 'tanu' ? 'nl-story-userlane nl-story-userlane--tanu' : 'nl-story-userlane'");
  });

  it('★CSS 側にも対応する規則がある(クラスを付けても規則が無ければ意味が無い)', () => {
    expect(src).toContain('.nlsb-venue-lane-stack .nl-story-userlane--tanu > :nth-child(n + 25) .nl-story-userlane-cell[data-thumb="0"] {');
    expect(src).toMatch(/\.nlsb-venue-lane-stack \.nl-story-userlane--tanu \{\s*gap: 4px;\s*\}/);
  });

  it('★生成元の無いクラスを CSS が前提にしていない(CSS に出る --tanu は、このファイルで必ず付けられている)', () => {
    const cssUses = src.split('.nl-story-userlane--tanu').length - 1;
    const producers = src.split("'nl-story-userlane nl-story-userlane--tanu'").length - 1;
    expect(cssUses).toBeGreaterThan(0);
    expect(producers).toBeGreaterThanOrEqual(1);
  });
});
