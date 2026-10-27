import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-14: 合成の入口(先読み・その場合成)の両方が、実効ブーストに合わせて本文上限を短くしている配線の固定。
 *   片方だけだと先読み側と再生側で読み上げる文字列が食い違う(速度の穴 v0.1.1222 と同じ非対称)。
 */
const src = fs.readFileSync(path.resolve('src/lib/voicePlayer.js'), 'utf8').split('\r\n').join('\n');

describe('voicePlayer: 本文上限は実効ブーストで短くする(2経路とも)', () => {
  it('★先読み(_ensurePrefetch)', () => {
    // v0.1.1799: 速さの上限に、見込み待ちの上限を重ねる(下げるだけ)。
    expect(src).toMatch(/const boostChars = capVoiceMaxCharsByBoost\(effBoost, congestion\.maxChars\);/);
    expect(src).toMatch(/const maxChars = capVoiceMaxCharsByWait\(waitMs, boostChars\);/);
    expect(src).toMatch(/buildMergedVoiceText\(item, \{ maxChars \}\)/);
  });
  it('★その場合成(再生ループ)', () => {
    expect(src).toMatch(/buildMergedVoiceText\(item, \{ maxChars: capVoiceMaxCharsByBoost\(effBoostNow, congestion\.maxChars\) \}\)/);
  });
  it('★上限を素の congestion.maxChars のまま渡す経路が残っていない', () => {
    expect(src).not.toMatch(/buildMergedVoiceText\(item, \{ maxChars: congestion\.maxChars \}\)/);
  });
});
