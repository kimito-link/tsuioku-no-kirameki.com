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

/**
 * 関数本体を「次の行頭 `}`」まで切り出す。
 * ★固定文字数(slice(i, i+N))で切ると、関数に行を足しただけで断言が範囲外に落ちて
 *   偽の赤になる(2026-08-05 に実際に発生)。断言すべきは【契約の有無】であって
 *   コードの長さではないので、終端まで見る。
 * @param {string} src @param {string} decl
 */
function fnBody(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const end = src.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? src.slice(i) : src.slice(i, end + 2);
}

describe('host flip census + 4s repaint gate wiring', () => {
  it('★中核: 4秒経路は無条件で描き直す(v0.1.1248 と同じ挙動へ戻した)', () => {
    /*
     * ★v0.1.1273 で断言の向きを【反転】した。
     *
     *   旧: 「ゲートを経てからでないと描かない」ことを固定していた(v0.1.1250〜)
     *   新: 「無条件で描く」ことを固定する(v0.1.1248 と同じ=安定していた版の挙動)
     *
     *   理由: そのゲート自体が事故の原因だった。v0.1.1250 で足した直後の
     *   v0.1.1254 のタイトルが「自分が塞いだ非常口を戻す」で、
     *   4秒経路は【唯一の復帰経路】だったのにゲートで塞いでいた。
     *   以降28版、そのゲートが生む症状を別の原因と誤認して追い続けた。
     *   詳細は inlineHostRecovery.wiring.test.js の冒頭コメント。
     */
    const unconditional = contentSrc.match(
      /ensurePageFrameStyleAlive\(\);\n\s*inlineLayoutDirty = false;\n\s*renderPageFrameOverlay\(\);/g
    ) || [];
    expect(unconditional.length).toBe(2);
    // ゲートが復活したら赤(=同じ事故を二度やらない歯止め)。
    expect(contentSrc).not.toMatch(/if \(verdict\.render\) \{/);
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
    const body = fnBody(contentSrc, 'function setInlineHostDisplay(');
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
