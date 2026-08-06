import { describe, expect, it } from 'vitest';
import {
  sanitizeLaneMirrorForRead,
  LANE_MIRROR_TIERS,
  LANE_MIRROR_CONSUMERS
} from './laneMirrorContract.js';

/** テスト用の最小 snapshot を作る。 */
function snapOf(buckets, extra = {}) {
  return { liveId: 'lv1', capturedAt: 1000, buckets, ...extra };
}
/** uid つきセル。 */
function cell(userId, extra = {}) {
  return { entry: { userId }, displaySrc: 'https://x/i.jpg', title: 'n', ...extra };
}

describe('sanitizeLaneMirrorForRead — 段別の不変条件(①の tier 法と同一)', () => {
  it('link段の匿名uidセルを落とし droppedLinkAnon に数える', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [cell('123456'), cell('a:XZVo')], gift: [], ad: [], konta: [], tanu: [] })
    );
    expect(r.snap.buckets.link).toHaveLength(1);
    expect(r.snap.buckets.link[0].entry.userId).toBe('123456');
    expect(r.droppedLinkAnon).toBe(1);
  });

  it('konta段の匿名uidセルを落とす', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [], gift: [], ad: [], konta: [cell('a:abc'), cell('4046119')], tanu: [] })
    );
    expect(r.snap.buckets.konta).toHaveLength(1);
    expect(r.droppedKontaAnon).toBe(1);
  });

  it('★tanu段の匿名uidセルは落とさない(匿名を吸収する段=①と同じ法)', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [], gift: [], ad: [], konta: [], tanu: [cell('a:abc'), cell('a:def')] })
    );
    expect(r.snap.buckets.tanu).toHaveLength(2);
    expect(r.droppedLinkAnon + r.droppedKontaAnon + r.droppedUnkeyed).toBe(0);
  });

  it('gift/ad段のuid無しセル(広告主など)は落とさない', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({
        link: [],
        gift: [{ entry: {}, title: 'ゲスト' }],
        ad: [{ entry: { userId: '' }, title: 'トルキア' }],
        konta: [],
        tanu: []
      })
    );
    expect(r.snap.buckets.gift).toHaveLength(1);
    expect(r.snap.buckets.ad).toHaveLength(1);
    expect(r.droppedUnkeyed).toBe(0);
  });

  it('link段のuid無しセルは droppedUnkeyed に落とす', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [{ entry: {}, title: 'x' }, cell('55555')], gift: [], ad: [], konta: [], tanu: [] })
    );
    expect(r.snap.buckets.link).toHaveLength(1);
    expect(r.droppedUnkeyed).toBe(1);
  });

  it('★正常snapは中身を作り変えない(recentTexts/displaySrc/meta を落とさない)', () => {
    const rich = {
      entry: { userId: '124272691' },
      displaySrc: 'https://x/a.jpg',
      title: 'なまえ',
      meta: { idLine: 'ID:124272691', nameLine: 'なまえ' },
      recentTexts: ['あ', 'い'],
      commentCount: 3,
      giftCount: 1,
      _laneSortAt: 12345
    };
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [rich], gift: [], ad: [], konta: [], tanu: [] })
    );
    // ★spread で写しているので参照等値まで保たれる(個別列挙で作り直していない証拠)。
    expect(r.snap.buckets.link[0]).toBe(rich);
    expect(r.snap.buckets.link[0].recentTexts).toEqual(['あ', 'い']);
    expect(r.snap.buckets.link[0].meta.idLine).toBe('ID:124272691');
  });

  it('★snapshot直下のフィールドも保存する(capturedAt/pickedLength/totalCandidates)', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [], gift: [], ad: [], konta: [], tanu: [] }, {
        pickedLength: 48,
        totalCandidates: 300,
        domSelf: { a: 1 }
      })
    );
    expect(r.snap.capturedAt).toBe(1000);
    expect(r.snap.pickedLength).toBe(48);
    expect(r.snap.totalCandidates).toBe(300);
    expect(r.snap.domSelf).toEqual({ a: 1 });
  });

  it('壊れた形は fail-closed(snap:null + issues)', () => {
    expect(sanitizeLaneMirrorForRead(null).snap).toBeNull();
    expect(sanitizeLaneMirrorForRead(undefined).issues).toContain('snapshotが無い');
    expect(sanitizeLaneMirrorForRead({ liveId: '', buckets: {} }).issues).toContain('liveIdが空');
    expect(sanitizeLaneMirrorForRead({ liveId: 'lv1' }).issues).toContain('bucketsが無い');
  });

  it('旧版snapshot(段が一部欠けている)を受理する=additive-only の互換', () => {
    const r = sanitizeLaneMirrorForRead(snapOf({ link: [cell('4046119')] }));
    expect(r.snap).not.toBeNull();
    // 欠けた段は空配列で埋まる(読み手が undefined を踏まない)。
    for (const tier of LANE_MIRROR_TIERS) {
      expect(Array.isArray(r.snap.buckets[tier])).toBe(true);
    }
  });
});

describe('LANE_MIRROR_CONSUMERS — 登録簿の形', () => {
  it('全エントリが file/role/note を持ち role は writer|reader のみ', () => {
    expect(LANE_MIRROR_CONSUMERS.length).toBeGreaterThan(0);
    for (const c of LANE_MIRROR_CONSUMERS) {
      expect(typeof c.file).toBe('string');
      expect(['writer', 'reader']).toContain(c.role);
      expect(String(c.note || '').length).toBeGreaterThan(0);
    }
  });

  it('★書き手が居る(唯一の書き手 popup-entry.js が登録されている)', () => {
    const writers = LANE_MIRROR_CONSUMERS.filter((c) => c.role === 'writer');
    expect(writers.map((c) => c.file)).toContain('src/extension/popup-entry.js');
  });

  it('★会場が reader として登録されている(=書き手は会場を客だと知っている)', () => {
    const venue = LANE_MIRROR_CONSUMERS.find((c) => c.file === 'src/extension/venueBar.js');
    expect(venue).toBeDefined();
    expect(venue.role).toBe('reader');
  });
});
