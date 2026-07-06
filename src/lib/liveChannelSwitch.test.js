import { describe, it, expect } from 'vitest';
import {
  NLS_LIVE_CHANNEL_SWITCH_TYPE,
  isLiveChannelSwitchMessageValid,
  extractSwitchedLiveIdFromMessage,
  buildLiveChannelSwitchPayload
} from './liveChannelSwitch.js';

describe('buildLiveChannelSwitchPayload', () => {
  it('妥当な lv と nonce から payload を組み立てる', () => {
    const p = buildLiveChannelSwitchPayload('lv12345', 'abc');
    expect(p).toMatchObject({
      type: NLS_LIVE_CHANNEL_SWITCH_TYPE,
      lv: 'lv12345',
      nonce: 'abc'
    });
    expect(Number.isFinite(p.sentAt)).toBe(true);
  });

  it('大文字混在の lv は小文字に正規化する', () => {
    const p = buildLiveChannelSwitchPayload('LV999', 'n1');
    expect(p.lv).toBe('lv999');
  });

  it('不正な lv 形式は null', () => {
    expect(buildLiveChannelSwitchPayload('notlv', 'n1')).toBeNull();
    expect(buildLiveChannelSwitchPayload('', 'n1')).toBeNull();
    expect(buildLiveChannelSwitchPayload('lv', 'n1')).toBeNull();
  });

  it('nonce 欠落は null', () => {
    expect(buildLiveChannelSwitchPayload('lv123', '')).toBeNull();
    expect(buildLiveChannelSwitchPayload('lv123', undefined)).toBeNull();
  });
});

describe('isLiveChannelSwitchMessageValid', () => {
  it('type/nonce/lv すべて妥当 → true', () => {
    expect(
      isLiveChannelSwitchMessageValid(
        { data: { type: NLS_LIVE_CHANNEL_SWITCH_TYPE, nonce: 'abc', lv: 'lv123' } },
        'abc'
      )
    ).toBe(true);
  });

  it('nonce 不一致 → false', () => {
    expect(
      isLiveChannelSwitchMessageValid(
        { data: { type: NLS_LIVE_CHANNEL_SWITCH_TYPE, nonce: 'abc', lv: 'lv123' } },
        'xyz'
      )
    ).toBe(false);
  });

  it('type 不一致 → false', () => {
    expect(
      isLiveChannelSwitchMessageValid(
        { data: { type: 'OTHER', nonce: 'abc', lv: 'lv123' } },
        'abc'
      )
    ).toBe(false);
  });

  it('expectedNonce 空 → false(未初期化の iframe から呼ばれても弾く)', () => {
    expect(
      isLiveChannelSwitchMessageValid(
        { data: { type: NLS_LIVE_CHANNEL_SWITCH_TYPE, nonce: 'abc', lv: 'lv123' } },
        ''
      )
    ).toBe(false);
  });

  it('lv 形式不正 → false', () => {
    expect(
      isLiveChannelSwitchMessageValid(
        { data: { type: NLS_LIVE_CHANNEL_SWITCH_TYPE, nonce: 'abc', lv: 'not-a-lv' } },
        'abc'
      )
    ).toBe(false);
  });

  it('data 欠落 → false', () => {
    expect(isLiveChannelSwitchMessageValid({}, 'abc')).toBe(false);
    expect(isLiveChannelSwitchMessageValid(null, 'abc')).toBe(false);
  });
});

describe('extractSwitchedLiveIdFromMessage', () => {
  it('妥当な lv を小文字化して返す', () => {
    expect(
      extractSwitchedLiveIdFromMessage({ data: { lv: 'LV999' } })
    ).toBe('lv999');
  });

  it('不正/欠落は空文字', () => {
    expect(extractSwitchedLiveIdFromMessage({ data: { lv: 'bad' } })).toBe('');
    expect(extractSwitchedLiveIdFromMessage({ data: {} })).toBe('');
    expect(extractSwitchedLiveIdFromMessage(null)).toBe('');
  });
});
