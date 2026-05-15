import { describe, it, expect, afterEach } from 'vitest';
import {
  createCommentSubmitProfiler,
  NLS_COMMENT_SUBMIT_PROFILE_FLAG,
  NLS_COMMENT_SUBMIT_LAST_TIMINGS,
  isCommentSubmitProfileEnabled
} from './commentSubmitProfiling.js';

describe('commentSubmitProfiling', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_PROFILE_FLAG);
    Reflect.deleteProperty(globalThis, NLS_COMMENT_SUBMIT_LAST_TIMINGS);
  });

  it('フラグ OFF なら create は null', () => {
    expect(isCommentSubmitProfileEnabled()).toBe(false);
    expect(createCommentSubmitProfiler({ now: () => 0 })).toBeNull();
  });

  it('フラグ ON なら mark/finish が記録する', () => {
    globalThis[NLS_COMMENT_SUBMIT_PROFILE_FLAG] = true;
    let t = 0;
    const prof = createCommentSubmitProfiler({ now: () => (t += 10) });
    expect(prof).not.toBeNull();
    prof.mark('a');
    prof.mark('b');
    prof.finish('x');
    expect(globalThis[NLS_COMMENT_SUBMIT_LAST_TIMINGS]).toEqual([
      ['a', 10],
      ['b', 20]
    ]);
  });
});
