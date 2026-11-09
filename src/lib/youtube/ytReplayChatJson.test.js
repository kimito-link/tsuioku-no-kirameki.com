import { describe, it, expect } from 'vitest';
import { ytReplayResponseToRecords, ytReplayItemToRecord } from './ytReplayChatJson.js';

describe('ytReplayResponseToRecords', () => {
  it('コメントとスパチャを記録の形にし、次の続き番号を返す', () => {
    const json = {
      continuationContents: {
        liveChatContinuation: {
          continuations: [{ liveChatReplayContinuationData: { continuation: 'NEXT' } }],
          actions: [
            {
              replayChatItemAction: {
                videoOffsetTimeMsec: '1000',
                actions: [
                  {
                    addChatItemAction: {
                      item: {
                        liveChatTextMessageRenderer: {
                          id: 'A1',
                          authorName: { simpleText: '@foo' },
                          authorExternalChannelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
                          authorPhoto: { thumbnails: [{ url: 'https://x/s.jpg' }, { url: 'https://x/l.jpg' }] },
                          message: { runs: [{ text: 'こんにちは' }, { emoji: { shortcuts: [':heart:'] } }] },
                          timestampUsec: '1762212485000000',
                        },
                      },
                    },
                  },
                ],
              },
            },
            {
              replayChatItemAction: {
                videoOffsetTimeMsec: '2000',
                actions: [
                  {
                    addChatItemAction: {
                      item: {
                        liveChatPaidMessageRenderer: {
                          id: 'P1',
                          authorName: { simpleText: '@bar' },
                          authorExternalChannelId: 'UCbbbbbbbbbbbbbbbbbbbbbb',
                          purchaseAmountText: { simpleText: '￥800' },
                          timestampUsec: '1762212486000000',
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    };
    const out = ytReplayResponseToRecords(json);
    expect(out.next).toBe('NEXT');
    expect(out.lastOffsetMs).toBe(2000);
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ id: 'A1', kind: 'text', name: '@foo', text: 'こんにちはheart', iconUrl: 'https://x/l.jpg', postedAtMs: 1762212485000 });
    expect(out.items[1]).toMatchObject({ id: 'P1', kind: 'superchat', amount: 800, currency: 'JPY' });
  });
  it('知らない種類・壊れた形は捨てる', () => {
    expect(ytReplayItemToRecord({ liveChatViewerEngagementMessageRenderer: { id: 'x' } })).toBeNull();
    expect(ytReplayItemToRecord(null)).toBeNull();
    expect(ytReplayResponseToRecords({}).items).toEqual([]);
  });
});
