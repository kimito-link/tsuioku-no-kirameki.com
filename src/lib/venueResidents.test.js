import { describe, test, expect } from 'vitest';
import { buildVenueResidents, VENUE_RESIDENT_IDS } from './venueResidents.js';

/**
 * 会場常駐3キャラ(りんく・こん太・たぬ姉)の描画モデル。
 * 「開いた瞬間に必ず誰かが居る」=ローディング/空っぽに見せない最後の砦。
 * 会場参加者カウントには含めない(誤情報防止)。
 */
const idUrl = (rel) => `chrome-extension://ID/${rel}`;

describe('buildVenueResidents (3キャラ常駐モデル)', () => {
  test('常に3体・順序固定(rinku→konta→tanunee)', () => {
    const r = buildVenueResidents(idUrl);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.id)).toEqual(['rinku', 'konta', 'tanunee']);
  });

  test('id はユニーク・VENUE_RESIDENT_IDS と一致', () => {
    const r = buildVenueResidents(idUrl);
    const ids = r.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...VENUE_RESIDENT_IDS]);
  });

  test('名前が各キャラに付く(空でない)', () => {
    const r = buildVenueResidents(idUrl);
    for (const x of r) expect(x.name.length).toBeGreaterThan(0);
  });

  test('imgSrc は resolveUrl を通っている(拡張URLに解決)', () => {
    const r = buildVenueResidents(idUrl);
    for (const x of r) {
      expect(x.imgSrc.startsWith('chrome-extension://ID/')).toBe(true);
      expect(x.imgSrc).toContain('yukkuri-charactore-english');
    }
  });

  test('resolveUrl が無い/不正でも例外を投げず相対パスを返す', () => {
    const r = buildVenueResidents(undefined);
    expect(r).toHaveLength(3);
    for (const x of r) expect(x.imgSrc).toContain('yukkuri-charactore-english');
  });

  test('各キャラの画像パスが異なる(同じ顔を3つ出さない)', () => {
    const r = buildVenueResidents(idUrl);
    const srcs = r.map((x) => x.imgSrc);
    expect(new Set(srcs).size).toBe(3);
  });
});
