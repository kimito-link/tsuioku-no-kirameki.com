import { describe, expect, it } from 'vitest';
import { resolveCommentPostWatchTarget } from './commentPostWatchTarget.js';

describe('resolveCommentPostWatchTarget', () => {
  it('候補が0件なら空を返す（no_watch のまま）', () => {
    expect(resolveCommentPostWatchTarget([], '')).toEqual({ url: '', liveId: '' });
    expect(resolveCommentPostWatchTarget(null, '')).toEqual({ url: '', liveId: '' });
    expect(resolveCommentPostWatchTarget(undefined, 'lv1')).toEqual({ url: '', liveId: '' });
  });

  it('候補が1件ならそれを採用する（現在文脈が無くても）', () => {
    expect(
      resolveCommentPostWatchTarget(
        [{ id: 1, url: 'https://live.nicovideo.jp/watch/lv111' }],
        ''
      )
    ).toEqual({ url: 'https://live.nicovideo.jp/watch/lv111', liveId: 'lv111' });
  });

  it('複数件かつ現在文脈の liveId と一致する候補があればそれを優先する', () => {
    const candidates = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv111' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv222' }
    ];
    expect(resolveCommentPostWatchTarget(candidates, 'lv222')).toEqual({
      url: 'https://live.nicovideo.jp/watch/lv222',
      liveId: 'lv222'
    });
  });

  it('複数件かつ現在文脈が一致しない/空なら先頭候補を採用する', () => {
    const candidates = [
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv111' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv222' }
    ];
    expect(resolveCommentPostWatchTarget(candidates, '')).toEqual({
      url: 'https://live.nicovideo.jp/watch/lv111',
      liveId: 'lv111'
    });
    expect(resolveCommentPostWatchTarget(candidates, 'lv999')).toEqual({
      url: 'https://live.nicovideo.jp/watch/lv111',
      liveId: 'lv111'
    });
  });

  it('URL が空/解析不能な候補は無視する', () => {
    const candidates = [
      { id: 1, url: '' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv222' }
    ];
    expect(resolveCommentPostWatchTarget(candidates, '')).toEqual({
      url: 'https://live.nicovideo.jp/watch/lv222',
      liveId: 'lv222'
    });
  });
});
