import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOAK_FAILSAFE_FIRED_FLAG } from './cloakFailsafeMarker.js';

/**
 * ★v0.1.1381(黒画面8版目)の配線テスト。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * この版の位置づけ(正本 = docs/handoff/sidepanel-black-council-MINUTES.md)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 黒画面には既に**7版**を費やして直っていない。8版目を推測で出さないために会議にかけ、
 * 会議が私(司令塔)の診断を実コードで訂正し、真因が確定した:
 *
 *     観測格子の 0〜12000ms の点数 = 16 / 速報の「窓0x0」の点数 = 16  ← 一致
 *     予定 12000ms のサンプルの実発火時刻 = 14574ms
 *     ＝イベントループ遅延 2,574ms ＝【メインスレッドが止まっていた】
 *
 * ★窓0x0・幕の残留・シェードの残留は**すべて下流**。
 *   よってこの版は「黒が消える」版ではない。直すのは
 *   【コードで確定済みのバグ2件】と【レジームを見分ける計器1件】だけ。
 *
 * ★合否は2レジームに分けて判定する(これを守らないと9版目の空振りになる):
 *   - 遅延 < 1000ms(健全) … 幕/シェードの短縮で判定してよい
 *   - 遅延 ≥ 1000ms(凍結) … この版の守備範囲外。黒が残っても「外れ」と呼ばない
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

const panelSrc = read('src/extension/sidepanel-entry.js');
const popupSrc = read('src/extension/popup-entry.js');
const failsafeSrc = read('src/extension/cloak-failsafe-entry.js');

describe('① 幕(cloak)の判定を外部保険と本体で共有する', () => {
  it('★外部保険は「外した」印を立てる(知識でなく判定を共有する)', () => {
    expect(failsafeSrc).toContain("from '../lib/cloakFailsafeMarker.js'");
    // ★tsc 用のキャストが前置され改行も入るので、`window` 直後や1行での固定はしない
    //   (定数経由で true を代入していることだけを見る)。
    expect(failsafeSrc).toMatch(/\(window\)\)?\[\s*CLOAK_FAILSAFE_FIRED_FLAG\s*\]\s*=\s*true;/);
  });

  it('★印は removeAttribute の【後】に立てる(失敗したのに「外した」と嘘をつかない)', () => {
    const removeIdx = failsafeSrc.indexOf("removeAttribute('data-nl-popup-primary-cloak')");
    // ★キャストで改行が入るので、代入は正規表現で位置を採る(素の indexOf だと -1 になる)。
    const flagIdx = failsafeSrc.search(/\[\s*CLOAK_FAILSAFE_FIRED_FLAG\s*\]\s*=\s*true;/);
    expect(removeIdx).toBeGreaterThan(-1);
    expect(flagIdx).toBeGreaterThan(removeIdx);
  });

  it('★本体は印を読んで幕を付け直さない(=配線されている)', () => {
    expect(popupSrc).toContain("from '../lib/cloakFailsafeMarker.js'");
    // ensurePopupPrimaryCloakedBeforeFirstReveal の中で判定していること。
    const fn = popupSrc.slice(
      popupSrc.indexOf('function ensurePopupPrimaryCloakedBeforeFirstReveal()'),
      popupSrc.indexOf('function revealPopupPrimaryOnce()')
    );
    expect(fn).toContain('hasCloakFailsafeFired');
    // ★印があるときは「何もしない」ではなく revealPopupPrimaryOnce() へ倒す
    //   (何もしないだけだと本体のフラグが立たず、次の refresh でまた付け直す)。
    expect(fn).toMatch(/hasCloakFailsafeFired\([^)]*\)\)\s*\{\s*revealPopupPrimaryOnce\(\);/);
  });

  it('★鍵の名前を両側に直書きしない(綴りがずれたら黙って共有が切れる)', () => {
    // 定数経由であること＝生文字列が両エントリに現れない。
    expect(failsafeSrc).not.toContain(`'${CLOAK_FAILSAFE_FIRED_FLAG}'`);
    expect(popupSrc).not.toContain(`'${CLOAK_FAILSAFE_FIRED_FLAG}'`);
  });
});

describe('② シェードの締切を「初回可視」起点にする', () => {
  it('★5秒待ってから2.5秒を開始する旧実装(最短7.5秒)が消えている', () => {
    // 旧: setTimeout(() => { if (INLINE_MODE) dismissInlineShadeWhenDataReady(...) }, 5000)
    expect(popupSrc).not.toMatch(
      /setTimeout\(\(\) => \{\s*if \(INLINE_MODE\) \{\s*dismissInlineShadeWhenDataReady/
    );
  });

  it('INLINE_MODE は可視起点でアームする', () => {
    expect(popupSrc).toMatch(/if \(INLINE_MODE\) \{\s*armInlineShadeDeadlineOnFirstVisible\(\);/);
    expect(popupSrc).toContain('function armInlineShadeDeadlineOnFirstVisible()');
  });

  it('★画面外(prewarm)では締切を始めない=見えた瞬間に始める', () => {
    const fn = popupSrc.slice(
      popupSrc.indexOf('function armInlineShadeDeadlineOnFirstVisible()'),
      popupSrc.indexOf('function armInlineShadeDeadlineOnFirstVisible()') + 1200
    );
    expect(fn).toContain("document.visibilityState === 'visible'");
    expect(fn).toContain('visibilitychange');
    // 二重アーム防止(見えるたびに締切が延びない)。
    expect(fn).toContain('inlineShadeVisibleDeadlineArmed');
  });

  it('★再入時に既存タイマーを掃除する(古い interval が回り続けない)', () => {
    const fn = popupSrc.slice(
      popupSrc.indexOf('function dismissInlineShadeWhenDataReady(fallbackMs)'),
      popupSrc.indexOf('let inlineShadeVisibleDeadlineArmed')
    );
    // データ有りの早期 return より後・タイマー設置より前に掃除が入っていること。
    const clearIdx = fn.indexOf('clearInlineShadeDataWaiters();\n  const cap');
    expect(clearIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeLessThan(fn.indexOf('setInterval('));
  });
});

describe('③ タイマー遅延(=イベントループ停止)を速報に出す', () => {
  it('観測列に予定時刻 sched を積んでいる', () => {
    /*
     * ★v0.1.1383: `Number.isFinite(Number(schedMs))` は **null を弾けない**
     *   (`Number(null)===0` は finite)。旧式だと late/visible/reload が
     *   「予定0msの点」になり、実機で12,750,002msという巨大な嘘を報告した。
     *   ★null を先に落とす形であることまで固定する(旧式に戻ったら赤)。
     */
    expect(panelSrc).toMatch(/sched: schedMs == null \|\| !Number\.isFinite\(Number\(schedMs\)\)/);
    expect(panelSrc).not.toMatch(/sched: Number\.isFinite\(Number\(schedMs\)\)/);
  });

  it('★観測系列が有界(パネルを開きっぱなしでも伸び続けない)', () => {
    expect(panelSrc).toContain('trimObservationSeries(_sizeSeries)');
    expect(panelSrc).toContain('trimObservationSeries(_cloakSeries)');
    // ★起動直後の格子は温存する(黒は起動直後に出るので頭を捨ててはいけない)。
    expect(panelSrc).toMatch(/arr\.length = SERIES_HEAD_KEEP;/);
  });

  it('★タイマー格子の各点が予定時刻を渡している(渡さないと永久に測れない)', () => {
    expect(panelSrc).toMatch(/collectAndPublish\(ms === 0 \? 'immediate' : `t\+\$\{ms\}ms`, ms\)/);
  });

  it('★速報の行に実際に出る(計器を足したら出力に現れるか確認する)', () => {
    expect(panelSrc).toContain('summarizeEventLoopStall');
    expect(panelSrc).toMatch(/const stallNote = stall\.observed > 0 \? ` \/ \$\{stall\.line\}` : '';/);
    // ★line の両分岐(flashed / 通常)の【両方】に入っていること。
    //   片方だけだと「黒かったときだけ出る/出ない」が起きて合否が読めない。
    const lines = panelSrc.match(/^\s*(\? |: )`\$\{(worst\.verdict|verdict)\.line\}.*$/gm) || [];
    expect(lines.length).toBe(2);
    for (const l of lines) expect(l).toContain('${stallNote}');
  });

  it('★保存にも残す(次のセッションが生値を読み直せる)', () => {
    expect(panelSrc).toMatch(/eventLoopStall: stall,/);
  });
});
