import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentSrc = fs
  .readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * ★v0.1.1263 二分実験の配線断言。
 *   会議(4体・全員一致)「特定より先に止まるか否かを確かめよ」に基づく一時的な実験。
 *   ここで断言するのは「実験が実際に効いていること」と「畳み忘れを検出できること」。
 */
describe('autoshow_off 二分実験の配線', () => {
  it('実験フラグが定義されている', () => {
    expect(contentSrc).toMatch(/const INLINE_AUTOSHOW_HIDE_EXPERIMENT = (true|false);/);
  });

  it('★一度でも表示したら autoshow_off では消さない(点滅の直接原因を断つ)', () => {
    /*
     * ★v0.1.1274 で条件を強化した。
     *   実測(2026-08-06)で、消える直前の足跡が
     *     show:anchored_show → hide:autoshow_off → hide:overlay_hidden → disp:none
     *   となっており【出した直後に自分で消していた】(autoshow_off が28回)。
     *   純関数側の everShown 判定に依存せず、ここでも直接ガードする。
     *   ★初回(everShown=false)は従来どおり消えるので
     *     「こん太を押すまで出さない」は壊れない。
     */
    expect(contentSrc).toMatch(
      /if \(!INLINE_AUTOSHOW_HIDE_EXPERIMENT && !_inlineHostEverShown\) \{\n\s*hidePageFrameOverlay\('autoshow_off'\);/
    );
  });

  it('★消す処理が囲いの外に残っていない(素通りで消えたら実験にならない)', () => {
    const calls = contentSrc.match(/hidePageFrameOverlay\('autoshow_off'\)/g) || [];
    expect(calls.length).toBe(1);
  });

  it('★判定は記録する(消さなくても計器は動く=何回通ったか分かる)', () => {
    expect(contentSrc).toMatch(
      /\n\s*noteInlineHostHideReason\('autoshow_off_experiment_skipped'\);/
    );
    // 記録が条件で無効化されていないこと。
    expect(contentSrc).not.toMatch(/if \([^)]*\) noteInlineHostHideReason\('autoshow_off_experiment/);
  });

  it('★記録は消す判定より前にある(消す前に必ず数える)', () => {
    const note = contentSrc.indexOf("noteInlineHostHideReason('autoshow_off_experiment_skipped')");
    const hide = contentSrc.indexOf("hidePageFrameOverlay('autoshow_off')");
    expect(note).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(-1);
    expect(note).toBeLessThan(hide);
  });

  it('★実験は畳まれている(実測で autoshow_off は無罪と確定した)', () => {
    // 実験中(消さないようにした状態)でも消失6回 = このゲートは犯人ではない。
    expect(contentSrc).toContain('const INLINE_AUTOSHOW_HIDE_EXPERIMENT = false;');
    const i = contentSrc.indexOf('const INLINE_AUTOSHOW_HIDE_EXPERIMENT');
    const around = contentSrc.slice(Math.max(0, i - 400), i + 100);
    expect(around).toMatch(/無罪|実験は終了/);
  });

  it('他の消す経路には手を入れていない(実験の範囲を広げない)', () => {
    for (const tag of ['not_top_frame', 'not_watch_url', 'toolbar_close', 'left_watch_page']) {
      expect(contentSrc).toContain(`hidePageFrameOverlay('${tag}')`);
    }
  });
});
