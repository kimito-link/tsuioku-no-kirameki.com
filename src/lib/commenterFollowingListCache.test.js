import { describe, it, expect } from 'vitest';
import {
  COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED,
  isFreshFollowingListEntry,
  mergeFollowingListIntoRows,
  normalizeCommenterFollowingListEntry,
  pickFollowingListUidsToFetch,
  shouldSkipFollowingListFetch,
  summarizeFollowingListCoverage
} from './commenterFollowingListCache.js';

describe('commenterFollowingListCache', () => {
  it('normalizes following list entry with cap', () => {
    const ids = Array.from({ length: COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED + 5 }, (_, i) =>
      String(i + 1)
    );
    const entry = normalizeCommenterFollowingListEntry({
      userIds: ids,
      status: 'ok',
      fetchedAt: 1000,
      truncated: false,
      pageCount: 1
    });
    expect(entry?.userIds).toHaveLength(COMMENTER_FOLLOWING_LIST_MAX_UIDS_STORED);
    expect(entry?.truncated).toBe(true);
  });

  it('skips fresh forbidden entries', () => {
    const entry = normalizeCommenterFollowingListEntry({
      userIds: [],
      status: 'forbidden',
      fetchedAt: Date.now(),
      truncated: false,
      pageCount: 1
    });
    expect(shouldSkipFollowingListFetch(entry)).toBe(true);
    expect(isFreshFollowingListEntry(entry?.fetchedAt ?? 0, Date.now(), 24 * 60 * 60 * 1000)).toBe(
      true
    );
  });

  it('picks top commenters not in cache', () => {
    const stats = [
      { userId: '1', commentCount: 10 },
      { userId: '2', commentCount: 8 },
      { userId: '3', commentCount: 5 }
    ];
    const cache = {
      '1': {
        userIds: ['99'],
        status: 'ok',
        fetchedAt: Date.now(),
        truncated: false,
        pageCount: 1
      }
    };
    expect(pickFollowingListUidsToFetch(stats, cache, { limit: 2 })).toEqual(['2', '3']);
  });

  it('retries error/login_required when forceRetryStatuses is set', () => {
    const stats = [{ userId: '1', commentCount: 10 }];
    const cache = {
      '1': {
        userIds: [],
        status: 'error',
        fetchedAt: Date.now(),
        truncated: false,
        pageCount: 0
      }
    };
    expect(pickFollowingListUidsToFetch(stats, cache, { limit: 1 })).toEqual([]);
    expect(
      pickFollowingListUidsToFetch(stats, cache, {
        limit: 1,
        forceRetryStatuses: ['error', 'login_required']
      })
    ).toEqual(['1']);
  });

  it('merges followsBroadcaster into rows', () => {
    const rows = mergeFollowingListIntoRows(
      [{ userId: '1', commentCount: 5, nickname: 'A' }],
      {
        '1': {
          userIds: ['42', '7'],
          status: 'ok',
          fetchedAt: 1,
          truncated: false,
          pageCount: 1
        }
      },
      '7'
    );
    expect(rows[0].followsBroadcaster).toBe(true);
    expect(rows[0].followingListCount).toBe(2);
    expect(rows[0].followingListStatus).toBe('ok');
  });

  it('summarizes coverage for candidate uids', () => {
    const cov = summarizeFollowingListCoverage(
      {
        '1': { userIds: ['2'], status: 'ok', fetchedAt: 1, truncated: false, pageCount: 1 },
        '2': { userIds: [], status: 'login_required', fetchedAt: 1, truncated: false, pageCount: 0 },
        '3': { userIds: [], status: 'forbidden', fetchedAt: 1, truncated: false, pageCount: 0 }
      },
      ['1', '2', '3', '4']
    );
    expect(cov).toMatchObject({
      attempted: 3,
      ok: 1,
      loginRequired: 1,
      forbidden: 1,
      notAttempted: 1
    });
  });
});
