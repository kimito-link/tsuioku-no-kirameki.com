import { describe, it, expect } from 'vitest';
import { decideHiddenOfficialIframeInject } from './hiddenOfficialIframeReinjectGate.js';

const NOW = 1_700_000_000_000;
const COOLDOWN = 90_000;

/** 既定の「再 inject 可能」状態（参加中・別 lv 済み・iframe 無し・クールダウン経過）。 */
function base(overrides = {}) {
  return {
    optInEnabled: true,
    liveId: 'lv123',
    alreadyInjectedLiveId: 'lv123',
    isEventParticipating: true,
    iframeStillPresent: false,
    lastInjectAtMs: NOW - (COOLDOWN + 1000),
    nowMs: NOW,
    cooldownMs: COOLDOWN,
    ...overrides
  };
}

describe('decideHiddenOfficialIframeInject', () => {
  it('opt-out なら常に inject しない', () => {
    const r = decideHiddenOfficialIframeInject(base({ optInEnabled: false }));
    expect(r.inject).toBe(false);
    expect(r.reason).toBe('opt-out');
  });

  it('liveId 無しは inject しない', () => {
    expect(decideHiddenOfficialIframeInject(base({ liveId: '' })).inject).toBe(false);
  });

  it('初回（別 lv）は参加に関わらず inject する', () => {
    const r = decideHiddenOfficialIframeInject(
      base({ alreadyInjectedLiveId: 'lv999', isEventParticipating: false })
    );
    expect(r.inject).toBe(true);
    expect(r.reason).toBe('first-inject');
  });

  it('inject 済み + 非イベントは再 inject しない（従来挙動）', () => {
    const r = decideHiddenOfficialIframeInject(base({ isEventParticipating: false }));
    expect(r.inject).toBe(false);
    expect(r.reason).toBe('already-injected-non-event');
  });

  it('イベント参加中 + クールダウン経過 + iframe 無し → 再 inject', () => {
    const r = decideHiddenOfficialIframeInject(base());
    expect(r.inject).toBe(true);
    expect(r.reason).toBe('re-inject-event');
  });

  it('イベント参加中でもクールダウン未経過なら再 inject しない', () => {
    const r = decideHiddenOfficialIframeInject(base({ lastInjectAtMs: NOW - 1000 }));
    expect(r.inject).toBe(false);
    expect(r.reason).toBe('cooldown');
  });

  it('前回 iframe がまだ残っていれば再 inject しない（同時2本防止）', () => {
    const r = decideHiddenOfficialIframeInject(base({ iframeStillPresent: true }));
    expect(r.inject).toBe(false);
    expect(r.reason).toBe('iframe-still-present');
  });

  it('不正引数は inject しない', () => {
    expect(decideHiddenOfficialIframeInject(null).inject).toBe(false);
    expect(decideHiddenOfficialIframeInject(undefined).inject).toBe(false);
  });

  it('時刻が不正なら inject しない（再 inject 経路）', () => {
    const r = decideHiddenOfficialIframeInject(base({ nowMs: NaN }));
    expect(r.inject).toBe(false);
    expect(r.reason).toBe('bad-time');
  });
});
