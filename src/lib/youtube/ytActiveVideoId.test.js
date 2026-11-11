import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideActiveVideoIdWrite, YT_ACTIVE_VIDEO_MIN_GAP_MS } from './ytActiveVideoId.js';

const base = {
  tabActive: true,
  windowFocused: true,
  currentId: 'ab.n-shogi.ayqcreejkbpmhq',
  nextId: 'ab.n-abema-anime-2.fc7dzshd6nskhh',
  lastSetAt: 0,
  now: 10_000,
};

describe('いま見ている配信の印', () => {
  it('裏のタブは印を付けない', () => {
    expect(decideActiveVideoIdWrite({ ...base, tabActive: false }).reason).toBe('not-visible');
  });

  it('見えているが前面でない窓は、別の配信へ奪わない', () => {
    expect(decideActiveVideoIdWrite({ ...base, windowFocused: false }).reason).toBe('unfocused');
  });

  it('前面のタブは印を付け、同じ印は書かない', () => {
    expect(decideActiveVideoIdWrite(base).write).toBe(true);
    expect(decideActiveVideoIdWrite({ ...base, nextId: base.currentId }).reason).toBe('same');
  });

  it('2秒より短い入れ替わりは書かない', () => {
    const first = decideActiveVideoIdWrite(base);
    expect(first.write).toBe(true);
    const again = decideActiveVideoIdWrite({
      ...base,
      currentId: base.nextId,
      nextId: base.currentId,
      lastSetAt: base.now,
      now: base.now + YT_ACTIVE_VIDEO_MIN_GAP_MS - 1,
    });
    expect(again.reason).toBe('debounce');
    const later = decideActiveVideoIdWrite({
      ...base,
      currentId: base.nextId,
      nextId: base.currentId,
      lastSetAt: base.now,
      now: base.now + YT_ACTIVE_VIDEO_MIN_GAP_MS,
    });
    expect(later.write).toBe(true);
  });

  it('印の変更では配信一覧の全体を書かない', () => {
    const src = readFileSync('extension-youtube/src/background-entry.js', 'utf8');
    expect(src).not.toContain('[STORAGE_KEYS.STREAM_SUMMARIES]: summaries');
    expect(src).toContain('decideActiveVideoIdWrite(');
    expect(src).not.toMatch(/set\(\{[^}]*STREAM_SUMMARIES[^}]*ACTIVE_VIDEO_ID/);
    expect(src).not.toMatch(/set\(\{[^}]*ACTIVE_VIDEO_ID[^}]*STREAM_SUMMARIES/);
  });
});
