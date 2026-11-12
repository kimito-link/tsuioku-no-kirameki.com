import { describe, it, expect } from 'vitest';
import { noWatchHintFor, NO_WATCH_HINT_SITES } from './noWatchHint.js';
import { STREAM_PLATFORMS } from './streamPlatform.js';

describe('noWatchHintFor', () => {
  it('YouTube と、同梱しているすべてのサービスに案内がある', () => {
    for (const id of ['youtube', ...Object.keys(STREAM_PLATFORMS)]) expect(NO_WATCH_HINT_SITES).toContain(id);
  });
  it('ニコ生の言葉と行き先が混ざらない', () => {
    for (const id of NO_WATCH_HINT_SITES) {
      const h = noWatchHintFor(id);
      const all = [h.label, h.lead, ...h.links.flatMap((l) => [l.href, l.text])].join(' ');
      expect(all).not.toMatch(/ニコ|nicovideo|ちくらん|chikuwachan|生放送ランキング/);
      for (const l of h.links) expect(l.href).toMatch(/^https:\/\//);
    }
  });
  it('サービスの言葉で書く', () => {
    expect(noWatchHintFor('twitcasting').lead).toContain('ツイキャス');
    expect(noWatchHintFor('tiktok').links[0].href).toBe('https://www.tiktok.com/live');
  });
  it('分からないときは YouTube', () => {
    expect(noWatchHintFor('')).toBe(noWatchHintFor('youtube'));
    expect(noWatchHintFor('nope')).toBe(noWatchHintFor('youtube'));
  });
});
