import { describe, it, expect } from 'vitest';
import { buildParityVerdict, formatParityVerdictLine } from './parityVerdict.js';

// 決定木を固定。誤検知根絶(取得不能は必ず pending・×にしない)を最重視で検証。

const okInput = () => ({
  currentLiveId: 'lv1',
  nowMs: 1000,
  trust: { hasWatchTab: true, popup: { present: true, lidMatch: true, fresh: true } },
  laneRenderDiag: { started: 8, verdict: 'ok' },
  northStarProbe: { refreshAllStarted: 4 },
  publishSelfDiag: {
    consistency: [{ lane: '北極星 貢献度', match: true, extRows: 10, mirrorRows: 10 }],
    publish: { ready: true },
    lastPost: { everSent: true, ok: true, ageSec: 5 }
  },
  previewAck: { ready: true, ts: 1000, liveId: 'lv1' }
});

describe('buildParityVerdict — 保留(誤検知根絶)', () => {
  it('watch 無し → pending(×にしない)', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: false } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('no_watch');
  });
  it('popup 未取得 → pending', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: true, popup: { present: false } } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('popup_absent');
  });
  it('popup 別配信 → pending', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: true, popup: { present: true, lidMatch: false } } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('popup_other_live');
  });
  it('popup 古い → pending', () => {
    const v = buildParityVerdict({ trust: { hasWatchTab: true, popup: { present: true, lidMatch: true, fresh: false } } });
    expect(v.verdict).toBe('pending');
    expect(v.code).toBe('popup_stale');
  });
  it('未publish → pending(eを×にしない)', () => {
    const i = okInput();
    i.publishSelfDiag.lastPost = { everSent: false };
    expect(buildParityVerdict(i).code).toBe('web_not_published');
    expect(buildParityVerdict(i).verdict).toBe('pending');
  });
  it('②応援プレビュー ack 無し → pending', () => {
    const i = okInput();
    i.previewAck = null;
    expect(buildParityVerdict(i).code).toBe('preview_no_ack');
    expect(buildParityVerdict(i).verdict).toBe('pending');
  });
});

describe('buildParityVerdict — 不一致(本物の×だけ)', () => {
  it('①応援レーン描画 started=0 → mismatch(a)', () => {
    const i = okInput();
    i.laneRenderDiag = { started: 0, verdict: 'not_started' };
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('pop_lane_not_started');
  });
  it('①北極星 refreshAllStarted=0 → mismatch(a)', () => {
    const i = okInput();
    i.northStarProbe = { refreshAllStarted: 0 };
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('pop_northstar_not_started');
  });
  it('データ整合 mismatch(拡張10≠鏡0) → mismatch(b)', () => {
    const i = okInput();
    i.publishSelfDiag.consistency = [{ lane: '北極星 貢献度', match: false, extRows: 10, mirrorRows: 0 }];
    const v = buildParityVerdict(i);
    expect(v.verdict).toBe('mismatch');
    expect(v.code).toBe('data_mismatch');
    expect(v.reason).toContain('拡張10≠鏡0');
  });
  it('鮮度差で skipped な consistency は ×にしない(normal は保留扱い=先へ進む)', () => {
    const i = okInput();
    i.publishSelfDiag.consistency = [{ lane: '北極星 貢献度', match: null, skipped: true, normal: true }];
    expect(buildParityVerdict(i).verdict).toBe('ok'); // 他が全部OKなら ok
  });
  it('③送信失敗 → mismatch', () => {
    const i = okInput();
    i.publishSelfDiag.lastPost = { everSent: true, ok: false };
    expect(buildParityVerdict(i).code).toBe('web_publish_failed');
    expect(buildParityVerdict(i).verdict).toBe('mismatch');
  });
});

describe('buildParityVerdict — 合格', () => {
  it('全部そろって ok', () => {
    const v = buildParityVerdict(okInput());
    expect(v.verdict).toBe('ok');
    expect(v.code).toBe('ok');
  });
  it('応援レーンが空ソース(供給0=正常)でも他OKなら ok', () => {
    const i = okInput();
    i.laneRenderDiag = { started: 0, verdict: 'empty_source' };
    expect(buildParityVerdict(i).verdict).toBe('ok');
  });
});

describe('formatParityVerdictLine', () => {
  it('ok 行', () => {
    expect(formatParityVerdictLine({ verdict: 'ok' })).toContain('✅ 同一で完全');
  });
  it('mismatch 行は理由と次の一手', () => {
    const line = formatParityVerdictLine({ verdict: 'mismatch', reason: 'X', nextAction: 'Y' });
    expect(line).toContain('🔴 不一致');
    expect(line).toContain('X');
    expect(line).toContain('→ Y');
  });
  it('pending 行', () => {
    expect(formatParityVerdictLine({ verdict: 'pending', reason: 'Z', nextAction: '' })).toContain('🟡 保留');
  });
});
