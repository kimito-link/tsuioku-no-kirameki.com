import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withCommentPostDeadline,
  shouldRevertOptimisticPost,
  COMMENT_POST_DEADLINE_MS,
  COMMENT_POST_TIMEOUT_MESSAGE
} from './commentPostDeadline.js';

describe('withCommentPostDeadline', () => {
  it('締切前に成功すればそのまま透過する', async () => {
    const p = Promise.resolve({ ok: true, error: '' });
    const result = await withCommentPostDeadline(p, 5000);
    expect(result).toEqual({ ok: true, error: '' });
  });

  it('締切前に通常失敗すればそのまま透過する(timedOutは付かない)', async () => {
    const p = Promise.resolve({ ok: false, error: 'コメント送信に失敗しました。' });
    const result = await withCommentPostDeadline(p, 5000);
    expect(result).toEqual({ ok: false, error: 'コメント送信に失敗しました。' });
    expect(result.timedOut).toBeUndefined();
  });

  describe('締切超過(フェイクタイマー)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('締切内に解決しない場合、{ok:false, timedOut:true} を返す', async () => {
      const neverResolves = new Promise(() => {});
      const resultPromise = withCommentPostDeadline(neverResolves, 5000);
      vi.advanceTimersByTime(5000);
      const result = await resultPromise;
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toBe(COMMENT_POST_TIMEOUT_MESSAGE);
    });

    it('既定の締切値は5秒', () => {
      expect(COMMENT_POST_DEADLINE_MS).toBe(5000);
    });

    it('タイムアウト文言は失敗と断定しない(嘘をつかない)', () => {
      expect(COMMENT_POST_TIMEOUT_MESSAGE).not.toMatch(/失敗/);
      expect(COMMENT_POST_TIMEOUT_MESSAGE).toContain('届いている可能性');
    });
  });
});

describe('shouldRevertOptimisticPost', () => {
  it('明確な失敗(ok:false, timedOutなし)は revert してよい', () => {
    expect(shouldRevertOptimisticPost({ ok: false, error: '送信に失敗しました。' })).toBe(true);
  });

  it('タイムアウト(ok:false, timedOut:true)は revert しない', () => {
    expect(shouldRevertOptimisticPost({ ok: false, timedOut: true })).toBe(false);
  });

  it('成功(ok:true)は revert しない', () => {
    expect(shouldRevertOptimisticPost({ ok: true })).toBe(false);
  });

  it('null/undefined/不正な形は revert しない', () => {
    expect(shouldRevertOptimisticPost(null)).toBe(false);
    expect(shouldRevertOptimisticPost(undefined)).toBe(false);
    expect(shouldRevertOptimisticPost(/** @type {any} */ ('x'))).toBe(false);
  });
});
