/**
 * ③WEB配信採点丸写し(第3号・reference_full_mirror_SYNTHESIS.md M2・路線2)の配線契約テスト。
 *
 * status-entry.js / app/live-view.js はエントリファイル(直接ユニットテスト不可)なので、
 *   両者が依存する2つの純lib境界を固定する:
 *     (1) status が jsonBlob.broadcastScoreVm に載せる view-model(buildBroadcastScorePanelViewModel の戻り)
 *         には innerHTML 行きの HTML 文字列が含まれない(R-1: サーバーを渡る blob に HTML を足さない)。
 *     (2) ③が jsonBlob.broadcastScoreVm を buildBroadcastScorePanelHtml で HTML 化すると採点パネル markup が出る
 *         (案A=③は HTML 化だけ・VM ロジックは status 側で①と共有)。
 *     (3) VM が null を返すケース(未観測/liveId 未一致/鮮度落ち)= status は blob に載せない・③は host を触らない。
 */
import { describe, it, expect } from 'vitest';
import { buildBroadcastScorePanelViewModel } from './broadcastScorePanelViewModel.js';
import { buildBroadcastScorePanelHtml } from './broadcastScoreHtml.js';

const NOW = 2_000_000;

// status-entry.js が extras で読んでいる5値と同形の入力(reportPreview/bgmPhaseDiag/giftEffectDiag/voiceDiag/highlightLedger)。
const previewRec = {
  liveId: 'lv999',
  at: NOW,
  totalComments: 4200,
  commenters: 700,
  commentsPerMinute: 22,
  heavyPct: 25,
  oncePct: 28,
  visitors: 640
};
const phaseStats = { liveId: 'lv999', phase: 'jackpot', r: 3.2, reachCount: 3, breakthroughCount: 2, jackpotCount: 1 };
const ledger = {
  liveId: 'lv999',
  rows: [
    { at: 1, kind: 'phase_jackpot', label: '大当たり到達' },
    { at: 2, kind: 'gift_large', label: 'ギフト大波(large)' }
  ]
};

/** status-entry.js の M2 相乗りと同じ引数で VM を組む(案A: status 側で VM を作る)。 */
function buildVmLikeStatus(liveId) {
  return buildBroadcastScorePanelViewModel({
    liveId,
    nowMs: NOW,
    previewRec,
    phaseStats,
    giftDiag: null,
    voiceDiag: null,
    ledger
  });
}

describe('M2 status→blob: broadcastScoreVm の中身は構造化データのみ(R-1)', () => {
  it('VM 戻りは score/radar/highlights 等の構造化データで、innerHTML 行きの HTML 文字列フィールドを持たない', () => {
    const vm = buildVmLikeStatus('lv999');
    expect(vm).not.toBeNull();
    // 期待するフィールドは①popup-entry の renderBroadcastScorePanel と同じ構造化データ。
    expect(vm.score).toBeTruthy();
    expect(typeof vm.score.total).toBe('number');
    expect(typeof vm.score.rank).toBe('string');
    expect(vm.score.parts).toBeTruthy();
    expect(Array.isArray(vm.highlights)).toBe(true);
    // R-1: どのフィールドにも「HTML っぽい文字列」が無いことを再帰で確認(< や > を含む文字列を弾く)。
    const findHtmlString = (v) => {
      if (typeof v === 'string') return /<[a-z/][\s\S]*>/i.test(v);
      if (Array.isArray(v)) return v.some(findHtmlString);
      if (v && typeof v === 'object') return Object.values(v).some(findHtmlString);
      return false;
    };
    expect(findHtmlString(vm)).toBe(false);
  });

  it('JSON 直列化を通しても壊れない(サーバー往復=jsonBlob と同じ経路)', () => {
    const vm = buildVmLikeStatus('lv999');
    const roundTripped = JSON.parse(JSON.stringify(vm));
    // 直列化後も buildBroadcastScorePanelHtml が同じ markup を出す(③は直列化後の blob を受け取る)。
    expect(buildBroadcastScorePanelHtml(roundTripped)).toBe(buildBroadcastScorePanelHtml(vm));
  });
});

describe('M2 ③paint: buildBroadcastScorePanelHtml(vm) が採点パネル markup を出す(案A)', () => {
  it('新鮮な VM から nl-score-panel を含む HTML が出る(#broadcastScoreMount に貼る器)', () => {
    const vm = buildVmLikeStatus('lv999');
    const html = buildBroadcastScorePanelHtml(vm);
    expect(html).toContain('nl-score-panel');
    expect(html).toContain('nl-score-total-num');
    // ①専用の発表ボタン markup は③器には含まれない(paint は VM→パネル本体だけ)。
    expect(html).not.toContain('broadcastScoreAnnounceBtn');
  });
});

describe('M2 縮退: VM が null なら status は載せない/③は host を触らない', () => {
  it('liveId 未一致は null(status は jsonBlob.broadcastScoreVm を付けない=空パネルにしない)', () => {
    expect(buildVmLikeStatus('lv000')).toBeNull();
  });

  it('null VM を ③paint の HTML 化に渡すと空文字(host を上書きしない=死に画面回避)', () => {
    expect(buildBroadcastScorePanelHtml(null)).toBe('');
  });
});
