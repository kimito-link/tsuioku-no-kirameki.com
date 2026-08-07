import { describe, it, expect } from 'vitest';

import { buildVenueSceneReceipts, compareRenderReceipts, laneDomFingerprint } from './laneSceneEnvelope.js';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';

/**
 * ★T-2/T-3(venue-exact-parity-SPEC-2026-08-07 §9): C1恒真の【恒久檻】。
 *
 * 直した嘘(MAP追補 A-4 で実コード確定・v0.1.1137〜1283 の全期間バグっていた):
 *   C1 venueReceipt.revision に popEnvelope.revision を自己代入 → revision比較が恒真
 *   C2 pop/venue 両 contentHash が同じ鏡オブジェクト起点 → X と copy(X) の比較
 *   C3 ①が snapshot に焼いた contentHash を誰も読まない
 *   → 結果「①が0件描画でも鏡さえ残れば ✅」。
 *
 * ★ここでは【生産者に本物の書き手を置く】: buildLaneMirrorSnapshot を nowMs 違いで2回呼び、
 *   capturedAt が実際に異なる2つの snapshot を受理側/描画側として渡す。
 *   手作りフィクスチャで revision を書くと、実装者の誤解をテスト側にも複製してしまう
 *   ([[gate-fixture-must-come-from-the-writer-2026-08-07]])。
 */

const BUCKETS = {
  link: [{ entry: { userId: '4046119' }, displaySrc: 'https://x/a.jpg', title: '太郎', meta: { idLine: '4046119', nameLine: '太郎' } }],
  gift: [],
  ad: [],
  konta: [],
  tanu: [{ entry: { userId: 'a:abc' }, displaySrc: '', title: '匿名', meta: { idLine: '匿名', nameLine: '匿名' } }]
};

/** 本番の書き手が吐く snapshot。domSelf(指紋つき)は①の paint 経路が載せる形を渡す。 */
function realSnapshot({ nowMs, buckets = BUCKETS, domSelf } = {}) {
  return buildLaneMirrorSnapshot(
    { liveId: 'lv1', buckets, pickedLength: 2, totalCandidates: 2, domSelf },
    { cap: 48, nowMs }
  );
}

/** ①の paint が実際に作る domSelf の形(fingerprintFor = 直前に publish した contentHash)。 */
function domSelfFor(snapForHash, keys) {
  return {
    measured: true,
    perTier: { link: { visible: 1, tileW: 10, tileH: 10 }, gift: {}, ad: {}, konta: {}, tanu: { visible: 1, tileW: 10, tileH: 10 } },
    dpr: 1,
    measuredAt: 1754500000000,
    fingerprint: laneDomFingerprint(keys),
    fingerprintFor: snapForHash.contentHash
  };
}

/** ①実DOMと会場実DOMが同じ顔ぶれのときのキー列。 */
const SAME_KEYS = { link: ['u:4046119'], tanu: ['u:a:abc'] };

describe('★T-2 buildVenueSceneReceipts: 両辺の起点が別であることを型で強制する', () => {
  it('★revision は accepted / painted の【別々の capturedAt】から出る(自己代入の檻)', () => {
    const accepted = realSnapshot({ nowMs: 2000 });
    const painted = realSnapshot({ nowMs: 1000 });
    // 前提: 生産者(本物の書き手)が実際に違う capturedAt を吐いている。
    expect(accepted.capturedAt).not.toBe(painted.capturedAt);

    const r = buildVenueSceneReceipts({
      acceptedSnap: accepted,
      paintedSnap: painted,
      paintedBuckets: restoreLaneMirrorBuckets(painted)
    });
    // ★変異(venueReceipt.revision に popReceipt.revision を自己代入)はここで必ず赤になる。
    expect(r.popReceipt.revision).toBe(accepted.capturedAt);
    expect(r.venueReceipt.revision).toBe(painted.capturedAt);
    expect(r.popReceipt.revision).not.toBe(r.venueReceipt.revision);
  });

  it('revision 差を compareRenderReceipts が 🔴(遅れ)で名指しする', () => {
    const accepted = realSnapshot({ nowMs: 2000 });
    const painted = realSnapshot({ nowMs: 1000 });
    const r = buildVenueSceneReceipts({
      acceptedSnap: accepted,
      paintedSnap: painted,
      paintedBuckets: restoreLaneMirrorBuckets(painted)
    });
    const out = compareRenderReceipts(r.popReceipt, r.venueReceipt);
    expect(out.match).toBe(false);
    expect(out.line).toContain('🔴');
    expect(out.line).toContain('1000ms遅れ');
  });

  it('★popReceipt.contentHash は①が snapshot に焼いた値そのもの(C3=誰も読まない、の修正)', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    const r = buildVenueSceneReceipts({
      acceptedSnap: snap,
      paintedSnap: snap,
      paintedBuckets: restoreLaneMirrorBuckets(snap)
    });
    expect(snap.contentHash).toBeTruthy();
    expect(r.popReceipt.contentHash).toBe(snap.contentHash);
  });

  it('★venueReceipt.contentHash は painted buckets からの【再計算】(C2=同一起点、の修正)', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    const painted = restoreLaneMirrorBuckets(snap);
    // 会場が実際に描いた中身を1セルだけ改変する=同世代なのに中身が違う状況。
    painted.link[0] = { ...painted.link[0], title: '別人' };
    const r = buildVenueSceneReceipts({ acceptedSnap: snap, paintedSnap: snap, paintedBuckets: painted });
    expect(r.venueReceipt.contentHash).not.toBe(r.popReceipt.contentHash);
    const out = compareRenderReceipts(r.popReceipt, r.venueReceipt);
    expect(out.match).toBe(false);
    expect(out.line).toContain('🔴');
  });

  it('同世代・同内容・同指紋なら ✅(前段まで通過することの確認)', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    const withDom = realSnapshot({ nowMs: 1000, domSelf: domSelfFor(snap, SAME_KEYS) });
    const r = buildVenueSceneReceipts({
      acceptedSnap: withDom,
      paintedSnap: withDom,
      paintedBuckets: restoreLaneMirrorBuckets(withDom),
      venueDomFingerprint: laneDomFingerprint(SAME_KEYS)
    });
    const out = compareRenderReceipts(r.popReceipt, r.venueReceipt);
    expect(out.match).toBe(true);
    expect(out.line).toContain('✅');
    expect(out.line).toContain('指紋');
  });

  it('★指紋が違えば 🔴(データは同じなのに画面の顔ぶれが違う=描画バグを名指し)', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    const withDom = realSnapshot({ nowMs: 1000, domSelf: domSelfFor(snap, SAME_KEYS) });
    const r = buildVenueSceneReceipts({
      acceptedSnap: withDom,
      paintedSnap: withDom,
      paintedBuckets: restoreLaneMirrorBuckets(withDom),
      // 会場実DOMだけ顔ぶれが違う(件数は同じ=既存の件数比較では絶対に捕まらない穴)。
      venueDomFingerprint: laneDomFingerprint({ link: ['u:999'], tanu: ['u:a:abc'] })
    });
    const out = compareRenderReceipts(r.popReceipt, r.venueReceipt);
    expect(out.match).toBe(false);
    expect(out.line).toContain('🔴');
    expect(out.line).toContain('指紋');
  });

  it('★指紋が片方でも空なら ⚪ かつ match:false(「DOMを写さない✅」は構造的に出ない)', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    const withDom = realSnapshot({ nowMs: 1000, domSelf: domSelfFor(snap, SAME_KEYS) });
    // 会場側の census が失敗した(=指紋を採れなかった)状況。
    const r = buildVenueSceneReceipts({
      acceptedSnap: withDom,
      paintedSnap: withDom,
      paintedBuckets: restoreLaneMirrorBuckets(withDom),
      venueDomFingerprint: ''
    });
    const out = compareRenderReceipts(r.popReceipt, r.venueReceipt);
    expect(out.match).toBe(false);
    expect(out.line).toContain('⚪');
    expect(out.line).toContain('指紋未計測');
  });

  it('★空指紋どうしでも ✅ にならない(「指紋が無いのに一致」の変異を殺す)', () => {
    // 旧版snapshot(domSelf に指紋が無い)+ census 失敗、の最悪ケース。
    const snap = realSnapshot({ nowMs: 1000 });
    const r = buildVenueSceneReceipts({
      acceptedSnap: snap,
      paintedSnap: snap,
      paintedBuckets: restoreLaneMirrorBuckets(snap),
      venueDomFingerprint: ''
    });
    expect(r.popReceipt.domFingerprint).toBe('');
    expect(r.venueReceipt.domFingerprint).toBe('');
    expect(compareRenderReceipts(r.popReceipt, r.venueReceipt).match).toBe(false);
  });

  it('どちらかの snapshot が欠けたら null(=scene 未計測)', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    expect(buildVenueSceneReceipts({ acceptedSnap: snap, paintedSnap: null, paintedBuckets: {} })).toBeNull();
    expect(buildVenueSceneReceipts({ acceptedSnap: null, paintedSnap: snap, paintedBuckets: {} })).toBeNull();
    expect(buildVenueSceneReceipts(null)).toBeNull();
  });
});

describe('★T-3 fingerprintFor ゲート: 指紋の鮮度は時計でなく【内容アドレス】で判定する', () => {
  it('★fingerprintFor ≠ snap.contentHash なら popReceipt.domFingerprint は空(⚪へ逃がす)', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    // 「1tick前の別内容を測った指紋」を運んでいる snapshot(publish先→paint後 のずれの再現)。
    const staleDom = { ...domSelfFor(snap, SAME_KEYS), fingerprintFor: 'deadbeef' };
    const withStale = realSnapshot({ nowMs: 1000, domSelf: staleDom });
    expect(withStale.domSelf.fingerprint).toBeTruthy();
    expect(withStale.domSelf.fingerprintFor).not.toBe(withStale.contentHash);

    const r = buildVenueSceneReceipts({
      acceptedSnap: withStale,
      paintedSnap: withStale,
      paintedBuckets: restoreLaneMirrorBuckets(withStale),
      venueDomFingerprint: laneDomFingerprint(SAME_KEYS)
    });
    // ★指紋自体は snapshot に載っているが、旧内容のものなので採用しない=偽🔴を構造的に排除。
    expect(r.popReceipt.domFingerprint).toBe('');
    const out = compareRenderReceipts(r.popReceipt, r.venueReceipt);
    expect(out.match).toBe(false);
    expect(out.line).toContain('指紋未計測');
    expect(out.line).not.toContain('🔴');
  });

  it('★fingerprintFor が一致していれば「何秒前に測ったか」に関わらず指紋を採用する', () => {
    const snap = realSnapshot({ nowMs: 1000 });
    // measuredAt を大昔にしても、内容(contentHash)が同じなら指紋は「古くて正しい」。
    const oldButValid = { ...domSelfFor(snap, SAME_KEYS), measuredAt: 1 };
    const withOld = realSnapshot({ nowMs: 1000, domSelf: oldButValid });
    const r = buildVenueSceneReceipts({
      acceptedSnap: withOld,
      paintedSnap: withOld,
      paintedBuckets: restoreLaneMirrorBuckets(withOld),
      venueDomFingerprint: laneDomFingerprint(SAME_KEYS)
    });
    expect(r.popReceipt.domFingerprint).toBe(laneDomFingerprint(SAME_KEYS));
    expect(compareRenderReceipts(r.popReceipt, r.venueReceipt).match).toBe(true);
  });
});
