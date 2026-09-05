import { describe, it, expect } from 'vitest';
import { buildLivesCardSignature, elapsedBucketForSignature } from './livesCardSignature.js';

/**
 * ★守っている実害(2026-08-10):
 *   配信カードの diff-skip guard に `elapsedSec`(秒)が入っていたため、配信中は
 *   guard が一度も効かず「2秒ごとの innerHTML 全再構築+<img>再生成」が起き続けていた。
 *   guard のすぐ上のコメントが「それを止めるための guard」と書いている＝自己無効化。
 */
describe('elapsedBucketForSignature', () => {
  it('★秒の変化では変わらない(同じ分なら同じ)', () => {
    expect(elapsedBucketForSignature(120)).toBe(elapsedBucketForSignature(179));
  });

  it('★分が変わったら変わる(表示が変わるときは作り直す)', () => {
    expect(elapsedBucketForSignature(119)).not.toBe(elapsedBucketForSignature(120));
  });

  it('★未取得(null/NaN)は 0分と区別する', () => {
    expect(elapsedBucketForSignature(null)).toBe('x');
    expect(elapsedBucketForSignature(undefined)).toBe('x');
    expect(elapsedBucketForSignature(NaN)).toBe('x');
    expect(elapsedBucketForSignature('120')).toBe('x'); // 文字列も未取得扱い(型で弾く)
    expect(elapsedBucketForSignature(0)).toBe('0');
    expect(elapsedBucketForSignature(null)).not.toBe(elapsedBucketForSignature(0));
  });

  it('負値は未取得扱い', () => {
    expect(elapsedBucketForSignature(-1)).toBe('x');
  });
});

describe('buildLivesCardSignature', () => {
  const base = {
    lv: 'lv1',
    recordedCount: 100,
    officialCommentCount: 200,
    watchCount: 300,
    giftPoints: 0,
    elapsedSec: 3660,
    endedAt: null,
    thumbnailUrl: 'https://example.com/a.jpg'
  };

  it('★これが本丸: 1秒経っただけでは署名が変わらない(再構築しない)', () => {
    const a = buildLivesCardSignature([{ ...base, elapsedSec: 3660 }]);
    const b = buildLivesCardSignature([{ ...base, elapsedSec: 3661 }]);
    expect(b).toBe(a);
  });

  it('★旧実装なら変わっていたことを示す(退化検知)', () => {
    // 旧: elapsedSec を生で入れていた
    const oldSig = (l) => `${l.lv}|${l.recordedCount}|${l.elapsedSec}`;
    const a = { ...base, elapsedSec: 3660 };
    const b = { ...base, elapsedSec: 3661 };
    expect(oldSig(a)).not.toBe(oldSig(b));                       // 旧=毎秒変わる(guard無効)
    expect(buildLivesCardSignature([a])).toBe(buildLivesCardSignature([b])); // 新=変わらない
  });

  it('★分をまたいだら署名が変わる(表示更新は落とさない)', () => {
    const a = buildLivesCardSignature([{ ...base, elapsedSec: 3659 }]);
    const b = buildLivesCardSignature([{ ...base, elapsedSec: 3660 }]);
    expect(b).not.toBe(a);
  });

  it('記録件数が増えたら変わる(本来の更新は止めない)', () => {
    const a = buildLivesCardSignature([base]);
    const b = buildLivesCardSignature([{ ...base, recordedCount: 101 }]);
    expect(b).not.toBe(a);
  });

  it('終了フラグ・サムネ有無の変化は拾う', () => {
    const a = buildLivesCardSignature([base]);
    expect(buildLivesCardSignature([{ ...base, endedAt: 1 }])).not.toBe(a);
    expect(buildLivesCardSignature([{ ...base, thumbnailUrl: '' }])).not.toBe(a);
  });

  it('応援者データ(reportPreview)の変化も拾う', () => {
    const a = buildLivesCardSignature([base], { liveId: 'lv1', topSupportersLength: 0 });
    const b = buildLivesCardSignature([base], { liveId: 'lv1', topSupportersLength: 3 });
    expect(b).not.toBe(a);
  });

  it('配信が増減したら変わる', () => {
    const a = buildLivesCardSignature([base]);
    const b = buildLivesCardSignature([base, { ...base, lv: 'lv2' }]);
    expect(b).not.toBe(a);
  });

  it('壊れた入力でも throw しない', () => {
    for (const bad of [null, undefined, 'x', 1, {}]) {
      expect(() => buildLivesCardSignature(bad)).not.toThrow();
    }
    expect(() => buildLivesCardSignature([null, undefined])).not.toThrow();
  });
});
