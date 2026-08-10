import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');

/**
 * ★幕(cloak)の解除が `window load` だけに依存していないことを固定する。
 *
 * 経緯(2026-08-10 実機・v0.1.1308 で計器の観測窓を30秒に延ばして初めて見えた):
 *   幕(cloak) ✅ t+5887ms で解除 ★CSS自動解除(1500ms)より後
 *   サイドパネルは滑り出るあいだ hidden 扱い(docHidden=7)でサブリソースが進まず、
 *   `window load` が t≈5.1秒までずれ込む。その間ずっと幕が残り黒く見えていた。
 *   ユーザー証言「はじめするっとでるときくろいのがでる」と持続時間が一致。
 *
 * ★CSS の 1500ms 保険は opacity しか戻さず cloak 属性は残る(=CSSだけでは救えない)。
 *   面積0でもCSSアニメは時間どおり進むことは実ブラウザで実測済み(面積は無関係)。
 */
describe('幕(cloak)解除は window load に依存しない', () => {
  it('load を待たない時間ベースの保険が存在する', () => {
    // `window.addEventListener('load', ...)` の外側に、素の setTimeout 保険があること。
    expect(src).toMatch(
      /setTimeout\(\(\) => \{\n\s*try \{\n\s*revealPopupPrimaryOnce\(\);\n\s*\} catch \{\n\s*\/\/ no-op\n\s*\}\n\s*\}, 1500\);/
    );
  });

  it('★その保険は無条件に実行される(if(false)前置・load配下への移動を弾く)', () => {
    // load リスナ登録ブロックが閉じた【後】に置かれていることをアンカーごと固定する。
    expect(src).toMatch(
      /window\.addEventListener\('load', finalRevealFallback, \{ once: true \}\);\n\s*\}\n[\s\S]{0,2000}?\n\s*setTimeout\(\(\) => \{\n\s*try \{\n\s*revealPopupPrimaryOnce\(\);/
    );
  });

  it('CSS の auto-reveal と同じ 1500ms で揃っている(中身が見える瞬間に幕も外す)', () => {
    const popupHtml = readFileSync(join(here, '../../extension/popup.html'), 'utf8');
    expect(popupHtml).toMatch(/animation: nl-popup-primary-cloak-auto-reveal 260ms 1500ms/);
    // JS 側の保険も同じ 1500ms(片方だけ変えると「中身は見えるが幕は残る」が復活する)
    expect(src).toMatch(/\}, 1500\);/);
  });

  it('revealPopupPrimaryOnce は冪等(二重実行で挙動が変わらない)', () => {
    // 加法のみの変更であることの根拠。既存経路が先に外していれば no-op。
    expect(src).toMatch(
      /function revealPopupPrimaryOnce\(\) \{\n\s*if \(popupPrimaryRevealDone\) return;\n\s*popupPrimaryRevealDone = true;/
    );
  });
});
