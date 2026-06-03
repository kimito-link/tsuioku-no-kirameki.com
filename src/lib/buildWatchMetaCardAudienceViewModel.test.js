import { describe, expect, it } from 'vitest';
import { buildWatchMetaCardAudienceViewModel } from './buildWatchMetaCardAudienceViewModel.js';
import { mergeProgramStatsWatchIntoWatchMetaSnapshot } from './mergeProgramStatsWatchIntoWatchMetaSnapshot.js';
import { WATCH_META_CARD_LABELS } from './watchMetaCardStateGate.js';

describe('buildWatchMetaCardAudienceViewModel', () => {
  const nowMs = 1_700_000_000_000;

  it('来場は stateGate に従い、viewerCountFromDom が数値ならロケール表示', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        viewerCountFromDom: 1234,
        recentActiveUsers: 1,
        liveId: 'lv1'
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.visitor.text).toBe('1,234');
    expect(vm.visitor.isPlaceholder).toBe(false);
    expect(vm.visitor.charReactionDelta).toBe(null);
  });

  it('来場が無く同接シグナルがあるときは（数字非公開）プレースホルダ', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        recentActiveUsers: 0,
        officialViewerCount: 50,
        viewerCountFromDom: null
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.visitor.text).toBe(WATCH_META_CARD_LABELS.DATA_MISSING);
    expect(vm.visitor.isPlaceholder).toBe(true);
  });

  it('同接ゲートが false のとき loading 面と aria-busy', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        recentActiveUsers: 0,
        officialViewerCount: null,
        viewerCountFromDom: null,
        liveId: ''
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.concurrent.phase).toBe('loading');
    expect(vm.concurrent.estText).toBe('計測中…');
    expect(vm.concurrent.estIsPlaceholder).toBe(true);
    expect(vm.concurrent.estTitle).toBe(null);
    expect(vm.concurrent.subText).toBe('人');
    expect(vm.concurrent.concurrentLoadingHidden).toBe(false);
    expect(vm.concurrent.concurrentReadyHidden).toBe(true);
    expect(vm.concurrent.ariaBusy).toBe(true);
    expect(vm.concurrent.numericEstimated).toBe(null);
    expect(vm.concurrent.charReactionDelta).toBe(null);
  });

  it('古い official 0 + 来場ありは推定中ではなく滞留推定を出す', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: 4737,
        recentActiveUsers: 0,
        officialViewerCount: 0,
        officialStatsUpdatedAt: nowMs - 3000,
        streamAgeMin: 210
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.concurrent.estText).not.toBe('推定中');
    expect(vm.concurrent.estText).not.toBe('0');
    expect(vm.concurrent.numericEstimated).toBeGreaterThan(100);
  });

  it('来場あり・recentActiveUsers 0・経過不明なら ~0 ではなく推定中', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: 723,
        recentActiveUsers: 0,
        officialViewerCount: null
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: 33 } }
    );
    expect(vm.concurrent.estText).toBe('推定中');
    expect(vm.concurrent.estIsPlaceholder).toBe(true);
    expect(vm.concurrent.numericEstimated).toBe(null);
    expect(vm.nextPrevForReactions.concurrentEstimated).toBe(33);
  });

  it('来場あり・recentActiveUsers 0 でも経過があれば滞留推定を表示する', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: 723,
        recentActiveUsers: 0,
        officialViewerCount: null,
        streamAgeMin: 420
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.concurrent.estText).not.toBe('~0');
    expect(vm.concurrent.estText).toMatch(/^~/u);
    expect(vm.concurrent.numericEstimated).toBeGreaterThan(0);
    expect(vm.concurrent.subText).toContain('5分内 0人');
  });

  it('公式同接が新鮮なら直接値（~ なし）・sub は直接値', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: null,
        recentActiveUsers: 0,
        officialViewerCount: 777,
        officialStatsUpdatedAt: nowMs - 5_000
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.concurrent.phase).toBe('ready');
    expect(vm.concurrent.estText).toBe('777');
    expect(vm.concurrent.estText.startsWith('~')).toBe(false);
    expect(vm.concurrent.subText).toBe('直接値');
    expect(vm.concurrent.concurrentLoadingHidden).toBe(true);
    expect(vm.concurrent.ariaBusy).toBe(false);
    expect(vm.concurrent.estTitle).toContain('直接値');
  });

  it('来場＋経過があれば診断 title に研究中シグナル（C/blend）を併記する', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: 3000,
        recentActiveUsers: 40,
        streamAgeMin: 180,
        officialViewerCount: 500,
        officialStatsUpdatedAt: nowMs - 4_000
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.concurrent.estTitle).toContain('研究中');
    expect(vm.concurrent.estTitle).toContain('C[リトル]');
    // 主値（直接値）は据え置きで研究中シグナルに引っぱられない
    expect(vm.concurrent.estText).toBe('500');
    expect(vm.concurrent.numericEstimated).toBe(500);
  });

  it('マージ後も officialViewerCount は来場補完値と混同されない', () => {
    const merged = mergeProgramStatsWatchIntoWatchMetaSnapshot(
      {
        liveId: 'lvz',
        viewerCountFromDom: null,
        officialViewerCount: 400,
        officialStatsUpdatedAt: nowMs - 3_000,
        recentActiveUsers: 2
      },
      { watchCount: 99_999 }
    );
    expect(merged?.viewerCountFromDom).toBe(99_999);
    const vm = buildWatchMetaCardAudienceViewModel(
      /** @type {Record<string, unknown>} */ (merged),
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: null } }
    );
    expect(vm.visitor.text).toBe('99,999');
    expect(vm.concurrent.estText).toBe('400');
    expect(vm.concurrent.numericEstimated).toBe(400);
  });

  it('来場増加・同接変化で charReactionDelta を返す', () => {
    const vm1 = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: 100,
        recentActiveUsers: 5,
        officialViewerCount: 200,
        officialStatsUpdatedAt: nowMs - 3_000
      },
      { nowMs, prevForReactions: { viewerCount: 90, concurrentEstimated: 200 } }
    );
    expect(vm1.visitor.charReactionDelta).toBe(10);
    expect(vm1.concurrent.charReactionDelta).toBe(null);

    const vm2 = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: 100,
        recentActiveUsers: 5,
        officialViewerCount: 250,
        officialStatsUpdatedAt: nowMs - 3_000
      },
      { nowMs, prevForReactions: { viewerCount: 100, concurrentEstimated: 200 } }
    );
    expect(vm2.visitor.charReactionDelta).toBe(null);
    expect(vm2.concurrent.charReactionDelta).toBe(50);
  });

  it('記録コメント集計と観客メモを返す', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        viewerCountFromDom: 1,
        recentActiveUsers: 1
      },
      {
        nowMs,
        prevForReactions: { viewerCount: null, concurrentEstimated: null },
        commentEntries: [
          { userId: 'a', avatarUrl: 'https://example.com/x.png' },
          { userId: 'a' },
          { userId: '', avatarUrl: 'https://example.com/y.png' }
        ]
      }
    );
    expect(vm.uniqueUsers.text).toBe('1');
    expect(vm.commentsNoId.text).toBe('1');
    expect(vm.audienceNote.text.length).toBeGreaterThan(10);
    expect(vm.audienceNote.title.length).toBeGreaterThan(10);
  });

  it('nextPrevForReactions は来場数値が無いとき viewerCount を維持', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        liveId: 'lv1',
        officialViewerCount: 10,
        officialStatsUpdatedAt: nowMs - 1_000,
        viewerCountFromDom: null,
        recentActiveUsers: 0
      },
      { nowMs, prevForReactions: { viewerCount: 42, concurrentEstimated: 10 } }
    );
    expect(vm.nextPrevForReactions.viewerCount).toBe(42);
  });

  it('計測中フェーズでは concurrentEstimated の prev を更新しない', () => {
    const vm = buildWatchMetaCardAudienceViewModel(
      {
        recentActiveUsers: 0,
        officialViewerCount: null,
        viewerCountFromDom: null,
        liveId: ''
      },
      { nowMs, prevForReactions: { viewerCount: null, concurrentEstimated: 333 } }
    );
    expect(vm.concurrent.phase).toBe('loading');
    expect(vm.nextPrevForReactions.concurrentEstimated).toBe(333);
  });
});
