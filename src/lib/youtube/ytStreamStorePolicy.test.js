import { describe, it, expect } from 'vitest';
import {
  YT_SIDE_PANEL_DISPLAY_LIMIT,
  buildYtCommentPrimaryKey,
  mergeYtStreamSummary,
  prepareYtCommentsForIdb,
  selectYtNewestCommentsForDisplay,
  createYtStreamIncrementalState,
  applyYtStreamIncrementalItems,
} from './ytStreamStorePolicy.js';

describe('buildYtCommentPrimaryKey', () => {
  it('videoId と commentId から一意の複合主キーを作る', () => {
    expect(buildYtCommentPrimaryKey('abc123xyz', 'ChwKGk1')).toBe('abc123xyz::ChwKGk1');
    expect(buildYtCommentPrimaryKey('', 'ChwKGk1')).toBe('');
    expect(buildYtCommentPrimaryKey('abc123xyz', '')).toBe('');
  });
});

describe('mergeYtStreamSummary', () => {
  it('コメント本体配列（items）を持たず、配信一覧の要約情報だけを生成・更新する（上限間引き・自動削除なし）', () => {
    const t0 = 1_700_000_000_000;
    const first = mergeYtStreamSummary(
      null,
      {
        videoId: 'vid-1',
        title: 'テスト配信',
        broadcasterName: 'りんく',
        broadcasterChannelId: 'UCOwner123456789012345678',
        chatFilterLabel: 'すべてのチャット',
        itemCount: 120,
      },
      t0,
    );

    expect(first).toEqual({
      videoId: 'vid-1',
      title: 'テスト配信',
      broadcasterName: 'りんく',
      broadcasterChannelId: 'UCOwner123456789012345678',
      broadcasterHandle: '',
      broadcasterIconUrl: '',
      concurrentViewers: null,
      peakConcurrentViewers: null,
      chatFilterLabel: 'すべてのチャット',
      itemCount: 120,
      startedAt: null,
      createdAt: t0,
      updatedAt: t0,
    });
    expect('items' in first).toBe(false);

    const t1 = t0 + 60_000;
    const updated = mergeYtStreamSummary(
      first,
      {
        videoId: 'vid-1',
        broadcasterIconUrl: 'https://yt3.ggpht.com/owner=s88',
        concurrentViewers: 1234,
        itemCount: 5000, // 1500件上限なしで全件数を保持
      },
      t1,
    );
    expect(updated.title).toBe('テスト配信');
    expect(updated.broadcasterIconUrl).toBe('https://yt3.ggpht.com/owner=s88');
    expect(updated.concurrentViewers).toBe(1234);
    expect(updated.peakConcurrentViewers).toBe(1234);
    // 同時視聴が減っても最大の記録は残る
    const later = mergeYtStreamSummary(updated, { videoId: 'vid-1', concurrentViewers: 900 }, t1 + 1);
    expect(later.concurrentViewers).toBe(900);
    expect(later.peakConcurrentViewers).toBe(1234);
    // 読み違いの巨大な数は保存しない・前に入ってしまった分も捨てる
    const broken = mergeYtStreamSummary({ ...later, concurrentViewers: 1.2e28, peakConcurrentViewers: 1.2e28 }, { videoId: 'vid-1', concurrentViewers: 1.2e28 }, t1 + 2);
    expect(broken.concurrentViewers).toBe(null);
    expect(broken.peakConcurrentViewers).toBe(null);
    const shogi = mergeYtStreamSummary(
      null,
      { videoId: 'ab.n-shogi.live1', title: '将棋チャンネル', broadcasterName: '将棋チャンネル' },
      t0,
    );
    // 保存欄は届いた絵だけ。サービスの公開ロゴで埋めるのは表示側(ytSummaryToNicoSnapshot)。
    expect(shogi.broadcasterIconUrl).toBe('');
    expect(updated.itemCount).toBe(5000);
    expect(updated.createdAt).toBe(t0);
    expect(updated.updatedAt).toBe(t1);
    expect('items' in updated).toBe(false);
  });

  it('読みに失敗しても前の同時視聴者数を残し、古くなった印だけ付ける。件数だけの更新では古くしない', () => {
    const t0 = 1_700_000_000_000;
    const saved = mergeYtStreamSummary(
      null,
      { videoId: 'vid-1', concurrentViewers: 4321, sourceUrl: 'https://www.youtube.com/@testchan/live' },
      t0,
    );
    expect(saved.concurrentViewers).toBe(4321);
    expect(saved.viewersReadAt).toBe(t0);
    expect(saved.viewersStale).toBeUndefined();
    expect(saved.sourceUrl).toBe('https://www.youtube.com/@testchan/live');

    const failed = mergeYtStreamSummary(saved, { videoId: 'vid-1', viewersRead: false }, t0 + 120_000);
    expect(failed.concurrentViewers).toBe(4321);
    expect(failed.viewersReadAt).toBe(t0);
    expect(failed.viewersStale).toBe(true);

    const counted = mergeYtStreamSummary(saved, { videoId: 'vid-1', itemCount: 9 }, t0 + 10_000);
    expect(counted.concurrentViewers).toBe(4321);
    expect(counted.viewersReadAt).toBe(t0);
    expect(counted.viewersStale).toBeUndefined();
  });
});

describe('prepareYtCommentsForIdb', () => {
  it('同一バッチ内の重複 id を除外し、1500件を超えても間引かず全件に pk と videoId を付与する', () => {
    const rawBatch = Array.from({ length: 1600 }, (_, i) => ({
      id: `msg-${i + 1}`,
      channelId: `UCUser${i + 1}`,
      name: `@User${i + 1}`,
      text: `コメント ${i + 1}`,
      kind: 'text',
      amount: 0,
      currency: '',
      badges: [],
      ts: '12:00 PM',
    }));
    // 重複1件を追加
    rawBatch.push({ ...rawBatch[0] });

    const records = prepareYtCommentsForIdb('stream-xyz', rawBatch, 1_700_000_000_000);
    expect(records).toHaveLength(1600);
    expect(records[0].pk).toBe('stream-xyz::msg-1');
    expect(records[0].videoId).toBe('stream-xyz');
    expect(records[1599].pk).toBe('stream-xyz::msg-1600');
  });
});

describe('selectYtNewestCommentsForDisplay', () => {
  it('全件保存されたコメント配列から、新しい順（降順）で指定上限件数だけを返す', () => {
    expect(YT_SIDE_PANEL_DISPLAY_LIMIT).toBeGreaterThan(0);
    const items = [
      { id: 'c1', text: '1番目', seq: 1 },
      { id: 'c2', text: '2番目', seq: 2 },
      { id: 'c3', text: '3番目', seq: 3 },
      { id: 'c4', text: '4番目', seq: 4 },
      { id: 'c5', text: '5番目', seq: 5 },
    ];

    const displayed = selectYtNewestCommentsForDisplay(items, 3);
    expect(displayed.map((x) => x.id)).toEqual(['c5', 'c4', 'c3']);
    // 元の配列（全件データ）は破壊しない
    expect(items).toHaveLength(5);
  });
});

describe('applyYtStreamIncrementalItems（1万件配信対応の差分更新）', () => {
  it('1万件の既存コメント状態に対して新着バッチだけを O(ΔN) で追記・ランキング差分更新し、既読 pk は重複加算しない', () => {
    const state = createYtStreamIncrementalState('stream-10k', {
      broadcasterChannelId: 'UCOwner111111111111111111',
    });

    const initial10k = Array.from({ length: 10_000 }, (_, i) => {
      const n = i + 1;
      const isSuperchat = n % 1000 === 0;
      const isOwner = n % 2500 === 0 && !isSuperchat;
      return {
        id: `msg-${n}`,
        pk: `stream-10k::msg-${n}`,
        videoId: 'stream-10k',
        channelId: isOwner
          ? 'UCOwner111111111111111111'
          : isSuperchat
            ? `UCSupporter${n}`
            : `UCViewer${n % 500}`,
        name: isOwner ? '@Owner' : isSuperchat ? `@Supporter${n}` : `@Viewer${n % 500}`,
        text: `コメント #${n}`,
        kind: isSuperchat ? 'superchat' : 'text',
        amount: isSuperchat ? 1000 : 0,
        currency: isSuperchat ? 'JPY' : '',
        badges: isOwner ? ['owner'] : [],
        ts: n,
        recordedAt: 1_700_000_000_000 + n,
      };
    });

    const resInitial = applyYtStreamIncrementalItems(state, initial10k);
    expect(resInitial.addedCount).toBe(10_000);
    expect(state.totalCount).toBe(10_000);
    expect(state.laneCounts.rinku).toBe(2); // 2500, 7500
    expect(state.laneCounts.konta).toBe(10); // 1000, 2000, ..., 10000
    expect(state.laneCounts.rinku + state.laneCounts.konta + state.laneCounts.tanunee).toBe(10_000);
    expect(state.laneDisplay.tanunee).toHaveLength(YT_SIDE_PANEL_DISPLAY_LIMIT);
    expect(state.laneDisplay.tanunee[0].id).toBe('msg-9999');
    expect(resInitial.ranking.totalsByCurrency.JPY).toBe(10_000);

    // 境界の既読1件(msg-10000)＋新着3件を差分適用
    const deltaBatch = [
      initial10k[9999], // 既読（スキップされるべき）
      {
        id: 'msg-10001',
        pk: 'stream-10k::msg-10001',
        videoId: 'stream-10k',
        channelId: 'UCNewViewer1',
        name: '@NewViewer1',
        text: '10001件目の一般コメント',
        kind: 'text',
        amount: 0,
        currency: '',
        badges: [],
        ts: 10001,
        recordedAt: 1_700_000_010_001,
      },
      {
        id: 'msg-10002',
        pk: 'stream-10k::msg-10002',
        videoId: 'stream-10k',
        channelId: 'UCSupporter1000',
        name: '@Supporter1000',
        text: '追加スパチャ！',
        kind: 'superchat',
        amount: 5000,
        currency: 'JPY',
        badges: [],
        ts: 10002,
        recordedAt: 1_700_000_010_002,
      },
      {
        id: 'msg-10003',
        pk: 'stream-10k::msg-10003',
        videoId: 'stream-10k',
        channelId: 'UCOwner111111111111111111',
        name: '@Owner',
        text: 'ありがとう！',
        kind: 'text',
        amount: 0,
        currency: '',
        badges: ['owner'],
        ts: 10003,
        recordedAt: 1_700_000_010_003,
      },
    ];

    const resDelta = applyYtStreamIncrementalItems(state, deltaBatch);
    expect(resDelta.addedCount).toBe(3); // 既読1件は除外され新着3件のみ
    expect(state.totalCount).toBe(10_003);
    expect(resDelta.rankingChanged).toBe(true);
    expect(resDelta.ranking.totalsByCurrency.JPY).toBe(15_000);
    expect(resDelta.ranking.byCurrency.JPY[0].channelId).toBe('UCSupporter1000');
    expect(resDelta.ranking.byCurrency.JPY[0].amount).toBe(6000);
    expect(resDelta.addedByLane.tanunee.map((x) => x.id)).toEqual(['msg-10001']);
    expect(resDelta.addedByLane.konta.map((x) => x.id)).toEqual(['msg-10002']);
    expect(resDelta.addedByLane.rinku.map((x) => x.id)).toEqual(['msg-10003']);
    expect(state.laneDisplay.tanunee[0].id).toBe('msg-10001');
    expect(state.laneDisplay.tanunee).toHaveLength(YT_SIDE_PANEL_DISPLAY_LIMIT);
  });
});

describe('mergeYtStreamSummary の配信開始時刻', () => {
  it('ページの開始時刻を覚え、次に来なくても前の値を残す', async () => {
    const { mergeYtStreamSummary } = await import('./ytStreamStorePolicy.js');
    const a = mergeYtStreamSummary(undefined, { videoId: 'v', startedAt: 1781434926000 }, 1793000000000);
    expect(a.startedAt).toBe(1781434926000);
    const b = mergeYtStreamSummary(a, { videoId: 'v' }, 1793000005000);
    expect(b.startedAt).toBe(1781434926000);
    expect(b.createdAt).toBe(1793000000000);
  });
  it('目安の開始時刻は早いほうだけ残し、正確な値が来たら上書きする', async () => {
    const { mergeYtStreamSummary } = await import('./ytStreamStorePolicy.js');
    const a = mergeYtStreamSummary(undefined, { videoId: 'v', startedAt: 1000_000, startedAtApprox: true }, 5000_000);
    expect(a.startedAt).toBe(1000_000);
    expect(a.startedAtApprox).toBe(true);
    const b = mergeYtStreamSummary(a, { videoId: 'v', startedAt: 1960_000, startedAtApprox: true }, 5000_000);
    expect(b.startedAt).toBe(1000_000);
    const c = mergeYtStreamSummary(b, { videoId: 'v', startedAt: 940_000, startedAtApprox: true }, 5000_000);
    expect(c.startedAt).toBe(940_000);
    const d = mergeYtStreamSummary(c, { videoId: 'v', startedAt: 1200_000 }, 5000_000);
    expect(d.startedAt).toBe(1200_000);
    expect(d.startedAtApprox).toBeUndefined();
  });
});
