import { describe, expect, it } from 'vitest';
import { shouldAcceptYtLiveRows } from './ytLiveRowsAccept.js';
import { shouldReadYtComment } from './ytVoiceQueue.js';
import { pickNewVenueSpeech } from '../venueSpeech.js';
import { parseMxMessage } from '../mixch/mxParse.js';
import { resolveVenueSpeechPaintSkip } from '../venuePaintSchedule.js';

describe('shouldAcceptYtLiveRows', () => {
  it('会場が仮キーで開いていても、同じミクチャの部屋の新着は受け取る', () => {
    expect(
      shouldAcceptYtLiveRows({
        incomingKey: 'mx.19026325.7788',
        cachedKeys: ['mx.19026325.00000'],
        currentWatchKey: 'mx.19026325.00000',
        pageUrl: 'https://mixch.tv/u/19026325/live',
      }),
    ).toBe(true);
    expect(
      shouldAcceptYtLiveRows({
        incomingKey: 'mx.19026325.7788',
        cachedKeys: [],
        currentWatchKey: '',
        pageUrl: 'https://mixch.tv/u/19026325/live',
      }),
    ).toBe(true);
    expect(
      shouldAcceptYtLiveRows({
        incomingKey: 'mx.9.7788',
        cachedKeys: ['mx.19026325.00000'],
        currentWatchKey: 'mx.19026325.00000',
        pageUrl: 'https://mixch.tv/u/19026325/live',
      }),
    ).toBe(false);
  });
});

describe('ミクチャのコメントは読み上げ列に乗る(過去分だけ乗らない)', () => {
  const liveRaw = { kind: 0, message_id: 'Ab1', user_id: 11, name: 'ファン', body: 'こんにちわ', created: 1700000000 };
  const live = parseMxMessage(liveRaw, { userId: '19026325', nowMs: 1700000000000 });

  it('ソケットの新着には skipVoice が付かない。履歴だけ付く', () => {
    expect(live).toMatchObject({ text: 'こんにちわ', kind: 'text' });
    expect(live.skipVoice).toBeUndefined();
    expect(shouldReadYtComment(live)).toBe(true);
    expect(shouldReadYtComment({ ...live, skipVoice: true })).toBe(false);
  });

  it('会場の新着抽出は、ライブを読み、履歴(skipVoice)は既読だけにする', () => {
    const rows = [
      { commentNo: 1, userId: '1', name: '昔', text: '履歴', skipVoice: true },
      { commentNo: 2, userId: '2', name: live.name, text: live.text },
    ];
    const first = pickNewVenueSpeech(rows, { primed: false }, { primeEmit: 3 });
    expect(first.speeches.map((s) => s.text)).toEqual(['こんにちわ']);
    const again = pickNewVenueSpeech(rows, first, { primeEmit: 3 });
    expect(again.speeches).toEqual([]);
  });

  it('しまった会場でも読み上げは続ける。裏タブだけ待ち行列を貯めない(描画の間引きで声を止めない)', () => {
    const tucked = resolveVenueSpeechPaintSkip({ open: true, tucked: true, voiceEnabled: true });
    expect(tucked).toEqual({ skipSeats: true, skipEnqueue: false, venueGate: 'ok' });
    const hidden = resolveVenueSpeechPaintSkip({ open: true, hidden: true, voiceEnabled: true });
    expect(hidden.skipEnqueue).toBe(true);
  });
});
