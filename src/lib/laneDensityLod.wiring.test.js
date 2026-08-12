import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1376: たぬ姉段の【段内LOD(遠近法)】の配線。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 何を解いたか
 * ─────────────────────────────────────────────────────────────────────────
 *
 * v0.1.1375 で匿名がたぬ姉段に出るようになり、実配信で 332人が並ぶ。
 * ユーザー確定(2026-08-12):
 *   「たぬ姉段が匿名332人で埋まること自体は望ましい。ただしレスポンシブで
 *    うまく見せやすい形を。SHOWROOMがヒントだがごちゃごちゃして見にくい」
 * ★人数を減らす解は【禁止】。密度と階層で解く。
 *
 * 直し: 先頭24人は読める pill / 25人目以降の匿名はアイコンのみ(群れ)。
 *
 * ■ 実測(出荷ビルド・幅461px・332タイル・chrome-devtools)
 *     適用前 1,615px → 適用後 598px(63%減)。目標 ≤700px を達成。
 *   ★仕様の推定値(1,900〜2,100px)ではなく【実測1,615px】が基準
 *     ([[measure-the-region-you-claim-2026-08-10]]: 推定で語らない)。
 *
 * ■ なぜ CSS だけなのか(ちらつき対策を壊さない構造的根拠)
 *   diff-skip の鍵 storyLaneTierBodyKey(renderStoryUserLaneDom.js:248)は
 *   userId+displaySrc+idLine+nameLine+title のみで【位置を含まない】。
 *   ＝:nth-child で見た目を変えても鍵は1バイトも動かない。
 *   ★JS で層を判定すると鍵に位置を混ぜたくなり、ちらつき再発の典型経路になる
 *     ([[story-userlane-churn-filllanetier-v1039]] 7版かけた対策)。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★レーンを実際に描く画面だけが対象(裏取り済み・2026-08-12)。
 *   - popup.html      : ①サイドパネル(renderStoryUserLaneDom を直接子で描く)
 *   - live-view.html  : ④純Web(live-view.js が同じ renderer を wrapTileEl 無しで呼ぶ)
 *   - venueBar.js     : ③会場(wrapTileEl でラップする=子孫形が要る)
 *   ★status.html は renderStoryUserLaneDom を1回も呼ばない(grep で 0 件)ので対象外。
 *   ★tsuioku-no-kirameki/index.html(LP)はレーンのCSSを持たないので対象外。
 *   これらを「5箇所」と数えると存在しない同期先を追うことになる。
 */
const LANE_CSS_FILES = ['extension/popup.html', 'app/live-view.html', 'src/extension/venueBar.js'];

describe('たぬ姉段の段内LOD — レーンを描く全画面に入っている', () => {
  it('★対象3画面すべてに後列(25人目以降)の規則がある', () => {
    const hit = LANE_CSS_FILES.filter((f) => {
      const src = read(f);
      // 引用符は画面ごとに ' と " が混在するため両方許す(整形に依存させない)。
      return /nth-child\(n \+ 25\)/.test(src) && /data-thumb=['"]0['"]/.test(src);
    });
    // ★件数で断言する([[wiring-test-must-assert-counts-2026-08-04]])。
    expect(hit.length).toBe(LANE_CSS_FILES.length);
  });

  it('★後列は meta を display:none にする(アイコンのみにする本体)', () => {
    for (const f of LANE_CSS_FILES) {
      const src = read(f);
      const idx = src.indexOf('nth-child(n + 25)');
      expect(idx, `${f} に後列規則が無い`).toBeGreaterThan(-1);
      // 後列ブロック以降に meta の display:none があること。
      expect(src.slice(idx)).toMatch(/nl-story-userlane-meta[\s\S]{0,120}display:\s*none/);
    }
  });

  it('★会場(venueBar)は【子孫形】で書く(直接子形だと会場だけ効かない)', () => {
    /*
     * 会場はタイルが wrapTileEl でラップされる(renderStoryUserLaneDom.js:402)。
     * `> .nl-story-userlane-cell:nth-child(...)` と書くとラッパーに当たって効かない。
     */
    const src = read('src/extension/venueBar.js');
    expect(src).toMatch(/> :nth-child\(n \+ 25\) \.nl-story-userlane-cell\[data-thumb="0"\]/);
  });

  it('★①popup と ④純Web は【直接子形】で書く(ラップしないため)', () => {
    for (const f of ['extension/popup.html', 'app/live-view.html']) {
      expect(read(f)).toMatch(
        /#sceneStoryUserLaneTanu\s*>\s*\.nl-story-userlane-cell:nth-child\(n \+ 25\)/
      );
    }
  });

  it('★実サムネ持ち(data-thumb=1)は名前を隠さない(セレクタが 0 限定)', () => {
    /*
     * 名前のある応援者が匿名の群れに埋もれないための契約
     * (tanuPolicy の存在理由と同じ)。属性が付かない旧タイルも既定(pill)に倒れる。
     */
    for (const f of LANE_CSS_FILES) {
      const src = read(f);
      const idx = src.indexOf('nth-child(n + 25)');
      const block = src.slice(idx, idx + 900);
      expect(block).not.toMatch(/data-thumb=['"]1['"]/);
    }
  });

  it('★JS 側で層を判定していない(ちらつき鍵に位置を混ぜない)', () => {
    // 位置ベースの判定が JS に漏れると diff-skip の鍵が揺れてちらつきが再発する。
    const renderer = read('src/extension/story/renderStoryUserLaneDom.js');
    expect(renderer).not.toMatch(/nth-child|index >= 24|i >= 24/);
    // 鍵の定義に位置(index)が入っていないことも固定する。
    const keyStart = renderer.indexOf('function storyLaneTierBodyKey');
    const keyBody = renderer.slice(keyStart, renderer.indexOf('\n}\n', keyStart));
    expect(keyBody).not.toMatch(/index|nth|position/i);
  });
});
