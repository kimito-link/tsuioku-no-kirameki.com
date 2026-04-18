/**
 * data/sources/laneFromStoredComments.js の契約テスト。
 *
 * この adapter は DO_NOT_REWRITE の方針により `src/lib/userLaneCandidatesFromStorage.js`
 * を正本として保ち、その戻り値を新 domain が期待する LaneCandidate 形
 * （avatarObservationKinds: Set / hasNonCanonicalPersonalUrl: boolean）に
 * 持ち上げるだけの薄いラッパである。既存ロジックは書き換えない。
 */

import { describe, expect, it } from 'vitest';
import { laneCandidatesFromStoredComments } from './laneFromStoredComments.js';

/**
 * @param {Partial<{
 *   userId: string, nickname: string, avatarUrl: string, avatarObserved: boolean,
 *   liveId: string, lvId: string, capturedAt: number, commentNo: string, text: string
 * }>} overrides
 */
function row(overrides = {}) {
  return {
    userId: overrides.userId ?? '',
    nickname: overrides.nickname ?? '',
    avatarUrl: overrides.avatarUrl ?? '',
    avatarObserved: overrides.avatarObserved ?? false,
    liveId: overrides.liveId ?? 'lv1',
    lvId: overrides.lvId ?? '',
    capturedAt: overrides.capturedAt ?? 1,
    commentNo: overrides.commentNo ?? '1',
    text: overrides.text ?? 'hi'
  };
}

describe('laneCandidatesFromStoredComments: 空 / 不正入力', () => {
  it('null は空配列', () => {
    expect(laneCandidatesFromStoredComments(null)).toEqual([]);
  });
  it('undefined は空配列', () => {
    expect(laneCandidatesFromStoredComments(undefined)).toEqual([]);
  });
  it('非配列は空配列', () => {
    // @ts-expect-error
    expect(laneCandidatesFromStoredComments({})).toEqual([]);
  });
  it('空配列は空配列', () => {
    expect(laneCandidatesFromStoredComments([])).toEqual([]);
  });
});

describe('laneCandidatesFromStoredComments: LaneCandidate 形への射影', () => {
  it('avatarObserved:true の行は kinds に dom が入る', () => {
    const out = laneCandidatesFromStoredComments(
      [row({ userId: '132035068', nickname: 'たろう', avatarObserved: true })],
      'lv1'
    );
    expect(out.length).toBe(1);
    const c = out[0];
    expect(c.userId).toBe('132035068');
    expect(c.avatarObservationKinds).toBeInstanceOf(Set);
    expect(c.avatarObservationKinds.has('dom')).toBe(true);
  });

  it('avatarObserved:false は kinds 空', () => {
    const out = laneCandidatesFromStoredComments(
      [row({ userId: '132035068', nickname: 'たろう', avatarObserved: false })],
      'lv1'
    );
    expect(out[0].avatarObservationKinds.size).toBe(0);
  });

  it('合成 canonical URL のみ → hasNonCanonicalPersonalUrl=false', () => {
    const canonical =
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/13203/132035068.jpg';
    const out = laneCandidatesFromStoredComments(
      [row({ userId: '132035068', nickname: 'たろう', avatarUrl: canonical })],
      'lv1'
    );
    expect(out[0].hasNonCanonicalPersonalUrl).toBe(false);
  });

  it('非合成の個人 URL → hasNonCanonicalPersonalUrl=true', () => {
    const external = 'https://example.com/my-avatar.png';
    const out = laneCandidatesFromStoredComments(
      [row({ userId: '132035068', nickname: 'たろう', avatarUrl: external })],
      'lv1'
    );
    expect(out[0].hasNonCanonicalPersonalUrl).toBe(true);
  });

  it('liveId / lastCapturedAt / nickname / avatarUrl が保持される', () => {
    const out = laneCandidatesFromStoredComments(
      [
        row({
          userId: '132035068',
          nickname: 'ケラ1',
          avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/13203/132035068.jpg',
          liveId: 'lv42',
          capturedAt: 9999,
          avatarObserved: true
        })
      ],
      'lv42'
    );
    const c = out[0];
    expect(c.liveId).toBe('lv42');
    expect(c.nickname).toBe('ケラ1');
    expect(c.avatarUrl).toBeTruthy();
    expect(c.lastCapturedAt).toBe(9999);
  });
});

describe('laneCandidatesFromStoredComments: 同一 userId の複数行を 1 候補に', () => {
  it('観測は後続行にあっても kinds.has(dom) が立つ', () => {
    const uid = '132035068';
    const out = laneCandidatesFromStoredComments(
      [
        row({ userId: uid, nickname: 'ケラ1', capturedAt: 1, avatarObserved: false }),
        row({ userId: uid, nickname: 'ケラ1', capturedAt: 2, avatarObserved: true })
      ],
      'lv1'
    );
    expect(out.length).toBe(1);
    expect(out[0].avatarObservationKinds.has('dom')).toBe(true);
  });
});

describe('laneCandidatesFromStoredComments: liveId フィルタ委譲', () => {
  it('liveId 指定あり → 当放送のみ', () => {
    const out = laneCandidatesFromStoredComments(
      [
        row({ userId: '100001', nickname: 'A', liveId: 'lv_a', capturedAt: 1 }),
        row({ userId: '100002', nickname: 'B', liveId: 'lv_b', capturedAt: 2 })
      ],
      'lv_a'
    );
    // userLaneCandidatesFromStorage は fallback があるので 1 人に絞れた場合それだけ返る
    expect(out.map((x) => x.userId)).toEqual(['100001']);
  });
  it('liveId 省略 → 全 live 混在 OK', () => {
    const out = laneCandidatesFromStoredComments([
      row({ userId: '100001', nickname: 'A', liveId: 'lv_a', capturedAt: 1 }),
      row({ userId: '100002', nickname: 'B', liveId: 'lv_b', capturedAt: 2 })
    ]);
    expect(out.length).toBe(2);
  });
});

describe('laneCandidatesFromStoredComments: 直接 resolveLaneTier と整合する', () => {
  it('非匿名 + observed → tier 3 相当の判定材料がそろう', async () => {
    const { resolveLaneTier } = await import('../../domain/lane/tier.js');
    const out = laneCandidatesFromStoredComments(
      [row({ userId: '132035068', nickname: '', avatarObserved: true })],
      'lv1'
    );
    // nickname 空でも kinds.size>=1 があれば link
    expect(resolveLaneTier(out[0])).toBe(3);
  });
  it('非匿名 + strongNick のみ → tier 3（Phase 1.5 の契約）', async () => {
    const { resolveLaneTier } = await import('../../domain/lane/tier.js');
    const out = laneCandidatesFromStoredComments(
      [row({ userId: '132035068', nickname: 'たろう' })],
      'lv1'
    );
    expect(resolveLaneTier(out[0])).toBe(3);
  });
  it('匿名 ID → tier 1 (tanu)', async () => {
    const { resolveLaneTier } = await import('../../domain/lane/tier.js');
    const out = laneCandidatesFromStoredComments(
      [row({ userId: 'a:AbCdEfGh', nickname: '匿名ユーザー' })],
      'lv1'
    );
    expect(resolveLaneTier(out[0])).toBe(1);
  });
});
