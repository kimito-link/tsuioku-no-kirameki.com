import { describe, expect, it } from 'vitest';
import {
  computeVenueParticipantAvatarCounts,
  venueDiagSig,
  buildVenueDiagHtml
} from './venueAvatarDiagLine.js';

describe('computeVenueParticipantAvatarCounts', () => {
  it('userId/avatar/実効サムネを正しく数える', () => {
    const parts = [
      { userId: '12345', avatar: 'https://example.com/a.jpg' }, // uid+http avatar+resolved
      { userId: '67890', avatar: '' }, // uid あり・数値ID由来でサムネ解決
      { userId: 'a:anon', avatar: '' }, // 匿名(uid あり)・サムネ解決不可
      { userId: '', avatar: '' } // uid なし
    ];
    const c = computeVenueParticipantAvatarCounts(parts);
    expect(c.total).toBe(4);
    expect(c.withUid).toBe(3); // 数値2 + 匿名a:1
    expect(c.withAvatar).toBe(1); // http avatar は1人
    expect(c.resolvedAvatar).toBe(2); // 数値ID2人は席サムネ解決可・匿名は不可
  });

  it('空配列/非配列で落ちない(全0)', () => {
    expect(computeVenueParticipantAvatarCounts([])).toEqual({ total: 0, withUid: 0, withAvatar: 0, resolvedAvatar: 0 });
    expect(computeVenueParticipantAvatarCounts(null)).toEqual({ total: 0, withUid: 0, withAvatar: 0, resolvedAvatar: 0 });
  });

  it('壊れた要素(null/文字列)を飛ばして数える', () => {
    const c = computeVenueParticipantAvatarCounts([null, 'x', { userId: '111' }]);
    expect(c.total).toBe(1);
    expect(c.withUid).toBe(1);
  });
});

describe('venueDiagSig(無変化 skip 用)', () => {
  const counts = { total: 3, withUid: 2, withAvatar: 1, resolvedAvatar: 2 };
  const diag = { seatsShown: 3, participantCount: 3, otherCount: 0, broadcasterInSeats: false, broadcasterKnown: true };

  it('同じ件数なら同じ sig(DOM を触らない)', () => {
    expect(venueDiagSig(counts, diag)).toBe(venueDiagSig({ ...counts }, { ...diag }));
  });

  it('件数が変われば sig が変わる(再描画される)', () => {
    expect(venueDiagSig(counts, diag)).not.toBe(venueDiagSig({ ...counts, withUid: 3 }, diag));
    expect(venueDiagSig(counts, diag)).not.toBe(venueDiagSig(counts, { ...diag, otherCount: 5 }));
  });

  it('capturedAt など時刻は sig に含めない(時刻違いでも同一)', () => {
    const a = venueDiagSig(counts, { ...diag, capturedAt: 1000, lastUpdateAt: 1000 });
    const b = venueDiagSig(counts, { ...diag, capturedAt: 9999, lastUpdateAt: 9999 });
    expect(a).toBe(b);
  });
});

describe('buildVenueDiagHtml', () => {
  it('参加者ありで件数を lead/face に出す', () => {
    const html = buildVenueDiagHtml({
      counts: { total: 10, withUid: 8, withAvatar: 3, resolvedAvatar: 6 },
      seatsDiag: { seatsShown: 7, participantCount: 10, otherCount: 3, broadcasterKnown: true, broadcasterInSeats: false }
    });
    expect(html).toContain('nl-venue-diag');
    expect(html).toContain('<strong>10</strong> 人が参加');
    expect(html).toContain('席に表示しているのは <strong>7</strong> 人');
    expect(html).toContain('ほか <strong>3</strong> 人');
    expect(html).toContain('席にご案内できた <strong>10</strong> 人');
    expect(html).toContain('顔アイコンを表示できているのは <strong>6</strong>');
    expect(html).toContain('ユーザーIDが付いているのは <strong>8</strong>');
    expect(html).toContain('配信者ご本人は席に混ざっていません');
  });

  it('配信者混入(異常)は警告を出す', () => {
    const html = buildVenueDiagHtml({
      counts: { total: 1, withUid: 1, withAvatar: 0, resolvedAvatar: 1 },
      seatsDiag: { seatsShown: 1, participantCount: 1, otherCount: 0, broadcasterKnown: true, broadcasterInSeats: true }
    });
    expect(html).toContain('nl-venue-diag__warn');
    expect(html).toContain('配信者ご本人が席に混ざっています');
  });

  it('配信者 uid 不明なら混入行を出さない(恥をかかせない)', () => {
    const html = buildVenueDiagHtml({
      counts: { total: 1, withUid: 1, withAvatar: 0, resolvedAvatar: 1 },
      seatsDiag: { seatsShown: 1, participantCount: 1, otherCount: 0, broadcasterKnown: false, broadcasterInSeats: false }
    });
    expect(html).not.toContain('配信者');
  });

  it('参加者0でも1ブロック返す(空の明滅を作らない)', () => {
    const html = buildVenueDiagHtml({ counts: { total: 0, withUid: 0, withAvatar: 0, resolvedAvatar: 0 }, seatsDiag: {} });
    expect(html).toContain('nl-venue-diag');
    expect(html).toContain('まだ参加者がいません');
  });

  it('席上限超(participantCount > total)で lead と faceLine が矛盾表示にならない', () => {
    // 参加120人だが席に案内できたのは席上限ぶん(例50)= total=50 のケース。
    //   lead は「120人が参加」、faceLine は「席にご案内できた 50 人のうち」で母集団が明示分離される。
    const html = buildVenueDiagHtml({
      counts: { total: 50, withUid: 40, withAvatar: 10, resolvedAvatar: 30 },
      seatsDiag: { seatsShown: 50, participantCount: 120, otherCount: 70 }
    });
    expect(html).toContain('<strong>120</strong> 人が参加'); // 全参加者(上限なし)
    expect(html).toContain('席にご案内できた <strong>50</strong> 人'); // 席ベース(上限あり)
    // 「応援してくれている 50 人」のような、全参加者と矛盾して読める旧文言は出さない。
    expect(html).not.toContain('応援してくれている');
  });

  it('otherCount=0 のときは「ほかN人」を出さない', () => {
    const html = buildVenueDiagHtml({
      counts: { total: 2, withUid: 2, withAvatar: 0, resolvedAvatar: 2 },
      seatsDiag: { seatsShown: 2, participantCount: 2, otherCount: 0 }
    });
    expect(html).not.toContain('入りきりません');
  });
});
