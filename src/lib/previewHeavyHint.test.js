import { describe, it, expect } from 'vitest';
import { buildPreviewHeavyHint } from './previewHeavyHint.js';

const NOW = 1_000_000_000;
const freshAck = { ready: true, ts: NOW - 10_000, liveId: 'lv1' }; // 10秒前=新鮮

describe('buildPreviewHeavyHint — 応援プレビューの重さ名指し(v0.1.1020)', () => {
  it('重い×②が開いている=②を原因として名指し', () => {
    const r = buildPreviewHeavyHint({ totalMs: 25086 }, freshAck, NOW);
    expect(r.heavy).toBe(true);
    expect(r.previewOpen).toBe(true);
    expect(r.line).toContain('応援プレビューを開いている間は診断の更新が重く');
    expect(r.line).toContain('25.1秒');
    expect(r.line).toContain('タブを閉じると軽く');
  });

  it('重い×②が開いていない=②のせいにしない(別原因)', () => {
    const r = buildPreviewHeavyHint({ totalMs: 25086 }, null, NOW);
    expect(r.heavy).toBe(true);
    expect(r.previewOpen).toBe(false);
    expect(r.line).toContain('応援プレビューは開いていない');
    expect(r.line).toContain('多配信');
  });

  it('②の ack が古い(90秒超)=開いていない扱い', () => {
    const staleAck = { ready: true, ts: NOW - 120_000, liveId: 'lv1' };
    const r = buildPreviewHeavyHint({ totalMs: 25086 }, staleAck, NOW);
    expect(r.previewOpen).toBe(false);
    expect(r.line).toContain('応援プレビューは開いていない');
  });

  it('軽い(閾値未満)=ヒントを出さない(空line)', () => {
    const r = buildPreviewHeavyHint({ totalMs: 16 }, freshAck, NOW);
    expect(r.heavy).toBe(false);
    expect(r.line).toBe('');
  });

  it('refreshPerf 無し=ヒント無し(落ちない)', () => {
    const r = buildPreviewHeavyHint(null, freshAck, NOW);
    expect(r.heavy).toBe(false);
    expect(r.line).toBe('');
  });

  it('閾値ちょうど(1500ms)は重い扱い', () => {
    expect(buildPreviewHeavyHint({ totalMs: 1500 }, freshAck, NOW).heavy).toBe(true);
  });

  it('ack.ready=false は開いていない扱い', () => {
    const r = buildPreviewHeavyHint({ totalMs: 5000 }, { ready: false, ts: NOW, liveId: 'lv1' }, NOW);
    expect(r.previewOpen).toBe(false);
  });
});
