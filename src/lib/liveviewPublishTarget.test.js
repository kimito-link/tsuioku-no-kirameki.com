import { describe, it, expect } from 'vitest';
import { publishPayloadLiveId, publishPayloadLiveIds, checkPublishTarget } from './liveviewPublishTarget.js';

const blob = (over = {}) => ({
  northStarMirror: { liveId: 'lv111' },
  laneMirror: { liveId: 'lv111' },
  statCardsMirror: { liveId: 'lv111' },
  ...over
});

describe('publishPayloadLiveId(送ろうとしているデータの配信)', () => {
  it('北極星 > レーン > 数字カード の順で liveId を取る(小文字・空白除去)', () => {
    expect(publishPayloadLiveId(blob())).toBe('lv111');
    expect(publishPayloadLiveId({ laneMirror: { liveId: ' LV222 ' } })).toBe('lv222');
    expect(publishPayloadLiveId({ statCardsMirror: { liveId: 'lv333' } })).toBe('lv333');
  });
  it('どれも無い/不正な入力は空文字', () => {
    expect(publishPayloadLiveId({})).toBe('');
    expect(publishPayloadLiveId(null)).toBe('');
    expect(publishPayloadLiveId('x')).toBe('');
  });
});

describe('checkPublishTarget(ページの ?lv= と送るデータの配信が一致するか)', () => {
  it('一致なら ok', () => {
    expect(checkPublishTarget(blob(), 'lv111')).toEqual({ ok: true, payloadLiveId: 'lv111', reason: '' });
    expect(checkPublishTarget(blob(), ' LV111 ').ok).toBe(true);
  });
  it('★別の配信のデータは送らない(公開URLへ別配信を載せる事故を止める)', () => {
    const r = checkPublishTarget(blob(), 'lv999');
    expect(r.ok).toBe(false);
    expect(r.payloadLiveId).toBe('lv111');
    expect(r.reason).toMatch(/lv111/);
    expect(r.reason).toMatch(/lv999/);
  });
  it('データ側の配信が分からないとき(鏡が無い)は判定できないので ok(従来どおり)', () => {
    expect(checkPublishTarget({}, 'lv111')).toEqual({ ok: true, payloadLiveId: '', reason: '' });
  });
  it('ページ側の lv が不明なら判定できないので ok(従来どおり・公開バー自体が lv 無しでは出ない)', () => {
    expect(checkPublishTarget(blob(), '').ok).toBe(true);
  });
});

describe('鏡が空でも他の区画が配信IDを持つ(独立検証の指摘)', () => {
  it('publishPayloadLiveIds: 鏡の各区画と topSupporters の liveId を重複なく集める', () => {
    const ids = publishPayloadLiveIds({
      northStarMirror: { liveId: 'lv111' },
      laneMirror: { liveId: 'LV111' },
      topSupporters: { liveId: 'lv222' },
      giftHistoryMirror: { liveId: 'lv333' },
      other: { liveId: 'lv999' }
    });
    expect(ids.sort()).toEqual(['lv111', 'lv222', 'lv333']);
  });
  it('★鏡が全部空でも topSupporters が別配信なら止める', () => {
    const r = checkPublishTarget({ topSupporters: { liveId: 'lv222' } }, 'lv111');
    expect(r.ok).toBe(false);
    expect(r.payloadLiveId).toBe('lv222');
  });
  it('★鏡は一致していても、別の区画が別配信なら止める(混在)', () => {
    expect(checkPublishTarget(blob({ topSupporters: { liveId: 'lv222' } }), 'lv111').ok).toBe(false);
    expect(checkPublishTarget(blob({ giftHistoryMirror: { liveId: 'lv222' } }), 'lv111').ok).toBe(false);
  });
  it('全部の区画が同じ配信なら ok', () => {
    expect(checkPublishTarget(blob({ topSupporters: { liveId: 'lv111' } }), 'lv111').ok).toBe(true);
  });
});
