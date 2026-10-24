import { describe, expect, it } from 'vitest';
import {
  liveEventToMirrorRow,
  mergeLiveRowsIntoMirror,
  mirrorRowToLiveEvent,
  parseLiveEventsMessage,
  sanitizeLiveEvent,
  sanitizeLiveEventsBody
} from './liveEvents.js';

const row = (no, at, text = 'こんにちは') => ({ no: String(no), at, name: `u${no}`, text, avatarUrl: 'https://x.example/a.jpg', userId: String(100 + no), kind: '' });

describe('liveEvents(v0.1.1756 リアルタイム化の形)', () => {
  it('★壊れたイベントは1件ずつ捨て、危ない URL は空にする', () => {
    expect(sanitizeLiveEvent({ type: 'comment', at: 1, text: 'a', avatarUrl: 'javascript:alert(1)' }).avatarUrl).toBe('');
    expect(sanitizeLiveEvent({ type: 'evil', at: 1, text: 'a' })).toBeNull();
    expect(sanitizeLiveEvent({ type: 'comment', at: 0, text: 'a' })).toBeNull();
    expect(sanitizeLiveEvent({ type: 'comment', at: 5, text: 'x'.repeat(500) }).text).toHaveLength(200);
    expect(sanitizeLiveEvent({ type: 'liveChanged', liveId: 'LV123' })).toMatchObject({ type: 'liveChanged', liveId: 'lv123' });
    expect(sanitizeLiveEvent({ type: 'liveChanged', liveId: 'x' })).toBeNull();
  });
  it('★送信の本文: 配信・送信番号・イベント配列が揃わなければ null、50件を超えたら null', () => {
    const ok = { liveId: 'lv1', sendId: 'abcdefgh', events: [{ type: 'comment', at: 1, text: 'a' }, null], dropped: 3 };
    expect(sanitizeLiveEventsBody(ok)).toMatchObject({ liveId: 'lv1', events: [{ text: 'a' }], dropped: 3 });
    expect(sanitizeLiveEventsBody({ ...ok, liveId: 'x' })).toBeNull();
    expect(sanitizeLiveEventsBody({ ...ok, sendId: 'short' })).toBeNull();
    expect(sanitizeLiveEventsBody({ ...ok, events: [null] })).toBeNull();
    expect(sanitizeLiveEventsBody({ ...ok, events: new Array(51).fill({ type: 'comment', at: 1, text: 'a' }) })).toBeNull();
  });
  it('鏡の行 → イベント → 鏡の行で中身が戻る(ギフトは gift)', () => {
    const r = row(7, 1000);
    expect(liveEventToMirrorRow(mirrorRowToLiveEvent(r))).toEqual(r);
    expect(mirrorRowToLiveEvent({ ...r, kind: 'gift' }).type).toBe('gift');
  });
  it('★スマホ: 新しい行だけ足し、同じ番号は足さない・時刻順・上限で古い方から消える', () => {
    const snap = { liveId: 'lv1', capturedAt: 2000, rows: [row(1, 1000), row(2, 2000)], totalSeen: 2 };
    const m = mergeLiveRowsIntoMirror(snap, [row(2, 2000), row(3, 3000)], { liveId: 'lv1' });
    expect(m.rows.map((r) => r.no)).toEqual(['1', '2', '3']);
    expect(m.capturedAt).toBe(3000);
    expect(snap.rows).toHaveLength(2);
    const capped = mergeLiveRowsIntoMirror(snap, [row(3, 3000), row(4, 4000)], { liveId: 'lv1', cap: 3 });
    expect(capped.rows.map((r) => r.no)).toEqual(['2', '3', '4']);
  });
  it('★スマホ: ポーリングで届いた古い鏡にも、届いていた行を足し直せる(巻き戻さない)・配信が違えば足さない', () => {
    const live = [row(5, 5000)];
    const polled = { liveId: 'lv1', capturedAt: 4000, rows: [row(4, 4000)] };
    expect(mergeLiveRowsIntoMirror(polled, live, { liveId: 'lv1' }).rows.map((r) => r.no)).toEqual(['4', '5']);
    expect(mergeLiveRowsIntoMirror({ ...polled, liveId: 'lv2' }, live, { liveId: 'lv1' }).liveId).toBe('lv2');
    expect(mergeLiveRowsIntoMirror(null, live, { liveId: 'lv1' }).rows).toHaveLength(1);
    expect(mergeLiveRowsIntoMirror(polled, [], { liveId: 'lv1' })).toBe(polled);
  });
  it('★Ably の SSE: 封筒あり(data が JSON 文字列)・封筒なしのどちらも読め、壊れていれば null', () => {
    const inner = { liveId: 'lv1', events: [{ type: 'comment', at: 1, text: 'a' }] };
    const env = JSON.stringify({ id: 'x', name: 'events', encoding: 'json', data: JSON.stringify(inner) });
    expect(parseLiveEventsMessage(env)).toMatchObject({ liveId: 'lv1', events: [{ text: 'a' }] });
    expect(parseLiveEventsMessage(JSON.stringify(inner))).toMatchObject({ liveId: 'lv1' });
    expect(parseLiveEventsMessage('{oops')).toBeNull();
    expect(parseLiveEventsMessage(JSON.stringify({ data: '{"liveId":"x","events":[]}' }))).toBeNull();
  });
});
