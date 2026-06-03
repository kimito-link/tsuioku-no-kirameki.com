import { describe, it, expect } from 'vitest';
import {
  NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE,
  buildNicoUserFollowingListUrl,
  classifyFollowingListFetchStatus,
  isLikelyNicoUserFollowingListShape,
  mergeNicoUserFollowingListPages,
  normalizeNicoUserFollowingListPage
} from './nicoUserFollowingApi.js';

describe('nicoUserFollowingApi', () => {
  it('message type is stable for background.js', () => {
    expect(NICO_USER_FOLLOWING_FETCH_MESSAGE_TYPE).toBe('NLS_NICO_USER_FOLLOWING_FETCH');
  });

  it('builds following list URL only for valid ids', () => {
    expect(buildNicoUserFollowingListUrl('123', { pageSize: 100, page: 1 })).toBe(
      'https://nvapi.nicovideo.jp/v1/users/123/following/users?pageSize=100&page=1'
    );
    expect(buildNicoUserFollowingListUrl('0')).toBeNull();
    expect(buildNicoUserFollowingListUrl('../../x')).toBeNull();
  });

  it('recognizes following list response shape', () => {
    expect(
      isLikelyNicoUserFollowingListShape({
        meta: { status: 200 },
        data: { items: [{ id: 1 }] }
      })
    ).toBe(true);
    expect(
      isLikelyNicoUserFollowingListShape({ meta: { status: 403 }, data: { items: [] } })
    ).toBe(false);
  });

  it('normalizes item ids from objects and numbers', () => {
    const page = normalizeNicoUserFollowingListPage({
      meta: { status: 200 },
      data: {
        items: [{ id: 10 }, { userId: '11' }, { id: 10 }, { id: 'bad' }],
        totalCount: 99
      }
    });
    expect(page?.userIds).toEqual(['10', '11']);
    expect(page?.totalCount).toBe(99);
  });

  it('merges pages with max cap', () => {
    const merged = mergeNicoUserFollowingListPages(
      [
        { userIds: ['1', '2'], totalCount: 5 },
        { userIds: ['3', '4', '5'] }
      ],
      { maxUserIds: 4 }
    );
    expect(merged.userIds).toEqual(['1', '2', '3', '4']);
    expect(merged.truncated).toBe(true);
    expect(merged.pageCount).toBe(2);
  });

  it('classifies HTTP status for following list fetch', () => {
    expect(classifyFollowingListFetchStatus(401, null)).toBe('login_required');
    expect(classifyFollowingListFetchStatus(403, null)).toBe('forbidden');
    expect(
      classifyFollowingListFetchStatus(200, { meta: { status: 200 }, data: { items: [] } })
    ).toBe('ok');
    expect(classifyFollowingListFetchStatus(500, null)).toBe('error');
  });

  it('classifies nvapi meta.status even when HTTP is 200', () => {
    expect(
      classifyFollowingListFetchStatus(200, { meta: { status: 401 }, data: { items: [] } })
    ).toBe('login_required');
    expect(
      classifyFollowingListFetchStatus(200, { meta: { status: 403 }, data: { items: [] } })
    ).toBe('forbidden');
  });
});
