import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ★v0.1.1370: 「守るものが無いから通す」(fail-open)の【横断台帳】。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * なぜこの検査が要るか — 同じ型を4回踏んだから
 * ─────────────────────────────────────────────────────────────────────────
 *
 * タイル消失は「1つのバグ」ではなく【1つの型】が別の名前で再発し続けたもの:
 *
 *   | 版      | 素通りした枝                          | 名前            |
 *   |---------|---------------------------------------|-----------------|
 *   | v1251前 | DOM が 0枚 → 冪等ガードを通過         | (無名)          |
 *   | v1251前 | prev <= 0 → 縮小ガードを通過          | 前回タイル無し  |
 *   | v1251   | roster <= 0 → 名簿ガードを通過        | roster-empty    |
 *   | v1370   | !rosterLid → 名簿ガードを通過         | live-switch     |
 *
 * どれも判断としては正しい(「守る対象が無いなら止める理由が無い」)。
 * ★問題は【守る対象が"無い"のか"まだ分からない"のか】を区別しなかったこと。
 *   - 無い   (別配信・初回描画)     → 通してよい
 *   - 未確定 (起動直後・ID未設定)   → 通してはいけない(まだ何も分かっていないだけ)
 * [[decisions-accumulate-into-regressions-2026-08-11]]
 *
 * ■ この検査の役目(30年後に楽をするための本体)
 *   fail-open 分岐を【数で固定】する。新しく足したら必ずここが赤くなり、
 *   足した人は「これは"無い"か"未確定"か」を宣言させられる。
 *   ★数を増やすこと自体は禁止しない。無自覚に増えることだけを禁止する。
 *
 * ■ なぜ文字列一致でなく件数か
 *   実装の言い回しは変わる(!last / prev<=0 / roster<=0)。変わらないのは
 *   「早期 return で防御を降りる箇所がいくつあるか」。
 *   ★[[mutation-test-needs-anchored-regex-2026-08-05]]: 緩い regex は
 *     `if(false)` 前置を素通りするので、行の形ではなく【出現数】を断言する。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * 「守りを降りる」早期 return を数える。
 * 対象: guard 関数内で防御を無効化して先へ通す分岐。
 */
function countFailOpenReturns(src, fnName) {
  const start = src.indexOf(`export function ${fnName}`);
  if (start < 0) throw new Error(`関数が見つからない: ${fnName}(改名したらこの検査も直すこと)`);
  // 関数本体を波括弧の対応で切り出す(素朴だが対象は小さな純関数のみ)。
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open, end);
  // skip:false を返す = 見送らない = 通す / return false = 守らない = 通す
  const passes = body.match(/return\s*\{\s*skip:\s*false/g) || [];
  const falses = body.match(/return\s+false\s*;/g) || [];
  return passes.length + falses.length;
}

describe('fail-open 台帳 — 「守るものが無いから通す」を無自覚に増やさない', () => {
  it('名簿ガード(lightSupplyOverwriteGuard)の fail-open は 5 箇所', () => {
    /*
     * 内訳(2026-08-12 v0.1.1370 時点・return 文の数で数える):
     *   1. settled              確定供給は常に通す(永久stale防止)
     *   2. live-unknown         現配信が不明=何を守るか決まらない
     *   3. live-switch          別IDへの切替=守る対象が別物
     *   4. roster-empty / roster-unestablished  名簿人数0(★1つの return が2つの理由を出し分ける)
     *   5. supply-complete      供給が名簿に追いついた=正常な更新
     * ★増やすときは、それが「無い」か「未確定」かを必ずコメントで宣言すること。
     *   未確定を通す枝を足すなら、それは v1370 と同じ穴を開けている。
     */
    const src = read('src/lib/lightSupplyOverwriteGuard.js');
    expect(countFailOpenReturns(src, 'shouldSkipLightSupplyOverwrite')).toBe(5);
  });

  it('縮小ガード(shouldKeepStoryUserLaneTilesOnShrink)の fail-open は 4 箇所', () => {
    /*
     * 内訳:
     *   1. entriesProvisional !== true  確定な正当減少は描く
     *   2. !last                        一度も描いていない=守るものが無い
     *   3. cur !== last                 本物の配信切替
     *   4. prev <= 0                    前回タイル無し
     * ★2 と 4 は「未確定」に化けうる枝(DOM が一瞬空になる窓が実在する)。
     *   ここを増やす/緩めるときは lightSupplyOverwriteGuard の名簿基準で
     *   代替できないかを先に検討すること(DOM は消える側の値=判断材料にしない)。
     */
    const src = read('src/extension/story/renderStoryUserLaneDom.js');
    expect(countFailOpenReturns(src, 'shouldKeepStoryUserLaneTilesOnShrink')).toBe(4);
  });

  it('★名簿ガードは「IDが空」を単独で通さない(v1370 の穴の再発防止)', () => {
    /*
     * 行の形で縛る唯一の検査。理由: この1行が穴そのものだったから。
     * 旧: if (!cur || !rosterLid || cur !== rosterLid) → 空を切替と同一視(穴)
     * 新: if (rosterLid && cur !== rosterLid)          → 空は下の名簿基準へ落とす
     */
    const src = read('src/lib/lightSupplyOverwriteGuard.js');
    expect(src).not.toMatch(/if\s*\(\s*!rosterLid\s*\|\|/);
    expect(src).toMatch(/if\s*\(\s*rosterLid\s*&&\s*cur\s*!==\s*rosterLid\s*\)/);
  });

  it('★判定と記録は同じ入口を通る(通した理由の記録漏れを構造で防ぐ)', () => {
    /*
     * popup-entry.js が生の shouldSkipLightSupplyOverwrite を直接呼ぶと
     * passReasons を記録し損ねる=「なぜ素通りしたか」が永久に分からない状態に戻る。
     * [[unwired-judgement-is-systemic-2026-08-12]]
     */
    const popup = read('src/extension/popup-entry.js');
    expect(popup).toContain('judgeAndRecordLightSupply');
    expect(popup).not.toContain('shouldSkipLightSupplyOverwrite(');
  });
});
