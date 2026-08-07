import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const popupSrc = fs
  .readFileSync(path.join(root, 'extension/popup-entry.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/** 関数本体を取り出す(対応する括弧まで)。 */
function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

/**
 * ★v0.1.1281: 鏡の publish が「描かない」判断に巻き込まれて止まるのを防ぐ。
 *
 * ■ 何が起きていたか(2026-08-06 実機で確定)
 *   v0.1.1111 の設計は「会場の5段を①の実paint鏡に同化＝メンバー完全一致」だった。
 *   ところが renderStoryUserLane には「描かない」で早期 return する経路が3本あり、
 *   publishLaneMirror がその【後ろ】に置かれていたため、描画を省くたびに
 *   鏡の更新まで巻き添えで止まっていた。
 *     - sig 一致(中身不変なので描き直さない)
 *     - 縮小ガード(短い候補で完全描画を上書きしない)
 *     - 空ガード(backfill 谷間で既存タイルを畳まない)
 *   実機では鏡が 656秒 前で凍結し、その値が3回のコピペで寸分違わず同一だった。
 *   結果、会場は①より多くも少なくもなった(凍結時点の中身次第)。
 *
 * ■ なぜ publish は止めてはいけないか
 *   描画のスキップは正しい最適化。しかし publish は【描画ではなく運搬】。
 *   運ぶ中身(buckets)は早期 return より手前で確定しているので、描かなくても運べる。
 */
describe('鏡の publish は「描かない」判断に巻き込まれない', () => {
  const body = fnBody(popupSrc, 'function renderStoryUserLane(');

  it('renderStoryUserLane の本体が取れている(前提)', () => {
    expect(body.length).toBeGreaterThan(1000);
  });

  it('★publish が sig 一致の早期 return より前にある', () => {
    const publishAt = body.indexOf('publishLaneMirror({');
    const sigReturnAt = body.indexOf('if (laneSig === storyUserLaneLastRenderSig) {');
    expect(publishAt).toBeGreaterThan(-1);
    expect(sigReturnAt).toBeGreaterThan(-1);
    // publish が先に現れること=どの早期 return でも到達済み。
    expect(publishAt).toBeLessThan(sigReturnAt);
  });

  it('★publish が縮小ガード・空ガードより前にある(3経路すべて)', () => {
    const publishAt = body.indexOf('publishLaneMirror({');
    const shrinkAt = body.indexOf('if (_shrinkGuardHit) {');
    /*
     * ★空ガードは `shouldKeepStoryUserLaneTilesOnEmpty` を使う箇所が別関数にもあるため、
     *   この関数【本体内】の出現位置で見る(fnBody で切り出し済み)。
     *   さらに publish より後ろにある実物を取るため lastIndexOf は使わず、
     *   publish 以降を対象に探す(先頭の別用途ヒットに引きずられない)。
     */
    const emptyAt = body.indexOf('shouldKeepStoryUserLaneTilesOnEmpty(', publishAt);
    expect(shrinkAt).toBeGreaterThan(-1);
    expect(emptyAt).toBeGreaterThan(-1);
    expect(publishAt).toBeLessThan(shrinkAt);
    expect(publishAt).toBeLessThan(emptyAt);
  });

  it('★publish の呼び出しは1箇所だけ(重複publishを増やさない)', () => {
    const calls = popupSrc.match(/publishLaneMirror\(\{/g) || [];
    expect(calls.length).toBe(1);
  });

  it('★publish に渡す buckets は gift/ad を後付けした後の値である', () => {
    // buckets.gift / buckets.ad の代入が publish より前にあること。
    const giftAt = body.indexOf('buckets.gift = [...giftPicks];');
    const adAt = body.indexOf('buckets.ad = [...adPicks];');
    const publishAt = body.indexOf('publishLaneMirror({');
    expect(giftAt).toBeGreaterThan(-1);
    expect(adAt).toBeGreaterThan(-1);
    expect(giftAt).toBeLessThan(publishAt);
    expect(adAt).toBeLessThan(publishAt);
  });

  it('★publish が条件で囲われていない(無条件に実行される文である)', () => {
    /*
     * ★文字列の存在だけでは `if (false)` 前置を検知できない
     *   ([[wiring-test-mutation-check-2026-08-01]])。
     *   直前が代入文の閉じ括弧であることまでアンカーして、条件節に入っていないことを固定する。
     */
    expect(body).toMatch(
      /\n {2}publishLaneMirror\(\{\n {4}liveId,/
    );
  });
});
