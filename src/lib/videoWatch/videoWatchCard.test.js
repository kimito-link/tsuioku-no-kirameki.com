import { describe, expect, it } from 'vitest';
import { buildVodVideoWatchCardModel, vodVideoWatchCardInnerHtml } from './videoWatchCard.js';

describe('VOD 通常動画カード', () => {
  it('コメントがあるときは newest-first の顔の列と、タップ用の詳細枠だけ出す。視聴者の行動という見出しは常時出さない', () => {
    const card = buildVodVideoWatchCardModel({
      platform: 'twitcasting',
      pageKey: 'tcmov:romi_lele/843382496',
      videoId: '843382496',
      title: 'ウクレレ',
      videoAuthors: [
        { id: 'tc:older', name: '古い人', postedAtMs: 100, commentCount: 1 },
        { id: 'tc:newer', name: '新しい人', postedAtMs: 200, commentCount: 1 },
      ],
      nowMs: 200,
    });
    expect(card?.behavior?.contentKind).toBe('video');
    expect(card?.behavior?.rows?.filter((r) => !r.isAnonymous).map((p) => p.id)).toEqual(['tc:newer', 'tc:older']);
    const html = vodVideoWatchCardInnerHtml(card);
    expect(html).toContain('data-live-lane-host');
    expect(html).toContain('nlsb-viewer-behavior__detail');
    expect(html).not.toContain('視聴者の行動');
    expect(html).not.toContain('同時視聴');
    expect(html).toContain('この録画のデータ');
  });

  it('ページにコメントが無いときは顔の列を出さず、会場を隠すためのカードだけ残す', () => {
    const card = buildVodVideoWatchCardModel({
      platform: 'twitch',
      pageKey: 'twvod:2938022552',
      videoId: '2938022552',
      title: 'VOD',
    });
    const html = vodVideoWatchCardInnerHtml(card);
    expect(html).toContain('コメント欄が読み込まれると、ここに書いた人が並びます');
    expect(html).not.toContain('視聴者の行動');
    expect(vodVideoWatchCardInnerHtml(buildVodVideoWatchCardModel({ platform: 'youtube' }))).toBe('');
  });
});
