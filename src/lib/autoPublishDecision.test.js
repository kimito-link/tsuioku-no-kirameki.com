import { describe, it, expect } from 'vitest';
import { shouldAutoPublish, DEFAULT_AUTO_PUBLISH_INTERVAL_MS } from './autoPublishDecision.js';

const base = {
  hasKeys: true,
  hasPayload: true,
  hasWatchTab: true,
  inFlight: false,
  everSent: true,
  lastSentAtMs: 1_000_000,
  nowMs: 1_000_000 + DEFAULT_AUTO_PUBLISH_INTERVAL_MS,
  intervalMs: DEFAULT_AUTO_PUBLISH_INTERVAL_MS
};

describe('shouldAutoPublish — 誤発射しない前提条件', () => {
  it('キー未設定なら false', () => {
    expect(shouldAutoPublish({ ...base, hasKeys: false })).toEqual({ publish: false, reason: 'no_keys' });
  });
  it('payload 未組成なら false', () => {
    expect(shouldAutoPublish({ ...base, hasPayload: false }).reason).toBe('no_payload');
  });
  it('watch タブが無いなら false(止まった状態を送り続けない)', () => {
    expect(shouldAutoPublish({ ...base, hasWatchTab: false }).reason).toBe('no_watch');
  });
  it('送信中なら false(多重防止)', () => {
    expect(shouldAutoPublish({ ...base, inFlight: true }).reason).toBe('in_flight');
  });
  it('null 入力でも落ちず false', () => {
    expect(shouldAutoPublish(null).publish).toBe(false);
  });
});

describe('shouldAutoPublish — 送るべきとき', () => {
  it('まだ一度も送っていないなら true(初回)', () => {
    expect(shouldAutoPublish({ ...base, everSent: false })).toEqual({ publish: true, reason: 'first_publish' });
  });
  it('everSent でも lastSentAtMs=0 なら初回扱いで true', () => {
    expect(shouldAutoPublish({ ...base, lastSentAtMs: 0 }).reason).toBe('first_publish');
  });
  it('前回送信から interval 以上経過なら true', () => {
    expect(shouldAutoPublish({ ...base, nowMs: base.lastSentAtMs + DEFAULT_AUTO_PUBLISH_INTERVAL_MS + 1 })).toEqual({
      publish: true,
      reason: 'interval_elapsed'
    });
  });
  it('直近失敗でも interval 経過なら再試行(回復)', () => {
    // lastOk は入力に無い=判定は時刻ベースのみ。interval 経過していれば送る。
    expect(shouldAutoPublish({ ...base }).publish).toBe(true);
  });
});

describe('shouldAutoPublish — まだ送らないとき', () => {
  it('interval 未満なら false(新鮮=打たない)', () => {
    expect(shouldAutoPublish({ ...base, nowMs: base.lastSentAtMs + 1000 })).toEqual({
      publish: false,
      reason: 'fresh_enough'
    });
  });
  it('nowMs 不明(0)なら false(誤発射しない)', () => {
    expect(shouldAutoPublish({ ...base, nowMs: 0 }).reason).toBe('no_now');
  });
});
