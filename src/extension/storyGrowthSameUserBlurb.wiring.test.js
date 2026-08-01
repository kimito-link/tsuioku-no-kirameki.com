import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// ★改行は CRLF で保存されている(Windows)。行またぎの断言が改行コードで壊れないよう正規化する。
const popupEntrySrc = fs
  .readFileSync(path.join(here, 'popup-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * v0.1.1209: グリッドのセル注記が「窓内の数え」であることを明示する配線の断言。
 *
 * ★このテストの書き方について(2026-08-01の反省を反映)
 *   v0.1.1201 で書いた wiring テストは `toContain('関数名(')` だけの文字列スキャンだったため、
 *   呼び出しに `if (false)` を前置する変異を検知できず20件緑のまま通った。
 *   ここでは「呼び出しが無条件に実行される代入文であること」まで形で縛る:
 *     - `const sameUserBlurb = entry` という三項の左辺ごと固定する(条件式を差し替えれば落ちる)
 *     - 旧テンプレートとフォールバックの**不在**を断言する(直したつもりの取り残しを捕まえる)
 *     - windowed の算出が呼び出しより前にあることを位置で断言する
 *   ただし文字列テストは補助であり、主軸は storyGrowthLimits.test.js の純関数テスト。
 *
 * ★もう一つの狙い: ホットパスの退化ガード
 *   applyStoryGrowthIconAttributes はセル描画ごとに走る。ここに entries の全件走査が戻ると
 *   userSupportGridAccent.js:189 が記録した O(N²)=「ページが応答しません」が再発する。
 *   走査系の呼び出しが関数内に無いことを機械で見張る。
 */
describe('story growth same-user blurb wiring (popup-entry.js)', () => {
  /** applyStoryGrowthIconAttributes の本体だけを切り出す。 */
  const blockOf = () => {
    const start = popupEntrySrc.indexOf('function applyStoryGrowthIconAttributes(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = popupEntrySrc.indexOf('\n}', start);
    expect(end).toBeGreaterThan(start);
    return popupEntrySrc.slice(start, end);
  };

  it('buildSupportSameUserBlurb が storyGrowthLimits.js から import されている', () => {
    // 同ファイルからの複数 import なので、import 文全体ではなく識別子の所在で見る。
    const idx = popupEntrySrc.indexOf("from '../lib/storyGrowthLimits.js'");
    expect(idx).toBeGreaterThanOrEqual(0);
    const importStmt = popupEntrySrc.slice(popupEntrySrc.lastIndexOf('import', idx), idx);
    expect(importStmt).toContain('buildSupportSameUserBlurb');
  });

  it('注記は無条件の代入文で組み立てられる(if(false)等で握り潰されていない)', () => {
    const block = blockOf();
    // 「const sameUserBlurb = 」の直後に来るのが entry の三項と本関数の呼び出しだけであることを
    // 縛る。`if (false)` を前置する/条件を差し替える/呼び出しを消す、いずれの変異でも落ちる。
    // 空白と改行は緩めて、prettier の整形変更では壊れないようにする。
    expect(block).toMatch(
      /const\s+sameUserBlurb\s*=\s*entry\s*\?\s*buildSupportSameUserBlurb\(\{/
    );
  });

  it('窓の有無(windowed)を sourceOffset から渡している', () => {
    const block = blockOf();
    expect(block).toContain('windowed: (STORY_GROWTH_STATE.sourceOffset || 0) > 0');
  });

  it('windowed の元になる sourceOffset の参照が、注記の組み立てより前にある', () => {
    const block = blockOf();
    const absIdx = block.indexOf('const absIndex = (STORY_GROWTH_STATE.sourceOffset || 0) + index;');
    const blurbIdx = block.indexOf('buildSupportSameUserBlurb({');
    expect(absIdx).toBeGreaterThanOrEqual(0);
    expect(blurbIdx).toBeGreaterThan(absIdx);
  });

  it('旧テンプレート「一覧に同ユーザー計」が関数内に残っていない', () => {
    expect(blockOf()).not.toContain('一覧に同ユーザー計');
  });

  it('組み立てた注記が aria-label と title の両方で使われている', () => {
    const block = blockOf();
    // この関数内での img への設定であることまで見る(他所の aria-label に釣られない)。
    expect(block).toMatch(/img\.setAttribute\(\s*'aria-label',/);
    expect(block).toMatch(/img\.title\s*=\s*entry/);
    // 1度組み立てた変数を両方で使い回す(ホットパスで呼び出しを増やさない)。
    const uses = block.match(/\$\{sameUserBlurb\}/g) || [];
    expect(uses.length).toBe(2);
  });

  it('ホットパスに全件走査が戻っていない(O(N²)退化ガード)', () => {
    const block = blockOf();
    // entries 全体を舐める系の呼び出しは、このセル単位の関数に入れてはいけない。
    expect(block).not.toContain('supportSameUserTotalInEntries');
    expect(block).not.toContain('querySelectorAll');
    expect(block).not.toContain('.filter(');
    expect(block).not.toContain('for (const');
  });

  it('到達不能だった全件走査フォールバックが popup-entry.js から撤去されている', () => {
    // import ごと消えていること(残っていると将来また呼ばれる退路になる)。
    expect(popupEntrySrc).not.toContain('supportSameUserTotalInEntries');
  });
});
