import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentSrc = fs
  .readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * ★v0.1.1278: 旧「二分実験の配線」から【実挙動の断言】へ書き換えた。
 *
 *   経緯: v0.1.1263 で「autoshow_off が点滅の犯人か」を確かめる二分実験を入れ、
 *   実測で【無罪】と確定した(実験中も消失は起きた)。実験フラグ
 *   INLINE_AUTOSHOW_HIDE_EXPERIMENT は恒久 false のまま残り、
 *   実効条件は !_inlineHostEverShown だけになっていた=フラグは死んだ分岐。
 *   点滅自体は Side Panel 移行(v0.1.1275)で解決済み。
 *
 *   ★ここで守るのは実験ではなく【v0.1.1274 の everShown ガード】。
 *     「一度でも表示したら autoshow_off では消さない」は実挙動であり、
 *     フラグ撤去後も壊してはいけない。
 */
describe('autoshow_off で消す経路のガード', () => {
  it('★一度でも表示したら autoshow_off では消さない(v0.1.1274 の実挙動)', () => {
    /*
     * 実測(2026-08-06)で、消える直前の足跡が
     *   show:anchored_show → hide:autoshow_off → hide:overlay_hidden → disp:none
     * となっており【出した直後に自分で消していた】(autoshow_off が28回)。
     * 純関数側の everShown 判定に依存せず、ここでも直接ガードする。
     * ★初回(everShown=false)は従来どおり消えるので
     *   「こん太を押すまで出さない」は壊れない。
     */
    expect(contentSrc).toMatch(
      /if \(!_inlineHostEverShown\) \{\n\s*hidePageFrameOverlay\('autoshow_off'\);/
    );
  });

  it('★消す処理は1箇所だけ(囲いの外に増やさない)', () => {
    const calls = contentSrc.match(/hidePageFrameOverlay\('autoshow_off'\)/g) || [];
    expect(calls.length).toBe(1);
  });

  it('★終了した実験の残骸が戻っていない(フラグも実験タグも復活させない)', () => {
    expect(contentSrc).not.toContain('INLINE_AUTOSHOW_HIDE_EXPERIMENT');
    expect(contentSrc).not.toContain('autoshow_off_experiment_skipped');
  });

  it('他の消す経路には手を入れていない(ガードの範囲を広げない)', () => {
    for (const tag of ['not_top_frame', 'not_watch_url', 'toolbar_close', 'left_watch_page']) {
      expect(contentSrc).toContain(`hidePageFrameOverlay('${tag}')`);
    }
  });
});
