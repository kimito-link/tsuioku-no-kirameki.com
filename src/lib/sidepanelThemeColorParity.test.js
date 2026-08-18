import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sidepanelHtml = readFileSync(join(root, 'extension/sidepanel.html'), 'utf8');
const popupHtml = readFileSync(join(root, 'extension/popup.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));

/**
 * ★パネルの地色が複数箇所でずれないことを機械で固定する。
 *
 * ■ このファイルの来歴（★同じ穴に落ちないために残す）
 *   v0.1.1310 で「黒画面は Chrome がパネル枠を暗色で塗っているせい」という前提のもと、
 *   theme-color / manifest.theme_color を足し、その一致を守る検査としてこれを作った。
 *   その前提は【測る前の推測】で、2026-08-10 の画面録画フレーム解析(219フレーム)が否定した:
 *     〜4.65秒 : (94,94,94)    ← ニコ生のページ。パネルはまだ開いていない
 *      4.70秒 : (255,255,255) ← パネルが開いた瞬間＝【白】
 *      4.90秒 : (251,249,245) ← 拡張の HTML(クリーム色)
 *   ＝「ぬーと出る黒」は拡張の外側(ニコ生のページ)で、拡張が塗る領域に黒い瞬間は無い。
 *   v0.1.1312 で theme-color を撤去し、この検査からも該当の断言を外した。
 *
 * ■ ただし下の2件は【前提が誤りでも生き残る本物】なので救出して残す
 *   (計器の検査を消すとき、中に紛れた実挙動の断言を一緒に捨てない)。
 */
const EXPECTED = '#fffaf2';

describe('パネルの地色の一致', () => {
  /*
   * ★v0.1.1311(2026-08-10): manifest の `theme_color` は【拡張では認識されない】。
   *   一度これを追加して実機で
   *     Unrecognized manifest key 'theme_color'.
   *   の警告を出した(拡張カードに黄色い「警告」ボタンが付く)。
   *   Chrome 拡張の manifest は許可キーのみ受理する＝Web App Manifest とは別物。
   *   ★確認せずに追加した私の誤り。以後、増やしたキーは実機の警告まで見ること。
   *   ＝これは実際に出荷して警告を出した実績のある回帰なので、前提の誤りとは無関係に残す。
   */
  it('★manifest.json に theme_color を入れない(拡張では未対応キー＝警告になる)', () => {
    expect(manifest.theme_color).toBeUndefined();
  });

  /*
   * ★この2件が守っているのは v0.1.1299 の【実測で効果を確認した】修正:
   *   <html> を DOCTYPE の直後(1行目)に置き、インライン背景でパース直後から地を塗る。
   *   sidepanel.html(入れ物)と popup.html(中身)は別文書で CSS 変数を共有できないため、
   *   色は手で二重に書くしかない＝機械で一致を固定する必要がある。
   *   (「3箇所とも直すこと」とコメントに書いてあったのに実際ずれた実績がある)
   */
  it('sidepanel.html の <html> インライン背景が既定色', () => {
    const m = sidepanelHtml.match(/<html[^>]*style="[^"]*background(?:-image)?:\s*linear-gradient\([^)]*?(#[0-9a-f]{6})/i);
    expect(m, '<html> のインライン背景が読めること').toBeTruthy();
    expect(m[1].toLowerCase()).toBe(EXPECTED);
  });

  it('popup.html(中身)の <html> インライン背景とも同じ色', () => {
    const m = popupHtml.match(/<html[^>]*style="[^"]*background(?:-image)?:\s*linear-gradient\([^)]*?(#[0-9a-f]{6})/i);
    expect(m, 'popup.html の <html> インライン背景が読めること').toBeTruthy();
    expect(m[1].toLowerCase()).toBe(EXPECTED);
  });

  /*
   * ★撤去したものが「よかれと思って」戻らないようにする碑。
   *   theme-color は実測で効果を否定済み(v0.1.1311 を入れた状態で撮った動画でも
   *   開いた瞬間の白 0.2 秒は残っていた)。戻すなら先に仕様の裏取りをすること。
   */
  it('★sidepanel.html に theme-color を戻さない(効果を実測で否定済み)', () => {
    expect(sidepanelHtml).not.toMatch(/<meta\s+name="theme-color"/);
  });
});
