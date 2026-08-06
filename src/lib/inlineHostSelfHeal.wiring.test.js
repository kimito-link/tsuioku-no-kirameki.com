import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentSrc = fs
  .readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/** 関数本体を取り出す(対応する括弧まで)。 */
function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

/**
 * ★v0.1.1278: 旧 vanishForensics1267.wiring.test.js から【実挙動の断言だけ】を救出した。
 *
 *   旧ファイルは点滅追跡の計器(rAF 見張り・祖先 observer・位相計器)の配線を固定する
 *   ものだったが、その中に計器とは無関係な「パネルが壊れないこと」の断言が
 *   混ざっていた。計器を撤去(v0.1.1278)すると旧ファイルは丸ごと不要になるため、
 *   ★消してはいけない断言をここへ移す。
 *
 *   守る対象は2つとも【実挙動】:
 *     1. <style> 生存ガード = 消えた CSS を貼り直す自己修復(計器ではない)
 *     2. CSS の既定値      = パネルの最低寸法と「消えている」状態の正本
 */
describe('パネルの自己修復ガード(実挙動・計器ではない)', () => {
  it('★<style> 生存ガードが2箇所で呼ばれる(片方だけ壊す変異を殺す)', () => {
    expect(contentSrc.match(/ensurePageFrameStyleAlive\(\);/g) || []).toHaveLength(2);
    const body = fnBody(contentSrc, 'function ensurePageFrameStyleAlive(');
    expect(body).not.toBe('');
    /*
     * ★正常系(style が在る)では何もしないこと=「何が正常か」を教えてある。
     *   これが無いと、正常な状態を異常と誤認して直し続ける無限ループになる
     *   ([[repair-gate-needs-to-know-normal-2026-08-05]] — 実際に踏んだ)。
     */
    expect(body).toMatch(/if \(document\.getElementById\(PAGE_FRAME_STYLE_ID\)\) return;/);
    expect(body).toMatch(/_pageFrameStyleReattachCount \+= 1;/);
  });

  it('★なぜ要るか: <style> が消えると「消えている」の正本ごと死ぬ', () => {
    /*
     * v0.1.1266 で「消えている」の正本を [data-nls-hidden] の CSS ルールに移した。
     * その <style> が失われるとルールごと死に、属性が付いていても消えなくなる
     * =「こん太を押す前にパネルが出る」という逆向きの事故になる。
     */
    const i = contentSrc.indexOf('#${INLINE_POPUP_HOST_ID}[data-nls-hidden="1"] {');
    expect(i).toBeGreaterThan(-1);
    const block = contentSrc.slice(i, contentSrc.indexOf('}', i + 50));
    expect(block).toMatch(/display: none !important;/);
  });
});

describe('パネル CSS の既定値(幾何の自衛)', () => {
  it('min-width/min-height が既定ブロックに入っている', () => {
    expect(contentSrc.match(/min-width: 280px;/g) || []).toHaveLength(1);
    expect(contentSrc.match(/min-height: 120px;/g) || []).toHaveLength(1);
  });
});
