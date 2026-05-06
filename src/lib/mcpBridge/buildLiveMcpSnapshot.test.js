/**
 * buildLiveMcpSnapshot のテスト。
 *
 * v0.1.187: L0 Evidence → L1 Canonical 変換の動作と Deterministic 性を保証。
 */

import { describe, it, expect } from 'vitest';
import { buildLiveMcpSnapshot } from './buildLiveMcpSnapshot.js';
import { isCanonicalLiveSnapshot } from './schema.js';

describe('buildLiveMcpSnapshot', () => {
  it('空入力でも valid な snapshot を返す', () => {
    const s = buildLiveMcpSnapshot({});
    expect(isCanonicalLiveSnapshot(s)).toBe(true);
    expect(s.gift).toEqual({});
    expect(s.diag.mismatchReasons).toEqual([]);
  });

  it('meta / watch を入力から反映する', () => {
    const s = buildLiveMcpSnapshot({
      extensionVersion: '0.1.187',
      buildId: 'b0506',
      seq: 5,
      liveId: 'lv100',
      watchUrl: 'https://live.nicovideo.jp/watch/lv100',
      aligned: true,
      exportedAt: 1234567890
    });
    expect(s.meta.extensionVersion).toBe('0.1.187');
    expect(s.meta.buildId).toBe('b0506');
    expect(s.meta.seq).toBe(5);
    expect(s.meta.exportedAt).toBe(1234567890);
    expect(s.watch.liveId).toBe('lv100');
    expect(s.watch.aligned).toBe(true);
  });

  it('giftPoints の ndgr 値を採用（優先順位）', () => {
    const s = buildLiveMcpSnapshot({
      officialValuesV2: {
        giftPoints: {
          ndgr: { value: 230, source: 'ndgr_stats', ageMs: 100, reason: null },
          domStats: { value: 230, source: 'dom_program_stats', ageMs: 100, reason: null }
        }
      }
    });
    expect(s.gift.programGiftPoints).toEqual({
      value: 230,
      source: 'ndgr_stats',
      ageMs: 100,
      reason: null
    });
  });

  it('ndgr が null なら domStats を採用', () => {
    const s = buildLiveMcpSnapshot({
      officialValuesV2: {
        giftPoints: {
          ndgr: { value: null, source: 'ndgr_stats', ageMs: 100, reason: 'no_field' },
          domStats: { value: 230, source: 'dom_program_stats', ageMs: 100, reason: null }
        }
      }
    });
    expect(s.gift.programGiftPoints?.value).toBe(230);
    expect(s.gift.programGiftPoints?.source).toBe('dom_program_stats');
    expect(s.gift.programGiftPoints?.reason).toBe(null);
  });

  it('全部 null なら最初の priority を no_field で返す', () => {
    const s = buildLiveMcpSnapshot({
      officialValuesV2: {
        eventGiftScore: {
          ndgr: { value: null, source: 'ndgr_stats', ageMs: 100, reason: 'no_field' },
          domBanner: { value: null, source: 'dom_event_banner', ageMs: 100, reason: 'no_field' }
        }
      }
    });
    expect(s.gift.eventGiftScore?.value).toBe(null);
    expect(s.gift.eventGiftScore?.source).toBe('ndgr_stats');
    expect(s.gift.eventGiftScore?.reason).toBe('no_field');
  });

  it('入力にない field は出力にも入れない', () => {
    const s = buildLiveMcpSnapshot({
      officialValuesV2: {
        giftPoints: {
          ndgr: { value: 230, source: 'ndgr_stats', ageMs: 100, reason: null }
        }
      }
    });
    expect(s.gift.programGiftPoints).toBeDefined();
    expect(s.gift.adPoints).toBeUndefined();
    expect(s.gift.eventGiftScore).toBeUndefined();
  });

  it('mismatchReasons はコピーされる（参照共有しない）', () => {
    const reasons = ['live_mismatch'];
    const s = buildLiveMcpSnapshot({ mismatchReasons: reasons });
    expect(s.diag.mismatchReasons).toEqual(['live_mismatch']);
    reasons.push('uid_avatar_mismatch');
    expect(s.diag.mismatchReasons).toEqual(['live_mismatch']); // 元配列の変化を受けない
  });

  it('Deterministic：同じ入力で同じ出力（exportedAt 固定時）', () => {
    const input = {
      extensionVersion: '0.1.187',
      buildId: 'b0506',
      seq: 5,
      liveId: 'lv100',
      watchUrl: 'https://live.nicovideo.jp/watch/lv100',
      aligned: true,
      exportedAt: 1234567890,
      officialValuesV2: {
        giftPoints: {
          ndgr: { value: 230, source: 'ndgr_stats', ageMs: 100, reason: null },
          domStats: { value: 230, source: 'dom_program_stats', ageMs: 100, reason: null }
        },
        adPoints: {
          ndgr: { value: 6000, source: 'ndgr_stats', ageMs: 100, reason: null }
        }
      }
    };
    const a = buildLiveMcpSnapshot(input);
    const b = buildLiveMcpSnapshot(input);
    expect(a).toEqual(b);
  });

  it('aligned=false が反映される', () => {
    const s = buildLiveMcpSnapshot({ aligned: false });
    expect(s.watch.aligned).toBe(false);
  });

  it('aligned 未指定なら true（緩い既定）', () => {
    const s = buildLiveMcpSnapshot({});
    expect(s.watch.aligned).toBe(true);
  });

  it('5 種の値すべての変換', () => {
    const s = buildLiveMcpSnapshot({
      officialValuesV2: {
        giftPoints: { ndgr: { value: 230, source: 'ndgr_stats', ageMs: 100, reason: null } },
        adPoints: { ndgr: { value: 6000, source: 'ndgr_stats', ageMs: 100, reason: null } },
        eventGiftScore: { ndgr: { value: null, source: 'ndgr_stats', ageMs: 100, reason: 'no_field' } },
        nicoEventRank: { ndgr: { value: 33, source: 'ndgr_stats', ageMs: 100, reason: null } },
        nicoEventTitle: { ndgr: { value: null, source: 'ndgr_stats', ageMs: 100, reason: 'no_field' } }
      }
    });
    expect(s.gift.programGiftPoints?.value).toBe(230);
    expect(s.gift.adPoints?.value).toBe(6000);
    expect(s.gift.eventGiftScore?.value).toBe(null);
    expect(s.gift.eventGiftScore?.reason).toBe('no_field');
    expect(s.gift.nicoEventRank?.value).toBe(33);
    expect(s.gift.nicoEventTitle?.value).toBe(null);
    expect(s.gift.nicoEventTitle?.reason).toBe('no_field');
  });
});
