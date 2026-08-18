import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * サイドパネルに配信ID(lv)を渡す経路の【配線】検査。
 *
 * ■ なぜ要るか(2026-08-18 実機で真因確定)
 *   状態速報: 🔴 描画関数が一度も呼ばれていません
 *             laneTickProbe: lidMiss=4 / lidFromInline=0 / lidFromSnapshot=0 /
 *                            lidFromLastPainted=0
 *
 *   v0.1.1419 は「パネル内ボタン」経路にだけ ?lv= を焼いていた。
 *   ★サイドパネルを開く入口は【2つ】あり、
 *     ②ツールバーのアイコン(chrome.action.onClicked)は素の 'sidepanel.html' のままだった。
 *   ＝いちばん普通の開き方をすると必ずレーンが描かれない状態が残っていた。
 *
 * ★このテストは「入口の数」を固定する。入口が増えたのに lv を焼き忘れたら赤にする
 *   ([[wiring-test-must-assert-counts-2026-08-04]]: 配線が複数箇所なら数で断言する)。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('サイドパネルへの lv 受け渡し', () => {
  /*
   * ★v0.1.1439: 入口が【2つ→ 3つ】になった。
   *   ①パネル内ボタン ②ツールバーアイコン ③★事前用意(watchページを開いた時)
   *   ③は「押される前に path を確定させておく」ためのもの。
   *   SWが寝ている/詰まっているとパネルがなかなか出ない問題への対策。
   *   ★数を固定し続ける意味: 入口が増えたのに lv を焼き忘れたら赤にする。
   */
  it('★setOptions で path を設定する箇所は【3つ】(パネル内ボタン / ツールバー / 事前用意)', () => {
    const code = stripComments(read('extension/background.js'));
    const hits = code.match(/setOptions\s*\(/g) || [];
    expect(hits.length).toBe(3);
  });

  it('★どの setOptions も、lv が取れたら ?lv= を焼く(素の sidepanel.html で終わらせない)', () => {
    const code = stripComments(read('extension/background.js'));
    // `sidepanel.html?lv=${...}` の形が2箇所に在ること＝両方の入口が lv を渡す。
    const baked = code.match(/sidepanel\.html\?lv=\$\{/g) || [];
    expect(baked.length).toBe(3);
  });

  it('★ツールバー経路は tab.url から lv を取り出す', () => {
    const code = stripComments(read('extension/background.js'));
    const at = code.indexOf('chrome.action.onClicked');
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at);
    // watch URL から lv を抜く正規表現が在る
    expect(body).toMatch(/\\\/watch\\\/\(lv/);
  });

  /*
   * ★v0.1.1434(実機で自分の目で見て確定した退化の防止):
   *   v0.1.1427 で open() の【あと】に setOptions({path}) を置いてしまい、
   *   パネルが読み込み直しになって Chrome の「読み込み中」表示
   *   (ダークでは黒地に灰色の横縞)が居座った=ユーザー報告の真っ黒の正体。
   *   ★path は open より【先】に確定させる。この順序を機械で固定する。
   */
  it('★setOptions(パス確定) は open より【先】に呼ぶ', () => {
    const code = stripComments(read('extension/background.js'));
    const at = code.indexOf('chrome.action.onClicked');
    const body = code.slice(at, at + 2600);
    const setAt = body.indexOf('setOptions');
    const openAt = body.indexOf('sidePanel.open');
    expect(setAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(-1);
    expect(setAt).toBeLessThan(openAt);
  });

  it('★lv が取れないときは setOptions を呼ばない(無駄な読み込み直しを起こさない)', () => {
    const code = stripComments(read('extension/background.js'));
    const at = code.indexOf('chrome.action.onClicked');
    const body = code.slice(at, at + 2600);
    // if (lvFromTab) { ... setOptions ... } の形で条件つきになっている
    const ifAt = body.indexOf('if (lvFromTab)');
    expect(ifAt).toBeGreaterThan(-1);
    expect(ifAt).toBeLessThan(body.indexOf('setOptions'));
  });

  it('★lv の形式規約は1つ(SIDE_PANEL_LV_RE)を共用する — 片方だけ通る穴を作らない', () => {
    const code = stripComments(read('extension/background.js'));
    const defs = code.match(/const SIDE_PANEL_LV_RE\s*=/g) || [];
    expect(defs.length).toBe(1);
    // 2箇所(パネル内ボタン / ツールバー)から参照される
    const uses = code.match(/SIDE_PANEL_LV_RE\.test\(/g) || [];
    expect(uses.length).toBe(3);
  });

  it('★受け取り側(sidepanel-entry)は iframe に lv を載せ替える', () => {
    const entry = stripComments(read('src/extension/sidepanel-entry.js'));
    expect(entry).toContain('buildSidePanelIframeSrc');
  });
});

describe('★SWを待たない自力解決(v0.1.1435)', () => {
  /*
   * ユーザーの訴え:「サービスワーカーが無効になる確率が多すぎて確認に時間がかかる」
   *              「会場モードはすぐにうごくけど」
   * ＝サイドパネルは SW の onClicked を必ず起こすので、SWが寝ていると待たされる。
   * → ①(?lv=)が空のときだけ、パネル自身が chrome.tabs.query で watchタブを探す。
   */
  it('パネルが自力で lv を探す経路を持つ', () => {
    const entry = stripComments(read('src/extension/sidepanel-entry.js'));
    expect(entry).toContain('pickLvFromTabs');
    expect(entry).toContain('chrome.tabs.query');
  });

  it('★①(?lv=)が在るときは自力探索を走らせない(順序の固定)', () => {
    const entry = stripComments(read('src/extension/sidepanel-entry.js'));
    // else if (!readSidePanelLv(...)) の形 = ①が空のときだけ②へ行く
    expect(entry).toMatch(/else if \(!readSidePanelLv\(/);
    const elseAt = entry.indexOf('else if (!readSidePanelLv(');
    const queryAt = entry.indexOf('chrome.tabs.query');
    expect(elseAt).toBeGreaterThan(-1);
    expect(elseAt).toBeLessThan(queryAt);
  });

  it('★active を条件にしない(裏タブで別タブを掴む事故の再発防止)', () => {
    const lib = stripComments(read('src/lib/sidePanelLvFromTabs.js'));
    // 問い合わせ条件は url だけ
    expect(lib).toContain('SIDE_PANEL_WATCH_TAB_QUERY');
    expect(lib).not.toMatch(/active:\s*true/);
  });

  it('★曖昧(watchタブ複数)なら選ばない= ambiguous を返す', () => {
    const lib = stripComments(read('src/lib/sidePanelLvFromTabs.js'));
    expect(lib).toContain("'ambiguous'");
    expect(lib).toMatch(/found\.size > 1/);
  });

  it('★失敗しても素の src に倒れる(描画をJSに依存させない)', () => {
    // ★コメント内の言及ではなく【実際の呼び出し】を見る(await 付き)
    const entry = stripComments(read('src/extension/sidepanel-entry.js'));
    const at = entry.indexOf('await chrome.tabs.query');
    expect(at).toBeGreaterThan(-1);
    expect(entry.slice(at, at + 500)).toContain('catch');
  });
});
