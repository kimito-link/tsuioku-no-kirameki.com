import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isNicoVideoWatchUrl,
  metaFromNicoJsonLd,
  nicoVideoIdFromUrl,
  parseNicoVideoWatchMeta,
  viewCountFromNicoJsonLd,
} from './nicoVideoWatchMeta.js';
import { buildNicoVideoWatchCardModel, nicoVideoWatchCardInnerHtml } from './nicoVideoWatchCard.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/real-dom/sm9.jsonld.json');
const jsonLd = JSON.parse(readFileSync(FIX, 'utf8'));
const URL = 'https://www.nicovideo.jp/watch/sm9';

describe('sm9 の公開キャプチャ（chore/real-dom-capture-nico f47989e03）', () => {
  it('通常動画の URL と JSON-LD の再生数・投稿者を読む。生放送にはしない', () => {
    expect(isNicoVideoWatchUrl(URL)).toBe(true);
    expect(isNicoVideoWatchUrl('https://live.nicovideo.jp/watch/lv351841372')).toBe(false);
    expect(nicoVideoIdFromUrl(URL)).toBe('sm9');
    expect(viewCountFromNicoJsonLd(jsonLd)).toBe(23142333);
    const meta = parseNicoVideoWatchMeta({}, jsonLd);
    expect(meta).toMatchObject({
      videoId: 'sm9',
      title: '新・豪血寺一族 -煩悩解放 - レッツゴー！陰陽師',
      viewCount: 23142333,
      ownerId: '4',
      ownerName: '中の',
    });
    expect(metaFromNicoJsonLd(jsonLd).viewCount).toBe(23142333);
  });

  it('動画カードは再生回数を出し、視聴者の行動の要約板は常時出さない', () => {
    const card = buildNicoVideoWatchCardModel({
      videoId: metaOrId(),
      title: jsonLd.name,
      viewCount: 23142333,
      ownerId: '4',
      ownerName: '中の',
      videoAuthors: [
        { userId: '12345678', name: '花子', commentCount: 1, postedAtMs: Date.parse('2026-11-26T10:00:00+09:00') },
      ],
      nowMs: Date.parse('2026-11-26T10:45:53+09:00'),
    });
    expect(card.viewCountText).toBe('23,142,333 回');
    const html = nicoVideoWatchCardInnerHtml(card);
    expect(html).toContain('23,142,333');
    expect(html).toContain('data-live-lane-host');
    expect(html).not.toContain('視聴者の行動');
    expect(html).not.toContain('同時視聴');
  });
});

function metaOrId() {
  return parseNicoVideoWatchMeta({}, jsonLd).videoId;
}
