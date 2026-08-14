import { describe, it, expect } from 'vitest';
import { buildGiftAdPipeline, STUCK_PENDING_MS } from './giftAdPipelineCensus.js';

const NS_OK = {
  '1_貢献度ランキング': { state: 'ok', apiRows: 31 },
  '+α_広告ランキング': { state: 'ok', apiRows: 7 }
};

describe('giftAdPipelineCensus', () => {
  it('取れていれば件数を出す', () => {
    const r = buildGiftAdPipeline({ northStar: NS_OK, liveElapsedMs: 60_000 });
    expect(r.line).toContain('ギフト貢献度: 31件');
    expect(r.line).toContain('広告ランキング: 7件');
    expect(r.line).toContain('✅');
  });

  it('★配信直後の「取得中」は詰まり扱いにしない(焦って赤くしない)', () => {
    const r = buildGiftAdPipeline({
      northStar: { ...NS_OK, '2_ギフト履歴': { state: 'iframe_unrendered', count: 0 } },
      liveElapsedMs: 30_000
    });
    const hist = r.stages.find((s) => s.id === '2_ギフト履歴');
    expect(hist.level).toBe('na');
    expect(hist.text).toBe('取得中');
  });

  it('★「取得中」が数分続いたら詰まりとして名指しする(実機で1時間続いていた穴)', () => {
    const r = buildGiftAdPipeline({
      northStar: { ...NS_OK, '2_ギフト履歴': { state: 'iframe_unrendered', count: 0 } },
      liveElapsedMs: STUCK_PENDING_MS + 60_000
    });
    const hist = r.stages.find((s) => s.id === '2_ギフト履歴');
    expect(hist.level).toBe('warn');
    expect(hist.text).toContain('取得できていません');
    expect(r.line).toContain('詰まり');
  });

  it('イベントが無い配信は「対象外」で赤くしない', () => {
    const r = buildGiftAdPipeline({
      northStar: { ...NS_OK, '5_イベント現在順位': { state: 'no_event', value: null } },
      liveElapsedMs: 3_600_000
    });
    const rank = r.stages.find((s) => s.id === '5_イベント現在順位');
    expect(rank.level).toBe('na');
    expect(r.line).not.toContain('イベント順位');
  });

  it('★検知したのに演出されなかった件数を名指しする', () => {
    const r = buildGiftAdPipeline({
      northStar: NS_OK,
      giftEffect: { detected: 8, played: 5, sound: 5 },
      liveElapsedMs: 60_000
    });
    expect(r.line).toContain('3件が演出されず');
  });

  it('検知0なら演出段は出さない(未使用を異常にしない)', () => {
    const r = buildGiftAdPipeline({
      northStar: NS_OK, giftEffect: { detected: 0 }, liveElapsedMs: 60_000
    });
    expect(r.line).not.toContain('ギフト演出');
  });

  it('入力が空でも落ちない', () => {
    expect(() => buildGiftAdPipeline({})).not.toThrow();
    expect(() => buildGiftAdPipeline(null)).not.toThrow();
  });
});
