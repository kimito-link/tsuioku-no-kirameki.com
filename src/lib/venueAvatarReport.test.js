import { describe, expect, it } from 'vitest';
import {
  VENUE_AVATAR_FAIL_WARN_PCT,
  formatVenueAvatarLine,
  formatVenueDiagReachLine
} from './venueAvatarReport.js';

describe('formatVenueAvatarLine — 会場のアイコン実績', () => {
  it('観測ゼロなら行を出さない(普段の速報を汚さない)', () => {
    expect(formatVenueAvatarLine(null)).toBe('');
    expect(formatVenueAvatarLine({})).toBe('');
    expect(formatVenueAvatarLine({ usericonSucceeded: 0, usericonFailed: 0 })).toBe('');
  });

  it('全部成功なら ✅', () => {
    const line = formatVenueAvatarLine({ usericonSucceeded: 10, usericonFailed: 0 });
    expect(line).toContain('✅');
    expect(line).toContain('成功10');
  });

  it(`★失敗率が ${VENUE_AVATAR_FAIL_WARN_PCT}% 以上なら 🔴`, () => {
    const line = formatVenueAvatarLine({
      usericonSucceeded: 1,
      usericonFailed: 2,
      failedTimeout: 1,
      failedError: 1
    });
    expect(line).toContain('🔴');
    expect(line).toContain('67%');
    expect(line).toContain('timeout1/error1');
  });

  it('★再取得0回なら名指しする(popup で実際に踏んだ穴)', () => {
    const line = formatVenueAvatarLine({ usericonSucceeded: 1, usericonFailed: 2, retriedTotal: 0 });
    expect(line).toContain('★再取得0回');
  });

  it('再取得していれば回数を出す', () => {
    const line = formatVenueAvatarLine({ usericonSucceeded: 1, usericonFailed: 2, retriedTotal: 5 });
    expect(line).toContain('再取得5回');
    expect(line).not.toContain('★再取得0回');
  });

  it('成功のみなら再取得の注記は出さない(ノイズにしない)', () => {
    const line = formatVenueAvatarLine({ usericonSucceeded: 5, usericonFailed: 0, retriedTotal: 0 });
    expect(line).not.toContain('再取得');
  });
});

describe('formatVenueDiagReachLine — 会場の診断が届いているか', () => {
  it('会場を開いていないなら黙る', () => {
    expect(formatVenueDiagReachLine({ venueOpen: false, venueSeatsDiag: null })).toBe('');
  });

  it('★会場は開いているのに診断が無いなら名指しする(実測 venueSeatsDiag:null)', () => {
    const line = formatVenueDiagReachLine({ venueOpen: true, venueSeatsDiag: null });
    expect(line).toContain('🔴');
    expect(line).toContain('診断が届いていません');
  });

  it('★診断が古すぎるなら名指しする(3秒min-gapなのに60秒超)', () => {
    const line = formatVenueDiagReachLine({
      venueOpen: true,
      venueSeatsDiag: { lastUpdateAt: 1 },
      diagAgeMs: 656_000
    });
    expect(line).toContain('⚠');
    expect(line).toContain('656秒前');
  });

  it('新鮮なら黙る(正常時のノイズにしない)', () => {
    const line = formatVenueDiagReachLine({
      venueOpen: true,
      venueSeatsDiag: { lastUpdateAt: 1 },
      diagAgeMs: 2000
    });
    expect(line).toBe('');
  });
});
