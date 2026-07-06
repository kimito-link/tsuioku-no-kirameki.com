import { describe, it, expect } from 'vitest';
import { buildBroadcastScorePanelViewModel, broadcastScorePanelSig } from './broadcastScorePanelViewModel.js';

const NOW = 1_000_000;

const freshPreview = {
  liveId: 'lv1',
  at: NOW,
  totalComments: 3000,
  commenters: 600,
  commentsPerMinute: 15,
  heavyPct: 20,
  oncePct: 30,
  visitors: 500
};

describe('buildBroadcastScorePanelViewModel', () => {
  it('liveId欠損はnull', () => {
    expect(buildBroadcastScorePanelViewModel({ liveId: '', nowMs: NOW, previewRec: freshPreview })).toBeNull();
    expect(buildBroadcastScorePanelViewModel(null)).toBeNull();
  });

  it('previewが無い/古い/liveId不一致ならnull(まだデータがない扱い)', () => {
    expect(buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: null })).toBeNull();
    // 古い(鮮度切れ)。
    expect(
      buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW + 999_999_999, previewRec: freshPreview })
    ).toBeNull();
    // liveId不一致(パリティ教訓=嘘の数字を出さない)。
    expect(
      buildBroadcastScorePanelViewModel({ liveId: 'lv2', nowMs: NOW, previewRec: freshPreview })
    ).toBeNull();
  });

  it('新鮮なpreviewがあればスコアを計算する', () => {
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview });
    expect(vm).not.toBeNull();
    expect(vm.score.total).toBeGreaterThan(0);
    expect(vm.isFresh).toBe(true);
    expect(vm.isFinal).toBe(false);
  });

  it('liveIdは大小文字を無視して突合する', () => {
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'LV1', nowMs: NOW, previewRec: freshPreview });
    expect(vm).not.toBeNull();
  });

  it('phaseStatsがliveId一致ならボーナス・phaseChipに反映される', () => {
    const phaseStats = { liveId: 'lv1', phase: 'reach', r: 1.75, reachCount: 2, breakthroughCount: 1, jackpotCount: 0 };
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview, phaseStats });
    expect(vm.score.bonus).toBeGreaterThan(0);
    expect(vm.phaseChip).toEqual({ phase: 'reach', r: 1.75 });
  });

  it('phaseStatsがliveId不一致ならbonus=0・phaseChip=null(古い配信の残骸を持ち越さない)', () => {
    const phaseStats = { liveId: 'other', phase: 'jackpot', r: 9.0, reachCount: 5, breakthroughCount: 5, jackpotCount: 5 };
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview, phaseStats });
    expect(vm.score.bonus).toBe(0);
    expect(vm.phaseChip).toBeNull();
  });

  it('phaseStatsが無ければbonus=0・phaseChip=null', () => {
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview });
    expect(vm.score.bonus).toBe(0);
    expect(vm.phaseChip).toBeNull();
  });

  it('ledgerがliveId一致ならハイライト3選を含む', () => {
    const ledger = {
      liveId: 'lv1',
      rows: [
        { at: 1, kind: 'phase_jackpot', label: '大当たり到達' },
        { at: 2, kind: 'gift_large', label: 'ギフト大波(large)' }
      ]
    };
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview, ledger });
    expect(vm.highlights).toHaveLength(2);
  });

  it('ledgerがliveId不一致なら空配列(古い配信のハイライトを持ち越さない)', () => {
    const ledger = { liveId: 'other', rows: [{ at: 1, kind: 'phase_jackpot', label: 'x' }] };
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview, ledger });
    expect(vm.highlights).toEqual([]);
  });

  it('ledgerが無ければ空配列', () => {
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview });
    expect(vm.highlights).toEqual([]);
  });

  it('決定論: 同じ入力には常に同じ結果', () => {
    const input = { liveId: 'lv1', nowMs: NOW, previewRec: freshPreview };
    const a = buildBroadcastScorePanelViewModel(input);
    const b = buildBroadcastScorePanelViewModel(input);
    expect(a).toEqual(b);
  });
});

describe('broadcastScorePanelSig', () => {
  it('vmがnullなら空文字', () => {
    expect(broadcastScorePanelSig('lv1', null)).toBe('');
  });

  it('同じliveId+スコア+ハイライト数なら同じsig', () => {
    const vm = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview });
    expect(broadcastScorePanelSig('lv1', vm)).toBe(broadcastScorePanelSig('lv1', vm));
  });

  it('totalが変わればsigも変わる', () => {
    const vm1 = buildBroadcastScorePanelViewModel({ liveId: 'lv1', nowMs: NOW, previewRec: freshPreview });
    const vm2 = buildBroadcastScorePanelViewModel({
      liveId: 'lv1',
      nowMs: NOW,
      previewRec: { ...freshPreview, totalComments: 1 }
    });
    expect(broadcastScorePanelSig('lv1', vm1)).not.toBe(broadcastScorePanelSig('lv1', vm2));
  });
});
