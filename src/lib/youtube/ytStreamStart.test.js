import { describe, it, expect } from 'vitest';
import { relativeStreamStartedAtMs, startMsFromTimestampBlob } from './ytStreamStart.js';

const NOW = Date.UTC(2026, 10, 11, 9, 0, 0);

describe('relativeStreamStartedAtMs', () => {
  it('日・週間・年も、分単位の開始時刻にする', () => {
    expect(relativeStreamStartedAtMs('5 日前にライブ配信開始', NOW)).toBe(NOW - 5 * 86_400_000);
    expect(relativeStreamStartedAtMs('2 週間前にライブ配信開始', NOW)).toBe(NOW - 14 * 86_400_000);
    expect(relativeStreamStartedAtMs('1 年前にライブ配信開始', NOW)).toBe(NOW - 365 * 86_400_000);
    expect(relativeStreamStartedAtMs('Started streaming 3 hours ago', NOW)).toBe(NOW - 3 * 3_600_000);
  });

  it('開始の文言が無いときは null', () => {
    expect(relativeStreamStartedAtMs('4,534 人が視聴中', NOW)).toBe(null);
  });
});

describe('startMsFromTimestampBlob', () => {
  it('startTimestamp だけを読む', () => {
    const iso = '2026-11-11T00:00:00.000Z';
    expect(startMsFromTimestampBlob(`{"startTimestamp":"${iso}"}`, NOW)).toBe(Date.parse(iso));
    expect(startMsFromTimestampBlob('{"publishDate":"2020-01-01T00:00:00.000Z"}', NOW)).toBe(null);
  });
});
