import { describe, expect, it } from 'vitest';
import { buildLaneMirrorSnapshot, buildLaneReceipt, isReceiptComparable } from './laneMirror.js';

/**
 * ★v0.1.1300: 実DOM受領証(Receipt)をデータ本体から分離する。
 *
 * 受領証は「①が実際に描いた DOM の要約」= 表示面固有。会場は別 DOM を持つので、
 * データ本体に同梱したままだと「同じデータなのに hash が違う」を構造的に作る。
 * → 分離し、contentHash(内容アドレス)で関連付ける。
 *   ★時計(measuredAt)では判定しない: sig一致で描画スキップ中の DOM は不変=
 *     指紋は「古くて正しい」ので、時計で切ると正しい値を捨てる。
 */
const DOM_SELF = {
  measured: true,
  perTier: { link: { visible: 3, tileW: 40, tileH: 40 } },
  dpr: 2,
  measuredAt: 1000,
  fingerprint: 'link:a,b,c',
  fingerprintFor: 'OLD_HASH'
};

const INPUT = {
  liveId: 'lv351133862',
  buckets: { link: [{ userId: 'u1' }], gift: [], ad: [], konta: [], tanu: [] },
  domSelf: DOM_SELF,
  pickedLength: 1,
  totalCandidates: 1
};

describe('buildLaneReceipt', () => {
  it('liveId を正規化して持つ', () => {
    const r = buildLaneReceipt({ ...INPUT, liveId: ' LV351133862 ' }, { nowMs: 5 });
    expect(r.liveId).toBe('lv351133862');
  });

  it('どの表示面の受領証かを名乗る(既定は popup)', () => {
    expect(buildLaneReceipt(INPUT, {}).surface).toBe('popup');
    expect(buildLaneReceipt(INPUT, { surface: 'venue' }).surface).toBe('venue');
  });

  /*
   * ★v0.1.1301(Codex レビュー指摘・重大度高)の回帰テスト。
   *
   * 受領証の fingerprintFor は【測った本人(domSelf)の申告】でなければならない。
   * 呼び手が「現在の snapshot の contentHash」で上書きすると:
   *   H1 を描いた指紋 F1 を持ったまま H2 を publish
   *     → 受領証が「F1 は H2 を測った」と嘘を名乗る
   *     → isReceiptComparable が true を返す
   *     → 別内容の指紋で一致を判定する = 恒真化と同じ穴
   * このリポが何度も踏んだ「比較の両辺が実は別物なのに緑」の類型。
   */
  it('★fingerprintFor は domSelf の申告をそのまま運ぶ(現在の hash で上書きしない)', () => {
    const r = buildLaneReceipt({ ...INPUT, contentHash: 'NEW_HASH' }, {});
    expect(r.fingerprintFor).toBe('OLD_HASH');
    expect(r.fingerprintFor).not.toBe('NEW_HASH');
  });

  it('★指紋が測っていない(fingerprintFor空)なら空のまま=比較不可へ倒す', () => {
    const r = buildLaneReceipt(
      { ...INPUT, domSelf: { ...DOM_SELF, fingerprintFor: '' }, contentHash: 'NEW_HASH' },
      {}
    );
    expect(r.fingerprintFor).toBe('');
  });

  it('指紋・実測値を落とさずに運ぶ', () => {
    const r = buildLaneReceipt(INPUT, { nowMs: 7 });
    expect(r.fingerprint).toBe('link:a,b,c');
    expect(r.measured).toBe(true);
    expect(r.dpr).toBe(2);
    expect(r.measuredAt).toBe(1000);
    expect(r.perTier.link.visible).toBe(3);
    expect(r.capturedAt).toBe(7);
  });
});

describe('isReceiptComparable(比較してよいかの関所)', () => {
  const snap = buildLaneMirrorSnapshot(INPUT, { nowMs: 1, cap: 48 });

  it('★受領証が同じ contentHash を測っていれば比較可', () => {
    // ★実機の順序: paint 後に domSelf.fingerprintFor へ「測った内容の hash」が刻まれる
    //   (popup-entry.js:7098-7103)。受領証はその申告をそのまま運ぶ。
    const r = buildLaneReceipt(
      { ...INPUT, domSelf: { ...DOM_SELF, fingerprintFor: snap.contentHash } },
      {}
    );
    expect(isReceiptComparable(snap, r).comparable).toBe(true);
  });

  it('★別の内容を測った受領証は比較不可(世代差=嘘の🔴を出さない)', () => {
    const r = buildLaneReceipt({ ...INPUT, contentHash: 'OTHER' }, {});
    const v = isReceiptComparable(snap, r);
    expect(v.comparable).toBe(false);
    expect(v.reason).toContain('世代差');
  });

  it('受領証が無い/指紋未計測なら比較不可(✅を名乗らない)', () => {
    expect(isReceiptComparable(snap, null).comparable).toBe(false);
    const noFp = buildLaneReceipt(
      { ...INPUT, contentHash: snap.contentHash, domSelf: { ...DOM_SELF, fingerprint: '' } },
      {}
    );
    expect(isReceiptComparable(snap, noFp).comparable).toBe(false);
  });

  it('鏡に contentHash が無ければ比較不可', () => {
    const r = buildLaneReceipt({ ...INPUT, contentHash: 'X' }, {});
    expect(isReceiptComparable({}, r).comparable).toBe(false);
  });

  it('★時計(measuredAt)が古くても、内容が同じなら比較可(時計で切らない)', () => {
    const stale = buildLaneReceipt(
      { ...INPUT, domSelf: { ...DOM_SELF, fingerprintFor: snap.contentHash, measuredAt: 1 } },
      {}
    );
    expect(isReceiptComparable(snap, stale).comparable).toBe(true);
  });
});
