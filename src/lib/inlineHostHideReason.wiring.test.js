import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');


/**
 * 関数本体を終端まで切り出す。
 * ★固定長 slice(i, i+N) は、関数にコメントを足しただけで断言が範囲外に落ちて
 *   偽の赤を出す(2026-08-05 に本ファイルで実際に発生)。長さでなく契約を見る。
 */
function fnBody(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return '';
  const end = src.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i);
  return end < 0 ? src.slice(i) : src.slice(i, end + 2);
}

describe('hidePageFrameOverlay の理由タグ配線', () => {
  it('計器を import して state を作っている', () => {
    expect(contentSrc).toContain("from '../lib/inlineHostHideReasonCensus.js'");
    expect(contentSrc).toMatch(/const _hostHideReasonCensus = createInlineHostHideReasonCensus\(\);/);
  });

  it('★消す関数の入口で無条件に記録している(if で囲われていない)', () => {
    // ★v0.1.1265: 足跡計器の1行が入った。断言すべきは「入口で無条件に記録する」で
    //   あって、直後の行であることではない(隣接や文字数を固定すると正当な追加で赤になる)。
    const body = fnBody(contentSrc, 'function hidePageFrameOverlay(');
    expect(body).toMatch(/function hidePageFrameOverlay\(reason = 'unknown'\) \{/);
    expect(body).toMatch(/\n\s*noteInlineHostHideReason\(reason\);/);
    // if 等で条件付きにされていないこと。
    expect(body).not.toMatch(/if \([^)]*\)\s*noteInlineHostHideReason\(reason\)/);
  });

  it('★全ての呼び出しにタグが付いている(タグ無しが1つでもあると犯人が unknown に埋もれる)', () => {
    const tagged = contentSrc.match(/hidePageFrameOverlay\('[a-z_]+'\)/g) || [];
    expect(tagged.length).toBe(5);
    // タグ無しの呼び出しが残っていないこと(定義行とコメントは除く)。
    const untagged = contentSrc
      .split('\n')
      .filter((ln) => /hidePageFrameOverlay\(\)/.test(ln) && !/^\s*\*/.test(ln));
    expect(untagged).toEqual([]);
  });

  it('★タグが互いに重複していない(経路を区別できる)', () => {
    const tags = (contentSrc.match(/hidePageFrameOverlay\('([a-z_]+)'\)/g) || [])
      .map((m) => m.replace(/.*'([a-z_]+)'.*/, '$1'));
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('★実際に見えていたか(computed)基準でも消失を記録する — インライン基準の取りこぼしを塞ぐ', () => {
    // hostFlipCensus が2日間 0 を出し続けた真因: CSS 既定が display:none のため
    // インラインの prev===display で素通りしていた。computed 基準なら取りこぼさない。
    const body = fnBody(contentSrc, 'function setInlineHostDisplay(');
    expect(body).toContain('window.getComputedStyle(host)');
    expect(body).toMatch(/noteInlineHostHideReason\(`display:\$\{cause\}`\)/);
    // ★prev の値に依存しない位置(早期returnより前)で記録していること。
    const recIdx = body.indexOf('noteInlineHostHideReason');
    const retIdx = body.indexOf('if (prev === display) return;');
    expect(recIdx).toBeGreaterThan(-1);
    expect(retIdx).toBeGreaterThan(-1);
    expect(recIdx).toBeLessThan(retIdx);
  });

  it('★判定に opacity を含めない(display だけ消す経路を取りこぼさない)', () => {
    // 実測(2026-08-05): 消失8回に対し記録4回=半分取りこぼしていた。
    //   first_paint_gate / video_rect_too_small / prewarm_offscreen / host_created は
    //   opacity を触らないため、CSS既定の opacity:0 が残ると "見えていない" と誤判定される。
    const body = fnBody(contentSrc, 'function setInlineHostDisplay(');
    expect(body).toMatch(/const wasDisplayed = cs\.display !== 'none' && cs\.visibility !== 'hidden';/);
    // opacity を判定に混ぜ戻していないこと。
    expect(body).not.toMatch(/wasDisplayed[^;]*opacity/);
    expect(body).not.toMatch(/Number\(cs\.opacity\) !== 0/);
  });

  it('診断に載せている(2箇所とも)', () => {
    const hits = contentSrc.match(/hostHideReason: \(\(\) => \{/g) || [];
    expect(hits.length).toBe(2);
  });

  it('★lite に通している(通さないとコピペに永久に出ない)', () => {
    const lite = read('lib/statusFastDiagLite.js');
    expect(lite).toContain('content.hostHideReason');
    expect(lite).toMatch(/\n\s+hostHideReason,/);
  });

  it('★状態速報の本文に1行出している', () => {
    const report = read('lib/aiShareFullText.js');
    expect(report).toContain('hostHideReason?.line');
    expect(report).toMatch(/if \(hideLine\) \{ lines\.push\(hideLine\)/);
  });
});
