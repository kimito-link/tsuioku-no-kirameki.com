import { describe, it, expect } from 'vitest';
import {
  ytRecordToNicoEntry,
  ytSummaryToNicoSnapshot,
  ytChannelUrlForNumericUid,
  watchUrlForStreamKey,
  isWatchLikeTabUrl,
  pseudoLvForVideoId,
} from '../../../extension-youtube/src/ytNicoShim.js';
import { parseTwChatLine } from './twIrcParse.js';

const LINE =
  '@badges=;color=;display-name=ファンA;id=c1;room-id=1;tmi-sent-ts=1762480000123;user-id=58355428 :fan_a!fan_a@fan_a.tmi.twitch.tv PRIVMSG #kimito_link :わこつ';

describe('Twitch の記録 → ニコ生版の画面(ytNicoShim)', () => {
  it('Twitch の1件がニコ生のコメント行になる(本当の時刻・名前・人のページ)', () => {
    const key = 'tw.kimito_link.41234567890';
    const lv = pseudoLvForVideoId(key);
    expect(lv).toMatch(/^lv9\d{11}$/);
    const r = { ...parseTwChatLine(LINE), recordedAt: 1762480001000 };
    const e = ytRecordToNicoEntry(r, 0, lv, r.channelId, 0);
    expect(e).toMatchObject({ text: 'わこつ', nickname: 'ファンA', name: 'ファンA', ytPostedAt: 1762480000123, ytKind: 'text' });
    expect(e.userId).toMatch(/^8\d{9}$/);
    expect(ytChannelUrlForNumericUid(e.userId)).toBe('https://www.twitch.tv/fan_a');
  });

  it('配信のまとめ → 視聴ページスナップショット(Twitch のページ・プレビュー画像)', () => {
    const key = 'tw.kimito_link.41234567890';
    const snap = ytSummaryToNicoSnapshot(
      { title: '雑談', broadcasterName: 'きみとりんく', broadcasterChannelId: 'tw:713936733', broadcasterHandle: 'kimito_link', concurrentViewers: 12, updatedAt: 1 },
      key,
      '',
      {},
    );
    expect(snap.broadcasterPageUrl).toBe('https://www.twitch.tv/kimito_link');
    expect(snap.thumbnailUrl).toBe('https://static-cdn.jtvnw.net/previews-ttv/live_user_kimito_link-440x248.jpg');
    expect(snap.officialViewerCount).toBe(12);
    expect(ytChannelUrlForNumericUid(snap.broadcasterUserId)).toBe('https://www.twitch.tv/kimito_link');
  });

  it('視聴タブの判定と配信のページ', () => {
    expect(isWatchLikeTabUrl('https://www.twitch.tv/kimito_link')).toBe(true);
    expect(isWatchLikeTabUrl('https://www.twitch.tv/directory')).toBe(false);
    expect(isWatchLikeTabUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(watchUrlForStreamKey('tw.kimito_link.1')).toBe('https://www.twitch.tv/kimito_link');
    expect(watchUrlForStreamKey('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('Twitch の有料の応援 → ギフトの記録', async () => {
  const { buildYtGiftBags } = await import('../../../extension-youtube/src/ytGiftToNico.js');
  it('Bits は pt(円の目安)・サブスクとギフトサブは Twitch の名前', () => {
    const lv = pseudoLvForVideoId('tw.kimito_link.9');
    const bits = parseTwChatLine(LINE.replace(';color=;', ';bits=500;color=;').replace('わこつ', 'Cheer500 おめ'));
    const sub = parseTwChatLine(
      '@display-name=S;id=s1;login=s;msg-id=sub;msg-param-sub-plan=1000;system-msg=S\\ssubscribed;tmi-sent-ts=1;user-id=11 :tmi.twitch.tv USERNOTICE #kimito_link',
    );
    const gift = parseTwChatLine(
      '@display-name=G;id=g1;login=g;msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-sub-plan=1000;system-msg=G\\sgifting;tmi-sent-ts=1;user-id=12 :tmi.twitch.tv USERNOTICE #kimito_link',
    );
    const entries = [bits, sub, gift].map((r, i) => ytRecordToNicoEntry({ ...r, recordedAt: 1 + i }, i, lv, r.channelId, i));
    const bags = buildYtGiftBags(entries, lv, {});
    const names = bags.giftEvents.map((/** @type {any} */ x) => x.itemName);
    expect(names).toEqual(['500 Bits', 'サブスク', 'ギフトサブ ×5']);
    expect(bags.giftEvents[0].point).toBe(700);
  });
});
