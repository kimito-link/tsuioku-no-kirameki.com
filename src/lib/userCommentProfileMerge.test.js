import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeUserCommentProfileMap, USER_COMMENT_PROFILE_CACHE_MAX } from './userCommentProfileCache.js';
import { mergeEntriesIntoUserCommentProfileMap } from './userCommentProfileMerge.js';

// v0.1.1984: 人数が上限を超える配信で、控えの中身が描き直しのたびに変わり続けないこと(描き直しの繰り返しの元)。
const NOW = 1_800_000_000_000;
const people = (n, t0 = NOW - 3_600_000) =>
  Array.from({ length: n }, (_, i) => ({
    userId: String(100000 + i),
    nickname: `name${i}`,
    avatarUrl: `https://example.com/icon/${i}.png`,
    capturedAt: t0 + i * 10
  }));
/** 保存して読み直す(popup は描き直しごとに storage から読み直す) */
const reload = (map) => normalizeUserCommentProfileMap(JSON.parse(JSON.stringify(map)), { nowMs: NOW });

describe('mergeEntriesIntoUserCommentProfileMap', () => {
  it('上限以下: 1回目は学んで「変わった」、2回目は「変わっていない」', () => {
    const arr = people(100);
    const r1 = mergeEntriesIntoUserCommentProfileMap({}, arr, { nowMs: NOW });
    expect(r1.cacheTouched).toBe(true);
    expect(Object.keys(r1.map).length).toBe(100);
    const r2 = mergeEntriesIntoUserCommentProfileMap(reload(r1.map), arr, { nowMs: NOW + 5000 });
    expect(r2.cacheTouched).toBe(false);
  });
  it('上限を超える人数: 2回目からは中身が変わらない(書き続けない)', () => {
    const arr = people(USER_COMMENT_PROFILE_CACHE_MAX + 1500);
    const r1 = mergeEntriesIntoUserCommentProfileMap({}, arr, { nowMs: NOW });
    expect(Object.keys(r1.map).length).toBe(USER_COMMENT_PROFILE_CACHE_MAX);
    const r2 = mergeEntriesIntoUserCommentProfileMap(reload(r1.map), arr, { nowMs: NOW + 5000 });
    expect(r2.cacheTouched).toBe(false);
    expect(Object.keys(r2.map).sort()).toEqual(Object.keys(r1.map).sort());
    const r3 = mergeEntriesIntoUserCommentProfileMap(reload(r2.map), arr, { nowMs: NOW + 10_000 });
    expect(r3.cacheTouched).toBe(false);
  });
  it('上限を超えたとき残るのは、最近見た人', () => {
    const arr = people(USER_COMMENT_PROFILE_CACHE_MAX + 10);
    const r = mergeEntriesIntoUserCommentProfileMap({}, arr, { nowMs: NOW });
    expect(r.map['100000']).toBeUndefined(); // いちばん古く見た人は刈られる
    expect(r.map[String(100000 + USER_COMMENT_PROFILE_CACHE_MAX + 9)]).toBeTruthy();
  });
  it('新しい人が来たら「変わった」と言う(上限を超えていても)', () => {
    const arr = people(USER_COMMENT_PROFILE_CACHE_MAX + 100);
    const r1 = mergeEntriesIntoUserCommentProfileMap({}, arr, { nowMs: NOW });
    const more = [...arr, { userId: '999999', nickname: 'newcomer', avatarUrl: 'https://example.com/n.png', capturedAt: NOW + 1000 }];
    const r2 = mergeEntriesIntoUserCommentProfileMap(reload(r1.map), more, { nowMs: NOW + 2000 });
    expect(r2.cacheTouched).toBe(true);
    expect(r2.map['999999']?.nickname).toBe('newcomer');
  });
  it('刈られた人の行にも、この回のうちは控えの名前・顔が当たる(補ってから刈る)', () => {
    const arr = [
      { userId: '100000', nickname: 'first', avatarUrl: 'https://example.com/a.png', capturedAt: NOW - 9_000_000 },
      { userId: '100000', nickname: '', avatarUrl: '', capturedAt: NOW - 8_000_000 }
    ];
    const r = mergeEntriesIntoUserCommentProfileMap({}, arr, { nowMs: NOW, max: 1 });
    expect(r.arr[1].nickname).toBe('first');
    expect(r.commentsPatched).toBe(true);
  });
  it('時刻の無い行は今までどおり「いま」で入る', () => {
    const r = mergeEntriesIntoUserCommentProfileMap({}, [{ userId: '100000', nickname: 'a', avatarUrl: 'https://example.com/a.png' }], { nowMs: NOW });
    expect(r.map['100000'].updatedAt).toBe(NOW);
  });
});

describe('popup の配線', () => {
  it('学ぶ・補う・刈るは lib の1関数を通す', () => {
    const src = readFileSync(new URL('../extension/popup-entry.js', import.meta.url), 'utf8');
    expect(src).toContain('const r = mergeEntriesIntoUserCommentProfileMap(popupUserCommentProfileMap, arr);');
  });
});
