import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 中身LOD(枠は残す。中身だけ空にする)の【配線】検査。
 *
 * ★このリポの掟: 配線が複数箇所なら【数で断言する】(toBe(2))。
 *   「どこかに在る」だけの検査は、片方が消えても緑のまま通る
 *   ([[wiring-test-must-assert-counts-2026-08-04]])。
 *
 * ★CRLF で空振りする地雷: 改行を必ず正規化してから検査する。
 *   同じ罠で laneDensityLod.wiring.test.js の検査が死んでいた(2026-08-18 に修復)。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/** コメントを剥がして「実際に効いているコード」だけを見る。 */
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const LOD_SRC = 'src/extension/story/laneContentLod.js';
const RENDERER = 'src/extension/story/renderStoryUserLaneDom.js';

/** hollow の寸法を持つ CSS を置くファイル(★手コピー同士・自動同期なし)。 */
const LANE_CSS_FILES = ['extension/popup.html', 'app/live-view.html'];

describe('中身LOD: 描画側への配線', () => {
  it('renderStoryUserLaneDom が LOD モジュールから4関数を取り込んでいる', () => {
    const code = stripComments(read(RENDERER));
    expect(code).toMatch(/from '\.\/laneContentLod\.js'/);
    for (const fn of [
      'shouldRenderHollow',
      'buildHollowTileEl',
      'observeHollowTile',
      'forgetLaneContentLod',
      'isAlreadyFilled'
    ]) {
      expect(code).toContain(fn);
    }
  });

  it('★forget は【3箇所】で呼ばれる — DOM を消す経路を1つでも漏らすと IO がリークする', () => {
    const code = stripComments(read(RENDERER));
    const hits = code.match(/forgetLaneContentLod\s*\(/g) || [];
    // 1) fillLaneTier の貼り替え前
    // 2) resetStoryUserLaneDom の innerHTML='' ループ
    // 3) paintStoryUserLaneDomEmptyGuides の innerHTML='' ループ
    expect(hits.length).toBe(3);
  });

  it('★hollow でも frag に append される = タイル枚数が減らない(幕の解除条件を守る)', () => {
    const code = stripComments(read(RENDERER));
    // hollow 分岐の中で frag.appendChild(hollowEl) してから continue していること。
    const branch = code.slice(code.indexOf('shouldRenderHollow'));
    const upToContinue = branch.slice(0, branch.indexOf('continue;'));
    expect(upToContinue).toContain('frag.appendChild(hollowEl)');
  });

  it('★diff-skip の鍵(storyLaneTierBodyKey)に位置・LOD を混ぜていない', () => {
    const code = stripComments(read(RENDERER));
    const start = code.indexOf('function storyLaneTierBodyKey');
    expect(start).toBeGreaterThan(-1);
    const end = code.indexOf('\n}\n', start);
    // ★空振り防止: 終端が見つからないまま緑になるのを防ぐ(CRLF 地雷の再発防止)
    expect(end).toBeGreaterThan(start);
    const body = code.slice(start, end);
    expect(body).not.toMatch(/hollow|Hollow|index|nth-child|LOD|lod/);
  });
});

describe('中身LOD: 3画面の扱い', () => {
  it('★会場(venueBar)には配線しない — 3D変形で可視判定が崩れる前科があるため', () => {
    const venue = stripComments(read('src/extension/venueBar.js'));
    expect(venue).not.toContain('laneContentLod');
    expect(venue).not.toContain('shouldRenderHollow');
  });

  it('★hollow の寸法 CSS が【2ファイル】に在る(手コピー同士の同期漏れ防止)', () => {
    let found = 0;
    for (const f of LANE_CSS_FILES) {
      if (read(f).includes('.nl-story-userlane-cell--hollow')) found += 1;
    }
    expect(found).toBe(LANE_CSS_FILES.length);
  });

  it('★各ページの hollow 寸法は、そのページ自身の後列 avatar 寸法と揃っている', () => {
    /*
     * ★v0.1.1496: 手計算(popup 25px / live-view 29px)をやめ、
     *   後列 avatar 寸法の変数から calc で導出する形にした。
     *   ⟹ 「そのページ自身の後列 avatar と揃っている」ことが【構造的に保証される】ので、
     *     具体値ではなく【導出されていること】を検査する。
     *   ★具体値を固定し続けると、寸法を調整するたびにこの検査も書き換えることになり、
     *     テストが仕様ではなく写経になる。
     *   ★「popup の値をコピーすると 4px ずれてスクロールが飛ぶ」という当初の恐れは、
     *     各ページが自分の --nl-lane-avatar-anon を参照することで原理的に起きなくなった。
     *   値そのものの見張りは src/lib/laneAvatarSize.wiring.test.js が持つ。
     */
    for (const f of ['extension/popup.html', 'app/live-view.html']) {
      const css = read(f);
      const at = css.indexOf('.nl-story-userlane-cell--hollow');
      expect(at).toBeGreaterThan(0);
      const decl = css.slice(at, css.indexOf('}', at));
      expect(decl).toMatch(/width:\s*calc\(var\(--nl-lane-avatar-anon\)/);
      expect(decl).toMatch(/height:\s*calc\(var\(--nl-lane-avatar-anon\)/);
      // ★直書きpxに戻っていないこと(退化ガード)。
      expect(decl).not.toMatch(/(?:^|[\s;])(?:width|height):\s*\d+px/);
    }
  });

  it('★hollow は地色を塗る — transparent だと「横縞つきの黒」を再生産する', () => {
    for (const f of LANE_CSS_FILES) {
      const css = read(f);
      const block = css.slice(css.indexOf('.nl-story-userlane-cell--hollow'));
      const decl = block.slice(0, block.indexOf('}'));
      expect(decl).toMatch(/background:/);
    }
  });
});

describe('中身LOD: 撤回できる形になっているか', () => {
  it('★kill スイッチが在り、判定の先頭で効く(1行で旧挙動に戻せる)', () => {
    const code = stripComments(read(LOD_SRC));
    expect(code).toMatch(/export const LANE_CONTENT_LOD_ENABLED = (true|false);/);
    const fn = code.slice(code.indexOf('export function shouldRenderHollow'));
    // ★v0.1.1441: 定数は【引数の既定値】として効く形にした
    //   (検査からは値を注入できるが、出荷経路は常に定数を使う)。
    const head = fn.slice(0, fn.indexOf('{'));
    expect(head).toContain('LANE_CONTENT_LOD_ENABLED');
    const body = fn.slice(fn.indexOf('{'));
    expect(body).toMatch(/if \(!enabled\) return false;/);
  });

  it('★popup-entry.js は不触(max-lines 余裕0行のため)', () => {
    const entry = read('src/extension/popup-entry.js');
    expect(entry).not.toContain('laneContentLod');
    expect(entry).not.toContain('shouldRenderHollow');
  });

  it('★personTileDom.js(タイル正本・凍結)は不触', () => {
    const tile = read('src/lib/personTileDom.js');
    expect(tile).not.toContain('hollow');
    expect(tile).not.toContain('laneContentLod');
  });
});

describe('中身LOD: 出荷ビルドに載っているか', () => {
  it('★dist に hollow の class 文字列が在る(日本語は \\uXXXX 化されるので ASCII で見る)', () => {
    const dist = read('extension/dist/popup.js');
    expect(dist).toContain('nl-story-userlane-cell--hollow');
  });
});
