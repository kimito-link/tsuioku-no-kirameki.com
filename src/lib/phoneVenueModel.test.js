import { describe, it, expect } from 'vitest';
import {
  buildPhoneVenueSeats,
  diffPhoneVenueEvents,
  phoneVenueAvatar,
  phoneVenueRowKey,
  PHONE_VENUE_MAX_EVENTS, phoneVenueFallbackFace } from './phoneVenueModel.js';

const c = (no, userId, name, text, extra = {}) => ({ at: no * 1000, no: String(no), userId, name, text, avatarUrl: '', kind: 'comment', ...extra });

describe('buildPhoneVenueSeats', () => {
  it('新しい順・同じ人は1席・上限まで', () => {
    const rows = [c(1, '11', 'A', 'a'), c(2, '22', 'B', 'b'), c(3, '11', 'A', 'a2'), c(4, 'a:x', '匿名', 'c')];
    const seats = buildPhoneVenueSeats(rows, 2);
    expect(seats.map((x) => x.key)).toEqual(['u:a:x', 'u:11']);
  });
  it('ID も名前も無い行は座らせない', () => {
    expect(buildPhoneVenueSeats([{ text: 'x' }])).toEqual([]);
  });
});

describe('phoneVenueAvatar', () => {
  it('届いた顔 → 数値IDの公式の顔 → 匿名の identicon → 空', () => {
    expect(phoneVenueAvatar({ avatarUrl: 'https://x/a.jpg', userId: '12345' })).toBe('https://x/a.jpg');
    expect(phoneVenueAvatar({ userId: '12345' })).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345.jpg');
    expect(phoneVenueAvatar({ userId: 'a:abc' })).toMatch(/^data:image\/svg\+xml/);
    expect(phoneVenueAvatar({})).toBe('');
  });
});

describe('diffPhoneVenueEvents', () => {
  it('最初は覚えるだけ・次から増えた分だけ(古→新)', () => {
    const r1 = diffPhoneVenueEvents({ rows: [c(1, '11', 'A', 'a')], seen: null });
    expect(r1.events).toEqual([]);
    const gift = { at: 5, userId: '22', name: 'B', kind: 'gift', itemName: '花', point: 500, text: '' };
    const r2 = diffPhoneVenueEvents({ rows: [c(1, '11', 'A', 'a'), c(2, '11', 'A', 'b'), gift], seen: r1.seen });
    expect(r2.events.map((e) => [e.type, e.text, e.itemName, e.point])).toEqual([
      ['comment', 'b', '', 0],
      ['gift', '', '花', 500]
    ]);
    expect(r2.events.map((e) => e.no)).toEqual(['2', '']); // v0.1.1742: 声と合わせる目印(ギフトは無し)
    expect(diffPhoneVenueEvents({ rows: [c(2, '11', 'A', 'b'), gift], seen: r2.seen }).events).toEqual([]);
  });
  it('一度にたくさん来ても新しい方から上限件数だけ', () => {
    const seen = diffPhoneVenueEvents({ rows: [], seen: null }).seen;
    const rows = Array.from({ length: 10 }, (_, i) => c(i + 1, '11', 'A', `t${i + 1}`));
    const r = diffPhoneVenueEvents({ rows, seen });
    expect(r.events).toHaveLength(PHONE_VENUE_MAX_EVENTS);
    expect(r.events.at(-1).text).toBe('t10');
  });
  it('番号が無いコメントは送り主・時刻・本文で見分ける', () => {
    expect(phoneVenueRowKey({ userId: '1', at: 3, text: 'x' })).toBe('c:1:3:x');
    expect(phoneVenueRowKey({ no: '9', text: 'x' })).toBe('c:#9');
  });
});

describe('phoneVenueFallbackFace(v0.1.1747)', () => {
  it('読めなかった公式の顔 URL の数値IDから、その人のゆっくり顔(ゆっくりりんくにしない)', () => {
    const f = phoneVenueFallbackFace('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/12/122085475.jpg', {});
    expect(f.startsWith('data:image/svg+xml')).toBe(true);
    expect(f).not.toContain('link-yukkuri');
    expect(phoneVenueFallbackFace('', { userId: '122085475' })).toBe(f);
  });
  it('URL に数値IDが無ければ席の userId → キーで作る・何も無ければ空', () => {
    expect(phoneVenueFallbackFace('', { userId: 'a:xyz' }).startsWith('data:image/svg+xml')).toBe(true);
    expect(phoneVenueFallbackFace('', { key: 'n:はなこ' }).startsWith('data:image/svg+xml')).toBe(true);
    expect(phoneVenueFallbackFace('', {})).toBe('');
  });
});
