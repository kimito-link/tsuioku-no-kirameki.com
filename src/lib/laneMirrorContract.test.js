import { describe, expect, it } from 'vitest';
import {
  sanitizeLaneMirrorForRead,
  LANE_MIRROR_TIERS,
  LANE_MIRROR_CONSUMERS
} from './laneMirrorContract.js';
// ★本番の書き手を実 import する。手作りフィクスチャだけで関所を試していたため、
//   v0.1.1280 の「snap.buckets を探す」バグ(鏡を100%捨てる)を全テストが緑のまま通した。
//   [[integration-test-must-import-real-code]] と同型の穴を自分で作った反省。
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';

/**
 * テスト用の最小 snapshot を作る。
 * ★段は【トップレベル】に置く=書き手 laneMirror.js の実出力と同じ形。
 *   `{ buckets }` に入れる旧フィクスチャは実在しない形で、関所のバグを隠した。
 */
function snapOf(buckets, extra = {}) {
  return { liveId: 'lv1', capturedAt: 1000, ...buckets, ...extra };
}
/** uid つきセル(鏡セルはフラット形=`entry.userId` ではなく `userId`)。 */
function cell(userId, extra = {}) {
  return { userId, displaySrc: 'https://x/i.jpg', title: 'n', ...extra };
}

describe('sanitizeLaneMirrorForRead — 段別の不変条件(①の tier 法と同一)', () => {
  it('link段の匿名uidセルを落とし droppedLinkAnon に数える', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [cell('123456'), cell('a:XZVo')], gift: [], ad: [], konta: [], tanu: [] })
    );
    expect(r.snap.link).toHaveLength(1);
    expect(r.snap.link[0].userId).toBe('123456');
    expect(r.droppedLinkAnon).toBe(1);
  });

  it('konta段の匿名uidセルを落とす', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [], gift: [], ad: [], konta: [cell('a:abc'), cell('4046119')], tanu: [] })
    );
    expect(r.snap.konta).toHaveLength(1);
    expect(r.droppedKontaAnon).toBe(1);
  });

  it('★tanu段の匿名uidセルは落とさない(匿名を吸収する段=①と同じ法)', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [], gift: [], ad: [], konta: [], tanu: [cell('a:abc'), cell('a:def')] })
    );
    expect(r.snap.tanu).toHaveLength(2);
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
    expect(r.snap.gift).toHaveLength(1);
    expect(r.snap.ad).toHaveLength(1);
    expect(r.droppedUnkeyed).toBe(0);
  });

  it('link段のuid無しセルは droppedUnkeyed に落とす', () => {
    const r = sanitizeLaneMirrorForRead(
      snapOf({ link: [{ entry: {}, title: 'x' }, cell('55555')], gift: [], ad: [], konta: [], tanu: [] })
    );
    expect(r.snap.link).toHaveLength(1);
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
    expect(r.snap.link[0]).toBe(rich);
    expect(r.snap.link[0].recentTexts).toEqual(['あ', 'い']);
    expect(r.snap.link[0].meta.idLine).toBe('ID:124272691');
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
    expect(sanitizeLaneMirrorForRead({ liveId: '', link: [] }).issues).toContain('liveIdが空');
    expect(sanitizeLaneMirrorForRead({ liveId: 'lv1' }).issues).toContain('段が無い');
    // ★実在しない `buckets` 形だけを持つ snapshot は「段が無い」で弾く。
    //   v0.1.1280 はこれを【正常系】と取り違えて本物の鏡を全部捨てた。
    expect(sanitizeLaneMirrorForRead({ liveId: 'lv1', buckets: { link: [] } }).snap).toBeNull();
  });

  it('旧版snapshot(段が一部欠けている)を受理する=additive-only の互換', () => {
    const r = sanitizeLaneMirrorForRead(snapOf({ link: [cell('4046119')] }));
    expect(r.snap).not.toBeNull();
    // 欠けた段は空配列で埋まる(読み手が undefined を踏まない)。
    for (const tier of LANE_MIRROR_TIERS) {
      expect(Array.isArray(r.snap[tier])).toBe(true);
    }
  });
});

/**
 * ★★★本番の書き手の【実出力】を関所に食わせる統合テスト。
 *
 * なぜこれが要るか(2026-08-07): 上の describe は全て手作りフィクスチャで、
 * v0.1.1280 の関所は `snap.buckets`(実在しない)を探して【鏡を100%捨てて】いたのに
 * 全テストが緑だった。会場だけ fallback へ降格し gift/ad 段が消える実害が出た。
 * 形の食い違いは、書き手の実出力を通さない限り原理的に検出できない。
 *
 * ★ここに手書きの snapshot リテラルを足さないこと(足した瞬間この防壁は無効になる)。
 */
describe('★書き手の実出力 → 関所(統合・形の食い違いを検出する唯一の防壁)', () => {
  /** 本番の書き手が実際に吐く snapshot。 */
  function realSnapshot() {
    return buildLaneMirrorSnapshot(
      {
        liveId: 'lv351092763',
        buckets: {
          link: [
            { entry: { userId: '4046119' }, displaySrc: 'https://x/a.jpg', title: '記名' },
            { entry: { userId: 'a:XZVo' }, displaySrc: 'https://x/b.jpg', title: 'link匿名' }
          ],
          gift: [{ entry: { userId: '' }, displaySrc: 'https://x/g.jpg', title: 'ギフト主' }],
          ad: [{ entry: { userId: '' }, displaySrc: 'https://x/d.jpg', title: '広告主' }],
          konta: [{ entry: { userId: '124272691' }, displaySrc: 'https://x/k.jpg', title: 'こん太' }],
          tanu: [{ entry: { userId: 'a:abc' }, displaySrc: 'https://x/t.jpg', title: 'たぬ姉匿名' }]
        },
        pickedLength: 6,
        totalCandidates: 6
      },
      { cap: 48, nowMs: 1754500000000 }
    );
  }

  it('★実出力を関所が受理する(捨てない)', () => {
    const r = sanitizeLaneMirrorForRead(realSnapshot());
    expect(r.issues).toEqual([]);
    expect(r.snap).not.toBeNull();
  });

  it('★5段すべてが関所を生き延びる(gift/ad が消えない=実害の再発防止)', () => {
    const r = sanitizeLaneMirrorForRead(realSnapshot());
    expect(r.snap.link).toHaveLength(1);
    expect(r.snap.gift).toHaveLength(1);
    expect(r.snap.ad).toHaveLength(1);
    expect(r.snap.konta).toHaveLength(1);
    expect(r.snap.tanu).toHaveLength(1);
  });

  it('★フラットセルの uid を読めている(link匿名だけ落ち、記名は残る)', () => {
    const r = sanitizeLaneMirrorForRead(realSnapshot());
    expect(r.snap.link[0].title).toBe('記名');
    expect(r.droppedLinkAnon).toBe(1);
    // gift/ad は uid 無しでも落とさない(広告主・送り主は uid が取れない)。
    expect(r.droppedUnkeyed).toBe(0);
  });

  it('★関所の出力を下流(restoreLaneMirrorBuckets)がそのまま読める', () => {
    const r = sanitizeLaneMirrorForRead(realSnapshot());
    const restored = restoreLaneMirrorBuckets(r.snap);
    for (const tier of LANE_MIRROR_TIERS) {
      expect(restored[tier]).toHaveLength(1);
    }
    expect(restored.link[0].entry.userId).toBe('4046119');
  });

  it('★snapshot直下のフィールドを素通しする(capturedAt/contentHash/pickedLength)', () => {
    const src = realSnapshot();
    const r = sanitizeLaneMirrorForRead(src);
    expect(r.snap.capturedAt).toBe(src.capturedAt);
    expect(r.snap.contentHash).toBe(src.contentHash);
    expect(r.snap.pickedLength).toBe(src.pickedLength);
    expect(r.snap.domSelf).toEqual(src.domSelf);
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
