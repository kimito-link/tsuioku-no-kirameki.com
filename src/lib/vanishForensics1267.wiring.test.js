import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const contentSrc = fs.readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8');
const liteSrc = fs.readFileSync(path.join(root, 'lib/statusFastDiagLite.js'), 'utf8');
const shareSrc = fs.readFileSync(path.join(root, 'lib/aiShareFullText.js'), 'utf8');

/**
 * v0.1.1267 の配線断言。
 *
 * ★この版の目的は「直すこと」ではなく【1版で必ず何かが確定すること】。
 *   よって計器が現物を見ているか・速報に出るかの配線が、機能そのもの。
 *   ここが緩むと「次も分かりませんでした」に戻る。
 */

/**
 * 関数本体を「次の行頭 `}`」まで切り出す。固定文字数で切ると行追加で偽の赤になる。
 * @param {string} src @param {string} decl
 */
function fnBody(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const end = src.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? src.slice(i) : src.slice(i, end + 2);
}

/**
 * コメントを除いた「実際に走るコード」だけにする。
 * ★これが無いと、旧実装を戒めるコメント(「旧 _hostStylePrevVisible は…」
 *   「querySelectorAll を入れて重くした前科」)自身にマッチして偽の赤になる。
 *   2026-08-05 に実際に4件踏んだ。断言すべきはコードであってコメントではない。
 * @param {string} src
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // ブロックコメント
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // 行コメント(URL の // は除く)
}

describe('v0.1.1267 wiring — 壊れた計器の修理', () => {
  it('★旧 _hostStylePrevVisible は完全に消えている(2計器の状態共有の復活を殺す)', () => {
    // rAF と MutationObserver が1変数を共有していたのが hostStyleTrace=0 の原因の1つ。
    // 旧名が1つでも残っていたら共有が復活している疑いがある。
    expect(codeOnly(contentSrc).match(/_hostStylePrevVisible/g) || []).toHaveLength(0);
  });

  it('★分離した2変数がそれぞれ1つの計器だけで使われている', () => {
    // Mut 側: 宣言1 + 読み1 + 書き1 = 3
    expect(contentSrc.match(/_hostMutPrevVisible/g) || []).toHaveLength(3);
    // rAF 側: 宣言1 + 読み1 + 書き1 = 3
    expect(contentSrc.match(/_hostRafPrevVisible/g) || []).toHaveLength(3);
  });

  it('★observer は host だけでなく祖先も見る(親を見ていなかったのが誤診の元)', () => {
    const body = codeOnly(fnBody(contentSrc, 'function ensureHostAncestryMutationTrace('));
    expect(body).not.toBe('');
    // host / parent / grandparent の3つを observe する。
    expect(body.match(/_hostStyleObserver\.observe\(/g) || []).toHaveLength(3);
    // 書き手の指紋(old→new)を採るため attributeOldValue が要る。
    expect(body.match(/attributeOldValue: true/g) || []).toHaveLength(3);
    // host が親から外される瞬間も捕らえる。
    expect(body).toMatch(/childList: true/);
    /*
     * ★親の observe が【到達可能】であることまで断言する。
     *   数(3)だけを見ると `if (parent)` を `if (false)` に変える変異が素通りする
     *   (2026-08-05 の変異テストで実際に緑のまま通した)。
     *   親を見ないと「親が潰されていない」証拠が採れず、今回の調査の核が死ぬ。
     */
    expect(body).toMatch(
      /if \(parent\) \{\n\s*_hostStyleObserver\.observe\(parent, \{/
    );
    expect(body).toMatch(/const grand = parent\.parentElement;\n\s*if \(grand\) \{/);
    expect(body).not.toMatch(/if \(false\)/);
  });

  it('★host が変わったら張り直す(初代固着=死んだノードを見張るのを殺す)', () => {
    const body = codeOnly(fnBody(contentSrc, 'function ensureHostAncestryMutationTrace('));
    // 旧実装の `if (_hostStyleObserver) return` が復活したら赤。
    expect(body).not.toMatch(/if \(_hostStyleObserver\) return/);
    // 現物を見ているときだけ早期 return する条件であること。
    expect(body).toMatch(
      /if \(_hostStyleObserver && _hostTraceHost === host && _hostTraceParent === parent\) return;/
    );
    expect(body).toMatch(/_hostStyleObserver\.disconnect\(\);/);
  });

  it('★rAF から追従が呼ばれる(無条件でなく変化時のみ・hot path を汚さない)', () => {
    const body = codeOnly(fnBody(contentSrc, 'function startHostVisibilityWatch('));
    expect(body).not.toBe('');
    // ポインタ比較2つで判定し、変わったときだけ張り直す。
    expect(body).toMatch(
      /if \(host !== _hostTraceHost \|\| host\.parentElement !== _hostTraceParent\) \{\n\s*ensureHostAncestryMutationTrace\(host\);\n\s*\}/
    );
    // ★hot path に DOM 走査を足していないこと(v0.1.1201 の前科)。
    expect(body).not.toMatch(/querySelectorAll/);
  });

  it('ensureHostAncestryMutationTrace の呼び出しは2箇所(生成時+rAF追従)', () => {
    // 宣言(function ...)を除いた【呼び出し】が2箇所。
    const calls = codeOnly(contentSrc).match(/(?<!function )ensureHostAncestryMutationTrace\(host\)/g) || [];
    expect(calls).toHaveLength(2);
    // 旧関数名が残っていたら配線漏れ。
    expect(codeOnly(contentSrc).match(/startHostStyleMutationTrace/g) || []).toHaveLength(0);
  });
});

describe('v0.1.1267 wiring — 位相計器と <style> 生存ガード', () => {
  it('★4秒 poll の入口で tick 時刻を無条件に記録する(if(false) 前置を殺す)', () => {
    const body = fnBody(contentSrc, 'function syncLiveIdFromLocation(');
    expect(body).not.toBe('');
    // ★関数宣言の直後であることまで固定する。緩めると条件で包む変異が素通りする
    //   ([[mutation-test-needs-anchored-regex-2026-08-05]] — 今日実際に素通りさせた)。
    expect(body).toMatch(
      /function syncLiveIdFromLocation\(\) \{\n(?:\s*\/\*[\s\S]*?\*\/\n)?\s*_lastLivePollTickAt = Date\.now\(\);/
    );
    expect(contentSrc.match(/_lastLivePollTickAt = Date\.now\(\)/g) || []).toHaveLength(1);
  });

  it('★消失時に Δ を渡している(位相判定の入力が欠けたら永久に insufficient)', () => {
    const body = fnBody(contentSrc, 'function startHostVisibilityWatch(');
    expect(body).toMatch(/pollDeltaMs: _lastLivePollTickAt > 0 \? Date\.now\(\) - _lastLivePollTickAt : null/);
  });

  it('★<style> 生存ガードが復帰ゲート2箇所で呼ばれる(片方だけ壊す変異を殺す)', () => {
    expect(contentSrc.match(/ensurePageFrameStyleAlive\(\);/g) || []).toHaveLength(2);
    const body = fnBody(contentSrc, 'function ensurePageFrameStyleAlive(');
    expect(body).not.toBe('');
    // ★正常系(style が在る)では何もしないこと=「何が正常か」を教えてある
    //   ([[repair-gate-needs-to-know-normal-2026-08-05]])。
    expect(body).toMatch(/if \(document\.getElementById\(PAGE_FRAME_STYLE_ID\)\) return;/);
    expect(body).toMatch(/_pageFrameStyleReattachCount \+= 1;/);
  });

  it('★消失時に分類器を通している(hint 無しで速報に出さない)', () => {
    const body = fnBody(contentSrc, 'function startHostVisibilityWatch(');
    expect(body).toMatch(/const snapshot = captureVanishSnapshot\(host, cs\);/);
    expect(body).toMatch(/const \{ hint, detail \} = classifyVanishSnapshot\(snapshot\);/);
  });

  it('★祖先の getComputedStyle は遷移時のみ(毎フレームだと重い)', () => {
    const raf = codeOnly(fnBody(contentSrc, 'function startHostVisibilityWatch('));
    // rAF 本体に祖先走査を直接書いていないこと(captureVanishSnapshot の中に閉じる)。
    expect(raf).not.toMatch(/parentElement;[\s\S]*getComputedStyle\(el\)/);
    const cap = fnBody(contentSrc, 'function captureVanishSnapshot(');
    expect(cap).toMatch(/for \(let i = 0; i < 3 && el; i \+= 1\)/);
  });
});

describe('v0.1.1267 wiring — 速報への passthrough(通さないと永久に出ない)', () => {
  it('lite に新キーが通っている', () => {
    expect(liteSrc.match(/hostAncestryTrace/g)?.length).toBeGreaterThanOrEqual(2);
    expect(liteSrc.match(/styleReattach/g)?.length).toBeGreaterThanOrEqual(2);
    // 返り値オブジェクトに載っていること(宣言だけで返していない変異を殺す)。
    expect(liteSrc).toMatch(/\n\s{6}hostAncestryTrace,\n\s{6}styleReattach,/);
  });

  it('AI共有テキストに2行が出る', () => {
    expect(shareSrc).toMatch(/fastDiag\?\.content\?\.hostAncestryTrace\?\.line/);
    expect(shareSrc).toMatch(/fastDiag\?\.content\?\.styleReattach\?\.line/);
  });

  it('★位相の行が vanishForensics.line に連結されている(ユーザーが読む2行目)', () => {
    expect(contentSrc.match(/formatVanishPhaseLine\(phase, snap\.pollDeltas\)/g)?.length).toBe(4);
  });

  it('★観測対象が現物かを毎回自己申告する(固着の再発検知)', () => {
    expect(contentSrc.match(/watchingCurrentHost: _hostTraceHost === nlsInlinePopupHostSingleton/g) || [])
      .toHaveLength(2);
  });
});

describe('v0.1.1267 wiring — CSS の幾何自衛', () => {
  it('min-width/min-height が既定ブロックに入っている', () => {
    expect(contentSrc.match(/min-width: 280px;/g) || []).toHaveLength(1);
    expect(contentSrc.match(/min-height: 120px;/g) || []).toHaveLength(1);
  });

  it('★hidden 側は display:none !important のまま(既定動作を壊していない)', () => {
    const i = contentSrc.indexOf('#${INLINE_POPUP_HOST_ID}[data-nls-hidden="1"] {');
    expect(i).toBeGreaterThan(-1);
    const block = contentSrc.slice(i, contentSrc.indexOf('}', i + 50));
    expect(block).toMatch(/display: none !important;/);
  });
});
