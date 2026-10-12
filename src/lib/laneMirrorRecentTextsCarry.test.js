/**
 * 鏡のセルの発言(recentTexts)が、会場の段のタイルまで届く(2026-10-12)。
 *
 * ■ 実測(状態速報 + headless): 鏡のセルは発言を持っている(りんく 4/4・たぬ姉 132/132)のに、
 *   会場のホバーカードに発言の行(セリフ)が出ない人がいた(発言1(12分前)・いまは聞いている だけ)。
 * ■ 真因: 鏡 → 会場のタイルへ「個別に列挙して作り直す」関数が2つあり、どちらも recentTexts を引き継いでいなかった
 *   (restoreLaneMirrorBuckets / composeVenueLaneBuckets)。カードは会場自前の在席名簿しか見ないので、
 *   会場を開く前に発言した人は名簿に発言が無く、鏡に載っている発言まで届かなかった。
 *   → 「個別列挙の作り直しは値を落とす」(laneMirrorContract の地雷4・5回踏んだ型)の6回目。
 * ■ 守ること: 引き継ぐ値を増やしたら、この経路を端から端まで通して固定する。
 */
import { describe, it, expect } from 'vitest';
import { buildLaneMirrorSnapshot, restoreLaneMirrorBuckets } from './laneMirror.js';
import { composeVenueLaneBuckets } from './venueLaneMirrorSupply.js';

const item = (uid, texts) => ({
  displaySrc: 'https://example.com/a.jpg',
  title: `n${uid}`,
  meta: { idLine: String(uid), nameLine: `n${uid}` },
  entry: { userId: String(uid) },
  recentTexts: texts
});

describe('鏡のセルの発言(recentTexts)が会場のタイルまで届く', () => {
  const snap = buildLaneMirrorSnapshot(
    { liveId: 'lv1', buckets: { link: [item(1, ['こんにちは', 'またね']), item(2, [])], tanu: [item(9, ['わーい'])] } },
    { cap: 10, nowMs: 1 }
  );

  it('(前提)鏡のセルは発言を持っている', () => {
    expect(snap.link[0].recentTexts).toEqual(['こんにちは', 'またね']);
    expect(snap.tanu[0].recentTexts).toEqual(['わーい']);
  });

  it('★鏡から段のタイルを復元しても発言が残る(restoreLaneMirrorBuckets)', () => {
    const restored = restoreLaneMirrorBuckets(snap);
    expect(restored.link[0].recentTexts).toEqual(['こんにちは', 'またね']);
    expect(restored.tanu[0].recentTexts).toEqual(['わーい']);
  });

  it('発言の無いセルは recentTexts を持たない(空配列を増やさない)', () => {
    const restored = restoreLaneMirrorBuckets(snap);
    expect(restored.link[1].recentTexts).toBeUndefined();
  });

  it('★会場の段を組んでも発言が残る(composeVenueLaneBuckets)', () => {
    const { buckets } = composeVenueLaneBuckets({ mirrorBuckets: restoreLaneMirrorBuckets(snap), seatIndexByUid: new Map() });
    expect(buckets.link[0].recentTexts).toEqual(['こんにちは', 'またね']);
    expect(buckets.tanu[0].recentTexts).toEqual(['わーい']);
    expect(buckets.link[1].recentTexts).toBeUndefined();
  });

  it('★contentHash は発言の有無で変わらない(会場の一致判定に混ぜない)', () => {
    const withTexts = buildLaneMirrorSnapshot({ liveId: 'lv1', buckets: { link: [item(1, ['a'])] } }, { cap: 5, nowMs: 1 });
    const without = buildLaneMirrorSnapshot({ liveId: 'lv1', buckets: { link: [item(1, [])] } }, { cap: 5, nowMs: 1 });
    expect(withTexts.contentHash).toBe(without.contentHash);
  });
});
