// v0.1.2265: YouTube の写し ID(8 + 9桁)を、会場のカードの名前や「本登録」にしない
import { describe, expect, it } from 'vitest';
import { isInternalMarketingId, operatorDisplayName } from '../marketingOperatorReport.js';
import { buildVenueHoverCardModel, venueParticipantDisplayName } from '../venueHoverCard.js';

const HASHED = '8029709044';

describe('YouTube 写し ID は内部番号', () => {
  it('isInternalMarketingId は YouTube 系で 8+9桁を内部とみなす(ニコは本登録のまま)', () => {
    expect(isInternalMarketingId(HASHED, 'youtube')).toBe(true);
    expect(isInternalMarketingId(HASHED, 'twitch')).toBe(true);
    expect(isInternalMarketingId(HASHED, 'niconico')).toBe(false);
    expect(isInternalMarketingId('12345678', 'youtube')).toBe(false);
  });
  it('名前が写し ID だけのとき、表示は「名前未取得」(番号そのものは出さない)', () => {
    expect(venueParticipantDisplayName(HASHED, HASHED, 'youtube')).toBe('名前未取得');
    expect(operatorDisplayName({ name: HASHED, uid: HASHED }, { platformId: 'youtube' })).toBe('名前未取得');
  });
  it('ホバーカードに本登録とも番号の名前とも出さない', () => {
    const m = buildVenueHoverCardModel({
      uid: HASHED, displayName: HASHED, platformId: 'youtube', count: 3, hasGift: false,
    });
    expect(m.displayName).toBe('名前未取得');
    expect(m.displayName).not.toBe(HASHED);
    expect(m.idLine).not.toContain('本登録');
    expect(m.idLine).not.toContain(HASHED);
  });
  it('ニコの本登録は今までどおり', () => {
    const m = buildVenueHoverCardModel({
      uid: '12345678', displayName: 'たろう', platformId: 'niconico', count: 1,
    });
    expect(m.displayName).toBe('たろう');
    expect(m.idLine).toBe('ID:12345678(本登録)');
  });
});
