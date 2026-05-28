import { describe, it, expect } from 'vitest';
import { createNdgrMessageDedupe } from './ndgrMessageDedupe.js';

describe('createNdgrMessageDedupe', () => {
  it('同一 liveId + messageId の 2 回目以降は drop される', () => {
    const d = createNdgrMessageDedupe();

    const r1 = d.accept({ liveId: 'lv1', messageId: 'm1' });
    expect(r1).toEqual({ accepted: true, reason: 'first-seen' });

    const r2 = d.accept({ liveId: 'lv1', messageId: 'm1' });
    expect(r2).toEqual({ accepted: false, reason: 'duplicate' });

    const snap = d.snapshot();
    expect(snap.accepted).toBe(1);
    expect(snap.droppedDuplicate).toBe(1);
  });

  it('別 liveId 同 messageId は両方 accept される（bucket は live で分離）', () => {
    const d = createNdgrMessageDedupe();
    expect(d.accept({ liveId: 'lv1', messageId: 'shared' }).accepted).toBe(true);
    expect(d.accept({ liveId: 'lv2', messageId: 'shared' }).accepted).toBe(true);

    const snap = d.snapshot();
    expect(snap.accepted).toBe(2);
    expect(snap.droppedDuplicate).toBe(0);
    expect(snap.currentBuckets).toBe(2);
    expect(snap.bucketsCreated).toBe(2);
  });

  it('messageId 空 / null は pass-through（false positive 回避）', () => {
    const d = createNdgrMessageDedupe();
    expect(d.accept({ liveId: 'lv1', messageId: null }).reason).toBe('no-id');
    expect(d.accept({ liveId: 'lv1', messageId: '' }).reason).toBe('no-id');
    expect(d.accept({ liveId: 'lv1' }).reason).toBe('no-id');

    const snap = d.snapshot();
    expect(snap.accepted).toBe(0);
    expect(snap.droppedDuplicate).toBe(0);
    expect(snap.currentBuckets).toBe(0);
  });

  it('liveId 空は pass-through（不完全キーで dedupe しない）', () => {
    const d = createNdgrMessageDedupe();
    expect(d.accept({ liveId: '', messageId: 'm1' }).reason).toBe('invalid-key');
    expect(d.accept({ liveId: null, messageId: 'm1' }).reason).toBe('invalid-key');

    const snap = d.snapshot();
    expect(snap.accepted).toBe(0);
    expect(snap.currentBuckets).toBe(0);
  });

  it('FIFO eviction で perLiveMax 超過時に最古の ID から消える', () => {
    const d = createNdgrMessageDedupe({ perLiveMax: 3 });
    d.accept({ liveId: 'lv1', messageId: 'a' }); // FIFO: [a]
    d.accept({ liveId: 'lv1', messageId: 'b' }); // FIFO: [a, b]
    d.accept({ liveId: 'lv1', messageId: 'c' }); // FIFO: [a, b, c]
    d.accept({ liveId: 'lv1', messageId: 'd' }); // FIFO: [b, c, d], 'a' evicted

    // 押し出される順序を assert（先に b/c/d の duplicate を確認）
    expect(d.accept({ liveId: 'lv1', messageId: 'b' })).toEqual({
      accepted: false,
      reason: 'duplicate',
    });
    expect(d.accept({ liveId: 'lv1', messageId: 'c' })).toEqual({
      accepted: false,
      reason: 'duplicate',
    });
    expect(d.accept({ liveId: 'lv1', messageId: 'd' })).toEqual({
      accepted: false,
      reason: 'duplicate',
    });

    // 'a' は evict 済 → 再度 first-seen として accept される
    expect(d.accept({ liveId: 'lv1', messageId: 'a' })).toEqual({
      accepted: true,
      reason: 'first-seen',
    });

    const snap = d.snapshot();
    expect(snap.evictedIds).toBeGreaterThanOrEqual(1);
  });

  it('resetForLive で stats.resets が進み currentLiveId が更新される', () => {
    const d = createNdgrMessageDedupe();
    expect(d.snapshot().currentLiveId).toBe(null);
    expect(d.snapshot().resets).toBe(0);

    d.resetForLive('lv1');
    expect(d.snapshot().currentLiveId).toBe('lv1');
    expect(d.snapshot().resets).toBe(1);
    expect(d.snapshot().lastResetLiveId).toBe('lv1');

    // 同じ lid で resetForLive を呼んでも resets は増えない（境界判定）
    d.resetForLive('lv1');
    expect(d.snapshot().resets).toBe(1);

    // 違う lid で reset
    d.resetForLive('lv2');
    expect(d.snapshot().resets).toBe(2);
    expect(d.snapshot().currentLiveId).toBe('lv2');
  });

  it('clearOtherLives で keep 以外の bucket だけが消える', () => {
    const d = createNdgrMessageDedupe();
    d.accept({ liveId: 'lv1', messageId: 'a' });
    d.accept({ liveId: 'lv2', messageId: 'b' });
    d.accept({ liveId: 'lv3', messageId: 'c' });
    expect(d.snapshot().currentBuckets).toBe(3);

    d.clearOtherLives('lv2');
    expect(d.snapshot().currentBuckets).toBe(1);
    expect(d.snapshot().bucketsCleared).toBe(2);

    // lv2 の dedupe は維持されている
    expect(d.accept({ liveId: 'lv2', messageId: 'b' }).accepted).toBe(false);
    // lv1 / lv3 は消えたので再 accept される
    expect(d.accept({ liveId: 'lv1', messageId: 'a' }).accepted).toBe(true);
    expect(d.accept({ liveId: 'lv3', messageId: 'c' }).accepted).toBe(true);
  });

  it('snapshot は plain object で structured clone 可能（postMessage 安全）', () => {
    const d = createNdgrMessageDedupe();
    d.accept({ liveId: 'lv1', messageId: 'a' });
    const snap = d.snapshot();

    // 再帰的に Set / Map / 関数を含まない（structuredClone が成功する）
    expect(() => structuredClone(snap)).not.toThrow();
    const cloned = structuredClone(snap);
    expect(cloned).toEqual(snap);
  });

  it('clear で全 bucket が消え、bucketsCleared が累積する', () => {
    const d = createNdgrMessageDedupe();
    d.accept({ liveId: 'lv1', messageId: 'a' });
    d.accept({ liveId: 'lv2', messageId: 'b' });
    expect(d.snapshot().currentBuckets).toBe(2);

    d.clear();
    expect(d.snapshot().currentBuckets).toBe(0);
    expect(d.snapshot().bucketsCleared).toBe(2);

    // clear 後は再 accept される
    expect(d.accept({ liveId: 'lv1', messageId: 'a' }).accepted).toBe(true);
  });

  // v0.1.356 (Bug6): clear は currentLiveId も null に戻す。従来は buckets だけ消えて
  //   currentLiveId が古い lv のまま残り、clear 後に同 lv で resetForLive しても切替扱いに
  //   ならなかった（buckets 空なのに live 継続中という不整合）。
  it('clear 後は currentLiveId が null に戻り、同 lv の resetForLive が切替として記録される', () => {
    const d = createNdgrMessageDedupe();
    d.resetForLive('lv1');
    expect(d.snapshot().currentLiveId).toBe('lv1');
    const resetsBefore = d.snapshot().resets;

    d.clear();
    // clear で currentLiveId は null に戻る。
    expect(d.snapshot().currentLiveId).toBe(null);

    // 同じ lv1 でも、currentLiveId が null に戻っているので切替として記録される。
    d.resetForLive('lv1');
    expect(d.snapshot().currentLiveId).toBe('lv1');
    expect(d.snapshot().resets).toBe(resetsBefore + 1);
  });

  it('drop 件数は accepted と独立にカウントされる', () => {
    const d = createNdgrMessageDedupe();
    d.accept({ liveId: 'lv1', messageId: 'a' });
    d.accept({ liveId: 'lv1', messageId: 'a' });
    d.accept({ liveId: 'lv1', messageId: 'a' });

    const snap = d.snapshot();
    expect(snap.accepted).toBe(1);
    expect(snap.droppedDuplicate).toBe(2);
  });

  it('case-insensitive: liveId は lowercase で正規化される', () => {
    const d = createNdgrMessageDedupe();
    expect(d.accept({ liveId: 'LV1', messageId: 'm1' }).accepted).toBe(true);
    expect(d.accept({ liveId: 'lv1', messageId: 'm1' }).accepted).toBe(false);
    expect(d.accept({ liveId: 'Lv1', messageId: 'm1' }).accepted).toBe(false);
  });

  it('messageId の trim: 前後空白は無視される', () => {
    const d = createNdgrMessageDedupe();
    expect(d.accept({ liveId: 'lv1', messageId: 'm1' }).accepted).toBe(true);
    expect(d.accept({ liveId: 'lv1', messageId: '  m1  ' }).accepted).toBe(false);
  });
});
