import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isLikelyKickLivestreamsShape,
  normalizeKickLivestream,
  normalizeKickLivestreams,
  sortByViewers,
  kickChannelUrl,
  decideKickStore,
  isTruncated,
  KICK_TITLE_MAX,
  KICK_NAME_MAX
} from './kickLivestreams.js';

/** docs.kick.com の返却フィールドに沿った 1 件(値は架空)。 */
function rawLive(over = {}) {
  return {
    id: 123456,
    title: '  雑談   配信  ',
    thumbnail: 'https://images.kick.com/video_thumbnails/x/720.webp',
    broadcaster_user: { id: 9, username: 'taro_kick', profile_picture: 'https://files.kick.com/images/user/9/profile.webp' },
    channel: { slug: 'taro_kick' },
    category: { id: 15, name: 'Just Chatting', thumbnail: 'https://files.kick.com/c.webp' },
    viewer_count: 321,
    language_code: 'ja',
    started_at: '2026-10-01T03:00:00Z',
    tags: ['日本語'],
    has_mature_content: false,
    ...over
  };
}

describe('isLikelyKickLivestreamsShape', () => {
  it('data が配列なら true、null/文字列/data が配列でない object は false', () => {
    expect(isLikelyKickLivestreamsShape({ data: [] })).toBe(true);
    expect(isLikelyKickLivestreamsShape({ data: [rawLive()] })).toBe(true);
    expect(isLikelyKickLivestreamsShape(null)).toBe(false);
    expect(isLikelyKickLivestreamsShape('x')).toBe(false);
    expect(isLikelyKickLivestreamsShape({ data: {} })).toBe(false);
    expect(isLikelyKickLivestreamsShape({})).toBe(false);
  });
});

describe('normalizeKickLivestream', () => {
  it('実形に近い 1 件を PlatformLive に（platform:kick・viewers 整数・startedAt は epoch ms・url は https://kick.com/<slug>）', () => {
    const v = normalizeKickLivestream(rawLive());
    expect(v).toEqual({
      platform: 'kick',
      id: '123456',
      url: 'https://kick.com/taro_kick',
      title: '雑談 配信',
      thumbnail: 'https://images.kick.com/video_thumbnails/x/720.webp',
      channel: { name: 'taro_kick', icon: 'https://files.kick.com/images/user/9/profile.webp', url: 'https://kick.com/taro_kick' },
      viewers: 321,
      startedAt: Date.parse('2026-10-01T03:00:00Z'),
      category: 'Just Chatting',
      mature: false,
      language: 'ja'
    });
  });

  it('id が無い／slug が形外の 1 件は null', () => {
    expect(normalizeKickLivestream(rawLive({ id: null }))).toBeNull();
    expect(normalizeKickLivestream(rawLive({ id: '' }))).toBeNull();
    expect(normalizeKickLivestream(rawLive({ channel: { slug: '../evil' } }))).toBeNull();
    expect(normalizeKickLivestream(rawLive({ channel: null }))).toBeNull();
    expect(normalizeKickLivestream(null)).toBeNull();
  });

  it('thumbnail/profile_picture に javascript: や相対 URL が来たら空', () => {
    const v = normalizeKickLivestream(rawLive({
      thumbnail: 'javascript:alert(1)',
      broadcaster_user: { username: 'a', profile_picture: '/rel.png' }
    }));
    expect(v && v.thumbnail).toBe('');
    expect(v && v.channel.icon).toBe('');
  });

  it('thumbnail が { src } のオブジェクトでも読める', () => {
    const v = normalizeKickLivestream(rawLive({ thumbnail: { src: 'https://images.kick.com/t.webp' } }));
    expect(v && v.thumbnail).toBe('https://images.kick.com/t.webp');
  });

  it('viewer_count が負・文字列・欠落なら 0、has_mature_content は === true だけ true', () => {
    expect(normalizeKickLivestream(rawLive({ viewer_count: -5 }))?.viewers).toBe(0);
    expect(normalizeKickLivestream(rawLive({ viewer_count: 'many' }))?.viewers).toBe(0);
    expect(normalizeKickLivestream(rawLive({ viewer_count: undefined }))?.viewers).toBe(0);
    expect(normalizeKickLivestream(rawLive({ viewer_count: 12.7 }))?.viewers).toBe(12);
    expect(normalizeKickLivestream(rawLive({ has_mature_content: 'true' }))?.mature).toBe(false);
    expect(normalizeKickLivestream(rawLive({ has_mature_content: true }))?.mature).toBe(true);
  });

  it('title は 120 字・username は 80 字で切る', () => {
    const v = normalizeKickLivestream(rawLive({
      title: 'あ'.repeat(300),
      broadcaster_user: { username: 'b'.repeat(200), profile_picture: '' }
    }));
    expect(v && v.title.length).toBe(KICK_TITLE_MAX);
    expect(v && v.channel.name.length).toBe(KICK_NAME_MAX);
  });

  it('started_at が読めなければ 0', () => {
    expect(normalizeKickLivestream(rawLive({ started_at: 'not a date' }))?.startedAt).toBe(0);
    expect(normalizeKickLivestream(rawLive({ started_at: null }))?.startedAt).toBe(0);
  });
});

describe('normalizeKickLivestreams', () => {
  it('形が違えば null。壊れた 1 件だけ落として残りを返す', () => {
    expect(normalizeKickLivestreams({ data: 'x' })).toBeNull();
    expect(normalizeKickLivestreams(null)).toBeNull();
    const out = normalizeKickLivestreams({ data: [rawLive({ id: 1 }), { broken: true }, rawLive({ id: 2 })] });
    expect(out && out.map((l) => l.id)).toEqual(['1', '2']);
    expect(normalizeKickLivestreams({ data: [] })).toEqual([]);
  });
});

describe('sortByViewers', () => {
  it('降順・同点は元順・元配列を壊さない', () => {
    const input = [
      { id: 'a', viewers: 10 }, { id: 'b', viewers: 50 }, { id: 'c', viewers: 10 }, { id: 'd', viewers: 99 }
    ];
    const before = input.map((x) => x.id).join();
    const out = sortByViewers(/** @type {any} */ (input));
    expect(out.map((x) => x.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(input.map((x) => x.id).join()).toBe(before);
    expect(sortByViewers(/** @type {any} */ (null))).toEqual([]);
  });
});

describe('kickChannelUrl', () => {
  it('許す文字だけ通し、スラッシュ・空・長すぎは空', () => {
    expect(kickChannelUrl('taro-kick_01')).toBe('https://kick.com/taro-kick_01');
    expect(kickChannelUrl('a/b')).toBe('');
    expect(kickChannelUrl('')).toBe('');
    expect(kickChannelUrl(null)).toBe('');
    expect(kickChannelUrl('x'.repeat(65))).toBe('');
  });
});

describe('decideKickStore', () => {
  it('ok:false → false / lives:null → false / lives:[] → true / lives:[1件] → true', () => {
    expect(decideKickStore({ ok: false, lives: [] }).store).toBe(false);
    expect(decideKickStore({ ok: true, lives: null }).store).toBe(false);
    expect(decideKickStore({ ok: true, lives: [] }).store).toBe(true);
    expect(decideKickStore({ ok: true, lives: [/** @type {any} */ ({})] }).store).toBe(true);
    expect(decideKickStore({ ok: true, lives: null }).reason).toBe('shape invalid');
  });
});

describe('isTruncated', () => {
  it('cursor あり && 件数 >= limit のときだけ true', () => {
    const full = Array.from({ length: 100 }, () => ({}));
    expect(isTruncated({ data: full, pagination: { next_cursor: 'abc' } }, 100)).toBe(true);
    expect(isTruncated({ data: full, pagination: { next_cursor: '' } }, 100)).toBe(false);
    expect(isTruncated({ data: full.slice(0, 40), pagination: { next_cursor: 'abc' } }, 100)).toBe(false);
    expect(isTruncated({ data: full, next_cursor: 'abc' }, 100)).toBe(true);
    expect(isTruncated(null, 100)).toBe(false);
  });
});

describe('kickLivestreams.js の境界', () => {
  it('★推定・増分・順位推移の関数を import していない', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, 'kickLivestreams.js'), 'utf8');
    expect(src).not.toMatch(/estimateConcurrent|createGiftPulseRegistry|createRowChangeTracker/);
  });
});
