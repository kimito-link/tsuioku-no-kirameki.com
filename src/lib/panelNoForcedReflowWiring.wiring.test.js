import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// v0.1.2223: コメントごとに走る横の欄の描画から、強制レイアウト(void el.offsetWidth)をなくした。
//   遅い PC(4倍遅い CPU・8コメ/秒)の実測で、横の欄の処理の約1割がこれだった。戻すと失敗する。
const src = fs.readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
const bodyOf = (start) => {
  const at = src.indexOf(start);
  expect(at).toBeGreaterThan(0);
  const next = src.indexOf('\nfunction ', at + start.length);
  return src.slice(at, next > 0 ? next : undefined);
};

describe('横の欄: コメントごとの描画でレイアウトを強制しない', () => {
  for (const fn of ['function patchStoryGrowthIconsFromSource(', 'function triggerCharaReaction(', 'function triggerStoryFaceHop(']) {
    it(`${fn} は offsetWidth を読まず replayClassAnimation で鳴らす`, () => {
      const body = bodyOf(fn);
      expect(body).not.toMatch(/\.offset(Width|Height)\b/);
      expect(body).toContain('replayClassAnimation(');
    });
  }
  it('キャラの弾みは既存の後始末タイマーで外す(次のコメントで付けるだけで最初から弾む)', () => {
    const body = bodyOf('function triggerCharaReaction(');
    expect(body).toMatch(/setTimeout\(\(\) => \{[\s\S]*for \(const c of CHARA_BOUNCE_CLASSES\) iconEl\.classList\.remove\(c\);/);
  });
});

describe('応援マス: 変わっていないマスは書き直さない', () => {
  it('作ったばかりのマスは patch で書き直さない(同じ sync の中だけ)', () => {
    expect(bodyOf('function createStoryGrowthCell(')).toContain('STORY_GROWTH_FRESH_IMGS.add(img)');
    const patch = bodyOf('function patchStoryGrowthIconsFromSource(');
    expect(patch).toMatch(/if \(STORY_GROWTH_FRESH_IMGS\.has\(img\)\) continue;/);
    expect(patch).toContain('STORY_GROWTH_FRESH_IMGS.clear()');
    expect(bodyOf('function syncStoryGrowth(')).toMatch(/^function syncStoryGrowth\([^)]*\) \{\s*STORY_GROWTH_FRESH_IMGS\.clear\(\);/);
  });
  it('書く中身を決める値が全部同じなら何も書かない(顔の読み込み結果・いまの src も値に入れる)', () => {
    const apply = bodyOf('function applyStoryGrowthIconAttributes(');
    expect(apply).toMatch(/if \(accent && sameStoryGrowthCellMemo\(img, memoVals\)\) return;/);
    expect(apply).toContain('STORY_GROWTH_CELL_MEMO.set(img, memoVals)');
    const vals = bodyOf('function storyGrowthCellMemoValues(');
    for (const k of ['requestedTile', 'displayTile', 'selected', 'accent.total', 'accent.ordinal', "img.getAttribute('src')", 'storyHoverPreviewEnabled()', 'storyGrowthDisplayLabel(']) {
      expect(vals).toContain(k);
    }
  });
});
