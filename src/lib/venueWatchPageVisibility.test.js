import { describe, expect, it } from 'vitest';
import { VENUE_WATCH_KEY_LOSS_CLOSE_MS, venueRootVisibilityAction } from './venueWatchPageVisibility.js';

describe('venueRootVisibilityAction', () => {
  it('視聴キーがあるときは根も会場も触らない', () => {
    expect(venueRootVisibilityAction({ shown: true, venueOpen: true, missingMs: 9999 })).toEqual({
      hideRoot: false,
      closeVenue: false,
    });
  });

  it('キーが一瞬取れなくても、開いている会場は閉じない（根だけ隠せる）', () => {
    expect(venueRootVisibilityAction({ shown: false, venueOpen: true, missingMs: 0 })).toEqual({
      hideRoot: true,
      closeVenue: false,
    });
    expect(venueRootVisibilityAction({ shown: false, venueOpen: true, missingMs: VENUE_WATCH_KEY_LOSS_CLOSE_MS - 1 })).toEqual({
      hideRoot: true,
      closeVenue: false,
    });
  });

  it('視聴ページ以外に移ってしばらくしたら、開いていた会場を閉じる', () => {
    expect(venueRootVisibilityAction({ shown: false, venueOpen: true, missingMs: VENUE_WATCH_KEY_LOSS_CLOSE_MS })).toEqual({
      hideRoot: true,
      closeVenue: true,
    });
  });

  it('もともと閉じているときは、閉じる操作をしない', () => {
    expect(venueRootVisibilityAction({ shown: false, venueOpen: false, missingMs: 9999 })).toEqual({
      hideRoot: true,
      closeVenue: false,
    });
  });
});
