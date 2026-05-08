import { describe, it, expect } from 'vitest';
import {
  resolveAvatarUrlFromCommentProfileMap,
  resolveAvatarUrlFromMap,
  resolveAvatarUrlWithCandidates
} from './popupAvatarResolver.js';

describe('resolveAvatarUrlFromCommentProfileMap', () => {
  it('returns intercepted avatarUrl when present', () => {
    const map = {
      '143172392': { avatarUrl: 'https://example.com/intercepted.jpg' }
    };
    const r = resolveAvatarUrlFromCommentProfileMap('143172392', map);
    expect(r).toBe('https://example.com/intercepted.jpg');
  });

  it('falls back to uid-derived URL when avatarUrl is empty', () => {
    const map = { '2913665': { avatarUrl: '' } };
    const r = resolveAvatarUrlFromCommentProfileMap('2913665', map);
    expect(r).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/291/2913665.jpg'
    );
  });

  it('falls back to uid-derived URL when entry is missing', () => {
    const map = {};
    const r = resolveAvatarUrlFromCommentProfileMap('143172392', map);
    expect(r).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14317/143172392.jpg'
    );
  });

  it('returns empty for invalid uid', () => {
    const map = {};
    expect(resolveAvatarUrlFromCommentProfileMap('', map)).toBe('');
    expect(resolveAvatarUrlFromCommentProfileMap(null, map)).toBe('');
    expect(resolveAvatarUrlFromCommentProfileMap(undefined, map)).toBe('');
    expect(resolveAvatarUrlFromCommentProfileMap('not-a-number', map)).toBe('');
  });

  it('handles null/undefined map gracefully', () => {
    expect(resolveAvatarUrlFromCommentProfileMap('99', null)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/99.jpg'
    );
    expect(resolveAvatarUrlFromCommentProfileMap('99', undefined)).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/99.jpg'
    );
  });

  it('respects size parameter', () => {
    const r = resolveAvatarUrlFromCommentProfileMap('2913665', {}, 'm');
    expect(r).toContain('/m/');
  });
});

describe('resolveAvatarUrlFromMap', () => {
  it('returns intercepted URL from Record', () => {
    const map = { '2913665': 'https://x.com/a.jpg' };
    const r = resolveAvatarUrlFromMap('2913665', map);
    expect(r).toBe('https://x.com/a.jpg');
  });

  it('returns intercepted URL from Map', () => {
    const map = new Map([['2913665', 'https://x.com/a.jpg']]);
    const r = resolveAvatarUrlFromMap('2913665', map);
    expect(r).toBe('https://x.com/a.jpg');
  });

  it('falls back to uid-derived URL when not in map', () => {
    const r = resolveAvatarUrlFromMap('143172392', {});
    expect(r).toContain('143172392.jpg');
  });
});

describe('resolveAvatarUrlWithCandidates', () => {
  it('returns first non-empty candidate', () => {
    const r = resolveAvatarUrlWithCandidates(
      '143172392',
      ['', null, 'https://first.com/a.jpg', 'https://second.com/b.jpg']
    );
    expect(r).toBe('https://first.com/a.jpg');
  });

  it('falls back to uid-derived when all candidates are empty', () => {
    const r = resolveAvatarUrlWithCandidates('143172392', ['', null, undefined]);
    expect(r).toContain('143172392.jpg');
  });

  it('falls back to uid-derived when candidates is null/undefined', () => {
    expect(resolveAvatarUrlWithCandidates('143172392', null)).toContain(
      '143172392.jpg'
    );
    expect(resolveAvatarUrlWithCandidates('143172392', undefined)).toContain(
      '143172392.jpg'
    );
  });

  it('returns empty when uid is invalid and all candidates empty', () => {
    expect(resolveAvatarUrlWithCandidates('', ['', null])).toBe('');
  });
});
