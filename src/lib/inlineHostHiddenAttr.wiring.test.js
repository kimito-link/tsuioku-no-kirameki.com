import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INLINE_HOST_HIDDEN_ATTR,
  buildInlineHostVisibilityIntent,
  isInlineHostHiddenByAttr
} from './inlineHostVisibilityIntent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const contentSrc = fs.readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8');

/**
 * v0.1.1266(2026-08-05): 「消えている」の正本をインラインスタイルから【属性】へ移した配線の断言。
 *
 * ★なぜこの構造にしたか(実測で確定した事実):
 *   消えた瞬間の値が旧 CSS 既定と完全一致(display:none / opacity:0 / connected:true)し、
 *   かつ計器が全部0(hostFlipCensus=0 / hostStyleTrace=0)だった。
 *   = 誰も消していない。インラインの上書きが失われて既定に落ちているだけ。
 *   → 既定を「見えている」に反転し、消すときだけ属性を付ける。
 *     こうするとインラインが失われても【消えない】(無害な no-op になる)。
 *
 * ★このテストが守る不変条件は3つ:
 *   (1) CSS 既定が display:block / opacity:1 であること(none に戻したら赤)
 *   (2) 属性ルールが存在し !important で勝つこと(外したら赤)
 *   (3) 属性の付け外しが display 集約入口の中で【無条件に】行われること
 */

/**
 * 関数本体を「次の行頭 `}`」まで切り出す。
 * ★固定文字数で切ると関数に行を足しただけで偽の赤になるため終端まで見る
 *   (hostFlipCensus.wiring.test.js と同じ型を踏襲)。
 * @param {string} src @param {string} decl
 */
function fnBody(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const end = src.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? src.slice(i) : src.slice(i, end + 2);
}

/** CSS 文字列は改行/空白の揺れがあるので比較前に潰す。 */
function squash(s) {
  return s.replace(/\s+/g, ' ');
}

/**
 * CSS ルール1個分の宣言部を切り出す。
 * ★素朴な indexOf('}') はセレクタ内の `${INLINE_POPUP_HOST_ID}` の閉じ括弧に当たって
 *   空文字を掴む(実際に踏んだ)。宣言の開始 `{` を探してからその先の `}` を見る。
 * @param {string} src @param {string} selector
 */
function cssRuleBody(src, selector) {
  const i = src.indexOf(selector);
  if (i < 0) return '';
  // selector 自身の末尾が `{` を含む(例: '#${ID} {')ので、その【後ろ】から宣言を読む。
  const open = i + selector.length;
  const close = src.indexOf('}', open);
  return close < 0 ? '' : squash(src.slice(open, close));
}

describe('inline host hidden-attr wiring — 消えない構造', () => {
  it('★(1) CSS 既定が「見えている」に反転している(display:none に戻す変異を殺す)', () => {
    // 既定ブロック(属性ルールではない素の `#host {`)を切り出す。
    const block = cssRuleBody(contentSrc, '#${INLINE_POPUP_HOST_ID} {');
    expect(block).not.toBe('');
    // ★ここが none/0 に戻ると「インラインが失われたら消える」旧構造に逆戻りする。
    expect(block).toMatch(/display: block;/);
    expect(block).toMatch(/opacity: 1;/);
    expect(block).not.toMatch(/display: none;/);
  });

  it('★(2) 属性ルールが存在し !important で勝つ(ルール削除・important外しを殺す)', () => {
    const block = cssRuleBody(contentSrc, '#${INLINE_POPUP_HOST_ID}[data-nls-hidden="1"] {');
    expect(block).not.toBe('');
    // reveal 経路(opacity だけ '1' を書く2箇所)に勝てないと、隠したパネルが復活する。
    expect(block).toMatch(/display: none !important;/);
    expect(block).toMatch(/opacity: 0 !important;/);
  });

  it('★(2b) CSS のセレクタ名と JS の定数が一致している(片方だけ改名する変異を殺す)', () => {
    // 名前がずれると「属性は付くがルールが当たらない」=パネルが消えなくなる(静かな事故)。
    expect(INLINE_HOST_HIDDEN_ATTR).toBe('data-nls-hidden');
    expect(contentSrc).toContain(`[${INLINE_HOST_HIDDEN_ATTR}="1"]`);
  });

  it('★(3) display 集約入口が属性を無条件に付け外しする(if(false) 前置を殺す)', () => {
    const body = fnBody(contentSrc, 'function setInlineHostDisplay(');
    expect(body).not.toBe('');
    // 「書いてあるか」ではなく「無条件に実行される文か」を断言する
    // ([[wiring-test-must-assert-counts-2026-08-04]] / 配線テストの掟)。
    // ★`try {` の【直後】であることまで固定する。ここを緩めると `if (false)` を
    //   間に挟む変異が素通りする(2026-08-05 に実際に緑のまま通してしまった)。
    expect(body).toMatch(
      /try \{\n\s*if \(display === 'none'\) host\.setAttribute\(INLINE_HOST_HIDDEN_ATTR, '1'\);\n\s*else host\.removeAttribute\(INLINE_HOST_HIDDEN_ATTR\);\n\s*\} catch/
    );
    // 追加の保険: 属性の付け外しを条件で包む変異(if (false) / 別 if の追加)を殺す。
    expect(body).not.toMatch(/if \(false\)/);
    // ★ガードで囲われていないこと(早期 return より前＝必ず通る位置)を数で担保する。
    expect(body.match(/INLINE_HOST_HIDDEN_ATTR/g) || []).toHaveLength(2);
  });

  it('★(4) 生成直後・DOM 投入前に属性が付く(「こん太を押すまで出さない」を守る)', () => {
    const body = fnBody(contentSrc, 'function ensureInlinePopupHost(');
    expect(body).not.toBe('');
    // 既定が block に反転したので、ここが抜けると新規生成のたびに一瞬出てしまう。
    const idIdx = body.indexOf('host.id = INLINE_POPUP_HOST_ID;');
    const attrIdx = body.indexOf(`host.setAttribute(INLINE_HOST_HIDDEN_ATTR, '1');`);
    expect(idIdx).toBeGreaterThan(-1);
    expect(attrIdx).toBeGreaterThan(idIdx);
    // ★iframe 生成など「他の要素の」appendChild は関係ないので数えない。
    //   属性は createElement〜singleton 登録の直後、つまり関数のごく先頭で付くこと。
    //   ここでは「id を付けた直後の数行以内」を順序で担保する。
    const between = body.slice(idIdx, attrIdx);
    expect(between).not.toContain('return');
  });

  it('★(5) import が実在する(未配線の定数参照で ReferenceError にしない)', () => {
    expect(contentSrc).toMatch(/import \{[\s\S]*INLINE_HOST_HIDDEN_ATTR[\s\S]*\} from '\.\.\/lib\/inlineHostVisibilityIntent\.js';/);
  });
});

describe('buildInlineHostVisibilityIntent — hiddenAttr は display と必ず同期', () => {
  it('★見せる=属性なし / 消す=属性あり(片方だけ変える変異を殺す)', () => {
    const shown = buildInlineHostVisibilityIntent({ visible: true, cause: 'x' });
    const hidden = buildInlineHostVisibilityIntent({ visible: false, cause: 'x' });
    expect(shown.display).toBe('block');
    expect(shown.hiddenAttr).toBe(null);
    expect(hidden.display).toBe('none');
    expect(hidden.hiddenAttr).toBe('1');
  });

  it('★曖昧な値は「消す」側に倒れ、属性も付く(安全側の既定を維持)', () => {
    for (const v of [undefined, null, 0, '', 'true', 1]) {
      const intent = buildInlineHostVisibilityIntent({ visible: v, cause: 'c' });
      expect(intent.display).toBe('none');
      expect(intent.hiddenAttr).toBe('1');
    }
  });
});

describe('isInlineHostHiddenByAttr', () => {
  it('属性 "1" のときだけ true(それ以外・null・例外は false)', () => {
    expect(isInlineHostHiddenByAttr({ getAttribute: () => '1' })).toBe(true);
    expect(isInlineHostHiddenByAttr({ getAttribute: () => null })).toBe(false);
    expect(isInlineHostHiddenByAttr({ getAttribute: () => '0' })).toBe(false);
    expect(isInlineHostHiddenByAttr(null)).toBe(false);
    expect(isInlineHostHiddenByAttr(undefined)).toBe(false);
    expect(isInlineHostHiddenByAttr({})).toBe(false);
  });
});
