import { describe, it, expect } from 'vitest';
import { resolveAvatar, isObservationSafe } from './avatarResolver.js';

const VIEWER_UID = '4046119';
const BROADCASTER_UID = '99999';

const VIEWER_PERSONAL_ICON =
  'https://cdn.example/viewer-photo.jpg';
const BROADCASTER_ICON_150 =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/uri150x150/9/99999.jpg';
const BROADCASTER_ICON_SMALL =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/9/99999.jpg';
const PAST_BROADCASTER_ICON_SMALL =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/14367/143675916.jpg';
const VIEWER_CANONICAL =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/4/4046119.jpg';

const broadcaster = {
  broadcasterUid: BROADCASTER_UID,
  broadcasterIconUrl: BROADCASTER_ICON_150
};

describe('resolveAvatar - 設計書 §5 の TDD ケース', () => {
  it('T1: 観測ゼロ + 数値 ID → canonical 合成', () => {
    const out = resolveAvatar({
      userId: '132035068',
      observations: [],
      broadcaster
    });
    expect(out.displayUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/13203/132035068.jpg'
    );
    expect(out.observedKinds.size).toBe(0);
  });

  it('T2: 観測ゼロ + 匿名 ID → 空文字', () => {
    const out = resolveAvatar({
      userId: 'a:abc123',
      observations: [],
      broadcaster
    });
    expect(out.displayUrl).toBe('');
    expect(out.observedKinds.size).toBe(0);
  });

  it('T3: DOM 観測 1 件 → DOM 採用', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'dom', url: VIEWER_CANONICAL, observedAt: 1 }
      ],
      broadcaster
    });
    expect(out.displayUrl).toBe(VIEWER_CANONICAL);
    expect(out.observedKinds.has('dom')).toBe(true);
  });

  it('T4: broadcaster なりすまし URL を弾く（0.1.76 case）', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'dom', url: BROADCASTER_ICON_150, observedAt: 1 }
      ],
      broadcaster
    });
    // canonical 合成にフォールバック
    // bucket = floor(4046119/10000) = 404
    expect(out.displayUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/404/4046119.jpg'
    );
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('uid-mismatch');
  });

  it('T5: サイズバリアント (uri150x150 vs /s/) でも broadcaster 検出（0.1.80 case）', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        // 観測は /s/ 小サイズ（broadcaster の icon, 違うサイズ）
        { kind: 'dom', url: BROADCASTER_ICON_SMALL, observedAt: 1 }
      ],
      broadcaster
    });
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('uid-mismatch');
  });

  it('T6: broadcaster 本人 uid + broadcaster icon → 通す', () => {
    const out = resolveAvatar({
      userId: BROADCASTER_UID,
      observations: [
        { kind: 'dom', url: BROADCASTER_ICON_SMALL, observedAt: 1 }
      ],
      broadcaster
    });
    expect(out.displayUrl).toBe(BROADCASTER_ICON_SMALL);
    expect(out.rejected.length).toBe(0);
  });

  it('T7: broadcaster 情報未取得 → 普遍ルールのみ適用（false positive 回避）', () => {
    // broadcaster 情報なしでも普遍ルールは効く（uid mismatch が検出される）
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'dom', url: PAST_BROADCASTER_ICON_SMALL, observedAt: 1 }
      ],
      broadcaster: { broadcasterUid: '', broadcasterIconUrl: '' }
    });
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('uid-mismatch');
  });

  it('T8: 多ソース併存 → 優先順 (dom > stored)', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'stored', url: VIEWER_CANONICAL, observedAt: 1 },
        { kind: 'dom', url: VIEWER_PERSONAL_ICON, observedAt: 2 }
      ],
      broadcaster
    });
    expect(out.displayUrl).toBe(VIEWER_PERSONAL_ICON);
    expect(out.observedKinds.size).toBe(2);
    expect(out.observedKinds.has('dom')).toBe(true);
    expect(out.observedKinds.has('stored')).toBe(true);
  });

  it('T9: profile-cache 経由汚染も弾く（0.1.81 case + 永続化対応）', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'profile-cache', url: BROADCASTER_ICON_SMALL, observedAt: 1 }
      ],
      broadcaster
    });
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('uid-mismatch');
    // canonical fallback
    // bucket = floor(4046119/10000) = 404
    expect(out.displayUrl).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/404/4046119.jpg'
    );
  });

  it('T10: viewer なりすまし（新規予防ケース）', () => {
    const otherUid = '88888';
    const out = resolveAvatar({
      userId: otherUid, // 他人
      observations: [
        // viewer の icon が他人の uid に紐付いている
        { kind: 'dom', url: VIEWER_PERSONAL_ICON, observedAt: 1 }
      ],
      broadcaster,
      viewer: {
        viewerUid: VIEWER_UID,
        viewerAvatarUrl: VIEWER_PERSONAL_ICON
      }
    });
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('viewer-impersonation');
  });
});

describe('resolveAvatar - 追加ケース（実機シナリオ補強）', () => {
  it('過去の broadcaster icon 残骸も普遍ルールで弾く', () => {
    // 別放送 (143675916) の broadcaster icon が viewer の cache に残っている
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'profile-cache', url: PAST_BROADCASTER_ICON_SMALL, observedAt: 1 }
      ],
      broadcaster // 現在の broadcaster は別人 (99999)
    });
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('uid-mismatch');
  });

  it('複数汚染 + 1 件正常 → 正常の方を採用', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'profile-cache', url: PAST_BROADCASTER_ICON_SMALL, observedAt: 1 },
        { kind: 'dom', url: BROADCASTER_ICON_SMALL, observedAt: 2 },
        { kind: 'stored', url: VIEWER_PERSONAL_ICON, observedAt: 3 }
      ],
      broadcaster
    });
    expect(out.displayUrl).toBe(VIEWER_PERSONAL_ICON);
    expect(out.rejected.length).toBe(2);
    expect(out.observedKinds.has('stored')).toBe(true);
  });

  it('invalid URL は invalid-url で reject', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'dom', url: 'not a url', observedAt: 1 }
      ]
    });
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('invalid-url');
  });

  it('クエリ string 付き URL も正しく判定', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'dom', url: `${BROADCASTER_ICON_SMALL}?cache=1`, observedAt: 1 }
      ],
      broadcaster
    });
    expect(out.rejected.length).toBe(1);
    expect(out.rejected[0].reason).toBe('uid-mismatch');
  });

  it('hasNonCanonicalPersonalUrl: 非 canonical の DOM 観測あり → true', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'dom', url: VIEWER_PERSONAL_ICON, observedAt: 1 }
      ]
    });
    expect(out.hasNonCanonicalPersonalUrl).toBe(true);
  });

  it('hasNonCanonicalPersonalUrl: canonical のみ → false', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        { kind: 'stored', url: VIEWER_CANONICAL, observedAt: 1 }
      ]
    });
    expect(out.hasNonCanonicalPersonalUrl).toBe(false);
  });

  it('input null / undefined でクラッシュしない', () => {
    expect(resolveAvatar(null).displayUrl).toBe('');
    expect(resolveAvatar(undefined).displayUrl).toBe('');
    expect(resolveAvatar({}).displayUrl).toBe('');
  });

  it('observations に null/undefined エントリあっても無視', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [
        null,
        undefined,
        { kind: 'dom', url: VIEWER_CANONICAL, observedAt: 1 },
        'invalid'
      ]
    });
    expect(out.displayUrl).toBe(VIEWER_CANONICAL);
  });

  it('返り値は frozen（immutability 保証）', () => {
    const out = resolveAvatar({
      userId: VIEWER_UID,
      observations: [{ kind: 'dom', url: VIEWER_CANONICAL, observedAt: 1 }]
    });
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out.rejected)).toBe(true);
  });
});

describe('isObservationSafe - 単独使用（書き込み時のフィルタ用）', () => {
  it('safe ケースで safe:true', () => {
    const r = isObservationSafe(
      VIEWER_UID,
      { kind: 'dom', url: VIEWER_CANONICAL, observedAt: 1 },
      broadcaster
    );
    expect(r.safe).toBe(true);
  });

  it('uid mismatch で safe:false + reason', () => {
    const r = isObservationSafe(
      VIEWER_UID,
      { kind: 'dom', url: BROADCASTER_ICON_SMALL, observedAt: 1 },
      broadcaster
    );
    expect(r.safe).toBe(false);
    if (!r.safe) expect(r.reason).toBe('uid-mismatch');
  });

  it('invalid URL で safe:false + invalid-url', () => {
    const r = isObservationSafe(VIEWER_UID, {
      kind: 'dom',
      url: 'not-a-url'
    });
    expect(r.safe).toBe(false);
    if (!r.safe) expect(r.reason).toBe('invalid-url');
  });
});
