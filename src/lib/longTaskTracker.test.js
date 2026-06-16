import { describe, it, expect } from 'vitest';
import {
  createLongTaskState,
  recordLongTask,
  summarizeLongTasks,
  LONGTASK_MIN_MS,
  LONGTASK_TOP_MAX,
  LONGTASK_RECENT_MAX
} from './longTaskTracker.js';

describe('longTaskTracker', () => {
  it('空状態を作る', () => {
    const s = createLongTaskState();
    expect(s).toEqual({ top: [], recent: [], totalCount: 0, maxMs: 0 });
  });

  it('閾値(50ms)未満は記録しない', () => {
    const s = recordLongTask(createLongTaskState(), { durationMs: LONGTASK_MIN_MS - 1 });
    expect(s.totalCount).toBe(0);
    expect(s.recent.length).toBe(0);
  });

  it('閾値以上は記録し maxMs/totalCount を更新', () => {
    let s = createLongTaskState();
    s = recordLongTask(s, { durationMs: 120, atMs: 1000, marker: 'tick', attribution: 'script' });
    expect(s.totalCount).toBe(1);
    expect(s.maxMs).toBe(120);
    expect(s.recent[0]).toMatchObject({ durationMs: 120, marker: 'tick', attribution: 'script' });
    expect(s.top[0].durationMs).toBe(120);
  });

  it('top は duration 降順で TOP_MAX 件に制限', () => {
    let s = createLongTaskState();
    for (let i = 1; i <= LONGTASK_TOP_MAX + 5; i++) {
      s = recordLongTask(s, { durationMs: 50 + i });
    }
    expect(s.top.length).toBe(LONGTASK_TOP_MAX);
    // 降順
    for (let i = 1; i < s.top.length; i++) {
      expect(s.top[i - 1].durationMs).toBeGreaterThanOrEqual(s.top[i].durationMs);
    }
    // 最大は 50 + (TOP_MAX+5)
    expect(s.top[0].durationMs).toBe(50 + LONGTASK_TOP_MAX + 5);
  });

  it('recent は時系列で RECENT_MAX 件に制限(古いものから落とす)', () => {
    let s = createLongTaskState();
    for (let i = 0; i < LONGTASK_RECENT_MAX + 10; i++) {
      s = recordLongTask(s, { durationMs: 60, atMs: i });
    }
    expect(s.recent.length).toBe(LONGTASK_RECENT_MAX);
    // 末尾が最新(atMs 最大)
    expect(s.recent[s.recent.length - 1].atMs).toBe(LONGTASK_RECENT_MAX + 10 - 1);
    expect(s.totalCount).toBe(LONGTASK_RECENT_MAX + 10);
  });

  it('marker/attribution は長すぎる文字列を切り詰める', () => {
    const s = recordLongTask(createLongTaskState(), {
      durationMs: 100,
      marker: 'm'.repeat(200),
      attribution: 'a'.repeat(200)
    });
    expect(s.recent[0].marker.length).toBeLessThanOrEqual(80);
    expect(s.recent[0].attribution.length).toBeLessThanOrEqual(120);
  });

  it('壊れた入力でも安全(空状態として扱う)', () => {
    const s = recordLongTask(null, { durationMs: 100 });
    expect(s.totalCount).toBe(1);
    expect(recordLongTask(createLongTaskState(), null).totalCount).toBe(0);
    expect(recordLongTask(createLongTaskState(), { durationMs: 'x' }).totalCount).toBe(0);
  });

  it('summarizeLongTasks は top5/recent8 に抑える', () => {
    let s = createLongTaskState();
    for (let i = 0; i < 30; i++) s = recordLongTask(s, { durationMs: 60 + i, atMs: i });
    const sum = summarizeLongTasks(s);
    expect(sum.top.length).toBeLessThanOrEqual(5);
    expect(sum.recent.length).toBeLessThanOrEqual(8);
    expect(sum.totalCount).toBe(30);
    expect(sum.maxMs).toBe(60 + 29);
  });
});
