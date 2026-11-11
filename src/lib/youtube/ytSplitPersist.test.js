import { describe, expect, it } from 'vitest';
import {
  YT_STORAGE_WRITE_MAX_BYTES,
  changedVoicePersonWrites,
  rowsMadeWithinAdded,
  slimSummaryForStorage,
  storageJsonBytes,
  summaryChromeWriteDue,
  summaryStorageKey,
  verifiedBeforeRetire,
  videoIdFromSummaryStorageKey,
} from './ytSplitPersist.js';

function person(i) {
  return { styleId: i % 40, pitchOffset: 0, speedOffset: 1 };
}

function summary(i) {
  return {
    videoId: `vid${i}`,
    title: `配信 ${i}`,
    broadcasterName: 'ほげ',
    broadcasterChannelId: 'UCxxxxxxxxxxxxxxxxxxxxxx',
    broadcasterHandle: '@hoge',
    broadcasterIconUrl: 'https://yt3.ggpht.com/a/icon',
    concurrentViewers: 10,
    itemCount: 1000 + i,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000 + i,
    createdAt: 1_700_000_000_000,
  };
}

describe('書き込みは人数や配信数で大きくならない', () => {
  it('1000人でも、変わった1人の書き込みは 64KB 以下', () => {
    const prev = {};
    const next = {};
    for (let i = 0; i < 1000; i += 1) next[`user${i}`] = person(i);
    const first = changedVoicePersonWrites(prev, next);
    expect(first).toHaveLength(1000);
    for (const row of first) {
      expect(storageJsonBytes({ v: 1, userKey: row.userKey, body: row.body })).toBeLessThanOrEqual(YT_STORAGE_WRITE_MAX_BYTES);
    }
    const again = { ...next, user1000: person(3) };
    const delta = changedVoicePersonWrites(next, again);
    expect(delta.map((r) => r.userKey)).toEqual(['user1000']);
    const one = storageJsonBytes({ v: 1, ...delta[0] });
    const grown = storageJsonBytes(again);
    expect(one).toBeLessThan(grown);
    expect(one).toBeLessThanOrEqual(YT_STORAGE_WRITE_MAX_BYTES);
  });

  it('1000配信でも、1配信の書き込みは 64KB 以下で、配信数では増えない', () => {
    const one = slimSummaryForStorage(summary(1));
    const manyBytes = [];
    for (let i = 0; i < 1000; i += 1) {
      const slim = slimSummaryForStorage(summary(i));
      expect(slim).toBeTruthy();
      const n = storageJsonBytes(slim);
      expect(n).toBeLessThanOrEqual(YT_STORAGE_WRITE_MAX_BYTES);
      manyBytes.push(n);
    }
    expect(Math.max(...manyBytes)).toBeLessThan(2000);
    expect(storageJsonBytes(one)).toBeLessThan(2000);
    expect(summaryStorageKey('abc')).toBe('ytm:sum:v1:abc');
    expect(videoIdFromSummaryStorageKey(summaryStorageKey('a b'))).toBe('a b');
    expect(videoIdFromSummaryStorageKey('sum:v1:floodvid2046')).toBe('floodvid2046');
  });

  it('件数の知らせは1秒に1回まで', () => {
    expect(summaryChromeWriteDue(1000, 1999)).toBe(false);
    expect(summaryChromeWriteDue(1000, 2000)).toBe(true);
  });

  it('読み戻しが足りなければ古い鍵は消さない', () => {
    expect(verifiedBeforeRetire({ stored: 10, readBack: 10 })).toBe(true);
    expect(verifiedBeforeRetire({ stored: 10, readBack: 9 })).toBe(false);
    expect(verifiedBeforeRetire({ stored: 0, readBack: 0 })).toBe(true);
  });

  it('同じ読み直しは新しい行を作らず、増分は足した件数以下', () => {
    expect(rowsMadeWithinAdded({ made: 0, added: 0 })).toBe(true);
    expect(rowsMadeWithinAdded({ made: 12, added: 12 })).toBe(true);
    expect(rowsMadeWithinAdded({ made: 8000, added: 12 })).toBe(false);
  });

  it('壊れた1件(巨大な data URL)だけ chrome の写しから外す', () => {
    const slim = slimSummaryForStorage({ ...summary(1), broadcasterIconUrl: `data:image/png;base64,${'A'.repeat(80_000)}` });
    expect(String(slim?.broadcasterIconUrl || '')).toBe('');
    expect(storageJsonBytes(slim)).toBeLessThanOrEqual(YT_STORAGE_WRITE_MAX_BYTES);
  });
});
