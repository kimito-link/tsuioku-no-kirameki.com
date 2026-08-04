import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');

/**
 * ★v0.1.1253 の配線断言。純関数が正しくても呼ばれていなければ実配信では何も分からない。
 *   [[wiring-test-mutation-check-2026-08-01]]: 変異で赤を確認済み。
 */
describe('hostVisibilityWatch の配線', () => {
  it('content-entry が見張りを import している', () => {
    expect(contentSrc).toContain("from '../lib/hostVisibilityWatch.js'");
    expect(contentSrc).toMatch(/const _hostVisWatch = createHostVisibilityWatch\(\);/);
  });

  it('★毎フレーム(rAF)で観測している=イベント依存でない', () => {
    const idx = contentSrc.indexOf('function startHostVisibilityWatch(');
    expect(idx).toBeGreaterThan(-1);
    const body = contentSrc.slice(idx, idx + 1800);
    expect(body).toContain('requestAnimationFrame(tick)');
    expect(body).toContain('noteHostFrame(_hostVisWatch');
    // scroll など特定イベントに紐づけていないこと(過去の scrollWhiteout の穴を繰り返さない)。
    expect(body).not.toContain("addEventListener('scroll'");
  });

  it('★実測の矩形を渡している(display だけを見ない=幅潰れも捕らえる)', () => {
    const idx = contentSrc.indexOf('function startHostVisibilityWatch(');
    const body = contentSrc.slice(idx, idx + 1800);
    expect(body).toContain('getBoundingClientRect()');
    expect(body).toMatch(/rect:\s*\{\s*w:\s*r\.width,\s*h:\s*r\.height\s*\}/);
  });

  it('★DOM 走査をしていない(paint毎の走査は禁止・v0.1.1201の反省)', () => {
    const idx = contentSrc.indexOf('function startHostVisibilityWatch(');
    const body = contentSrc.slice(idx, idx + 1800);
    expect(body).not.toContain('querySelectorAll');
    expect(body).not.toContain('querySelector(');
  });

  it('★見張りが無条件に開始される文である(if(false)前置で無効化されていない)', () => {
    expect(contentSrc).toMatch(/\n\s{2}startHostVisibilityWatch\(\);/);
  });

  it('二重起動を防いでいる(rAF が多重に回らない)', () => {
    const idx = contentSrc.indexOf('function startHostVisibilityWatch(');
    const body = contentSrc.slice(idx, idx + 400);
    expect(body).toMatch(/if \(_hostVisWatchRaf != null\) return;/);
  });

  it('診断オブジェクトに hostVisWatch を載せている', () => {
    expect(contentSrc).toContain('hostVisWatch: snapshotHostVisibilityWatch(_hostVisWatch)');
  });

  it('★lite に通している(通さないとコピペに永久に出ない)', () => {
    const lite = read('lib/statusFastDiagLite.js');
    expect(lite).toContain('content.hostVisWatch');
    expect(lite).toMatch(/\n\s+hostVisWatch,/);
  });

  it('★状態速報の本文に1行出している', () => {
    const report = read('lib/aiShareFullText.js');
    expect(report).toMatch(/import\s*\{[^}]*formatHostVisibilityWatchLine/);
    expect(report).toContain('fastDiag?.content?.hostVisWatch');
    expect(report).toMatch(/if \(visLine\) \{ lines\.push\(visLine\)/);
  });
});
