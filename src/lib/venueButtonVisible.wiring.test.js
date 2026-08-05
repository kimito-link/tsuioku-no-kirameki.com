import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVenueButtonVisible, KEY_VENUE_BUTTON_VISIBLE } from './storageKeys.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');
const popupSrc = read('extension/popup-entry.js');
const popupHtml = fs.readFileSync(
  path.join(root, '..', 'extension/popup.html'), 'utf8'
).replace(/\r\n/g, '\n');

/**
 * v0.1.1271: 「🏟 会場モード」ボタンを出すかの設定。
 *
 * ★ユーザー指摘「開いた瞬間つねに会場モードが有効になっている」の実体は
 *   【ボタンが常時表示されていること】だった(会場の画面自体は閉じて始まっている)。
 * ★設定は「読む・書く・使う」の3点が揃って初めて効く。1つでも欠けると
 *   「トグルは動くのに何も変わらない」という最悪の形になるので、数で固定する。
 */
describe('venueButtonVisible — 既定は表示(安全側)', () => {
  it('未設定・true は表示。false のときだけ隠す', () => {
    expect(isVenueButtonVisible(undefined)).toBe(true);
    expect(isVenueButtonVisible(null)).toBe(true);
    expect(isVenueButtonVisible(true)).toBe(true);
    expect(isVenueButtonVisible(false)).toBe(false);
  });

  it('★既定を「隠す」に倒さない(機能が黙って消えると壊れたと誤解される)', () => {
    // 未知の値でも表示側に倒れること。
    expect(isVenueButtonVisible('x')).toBe(true);
    expect(isVenueButtonVisible(0)).toBe(true);
  });
});

describe('venueButtonVisible — 配線(読む・書く・使う)', () => {
  it('★視聴ページ側: ゲートを通してからボタンを出す', () => {
    expect(contentSrc).toMatch(
      /if \(isWatchInlinePanelTopFrame\(\) && \(await readVenueButtonVisible\(\)\)\) \{\n\s*_venueApi = mountVenueBarButton\(\);\n\s*\}/
    );
    // ゲート無しの裸の呼び出しが残っていないこと(変異で戻したら赤)。
    const bare = contentSrc.match(/\n\s*_venueApi = mountVenueBarButton\(\);/g) || [];
    expect(bare).toHaveLength(1);
  });

  it('★読み取り失敗は「表示」に倒す(黙って消さない)', () => {
    const i = contentSrc.indexOf('async function readVenueButtonVisible(');
    expect(i).toBeGreaterThan(-1);
    const body = contentSrc.slice(i, contentSrc.indexOf('\n}\n', i));
    expect(body).toMatch(/if \(!hasExtensionContext\(\)\) return true;/);
    expect(body).toMatch(/catch \{\n\s*return true;\n\s*\}/);
  });

  it('★popup: 設定キーを storage 読み出しの一覧に入れている', () => {
    // ここに無いと popup を開くたび既定(ON)に見えてしまう(静かな不具合)。
    expect(popupSrc).toMatch(/KEY_VENUE_BUTTON_VISIBLE,\n/);
    /*
     * ★popup 起動時に読む一覧(openBagRaw)に入っていること。
     *   ファイル内に storage.local.get は複数あるので、openBag を作っている
     *   【その呼び出し】を名指しで切り出す(先頭一致だと別の箇所を見てしまう)。
     */
    const anchor = popupSrc.indexOf('const [tabs, lastFocusedNormal, openBagRaw');
    expect(anchor).toBeGreaterThan(-1);
    const getIdx = popupSrc.indexOf('chrome.storage.local.get([', anchor);
    const list = popupSrc.slice(getIdx, popupSrc.indexOf(']', getIdx));
    expect(list).toContain('KEY_VENUE_BUTTON_VISIBLE');
  });

  it('★popup: 保存する(change ハンドラが在る)', () => {
    expect(popupSrc).toMatch(/\[KEY_VENUE_BUTTON_VISIBLE\]: venueBtnToggle\.checked/);
  });

  it('★popup: 現在値を反映する(hydrate)', () => {
    expect(popupSrc).toMatch(
      /venueBtnEl\.checked = isVenueButtonVisible\(openBag\[KEY_VENUE_BUTTON_VISIBLE\]\)/
    );
  });

  it('★HTML にトグルが在り、id が JS と一致している', () => {
    expect(popupHtml).toContain('id="venueButtonVisibleToggle"');
    expect(popupSrc).toContain("$('venueButtonVisibleToggle')");
    // 反映に再読み込みが要ることをユーザーに伝えている。
    expect(popupHtml).toContain('再読み込み');
  });

  it('storage キー名が固定されている(改名で静かに設定が消えない)', () => {
    expect(KEY_VENUE_BUTTON_VISIBLE).toBe('nls_venue_button_visible_v1');
  });
});
