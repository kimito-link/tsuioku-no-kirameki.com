import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `content-visibility: auto` を【インタラクティブ要素を含む器】に掛けないことの回帰テスト。
 *
 * ■ 何が起きていたか(e2e popup-layout:465 が 2026-08-05 から赤だった真因)
 *   `content-visibility: auto` はスキップ中の subtree を【ヒットテスト対象から外す】。
 *   そのため中の button/summary を狙ったクリックが親に吸われ、1クリックで開かない。
 *   実測(同じ点・同じ瞬間で両方向を確認):
 *     .nl-stats                  auto → elementFromPoint=SECTION / visible → DETAILS ✅
 *     .nl-support-visual-details auto → elementFromPoint=DETAILS / visible → SUMMARY ✅
 *
 * ★当初「<summary> は details の直接の子だから当たり判定は残る」と考えたが【誤り】。
 *   subtree 全体がスキップされるので summary 自身も当たらない。実測で判明した。
 *
 * ■ このテストの役割
 *   速さのための省略(content-visibility)が、当たり判定という【機能】を黙って削るのを止める。
 *   新しく content-visibility を足すときは、その器がインタラクティブ要素を含まないことを
 *   確かめてから許可リストに追加すること。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const popupHtml = fs.readFileSync(
  path.resolve(__dirname, '../../extension/popup.html'),
  'utf8'
);

/**
 * `content-visibility: auto` を含む CSS 宣言ブロックだけを取り出す。
 *
 * ★素朴な `/[^{}]+\{[^{}]*content-visibility[^{}]*\}/g` を 22k 行へ当てると
 *   バックトラックで数秒かかり、【フルラン時だけ】落ちることがある
 *   (単体では緑=テスト隔離の罠)。出現位置から切り出して線形時間にする。
 *
 * @param {string} html
 * @returns {string[]} 各ブロック(セレクタ + { ... })
 */
function collectContentVisibilityBlocks(html) {
  // ★CSS コメント(/* ... */)を先に落とす。落とさないと、説明文に書いた
  //   「content-visibility: auto → …」まで規則として拾い、無関係なセレクタ
  //   (.nl-main 等)を犯人として報告する(実際に一度誤検出した)。
  const stripped = html.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  /** @type {string[]} */
  const out = [];
  const needle = 'content-visibility:';
  let from = 0;
  for (;;) {
    const hit = stripped.indexOf(needle, from);
    if (hit < 0) break;
    from = hit + needle.length;
    if (!/^\s*auto\b/.test(stripped.slice(hit + needle.length, hit + needle.length + 12))) continue;
    const open = stripped.lastIndexOf('{', hit);
    const close = stripped.indexOf('}', hit);
    if (open < 0 || close < 0) continue;
    // セレクタは直前の } / ; / 冒頭 のいずれかから { まで。
    const selStart = Math.max(
      stripped.lastIndexOf('}', open - 1),
      stripped.lastIndexOf(';', open - 1)
    );
    out.push(stripped.slice(selStart + 1, close + 1));
  }
  return out;
}

/**
 * content-visibility: auto を許してよいセレクタ。
 *
 * ★`.nl-story-growth-cell` / `.nl-story-growth-icon` は13pxのアイコン枠で、
 *   実害(hover/クリックが効かない)を【実測できていない】ので現状維持とする。
 *   幕(.nl-init-shade)に覆われて計測できず、推測で触らない判断
 *   ([[red-may-be-snapshot-too-early-2026-08-08]]=確かめずに直さない)。
 *   もしアイコンのホバー(pin/プレビュー)が効かない報告が出たら、ここを疑う。
 */
const ALLOWED_SELECTORS = ['.nl-story-growth-icon', '.nl-story-growth-cell'];

describe('content-visibility: auto の適用先', () => {
  it('★クリック対象を含む器(.nl-stats / .nl-support-visual-details)には掛けない', () => {
    // CSS宣言ブロック単位で「セレクタ群 { ... content-visibility: auto ... }」を拾う。
    // ★正規表現を popup.html 全体(22k行)に当てると数秒かかり、フルラン時に
    //   タイムアウトで落ちることがある(単体では緑=テスト隔離の罠)。
    //   `content-visibility` を含む周辺だけに絞ってから解析する。
    const blocks = collectContentVisibilityBlocks(popupHtml);
    const offenders = [];
    for (const b of blocks) {
      const selectorPart = b.slice(0, b.indexOf('{'));
      // コメント行は除外(説明文に .nl-stats と書いてあるだけのものを拾わない)
      const sel = selectorPart.replace(/\/\*[\s\S]*?\*\//g, '');
      if (/\.nl-stats\b/.test(sel)) offenders.push('.nl-stats');
      if (/\.nl-support-visual-details\b/.test(sel)) offenders.push('.nl-support-visual-details');
    }
    expect(
      offenders,
      `content-visibility:auto が当たり判定を消す器に掛かっている: ${offenders.join(', ')}。` +
        'この器は button/summary を含むのでクリックが親に吸われる(e2e popup-layout:465 が赤になる)'
    ).toEqual([]);
  });

  it('content-visibility を足すなら許可リストに載っている器だけ', () => {
    // ★正規表現を popup.html 全体(22k行)に当てると数秒かかり、フルラン時に
    //   タイムアウトで落ちることがある(単体では緑=テスト隔離の罠)。
    //   `content-visibility` を含む周辺だけに絞ってから解析する。
    const blocks = collectContentVisibilityBlocks(popupHtml);
    const selectors = blocks
      .map((b) => b.slice(0, b.indexOf('{')).replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter(Boolean);
    for (const sel of selectors) {
      const ok = ALLOWED_SELECTORS.some((a) => sel.includes(a));
      expect(
        ok,
        `未知の器に content-visibility:auto が掛かっている: "${sel}"。` +
          'インタラクティブ要素(button/summary/input/a)を含まないことを実機で確かめてから ' +
          'ALLOWED_SELECTORS に追加すること'
      ).toBe(true);
    }
  });
});
