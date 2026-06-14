import { describe, it, expect } from 'vitest';
import { buildVenueRoster, formatVenueRosterSummary } from './venueRoster.js';

const seat = (i, p) => ({ seatIndex: i, participant: p });

describe('buildVenueRoster', () => {
  it('全参加者を seatIndex 昇順で行にする', () => {
    const all = [
      seat(2, { key: 'u:c', userId: 'c', name: 'C', avatar: '' }),
      seat(0, { key: 'u:a', userId: 'a', name: 'A', avatar: 'https://e/a.png' }),
      seat(1, { key: 'u:b', userId: 'b', name: 'B', avatar: '' })
    ];
    const { rows } = buildVenueRoster({ allSeats: all, visibleSeats: all });
    expect(rows.map((r) => r.seatIndex)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b', 'c']);
  });

  it('visible 判定: visibleSeats に含まれる人だけ visible=true', () => {
    const all = [
      seat(0, { key: 'u:a', userId: 'a', avatar: 'https://e/a.png' }),
      seat(1, { key: 'u:b', userId: 'b', avatar: '' })
    ];
    const { rows } = buildVenueRoster({ allSeats: all, visibleSeats: [all[0]] });
    expect(rows.find((r) => r.userId === 'a').visible).toBe(true);
    expect(rows.find((r) => r.userId === 'b').visible).toBe(false);
  });

  it('hasThumb 判定: http サムネだけ true', () => {
    const all = [
      seat(0, { key: 'u:a', userId: 'a', avatar: 'https://e/a.png' }),
      seat(1, { key: 'u:b', userId: 'b', avatar: 'data:image/png;base64,AA' }),
      seat(2, { key: 'u:c', userId: 'c', avatar: '' })
    ];
    const { rows } = buildVenueRoster({ allSeats: all, visibleSeats: all });
    expect(rows.find((r) => r.userId === 'a').hasThumb).toBe(true);
    expect(rows.find((r) => r.userId === 'b').hasThumb).toBe(false);
    expect(rows.find((r) => r.userId === 'c').hasThumb).toBe(false);
  });

  it('summary: 全体/表示中/隠れ/サムネ持ち/サムネ表示/観客を集計', () => {
    const all = [
      seat(0, { key: 'u:a', userId: 'a', avatar: 'https://e/a.png' }), // thumb, visible
      seat(1, { key: 'u:b', userId: 'b', avatar: 'https://e/b.png' }), // thumb, hidden
      seat(2, { key: 'u:c', userId: 'c', avatar: '' }) // no thumb, visible
    ];
    const visible = [all[0], all[2]];
    const { summary } = buildVenueRoster({ allSeats: all, visibleSeats: visible, audienceCount: 400 });
    expect(summary).toEqual({
      total: 3,
      visible: 2,
      hidden: 1,
      withThumb: 2,
      thumbVisible: 1, // a だけ(b は hidden)
      audience: 400
    });
  });

  it('空入力でも安全', () => {
    const { rows, summary } = buildVenueRoster({});
    expect(rows).toEqual([]);
    expect(summary.total).toBe(0);
  });
});

describe('formatVenueRosterSummary', () => {
  it('人間とAIが読める1行サマリ', () => {
    const text = formatVenueRosterSummary({
      total: 482,
      visible: 96,
      withThumb: 20,
      thumbVisible: 18,
      audience: 386
    });
    expect(text).toContain('席を持つ参加者 482人');
    expect(text).toContain('画面表示中 96人');
    expect(text).toContain('サムネ持ち 20人');
    expect(text).toContain('後方観客(点描) 386人');
  });
});
