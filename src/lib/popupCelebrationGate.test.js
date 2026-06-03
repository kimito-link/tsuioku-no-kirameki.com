import { describe, it, expect, vi } from 'vitest';
import {
  createPopupCelebrationGate,
  POPUP_CELEBRATION_OPEN_COOLDOWN_MS,
  RECORD_OFFICIAL_ALIGN_MAX_GAP
} from './popupCelebrationGate.js';
import { pickCommentMilestoneCelebration } from './supportCelebration.js';

describe('popupCelebrationGate', () => {
  it('heavy 未完了・プライム未完了では演出不可', () => {
    const gate = createPopupCelebrationGate({ now: () => 10_000 });
    gate.beginPopupRefresh('lv1', { refreshSessionKey: 's1' });
    gate.setCommentLoadPhase({
      heavySettled: false,
      recordCount: 4384,
      arrayLength: 4384,
      hasReliableFullArray: true
    });
    expect(gate.canFireCelebrations()).toBe(false);
    gate.setCommentLoadPhase({ heavySettled: true });
    expect(gate.canFireCelebrations()).toBe(false);
    gate.markPrimeComplete();
    expect(gate.canFireCelebrations()).toBe(false);
  });

  it('light 100 → heavy 4384 相当の件数ズレでは演出不可', () => {
    const gate = createPopupCelebrationGate({ now: () => 10_000 + POPUP_CELEBRATION_OPEN_COOLDOWN_MS + 1 });
    gate.beginPopupRefresh('lv1', { refreshSessionKey: 's1' });
    gate.setCommentLoadPhase({
      heavySettled: true,
      recordCount: 4384,
      arrayLength: 100,
      officialChunkTotal: 4384,
      hasReliableFullArray: true
    });
    gate.markPrimeComplete();
    expect(gate.canFireCelebrations()).toBe(false);
    expect(RECORD_OFFICIAL_ALIGN_MAX_GAP).toBeGreaterThanOrEqual(100);
  });

  it('heavy 完了・整合・プライム後は開幕クールダウン中のみ不可', () => {
    let t = 0;
    const gate = createPopupCelebrationGate({ now: () => t });
    gate.beginPopupRefresh('lv1', { refreshSessionKey: 'r1' });
    gate.setCommentLoadPhase({
      heavySettled: true,
      recordCount: 4384,
      arrayLength: 4380,
      officialChunkTotal: 4384,
      hasReliableFullArray: true
    });
    gate.markPrimeComplete();
    expect(gate.canFireCelebrations()).toBe(false);
    t = POPUP_CELEBRATION_OPEN_COOLDOWN_MS + 1;
    expect(gate.canFireCelebrations()).toBe(true);
  });

  it('runAfterPrime は1回だけプライムし、プライム済み high-water ではマイルストーン横断しない', async () => {
    const prime = vi.fn(async () => {});
    const gate = createPopupCelebrationGate({ now: () => 99_999 });
    gate.beginPopupRefresh('lv1');
    await gate.runAfterPrime(prime);
    await gate.runAfterPrime(prime);
    expect(prime).toHaveBeenCalledTimes(1);
    expect(pickCommentMilestoneCelebration(2970, 2970)).toBeNull();
  });

  it('viewer action は heavy 待ちなしで再生可', () => {
    const gate = createPopupCelebrationGate({ now: () => 0 });
    gate.beginPopupRefresh('lv1', { refreshSessionKey: 'r1' });
    expect(gate.canFireCelebrations()).toBe(false);
    expect(gate.canPlayViewerActionCelebration()).toBe(true);
  });

  it('liveId 変化時のみフェーズリセット（同一 lv 再開は heavy 状態維持）', () => {
    const gate = createPopupCelebrationGate({ now: () => 99_999 });
    gate.beginPopupRefresh('lv1', { refreshSessionKey: 'a' });
    gate.setCommentLoadPhase({ heavySettled: true, hasReliableFullArray: true });
    gate.markPrimeComplete();
    gate.beginPopupRefresh('lv1', { refreshSessionKey: 'b' });
    expect(gate.getDebugSnapshot().primeComplete).toBe(true);
    gate.beginPopupRefresh('lv2', { refreshSessionKey: 'c' });
    expect(gate.getDebugSnapshot().primeComplete).toBe(false);
    expect(gate.getDebugSnapshot().heavySettled).toBe(false);
  });
});
