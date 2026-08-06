import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const contentSrc = fs
  .readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * ★v0.1.1255(Phase A) の配線断言。
 *   [[wiring-test-must-assert-counts-2026-08-04]]: 同じ配線が複数箇所に要るときは
 *   「存在する」でなく「N箇所ある」と数で断言する。存在の断言は片方だけ壊す変異を通す。
 */

/**
 * 関数本体を「次の行頭 `}`」まで切り出す。
 * ★固定文字数(slice(i, i+N))で切ると、関数に行を足しただけで断言が範囲外に落ちて
 *   偽の赤になる(2026-08-05 に実際に発生)。断言すべきは【契約の有無】であって
 *   コードの長さではないので、終端まで見る。
 * @param {string} src @param {string} decl
 */
function fnBody(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const end = src.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? src.slice(i) : src.slice(i, end + 2);
}

describe('setInlineHostVisible の配線', () => {
  it('純関数を import して唯一の入口を定義している', () => {
    expect(contentSrc).toContain("from '../lib/inlineHostVisibilityIntent.js'");
    expect(contentSrc).toMatch(/function setInlineHostVisible\(host, visible, cause\) \{/);
  });

  it('★入口は4つの値を全部書く(1つでも欠けると中途半端＝事故1の再現)', () => {
    const body = fnBody(contentSrc, 'function setInlineHostVisible(');
    expect(body).toContain('setInlineHostDisplay(host, intent.display, intent.cause)');
    expect(body).toMatch(/host\.style\.opacity = intent\.opacity;/);
    expect(body).toMatch(/host\.style\.pointerEvents = intent\.pointerEvents;/);
    expect(body).toMatch(/setAttribute\('aria-hidden', intent\.ariaHidden\)/);
  });

  it('★既存の集約入口を置き換えず内側で呼ぶ(display を書く唯一の場所を保つ)', () => {
    /*
     * ★v0.1.1278: 旧版はここで計器 hostFlipCensus の契約
     *   (`if (prev === display) return;` による水増し防止)も固定していたが、
     *   計器を撤去したのでその断言は落とした。
     *   ★残すのは実挙動=「display を書く唯一の入口が存在し、内側で呼ばれること」。
     *     第3引数は経路タグ(計器撤去で現在は未使用のため _cause)。
     */
    expect(contentSrc).toMatch(/function setInlineHostDisplay\(host, display, _cause\) \{/);
    // 属性(消えているの正本)と display をセットで書く契約は実挙動なので固定する。
    const body = fnBody(contentSrc, 'function setInlineHostDisplay(');
    expect(body).toMatch(/setAttribute\(INLINE_HOST_HIDDEN_ATTR, '1'\)/);
    expect(body).toMatch(/removeAttribute\(INLINE_HOST_HIDDEN_ATTR\)/);
    expect(body).toMatch(/host\.style\.display = display;/);
  });

  it('★見せる経路4つが全部この入口を通っている(数で断言)', () => {
    for (const tag of ['floating_show', 'dock_show', 'anchored_show', 'nonvideo_show']) {
      expect(contentSrc).toContain(`setInlineHostVisible(host, true, '${tag}');`);
    }
    const shows = contentSrc.match(/setInlineHostVisible\(host, true, '/g) || [];
    expect(shows.length).toBe(4);
  });

  it('★消す経路も入口を通っている', () => {
    expect(contentSrc).toContain("setInlineHostVisible(host, false, 'overlay_hidden');");
  });

  it('★見せる4経路で opacity/pointerEvents の直書きが残っていない(事故2＝集約漏れの再現を殺す)', () => {
    // 旧実装の並び(display と opacity が別行)が1つでも残っていたら赤にする。
    expect(contentSrc).not.toMatch(
      /setInlineHostDisplay\(host, 'block', '(floating_show|dock_show|anchored_show|nonvideo_show)'\);\n\s*host\.style\.opacity/
    );
  });

  it('★reveal 経路(display を触らない2箇所)は巻き込んでいない — 最大の地雷', () => {
    // 3697/3832 相当: iframe の準備完了で透明度だけ戻す処理。ここに display:'block' を
    // 書く関数を入れると【意図的に消された状態を復活させる】= v0.1.1250 の逆向き事故。
    const direct = contentSrc.match(/\bhost\.style\.opacity = '1';/g) || [];
    expect(direct.length).toBe(2);
    // その2箇所が setInlineHostVisible に置換されていないこと(＝関数の呼び出しが混ざっていない)。
    const revealFn = contentSrc.indexOf('function attachInlineIframeRevealFallback(');
    expect(revealFn).toBeGreaterThan(-1);
    const revealBody = contentSrc.slice(revealFn, revealFn + 900);
    expect(revealBody).not.toContain('setInlineHostVisible(');
  });

  it('★host の style 直書きが入口の外に増えていない(代入の形で走査＝変数名に依存しない)', () => {
    // [[wiring-test-must-assert-counts-2026-08-04]]: 変数名 host/hostEarly の違いで
    // 取りこぼした事故2の再発防止。opacity は「入口1 + reveal2」= 3 が上限。
    const lines = contentSrc.split(String.fromCharCode(10));
    const hits = lines.filter((ln) => /\b(host[A-Za-z0-9_]*)\.style\.opacity\s*=/.test(ln));
    expect(hits.length).toBe(3);
  });
});
