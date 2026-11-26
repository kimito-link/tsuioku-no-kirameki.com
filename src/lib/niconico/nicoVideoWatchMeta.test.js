import { describe, it, expect } from 'vitest';
import {
  nicoVideoIdFromUrl,
  isNicoVideoWatchUrl,
  isNicoVideoNvcommentUrl,
  isNicoNumericUserId,
  viewCountFromNicoJsonLd,
  viewCountFromNicoWatchData,
  parseNicoVideoWatchMeta,
  nicoVideoCommentersFromNvcommentJson,
  packNicoVideoCommentersAttr,
  unpackNicoVideoCommentersAttr,
  nicoVideoCommentersFromDomRoot,
  mergeNicoVideoCommenters,
} from './nicoVideoWatchMeta.js';

describe('nicoVideoIdFromUrl', () => {
  it('sm / so / nm の通常動画だけを対象にし、生放送は除外する', () => {
    expect(nicoVideoIdFromUrl('https://www.nicovideo.jp/watch/sm9')).toBe('sm9');
    expect(nicoVideoIdFromUrl('https://www.nicovideo.jp/watch/so123?from=0')).toBe('so123');
    expect(nicoVideoIdFromUrl('https://sp.nicovideo.jp/watch/nm456')).toBe('nm456');
    expect(isNicoVideoWatchUrl('https://www.nicovideo.jp/watch/sm9')).toBe(true);
    expect(nicoVideoIdFromUrl('https://live.nicovideo.jp/watch/lv123')).toBe('');
    expect(nicoVideoIdFromUrl('https://www.nicovideo.jp/watch/lv9')).toBe('');
    expect(nicoVideoIdFromUrl('https://www.nicovideo.jp/')).toBe('');
  });
});

describe('view counts', () => {
  it('WatchAction と count.view だけを再生数にし、マイリストやコメント数は使わない', () => {
    const ld = {
      interactionStatistic: [
        { interactionType: 'https://schema.org/WatchAction', userInteractionCount: 23142299 },
        { interactionType: 'https://schema.org/WantAction', userInteractionCount: 183280 },
      ],
      commentCount: 5704936,
    };
    expect(viewCountFromNicoJsonLd(ld)).toBe(23142299);
    const watch = {
      data: {
        response: {
          $watchV4: {
            data: {
              video: { id: 'sm9', title: '題', count: { view: 23142299, comment: 5704936, mylist: 183280, like: 46515 } },
              metadata: { jsonLd: { owner: { id: '4', name: '中の' } } },
            },
          },
        },
      },
    };
    expect(viewCountFromNicoWatchData(watch)).toBe(23142299);
    const meta = parseNicoVideoWatchMeta(watch, ld);
    expect(meta).toEqual({ videoId: 'sm9', title: '題', viewCount: 23142299, ownerId: '4', ownerName: '中の' });
  });
});

describe('nvcomment commenters', () => {
  it('本文を持たず、owner / easy を除き、同じ人はまとめる', () => {
    const json = {
      data: {
        threads: [
          { fork: 'owner', comments: [{ userId: '4', postedAt: '2020-01-01T00:00:00+09:00', body: '投稿者コメント' }] },
          { fork: 'easy', comments: [{ userId: '99', postedAt: '2020-01-01T00:00:00+09:00', body: 'かんたん' }] },
          {
            fork: 'main',
            comments: [
              { userId: '123', postedAt: '2020-01-01T00:00:00+09:00', body: 'こんにちは' },
              { userId: '123', postedAt: '2021-02-01T00:00:00+09:00', body: 'また来た' },
              { userId: '456', postedAt: '2021-03-01T00:00:00+09:00', body: ' conc ' },
            ],
          },
        ],
      },
    };
    const people = nicoVideoCommentersFromNvcommentJson(json);
    expect(people).toHaveLength(2);
    expect(people.find((p) => p.userId === '123')?.commentCount).toBe(2);
    expect(JSON.stringify(people)).not.toMatch(/こんにちは|また来た|投稿者コメント/);
    const packed = packNicoVideoCommentersAttr(json);
    expect(packed).not.toMatch(/こんにちは/);
    expect(unpackNicoVideoCommentersAttr(packed).map((p) => p.userId).sort()).toEqual(['123', '456']);
  });
});

describe('isNicoVideoNvcommentUrl / isNicoNumericUserId', () => {
  it('ページが呼ぶコメント API と、照合できる数値 ID を見分ける', () => {
    expect(isNicoVideoNvcommentUrl('https://public.nvcomment.nicovideo.jp/v1/threads')).toBe(true);
    expect(isNicoVideoNvcommentUrl('https://live.nicovideo.jp/watch/lv1')).toBe(false);
    expect(isNicoNumericUserId('4')).toBe(true);
    expect(isNicoNumericUserId('abc123hash')).toBe(false);
  });
});

describe('nicoVideoCommentersFromDomRoot', () => {
  it('数値 ID のリンクだけを集め、document が無くても動く', () => {
    const nodes = [
      { getAttribute: (k) => (k === 'href' ? '/user/123' : null), href: '/user/123', textContent: '花子' },
      { getAttribute: (k) => (k === 'href' ? '/user/abc' : null), href: '/user/abc', textContent: 'ハッシュ' },
    ];
    const root = {
      querySelectorAll: (sel) => (String(sel).includes('/user/') ? nodes : []),
    };
    const people = nicoVideoCommentersFromDomRoot(root);
    expect(people).toEqual([{ userId: '123', name: '花子', postedAtMs: 0, commentCount: 1 }]);
  });
});

describe('mergeNicoVideoCommenters', () => {
  it('属性と DOM を合成し、名前がある方を残す', () => {
    const merged = mergeNicoVideoCommenters(
      [{ userId: '123', name: '', postedAtMs: 10, commentCount: 2 }],
      [{ userId: '123', name: '花子', postedAtMs: 0, commentCount: 1 }],
    );
    expect(merged).toEqual([{ userId: '123', name: '花子', postedAtMs: 10, commentCount: 2 }]);
  });
});
