import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');

describe('hidePageFrameOverlay の理由タグ配線', () => {
  it('計器を import して state を作っている', () => {
    expect(contentSrc).toContain("from '../lib/inlineHostHideReasonCensus.js'");
    expect(contentSrc).toMatch(/const _hostHideReasonCensus = createInlineHostHideReasonCensus\(\);/);
  });

  it('★消す関数の入口で無条件に記録している(if で囲われていない)', () => {
    const i = contentSrc.indexOf('function hidePageFrameOverlay(');
    expect(i).toBeGreaterThan(-1);
    const body = contentSrc.slice(i, i + 260);
    expect(body).toMatch(/function hidePageFrameOverlay\(reason = 'unknown'\) \{\n\s*noteInlineHostHideReason\(reason\);/);
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
    const i = contentSrc.indexOf('function setInlineHostDisplay(');
    const body = contentSrc.slice(i, i + 1200);
    expect(body).toContain('window.getComputedStyle(host)');
    expect(body).toMatch(/noteInlineHostHideReason\(`display:\$\{cause\}`\)/);
    // ★prev の値に依存しない位置(早期returnより前)で記録していること。
    const recIdx = body.indexOf('noteInlineHostHideReason');
    const retIdx = body.indexOf('if (prev === display) return;');
    expect(recIdx).toBeGreaterThan(-1);
    expect(retIdx).toBeGreaterThan(-1);
    expect(recIdx).toBeLessThan(retIdx);
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
