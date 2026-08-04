import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const contentSrc = fs.readFileSync(path.join(root, 'extension/content-entry.js'), 'utf8');

/**
 * v0.1.1250(2026-08-04): 4秒周期のパネル消失を断つ配線と、それを名指しする計器の断言。
 *
 * ★実測(画面録画・30fps): frame 106/226/345 で消失。間隔きっかり120フレーム=4.000秒。
 *   33msだけ消えて即復帰。幅 920px→11px に潰れる。前後フレームは変化0.0%(完全静止)。
 * ★既存2計器はこれを取りこぼしていた(hostMoveDiag=移設のみ / scrollWhiteout=scroll時のみ)。
 */
describe('host flip census + 4s repaint gate wiring', () => {
  it('★中核: 4秒経路(syncLiveIdFromLocation)が無条件描画をやめている', () => {
    // 配信切替 or geometry変化のときだけ描く。無条件 renderPageFrameOverlay は復活させない。
    expect(contentSrc).toMatch(
      /\n\s*if \(ctx\.liveIdSwitched \|\| inlineLayoutDirty\) \{\n\s*inlineLayoutDirty = false;\n\s*renderPageFrameOverlay\(\);\n\s*\}/
    );
    // 旧実装(_nonWatchTickCount リセット直後の無条件呼び出し)が戻っていないこと。
    expect(contentSrc).not.toMatch(
      /_nonWatchTickCount = 0;\n\s*renderPageFrameOverlay\(\);/
    );
  });

  it('計器を import して state を作っている', () => {
    expect(contentSrc).toContain("from '../lib/hostVisibilityFlipCensus.js'");
    expect(contentSrc).toMatch(/const _hostFlipCensus = createHostVisibilityFlipCensus\(\);/);
  });

  it('★display の書き換えが1関数に集約され、直接代入が残っていない', () => {
    // 直接代入が1つでも残っていると、その経路の消失は永久に計上されない。
    expect(contentSrc).toMatch(/function setInlineHostDisplay\(host, display, cause\) \{/);

    // ★v0.1.1252: 旧テストは /host\.style\.display/ と【変数名】で探しており、
    //   `hostEarly.style.display = 'none'`(5503行)を見逃していた。実配信で
    //   scrollWhiteoutDiag が hostDisplay:"none" を捕らえたのに hostFlipCensus が
    //   0回だった真因がこれ。→ 変数名に依存せず「host で始まる識別子」を全部見る。
    const lines = contentSrc.split(String.fromCharCode(10));
    const offenders = [];
    lines.forEach((ln, i) => {
      const m = /\b(host[A-Za-z0-9_]*)\.style\.display\s*=/.exec(ln);
      if (!m) return;
      // 集約関数の内部(host.style.display = display)だけが唯一の正当な代入。
      if (/\.style\.display\s*=\s*display;/.test(ln)) return;
      offenders.push(`${i + 1}: ${ln.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it('★集約関数が「状態が変わったときだけ」計上する(水増ししない)', () => {
    const idx = contentSrc.indexOf('function setInlineHostDisplay(');
    const body = contentSrc.slice(idx, idx + 700);
    expect(body).toMatch(/const prev = host\.style\.display;/);
    expect(body).toMatch(/if \(prev === display\) return;/);
    expect(body).toMatch(/if \(display === 'none'\) noteHostHidden\(/);
    expect(body).toMatch(/else noteHostShown\(/);
  });

  it('★9つの経路すべてに固有タグが付いている(犯人を名指しするため)', () => {
    for (const tag of [
      'host_created', 'floating_show', 'dock_show', 'first_paint_gate',
      'video_rect_too_small', 'anchored_show', 'nonvideo_show',
      'overlay_hidden', 'prewarm_offscreen'
    ]) {
      expect(contentSrc).toContain(`setInlineHostDisplay(host, `);
      expect(contentSrc).toContain(`'${tag}'`);
    }
    // タグ未設定のプレースホルダが残っていないこと。
    expect(contentSrc).not.toContain('__HOSTDISP_TAG__');
  });

  it('診断payloadに通っている(通さないと速報に永久に出ない)', () => {
    expect(contentSrc).toMatch(/hostFlipCensus: snapshotHostVisibilityFlipCensus\(_hostFlipCensus\)/);
  });
});
