import { describe, expect, it } from 'vitest';
import { isChunkIndex } from './commentChunkStore.js';
import {
  MERGE_MAX_STREAMS,
  assembleNicoRecentRows,
  buildMergedTimeline,
  describeOpenStreams,
  leaseIdForStream,
  newestSummaryKey,
  nextNicoChunkSeq,
  resolveMergeTargets,
  sanitizeRecentVideoIds,
  tabPageUrl,
  takeMergedVoiceItems,
  takeRecentComments
} from './mergedComeview.js';
import { computePseudoLvForVideoId } from './youtube/ytPseudoLv.js';

const tabs = [
  { id: 1, url: 'https://live.nicovideo.jp/watch/lv351195145', title: '朝の枠 - ニコニコ生放送', active: true },
  { id: 2, url: 'https://www.youtube.com/watch?v=abcdefghijk', title: '歌枠 - YouTube' },
  { id: 3, url: 'https://www.twitch.tv/caster_one', title: '雑談 - Twitch' },
  { id: 4, url: 'https://kick.com/caster_two', title: 'ゲーム - Kick' },
  { id: 5, url: 'https://whowatch.tv/viewer/12345678', title: 'ふわ枠' },
  { id: 6, url: 'https://www.showroom-live.com/r/test_room', title: '部屋' },
  { id: 7, url: 'https://mixch.tv/u/1234567/live', title: 'ミク枠' },
  { id: 8, url: 'https://www.tiktok.com/@some.user_1/live', title: '短枠' },
  { id: 9, url: 'https://example.com/not-a-stream', title: 'メール' }
];

const summaries = {
  'tw.caster_one.1': { updatedAt: 10 },
  'tw.caster_one.9': { updatedAt: 50 },
  'tw.caster_one.00000': { updatedAt: 99 },
  'kk.caster_two.42': { updatedAt: 3 },
  'ww.12345678.7': { updatedAt: 1 },
  'sr.test_room.8': { updatedAt: 1 },
  'mx.1234567.4': { updatedAt: 1 },
  'tt.some.user_1.6': { updatedAt: 1 },
  'tw.nobody_open.3': { updatedAt: 1000 }
};

describe('describeOpenStreams', () => {
  const open = describeOpenStreams(tabs, summaries);

  it('対応する配信タブだけを候補にし、開いていない記録は混ぜない', () => {
    expect(open.map((s) => s.platformId)).toEqual([
      'niconico', 'youtube', 'twitch', 'kick', 'whowatch', 'showroom', 'mixch', 'tiktok'
    ]);
    expect(open.some((s) => String(s.read.kind === 'yt' && s.read.videoId).includes('nobody_open'))).toBe(false);
    expect(JSON.stringify(open)).not.toContain('nobody_open');
  });

  it('各サービスの記録キーは、開いているタブのいちばん新しいもの', () => {
    const by = Object.fromEntries(open.map((s) => [s.platformId, s]));
    expect(by.niconico.read).toEqual({ kind: 'nico', liveId: 'lv351195145' });
    expect(by.youtube.read).toEqual({ kind: 'yt', videoId: 'abcdefghijk' });
    expect(by.twitch.read).toEqual({ kind: 'yt', videoId: 'tw.caster_one.9' });
    expect(by.kick.read).toEqual({ kind: 'yt', videoId: 'kk.caster_two.42' });
    expect(by.whowatch.read).toEqual({ kind: 'yt', videoId: 'ww.12345678.7' });
    expect(by.showroom.read).toEqual({ kind: 'yt', videoId: 'sr.test_room.8' });
    expect(by.mixch.read).toEqual({ kind: 'yt', videoId: 'mx.1234567.4' });
    expect(by.tiktok.read).toEqual({ kind: 'yt', videoId: 'tt.some.user_1.6' });
  });

  it('記録がまだ無い部屋は一覧に出すが、取りにはいかない', () => {
    const rows = describeOpenStreams(
      [{ id: 1, url: 'https://kick.com/brand_new', title: '開始前' }],
      {}
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].read).toEqual({ kind: 'none' });
    expect(rows[0].platformLabel).toBe('Kick');
  });

  it('YouTube 版の写しは元 URL を見て、疑似 lv をニコ生と取り違えない', () => {
    const url = 'https://www.youtube.com/watch?v=abcdefghijk';
    expect(tabPageUrl({ url: 'https://live.nicovideo.jp/watch/lv900000000001', __ytUrl: url })).toBe(url);
    const rows = describeOpenStreams([{ id: 4, url: 'https://live.nicovideo.jp/watch/lv900000000001', __ytUrl: url, title: '歌' }], {});
    expect(rows[0].platformId).toBe('youtube');
    expect(rows[0].read).toEqual({ kind: 'yt', videoId: 'abcdefghijk' });
  });

  it('同じ配信のタブは1つにまとめる', () => {
    const rows = describeOpenStreams([
      { id: 1, url: 'https://live.nicovideo.jp/watch/lv10', title: 'A' },
      { id: 2, url: 'https://live.nicovideo.jp/watch/lv10', title: 'A', active: true }
    ], {});
    expect(rows).toHaveLength(1);
    expect(rows[0].active).toBe(true);
    expect(rows[0].tabId).toBe(2);
  });
});

describe('resolveMergeTargets', () => {
  const open = describeOpenStreams(tabs, summaries);

  it('1件以下は今までどおり1配信のまま', () => {
    expect(resolveMergeTargets(open, []).active).toBe(false);
    expect(resolveMergeTargets(open, ['nico:lv351195145']).active).toBe(false);
  });

  it('開いているものだけを、覚えた順に最大件数まで採用する', () => {
    const ids = ['youtube:abcdefghijk', 'closed:1', 'nico:lv351195145', 'twitch:caster_one'];
    const extra = Array.from({ length: 20 }, (_, i) => `kick:gone.${i}`);
    const resolved = resolveMergeTargets(open, [...ids, ...extra, 'kick:caster_two']);
    expect(resolved.active).toBe(true);
    expect(resolved.chosen.map((s) => s.id)).toEqual([
      'youtube:abcdefghijk',
      'nico:lv351195145',
      'twitch:caster_one',
      'kick:caster_two'
    ]);
    expect(resolved.chosen.length).toBeLessThanOrEqual(MERGE_MAX_STREAMS);
    expect(resolved.chosen.some((s) => s.id === 'closed:1')).toBe(false);
  });
});

describe('buildMergedTimeline', () => {
  const nico = describeOpenStreams([tabs[0]], {})[0];
  const yt = describeOpenStreams([tabs[1]], {})[0];

  it('時刻順に並べ、配信ごとの札を付ける。同じ番号は1行', () => {
    const timeline = buildMergedTimeline([
      {
        stream: nico,
        rows: [
          { text: 'あと', commentNo: '2', capturedAt: 300, userId: '9', name: 'b' },
          { text: '先', commentNo: '1', capturedAt: 100, userId: '8', name: 'a' },
          { text: '先の写し', commentNo: '1', capturedAt: 120, userId: '8', name: 'a' }
        ]
      },
      {
        stream: yt,
        rows: [
          { text: '間', id: 'm', postedAtMs: 200, channelId: 'UC1', name: 'c', iconUrl: 'https://example.com/a.png' }
        ]
      }
    ]);
    expect(timeline.map((row) => row.text)).toEqual(['先の写し', '間', 'あと']);
    expect(timeline[0].sourceBadge).toContain('ニコ生');
    expect(timeline[1].sourceBadge).toContain('YouTube');
    expect(timeline[0].voiceId).not.toBe(timeline[2].voiceId);
    expect(timeline[1].userId).toBe('UC1');
  });

  it('別の配信で同じ番号でも別のコメントとして残す', () => {
    const timeline = buildMergedTimeline([
      { stream: nico, rows: [{ text: 'n', commentNo: '1', capturedAt: 1 }] },
      { stream: yt, rows: [{ text: 'y', commentNo: '1', capturedAt: 2 }] }
    ]);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].voiceId).not.toBe(timeline[1].voiceId);
  });

  it('本文の無い行は捨てる', () => {
    expect(buildMergedTimeline([{ stream: nico, rows: [{ text: '  ', commentNo: '1', capturedAt: 1 }] }])).toEqual([]);
  });
});

describe('takeMergedVoiceItems', () => {
  const row = (voiceId) => ({ voiceId, text: voiceId });

  it('最初の絵は読まず、その後の新しい行だけ読む', () => {
    const heard = new Set();
    const state = { seeded: false, now: 1000, lastAt: 0, maxSpeak: 3, gapMs: 15000 };
    expect(takeMergedVoiceItems([row('a'), row('b')], heard, state)).toEqual([]);
    expect(heard.has('a')).toBe(true);
    state.seeded = true;
    state.lastAt = 1000;
    state.now = 2000;
    expect(takeMergedVoiceItems([row('a'), row('c')], heard, state).map((r) => r.voiceId)).toEqual(['c']);
    expect(takeMergedVoiceItems([row('c')], heard, state)).toEqual([]);
  });

  it('しばらく空いたあとの溜まりは新しい数件だけ読む', () => {
    const heard = new Set();
    const state = { seeded: true, now: 50000, lastAt: 0, maxSpeak: 3, gapMs: 15000 };
    const items = ['1', '2', '3', '4', '5'].map(row);
    expect(takeMergedVoiceItems(items, heard, state).map((r) => r.voiceId)).toEqual(['3', '4', '5']);
    expect(heard.has('1')).toBe(true);
  });
});

describe('補助', () => {
  it('新しい記録キーを選ぶ', () => {
    expect(newestSummaryKey(summaries, 'tw.', 'caster_one')).toBe('tw.caster_one.9');
    expect(newestSummaryKey(null, 'tw.', 'caster_one')).toBe('');
  });

  it('末尾だけ残す', () => {
    expect(takeRecentComments([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(takeRecentComments(null, 2)).toEqual([]);
  });

  it('末尾が空でも、流し込み済みのチャンクから新しい順に出す', () => {
    const index = { v: 1, liveId: 'lv351771428', seqs: [0, 1, 2], total: 2394, maxPerChunk: 1000 };
    expect(isChunkIndex(index, 'lv351771428')).toBe(true);
    expect(nextNicoChunkSeq(index, [], 0, 40)).toBe(2);
    const newest = Array.from({ length: 50 }, (_, i) => ({
      text: `応援 ${i + 1}`,
      commentNo: String(2300 + i),
      capturedAt: 1_700_000_000_000 + i * 1000
    }));
    expect(nextNicoChunkSeq(index, [2], newest.length, 40)).toBe(null);
    const rows = assembleNicoRecentRows({ chunks: [newest], tail: [] }, 40);
    expect(rows).toHaveLength(40);
    expect(rows[0].text).toBe('応援 11');
    expect(rows[39].text).toBe('応援 50');
  });

  it('新しいチャンクが少ないときは、その前のチャンクだけ足す', () => {
    const index = { v: 1, liveId: 'lv1', seqs: [0, 1, 2], total: 40, maxPerChunk: 1000 };
    expect(nextNicoChunkSeq(index, [2], 1, 40)).toBe(1);
    expect(nextNicoChunkSeq(index, [2, 1], 40, 40)).toBe(null);
    const prev = Array.from({ length: 39 }, (_, i) => ({
      text: `前 ${i}`,
      commentNo: String(i + 1),
      capturedAt: 1000 + i
    }));
    const rows = assembleNicoRecentRows({
      chunks: [prev, [{ text: '新しい', commentNo: '40', capturedAt: 3000 }]],
      tail: []
    }, 40);
    expect(rows).toHaveLength(40);
    expect(rows.at(-1)?.text).toBe('新しい');
    expect(rows.some((row) => row.commentNo === '0')).toBe(false);
  });

  it('チャンクが無いときは本体配列の新しい側を使い、末尾の新しい行も足す', () => {
    const main = [
      { text: '古い', commentNo: '1', capturedAt: 1 },
      { text: '保存', commentNo: '2', capturedAt: 2 }
    ];
    expect(assembleNicoRecentRows({ main, tail: [] }, 40).map((row) => row.text)).toEqual(['古い', '保存']);
    expect(assembleNicoRecentRows({
      chunks: [[{ text: '保存', commentNo: '1', capturedAt: 1 }]],
      main,
      tail: [{ text: '未圧縮', commentNo: '9', capturedAt: 9 }]
    }, 40).map((row) => row.text)).toEqual(['保存', '未圧縮']);
    expect(assembleNicoRecentRows({ chunks: [], main, tail: [] }, 40)).toEqual([]);
    expect(nextNicoChunkSeq(null, [], 0, 40)).toBe(null);
  });

  it('末尾読みの id は仮キーと余分を落とす', () => {
    expect(sanitizeRecentVideoIds([' tw.a.1 ', '', 'kk.b.00000', 'a/../b', 'x'.repeat(90), 'tw.a.1', 'kk.b.2'])).toEqual(['tw.a.1', 'kk.b.2']);
  });

  it('読み手の id はニコ生の lv と、他サービスの疑似 lv', () => {
    const nico = describeOpenStreams([tabs[0]], {})[0];
    const yt = describeOpenStreams([tabs[1]], {})[0];
    expect(leaseIdForStream(nico)).toBe('lv351195145');
    expect(leaseIdForStream(yt)).toBe(computePseudoLvForVideoId('abcdefghijk'));
    expect(leaseIdForStream(describeOpenStreams([{ url: 'https://kick.com/brand_new' }], {})[0])).toBe('');
  });
});
