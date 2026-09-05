import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * ★診断ページへの popup 埋め込みの配線ガード（2026-08-31）。
 *
 * ■ なぜ要るか
 *   この機能は v0.1.917 で「勝手に別配信タブを開く」【疑い】で緊急停止された。
 *   ★だが真因は別で、v0.1.919 で確定している(git 履歴):
 *     「拡張起動の瞬間に毎回違う配信が裏タブで複数開く症状の正体は
 *       background.js の autopatrol(自動巡回)」
 *   ＝ popup 埋め込みは【無実】で、巻き添えで止まったまま2年近く残っていた。
 *
 * ★このテストが守るのは「再開してよい」と言える【根拠そのもの】。
 *   根拠が崩れたら赤くする。根拠は3つ:
 *     ① 真因(autopatrol)の封じが今も生きている
 *     ② 埋め込みは受動ビュー(書かない/注入しない/fetch しない)で開く
 *     ③ popup がタブを開く経路は全部クリック起点(勝手に発火しない)
 */

/** @param {string} rel */
function read(rel) {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
}

const statusSrc = read('src/extension/status-entry.js');
const backgroundSrc = read('extension/background.js');
const flagsSrc = read('src/lib/inlineModeFlags.js');
const popupSrc = read('src/extension/popup-entry.js');

describe('★埋め込みを再開してよい根拠が生きているか', () => {
  it('★根拠①: 真因だった autopatrol は今も封じられている', () => {
    /*
     * ★v0.1.919 の真因。ここが false に戻ると「勝手にタブが開く」が復活する。
     *   ★もし実機でまた勝手にタブが開いたら、埋め込みより先にここを疑うこと。
     */
    expect(backgroundSrc).toMatch(/const AUTOPATROL_KILL_SWITCH = true;/);
    // kill switch が getAutopatrolEnabled の先頭で効いていること（宣言だけで使われていない穴を塞ぐ）。
    const at = backgroundSrc.indexOf('async function getAutopatrolEnabled');
    expect(at).toBeGreaterThan(0);
    expect(backgroundSrc.slice(at, at + 220)).toMatch(/if \(AUTOPATROL_KILL_SWITCH\) return false;/);
  });

  it('★根拠②: 埋め込みは受動ビュー(dock=status)で開く', () => {
    // 受動ビュー = 書かない/注入しない/fetch しない（inlineModeFlags.js の定義）。
    expect(flagsSrc).toMatch(/passive: inline && \(dock === 'status' \|\| dock === 'liveview'\)/);
    // status 側が dock=status を焼いていること。
    const at = statusSrc.indexOf('function ensureStatusPopupIframe');
    expect(at).toBeGreaterThan(0);
    expect(statusSrc.slice(at, at + 2000)).toMatch(/set\('dock', 'status'\)/);
  });

  it('★根拠③: popup がタブを開く経路は勝手に発火しない', () => {
    /*
     * ★`chrome.tabs.create` は存在してよい。問題は「クリック無しで呼ばれるか」。
     *   ここでは「受動ビューでは storage へ書かない」ガードが実在することを固定する
     *   （書き込み・注入・fetch を止める経路が生きていれば、受動ビューは副作用を持たない）。
     */
    expect(popupSrc).toMatch(/const INLINE_PASSIVE = _inlineFlags\.passive;/);
    expect(popupSrc).toMatch(/if \(INLINE_PASSIVE\) return/);
  });
});

describe('★kill switch は残っている（戻せること）', () => {
  it('フラグが1箇所で定義され、false なら iframe を出さない分岐がある', () => {
    expect(statusSrc).toMatch(/const STATUS_POPUP_EMBED_ENABLED = (true|false);/);
    // ★false のときに「隠す＋iframe除去」まで行う分岐が残っていること（戻し方が生きている）。
    const at = statusSrc.indexOf('if (!STATUS_POPUP_EMBED_ENABLED)');
    expect(at).toBeGreaterThan(0);
    const block = statusSrc.slice(at, at + 500);
    expect(block).toMatch(/section\.hidden = true/);
    expect(block).toMatch(/remove\(\)/);
  });

  it('★経緯がコメントに残っている（次の人が同じ調査をやり直さないため）', () => {
    // ★「疑いで止めた／真因は別だった」を読めること。
    //   これが無いと、次の人はまた git 履歴を掘り直す（実際に今回それをやった）。
    const at = statusSrc.indexOf('const STATUS_POPUP_EMBED_ENABLED');
    const head = statusSrc.slice(Math.max(0, at - 2600), at);
    expect(head).toMatch(/v0\.1\.919/);
    expect(head).toMatch(/autopatrol/);
  });
});

describe('★会場モードの埋め込み（v0.1.1500）', () => {
  it('venue.html?lv= を iframe で出す配線がある', () => {
    expect(statusSrc).toMatch(/function ensureStatusVenueIframe/);
    const at = statusSrc.indexOf('function ensureStatusVenueIframe');
    const block = statusSrc.slice(at, at + 2500);
    expect(block).toMatch(/getURL\('venue\.html'\)/);
    expect(block).toMatch(/searchParams\.set\('lv', lv\)/);
    // ★描画ループから呼ばれていること（関数を作っただけで配線漏れ、を防ぐ）。
    expect(statusSrc).toMatch(/safeSection\('会場埋め込み'/);
  });

  it('★kill switch と戻し方がある', () => {
    expect(statusSrc).toMatch(/const STATUS_VENUE_EMBED_ENABLED = (true|false);/);
    const at = statusSrc.indexOf('if (!STATUS_VENUE_EMBED_ENABLED)');
    expect(at).toBeGreaterThan(0);
    const block = statusSrc.slice(at, at + 500);
    expect(block).toMatch(/section\.hidden = true/);
    expect(block).toMatch(/remove\(\)/);
  });

  it('★lv が無いときは出さない（死に画面を作らない）', () => {
    const at = statusSrc.indexOf('function ensureStatusVenueIframe');
    const block = statusSrc.slice(at, at + 2500);
    expect(block).toMatch(/if \(!lv\)/);
  });

  it('★署名ガードがある（同じ配信で作り直さない＝チラつき/重さ防止）', () => {
    expect(statusSrc).toMatch(/_lastStatusVenueEmbedSrc/);
    const at = statusSrc.indexOf('function ensureStatusVenueIframe');
    const block = statusSrc.slice(at, at + 2500);
    expect(block).toMatch(/if \(src === _lastStatusVenueEmbedSrc\)/);
  });

  it('★載せてよい根拠: 会場から 3D 変形が消えている', () => {
    /*
     * ★過去に「会場は 3D変形で可視判定が崩れるので載せられない」と判断していたが、
     *   その 3D は v0.1.1047 で撤去済みだった（前提だけが残っていた）。
     *   ★もし 3D が戻ったら、この判断は成り立たなくなるので赤くする。
     *   （この型の記録: _docs/KB-stale-premise.md）
     */
    const venueSrc = read('src/extension/venueBar.js');
    expect(venueSrc).not.toMatch(/perspective\s*:/);
    expect(venueSrc).not.toMatch(/translateZ\(/);
    expect(venueSrc).not.toMatch(/transform-style\s*:/);
  });

  it('★status 側の DOM を増やさない（会場UIは iframe の中が作る）', () => {
    // status.html に会場用の受け皿は「箱1つ」だけ。席やタイルの DOM を持ち込まない。
    const html = read('extension/status.html');
    expect(html).toMatch(/id="statusVenueEmbedHost"/);
    expect(html).not.toMatch(/nlsb-seat/);
  });
});
