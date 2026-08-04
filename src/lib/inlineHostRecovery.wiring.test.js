import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const contentSrc = read('extension/content-entry.js');

/**
 * ★v0.1.1254 の配線断言。純関数が正しくても呼ばれていなければ実配信では直らない。
 *   [[wiring-test-mutation-check-2026-08-01]]: 変異で赤を確認済み。
 */
describe('inlineHostRecoveryGate の配線', () => {
  it('content-entry が復帰ゲートを import している', () => {
    expect(contentSrc).toContain("from '../lib/inlineHostRecoveryGate.js'");
  });

  it('★4秒経路の【両方】で復帰ゲートを呼んでいる(片方だけだと症状が半分残る)', () => {
    // v0.1.1250 で私はゲートを2箇所に入れた。復帰の非常口も同じ2箇所に要る。
    const calls = contentSrc.match(/shouldRenderInlineHostOnPoll\(/g) || [];
    expect(calls.length).toBe(2);
  });

  it('★可視状態を判定に渡している(これが無いと消えたまま戻らない)', () => {
    const idx = contentSrc.indexOf('shouldRenderInlineHostOnPoll({');
    const block = contentSrc.slice(idx, contentSrc.indexOf('});', idx));
    expect(block).toContain('hostVisible:');
    expect(block).toContain('hostKnown:');
    expect(block).toMatch(/hostVisible:\s*vis\.visible/);
  });

  it('★判定が render のときだけ描く(無条件描画に戻していない=4秒ちらつきを再発させない)', () => {
    expect(contentSrc).toMatch(/if \(verdict\.render\) \{\s*\n\s*inlineLayoutDirty = false;\s*\n\s*renderPageFrameOverlay\(\);/);
  });

  it('可視判定が DOM 走査をしていない(4秒に1回でも走査は入れない)', () => {
    const idx = contentSrc.indexOf('function probeInlineHostVisibilityForRecovery(');
    expect(idx).toBeGreaterThan(-1);
    const body = contentSrc.slice(idx, idx + 1400);
    expect(body).not.toContain('querySelectorAll');
    // ★hidePageFrameOverlay が作る状態(display:none / opacity:0)を見ていること。
    expect(body).toContain("cs.display === 'none'");
    expect(body).toMatch(/Number\(cs\.opacity\) === 0/);
  });

  it('★消しすぎ防止が配線され、視聴ページなら消さない', () => {
    expect(contentSrc).toContain('shouldHideInlineHostOnMissingPanel({');
    const idx = contentSrc.indexOf('shouldHideInlineHostOnMissingPanel({');
    const block = contentSrc.slice(idx, contentSrc.indexOf('});', idx));
    expect(block).toMatch(/stillOnWatchUrl:\s*isNicoLiveWatchUrl\(href\)/);
    // 判定が hide のときだけ先へ進む(無条件に消す旧実装へ戻していない)。
    expect(contentSrc).toMatch(/if \(!verdict\.hide\) \{/);
  });

  it('点検回数を必ず数えている(0の意味を区別するため)', () => {
    expect(contentSrc).toContain('_inlineHostRecoveryDiag.checkCount += 1;');
    expect(contentSrc).toMatch(/noteInlineHostRecoveryCheck\(verdict\.reason\)/);
  });

  it('診断オブジェクトに hostRecoveryDiag を載せている', () => {
    expect(contentSrc).toContain('formatInlineHostRecoveryLine(_inlineHostRecoveryDiag)');
  });

  it('★lite に通している(通さないとコピペに永久に出ない)', () => {
    const lite = read('lib/statusFastDiagLite.js');
    expect(lite).toContain('content.hostRecoveryDiag');
    expect(lite).toMatch(/\n\s+hostRecoveryDiag,/);
  });

  it('★状態速報の本文に1行出している', () => {
    const report = read('lib/aiShareFullText.js');
    expect(report).toContain('hostRecoveryDiag?.line');
    expect(report).toMatch(/if \(recLine\) \{ lines\.push\(recLine\)/);
  });
});
