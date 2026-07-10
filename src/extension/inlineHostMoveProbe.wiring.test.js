import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * v0.1.1124 D-1計器(host移設観測)の「配線忘れ=CI赤」ガード。
 *   content-entry.js は content script で vitest から import できないため、ソース文字列スキャンで
 *   「移設6箇所すべての直前に noteInlineHostMove がある」「fastDiag に hostMoveDiag が載る」を断言する。
 *   1箇所でも計器の無い移設経路が残ると、実測で reloadCount=0 なのにちかちかが続く=嘘の白、になるため。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(repoRoot, 'src/extension/content-entry.js'), 'utf8');

describe('inlineHostMoveProbe(v0.1.1124)の配線', () => {
  it('移設6経路すべての直前に noteInlineHostMove がある(理由ラベル網羅)', () => {
    for (const reason of [
      'anchored_video',
      'anchored_video_fallback_body',
      'nonvideo_anchor',
      'nonvideo_fallback_body',
      'floating_body',
      'dock_body',
      'prewarm_offscreen'
    ]) {
      expect(src).toContain(`noteInlineHostMove('${reason}'`);
    }
  });

  it('★計器の無い移設が残っていない: host移設の各出現の直前5行に計器がある', () => {
    const lines = src.split('\n');
    // popup host の移設だけを対象にする(insertAdjacentElement / body・hostParent への appendChild)。
    //   documentElement.appendChild(host) はトースト等の無関係なローカル host=対象外。
    const movePattern = /insertAdjacentElement\('afterend', host\)|body\.appendChild\(host\)|hostParent\.appendChild\(host\)/;
    const offenders = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!movePattern.test(lines[i])) continue;
      const windowBefore = lines.slice(Math.max(0, i - 5), i).join('\n');
      if (!windowBefore.includes('noteInlineHostMove(')) offenders.push(i + 1);
    }
    expect(offenders).toEqual([]); // 新しい移設経路を足すときは計器も一緒に(このテストが赤で教える)
  });

  it('fastDiag(AI共有の診断JSON)に hostMoveDiag が載る', () => {
    expect(src).toMatch(/hostMoveDiag: summarizeInlineHostMoveDiag\(_inlineHostMoveState/);
  });

  it('venueOpen 判定は venueBar.js と同一 literal(文字列契約=driftをCIで止める)', () => {
    const venueBarSrc = readFileSync(path.join(repoRoot, 'src/extension/venueBar.js'), 'utf8');
    expect(src).toContain("classList.contains('nlsb-venue-open')");
    expect(venueBarSrc).toContain("classList.toggle('nlsb-venue-open', open)");
  });
});
