import { describe, it, expect } from 'vitest';
import {
  NEXT_LIVE_REQUEST_TYPE,
  AUTOPATROL_ENABLED_KEY,
  pickNextPatrolLv
} from './rankingPatrolMessages.js';

describe('定数', () => {
  it('メッセージ type と storage キー', () => {
    expect(NEXT_LIVE_REQUEST_TYPE).toBe('NLS_NEXT_LIVE_REQUEST');
    expect(AUTOPATROL_ENABLED_KEY).toBe('nls_autopatrol_enabled_v1');
  });
});

describe('pickNextPatrolLv', () => {
  it('queue 先頭の未訪問を選び queue から外す', () => {
    const r = pickNextPatrolLv({ queue: ['lv10000', 'lv20000'], visited: [] });
    expect(r.lv).toBe('lv10000');
    expect(r.nextQueue).toEqual(['lv20000']);
    expect(r.nextVisited).toEqual(['lv10000']);
  });

  it('訪問済みは飛ばす(スキップした訪問済みは queue に残る=再訪余地)', () => {
    const r = pickNextPatrolLv({ queue: ['lv10000', 'lv20000'], visited: ['lv10000'] });
    expect(r.lv).toBe('lv20000');
    expect(r.nextQueue).toEqual(['lv10000']);
    expect(r.nextVisited).toEqual(['lv10000', 'lv20000']);
  });

  it('excludeLv(今いる配信)は選ばない', () => {
    const r = pickNextPatrolLv({ queue: ['lv10000', 'lv20000'], visited: [], excludeLv: 'lv10000' });
    expect(r.lv).toBe('lv20000');
  });

  it('queue 空なら candidates から未訪問を補充して選ぶ', () => {
    const r = pickNextPatrolLv({
      queue: [],
      visited: ['lv99999'],
      candidates: ['lv99999', 'lv30000', 'lv40000']
    });
    expect(r.lv).toBe('lv30000');
    expect(r.nextQueue).toEqual(['lv40000']);
    expect(r.nextVisited).toEqual(['lv99999', 'lv30000']);
  });

  it('候補が全部訪問済みなら null', () => {
    const r = pickNextPatrolLv({ queue: ['lv10000'], visited: ['lv10000'], candidates: ['lv10000'] });
    expect(r.lv).toBeNull();
    expect(r.nextVisited).toEqual(['lv10000']);
  });

  it('不正な lv は無視', () => {
    const r = pickNextPatrolLv({ queue: ['bad', 'lv123456'], visited: [] });
    expect(r.lv).toBe('lv123456');
  });

  it('大文字 lv は小文字化', () => {
    const r = pickNextPatrolLv({ queue: ['LV10000'], visited: [] });
    expect(r.lv).toBe('lv10000');
  });
});
