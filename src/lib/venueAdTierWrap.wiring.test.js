import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 広告段の器の見た目(v0.1.1652・ユーザー決定「ギフトが上」=ギフトだけが金色カード・広告は飾りなし)。
 *   popup と別窓(live-view)は、ギフト段が `…tier-wrap--gift`(金色カード)・広告段が `…tier-wrap--ad`(CSS 規則なし=飾りなし)。
 *   会場だけ v0.1.1047 から広告段にも --gift を付けていて、広告がギフトと同格の金色に見え、内幅も popup より14px狭かった
 *   (実測: 会場の広告段 laneW=wrapW−14px / popup は laneW=wrapW)。
 *   面の差を宣言する検査(laneCssSync.parity.test.js)は CSS のセレクタ集合しか見ず、DOM にどのクラスを付けるかは見ない=この差は素通りしていた。
 *   ここで【会場が広告段に付けるクラス】を固定する。金色にする方針に変えるなら、popup.html / app/live-view.html / 会場の SYNC 区間の
 *   3か所へ `--ad` 規則を同時に足し、このテストも意図的に直すこと。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const venue = read('src/extension/venueBar.js');
const count = (src, needle) => src.split(needle).length - 1;

describe('会場の段の器(ギフトだけ金色・広告は飾りなし)', () => {
  it('★広告段の器は --ad(popup/別窓と同じ)', () => {
    expect(venue).toContain("const adWrap = makeWrap('nl-story-userlane-tier-wrap--ad');");
  });

  it('★ギフト段の器は --gift(金色カード・従来どおり)', () => {
    expect(venue).toContain("const giftWrap = makeWrap('nl-story-userlane-tier-wrap--gift');");
  });

  it('★--gift を付ける makeWrap はギフト段の1回だけ(広告に金色を戻さない)', () => {
    expect(count(venue, "makeWrap('nl-story-userlane-tier-wrap--gift')")).toBe(1);
  });

  it('★popup と別窓の広告段は --ad を付ける(会場と揃える相手側の前提)', () => {
    expect(read('extension/popup.html')).toContain('nl-story-userlane-tier-wrap nl-story-userlane-tier-wrap--ad');
    expect(read('app/live-view.html')).toContain('nl-story-userlane-tier-wrap nl-story-userlane-tier-wrap--ad');
  });

  it('★--ad にはどの面にも CSS 規則が無い(=飾りなし)。金色にする方針に変えるなら3か所同時に足し、このテストを直す', () => {
    const rule = /\.nl-story-userlane-tier-wrap--ad\s*\{/;
    expect(rule.test(read('extension/popup.html'))).toBe(false);
    expect(rule.test(read('app/live-view.html'))).toBe(false);
    expect(rule.test(venue)).toBe(false);
  });
});
