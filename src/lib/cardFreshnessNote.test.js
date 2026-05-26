import { describe, it, expect } from 'vitest';
import {
  formatCardFreshnessNote,
  formatAgoLabel,
  CARD_FRESHNESS_STALE_MS
} from './cardFreshnessNote.js';

const NOW = 1_700_000_000_000;

describe('formatAgoLabel', () => {
  it('5秒未満は「たった今」', () => {
    expect(formatAgoLabel(0)).toBe('たった今');
    expect(formatAgoLabel(4_999)).toBe('たった今');
  });
  it('秒・分・時間・日で丸める', () => {
    expect(formatAgoLabel(12_000)).toBe('12秒前');
    expect(formatAgoLabel(90_000)).toBe('1分前');
    expect(formatAgoLabel(2 * 60 * 60 * 1000)).toBe('2時間前');
    expect(formatAgoLabel(3 * 24 * 60 * 60 * 1000)).toBe('3日前');
  });
  it('不正値は空', () => {
    expect(formatAgoLabel(-1)).toBe('');
    expect(formatAgoLabel(NaN)).toBe('');
    expect(formatAgoLabel('x')).toBe('');
  });
});

describe('formatCardFreshnessNote', () => {
  it('capturedAt 無効なら空（注記を出さない）', () => {
    expect(formatCardFreshnessNote(null, { nowMs: NOW })).toBe('');
    expect(formatCardFreshnessNote(0, { nowMs: NOW })).toBe('');
    expect(formatCardFreshnessNote('x', { nowMs: NOW })).toBe('');
    expect(formatCardFreshnessNote(undefined, { nowMs: NOW })).toBe('');
  });

  it('直近なら「最終更新: ○秒前」', () => {
    expect(formatCardFreshnessNote(NOW - 12_000, { nowMs: NOW })).toBe('最終更新: 12秒前');
  });

  it('autoRefreshing=true なら「自動更新中」を添える', () => {
    expect(formatCardFreshnessNote(NOW - 12_000, { nowMs: NOW, autoRefreshing: true })).toBe(
      '最終更新: 12秒前・自動更新中'
    );
  });

  it('STALE_MS を超えたら autoRefreshing でも「少し前の値」', () => {
    const old = NOW - (CARD_FRESHNESS_STALE_MS + 30_000);
    expect(formatCardFreshnessNote(old, { nowMs: NOW, autoRefreshing: true })).toBe(
      '最終更新: 2分前（少し前の値）'
    );
  });

  it('未来時刻（時計ずれ）は出さない', () => {
    expect(formatCardFreshnessNote(NOW + 120_000, { nowMs: NOW })).toBe('');
  });

  it('極端に古い（7日超）は出さない', () => {
    expect(formatCardFreshnessNote(NOW - 8 * 24 * 60 * 60 * 1000, { nowMs: NOW })).toBe('');
  });

  it('たった今（5秒未満）は「最終更新: たった今・自動更新中」', () => {
    expect(formatCardFreshnessNote(NOW - 1_000, { nowMs: NOW, autoRefreshing: true })).toBe(
      '最終更新: たった今・自動更新中'
    );
  });
});
