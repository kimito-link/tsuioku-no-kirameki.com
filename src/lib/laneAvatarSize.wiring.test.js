import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * ★応援レーンのアバター寸法が「3画面でバラバラに直書きされる」のを止める配線ガード。
 *
 * ■ なぜ要るか（2026-08-30・実測）
 *   同じレーンのCSSが3ファイルにコピーされている:
 *     extension/popup.html / app/live-view.html / src/extension/venueBar.js
 *   （scripts/build.mjs:190-197「本物 popup.html を丸ごとコピー(app/live-view.html)」）
 *
 *   ところが★値を照合する検査が1本も無かった。
 *   実測: `.nl-story-userlane-avatar {` は popup 6件 / live-view 3件 ＝ 既に乖離していた。
 *   `LANE_CSS_SYNC` マーカー(venueBar.js:1251)はあるが、
 *   検査は「区間内に特定セレクタが在るか」だけで【値は見ていない】。
 *   さらにマーカーの参照行(popup.html:829-1067)は古くなっていた（実際は 1037-1320 付近）。
 *
 * ■ ★何を検査するか（設計の核）
 *   ★値そのものを照合しない。「値が書ける場所を塞ぐ」。
 *   具体値を固定すると、サイズを調整するたびにテストも直す＝
 *   テストが仕様ではなく【写経】になり、やがて誰も読まなくなる。
 *   直書きを禁じておけば、★どんな値の毒でも捕まる。
 *
 * ■ ★何を検査しないか（過剰検査は赤の信頼を毀損する）
 *   ・前列の具体値(44px) … 調整されるべき値
 *   ・display / flex-direction / gap … grid化禁止は laneDensityLod.wiring.test.js:119 が
 *     JS側で守り、縦積み禁止は venue-lane-readable-SPEC.md §3 が文書で却下済み
 *   ・★3画面の値の一致 … 会場は popup の inline と一致すべきだが window とは
 *     一致してはいけない（?inline=1 で決まる排他モード・window は高さ580px固定の狭い箱）。
 *     live-view の後列26pxも popup の22pxとは意図的に違う。
 *     「3画面同値」を断言すると【正しい差異を赤にする誤検査】になる。
 */

const LANE_CSS_FILES = ['extension/popup.html', 'app/live-view.html', 'src/extension/venueBar.js'];

/** @param {string} rel */
function read(rel) {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

/**
 * ★レーンのアバター規則だけを取り出す。
 *   `.nlsb-topbar-cell`(応援者トップの44px)はレーンではない別部品なので除く。
 * @param {string} src
 * @returns {{ sel: string, body: string }[]}
 */
function laneAvatarRules(src) {
  const out = [];
  /*
   * ★正規表現で丸ごと舐めると、この規模のファイルでは破滅的バックトラックで固まる
   *   （実測: 5秒でタイムアウト）。indexOf で位置を取り、前後を切り出す素朴な走査にする。
   */
  const NEEDLE = '.nl-story-userlane-avatar';
  let at = src.indexOf(NEEDLE);
  while (at >= 0) {
    const open = src.indexOf('{', at);
    const close = open >= 0 ? src.indexOf('}', open) : -1;
    if (open < 0 || close < 0) break;
    // セレクタは直前の } か ; か / から今の { まで。
    let start = at;
    for (let i = at; i >= 0 && at - i < 400; i -= 1) {
      const c = src[i];
      if (c === '}' || c === ';' || c === '/') { start = i + 1; break; }
      start = i;
    }
    const sel = src.slice(start, open).replace(/\s+/g, ' ').trim();
    // セレクタ内に needle があるものだけ（宣言側の言及を拾わない）。
    if (sel.includes(NEEDLE) && !sel.includes('.nlsb-topbar-cell')) {
      out.push({ sel, body: src.slice(open + 1, close) });
    }
    at = src.indexOf(NEEDLE, close > at ? close : at + NEEDLE.length);
  }
  return out;
}

describe('★レーンのアバター寸法は変数で持つ(3画面の直書きを禁じる)', () => {
  it('★対象3画面すべてが寸法変数を定義している', () => {
    const hit = LANE_CSS_FILES.filter((f) => {
      const src = read(f);
      return /--nl-lane-avatar\s*:/.test(src) && /--nl-lane-avatar-anon\s*:/.test(src);
    });
    // ★件数で断言する([[wiring-test-must-assert-counts-2026-08-04]])。
    expect(hit.length).toBe(LANE_CSS_FILES.length);
  });

  it('★アバター寸法に直書きpxが1つも残っていない(これが本体)', () => {
    /** @type {string[]} */
    const offenders = [];
    for (const f of LANE_CSS_FILES) {
      for (const { sel, body } of laneAvatarRules(read(f))) {
        if (/(?:^|[\s;])(?:width|height)\s*:\s*\d+px/.test(body)) {
          offenders.push(`${f}: ${sel.slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('★各画面にレーンのアバター規則が実在する(走査0件を緑にしない)', () => {
    // ★セレクタ名を変えられて「0件だから直書きも0件」で緑になる穴を塞ぐ。
    for (const f of LANE_CSS_FILES) {
      expect(laneAvatarRules(read(f)).length).toBeGreaterThan(0);
    }
  });
});

describe('★hollow(枠だけタイル)は寸法を手計算しない', () => {
  /*
   * hollow は「中身が入った瞬間に寸法が動かない」ことが存在理由。
   * 以前は popup 25px(=22+3) / live-view 29px(=26+3) と★手計算で結合しており、
   * live-view.html のコメントが
   *   「寸法を popup からコピーすると中身が入った瞬間に 4px ずれてスクロールが飛ぶ」
   * と警告していた。calc で導出すれば、この地雷は構造的に踏めない。
   */
  const HOLLOW_FILES = LANE_CSS_FILES.filter((f) => read(f).includes('nl-story-userlane-cell--hollow'));

  it('hollow を持つ画面が実在する(走査0件を緑にしない)', () => {
    expect(HOLLOW_FILES.length).toBeGreaterThan(0);
  });

  it('★hollow の寸法が匿名アバター変数から calc で導出されている', () => {
    const bad = HOLLOW_FILES.filter((f) => {
      const src = read(f);
      const i = src.indexOf('.nl-story-userlane-cell--hollow');
      const block = src.slice(i, i + 900);
      return !/width:\s*calc\(var\(--nl-lane-avatar-anon\)/.test(block);
    });
    expect(bad).toEqual([]);
  });
});

describe('★後列(25人目以降の匿名)を大きくしない — 63%減の防衛', () => {
  /*
   * v0.1.1376 が「25人目以降の匿名はアイコンのみ」で
   * ★実測 1,615px → 598px(63%減) を達成した(popup.html の同名ブロックに根拠)。
   * 後列を大きくするとこの成果が消える。
   * 実測(332人・後列308人): 22px→28px で後列が +62%、48px なら約4倍。
   */
  it('後列の寸法が前列の 0.6 倍以下に保たれている', () => {
    for (const f of LANE_CSS_FILES) {
      const src = read(f);
      // 各画面で最後に宣言された値（inline 上書きを含む）を採る。
      const front = [...src.matchAll(/--nl-lane-avatar\s*:\s*(\d+)px/g)].map((m) => Number(m[1]));
      const anon = [...src.matchAll(/--nl-lane-avatar-anon\s*:\s*(\d+)px/g)].map((m) => Number(m[1]));
      expect(front.length).toBeGreaterThan(0);
      expect(anon.length).toBeGreaterThan(0);
      const maxFront = Math.max(...front);
      const maxAnon = Math.max(...anon);
      expect(maxAnon).toBeLessThanOrEqual(maxFront * 0.6);
    }
  });
});
