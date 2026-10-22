import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');
const sound = readFileSync(new URL('../../app/live-view-sound.js', import.meta.url), 'utf8');

describe('配線: スマホでギフトの効果音(v0.1.1737)', () => {
  it('★スナップショットを塗るたびに、コメント鏡の行を効果音の係へ渡す(閲覧は止めない)', () => {
    expect(liveView).toContain('try { _soundPlayer.onRows(restoreCommentTimelineRows(jsonBlob.commentTimelineMirror || null)); } catch');
    expect(liveView).toContain('try { mountPhoneSoundUi(_soundPlayer); } catch');
  });
  it('★既定は音なし・音は拡張と同じ /extension/sound/ から・タップの中で AudioContext を起こす', () => {
    expect(sound).toContain("globalThis.localStorage?.getItem(STORE_KEY) === 'on'");
    expect(sound).toContain('fetchImpl(`/extension/${path}`)');
    expect(sound).toContain("document.addEventListener('pointerdown', wakeOnce, { once: true, capture: true });");
  });
});
