import { describe, expect, it } from 'vitest';
import {
  KEY_BACKFILL_SW_MODE,
  shouldTriggerSwBackfill
} from './swBackfillTrigger.js';

describe('KEY_BACKFILL_SW_MODE', () => {
  it('storage キー名が安定している(実験フラグの正本)', () => {
    expect(KEY_BACKFILL_SW_MODE).toBe('nls_backfill_sw_mode_v1');
  });
});

describe('shouldTriggerSwBackfill', () => {
  const args = (overrides = {}) => ({
    swModeEnabled: true,
    lid: 'lv350000001',
    viewBase: 'https://mpn.live.nicovideo.jp/api/view/v4/x',
    triggeredLiveId: '',
    ...overrides
  });

  it('全条件OKなら fire=true / reason=ok', () => {
    expect(shouldTriggerSwBackfill(args())).toEqual({
      fire: true,
      reason: 'ok'
    });
  });

  it('swModeEnabled=false なら disabled(従来経路を使う)', () => {
    expect(shouldTriggerSwBackfill(args({ swModeEnabled: false }))).toEqual({
      fire: false,
      reason: 'disabled'
    });
  });

  it('swModeEnabled が truthy でも true 厳密一致でなければ disabled', () => {
    expect(shouldTriggerSwBackfill(args({ swModeEnabled: 1 }))).toEqual({
      fire: false,
      reason: 'disabled'
    });
  });

  it('lid が lv 形式でなければ bad_lid', () => {
    expect(shouldTriggerSwBackfill(args({ lid: 'co12345' }))).toEqual({
      fire: false,
      reason: 'bad_lid'
    });
  });

  it('lid 空 / null は bad_lid', () => {
    expect(shouldTriggerSwBackfill(args({ lid: '' })).reason).toBe('bad_lid');
    expect(shouldTriggerSwBackfill(args({ lid: null })).reason).toBe('bad_lid');
  });

  it('lid は正規化済み前提: 大文字 LV や空白付きは bad_lid(呼び出し側で trim+lowercase する)', () => {
    expect(shouldTriggerSwBackfill(args({ lid: 'LV350000001' })).reason).toBe(
      'bad_lid'
    );
    expect(shouldTriggerSwBackfill(args({ lid: ' lv350000001 ' })).reason).toBe(
      'bad_lid'
    );
  });

  it('lid が16桁以上の数字は bad_lid', () => {
    expect(
      shouldTriggerSwBackfill(args({ lid: 'lv1234567890123456' })).reason
    ).toBe('bad_lid');
  });

  it('viewBase が http(s) で始まらなければ no_view_base(次tickで再試行可能)', () => {
    expect(shouldTriggerSwBackfill(args({ viewBase: '' }))).toEqual({
      fire: false,
      reason: 'no_view_base'
    });
    expect(
      shouldTriggerSwBackfill(args({ viewBase: 'ws://example.com' })).reason
    ).toBe('no_view_base');
  });

  it('viewBase は前後空白を許容する(trim して判定)', () => {
    expect(
      shouldTriggerSwBackfill(args({ viewBase: '  https://example.com/v ' }))
    ).toEqual({ fire: true, reason: 'ok' });
  });

  it('http:// も許容する(大文字スキーム含む)', () => {
    expect(
      shouldTriggerSwBackfill(args({ viewBase: 'HTTP://example.com/v' })).fire
    ).toBe(true);
  });

  it('同じ live で送信済みなら already_triggered(ワンショット guard)', () => {
    expect(
      shouldTriggerSwBackfill(args({ triggeredLiveId: 'lv350000001' }))
    ).toEqual({ fire: false, reason: 'already_triggered' });
  });

  it('別 live に切り替われば再び fire する', () => {
    expect(
      shouldTriggerSwBackfill(args({ triggeredLiveId: 'lv350000000' })).fire
    ).toBe(true);
  });
});
