import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venueSrc = fs
  .readFileSync(path.join(root, 'extension/venueBar.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const renderSrc = fs
  .readFileSync(path.join(root, 'extension/story/renderStoryUserLaneDom.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * ★v0.1.1280: 会場の鏡受け入れが【必ず関所を通る】ことを配線レベルで固定する。
 *
 *   受け入れ点は2箇所(開時 catch-up / onChanged)。どちらか片方を素の代入に戻すと、
 *   その経路だけ段別の不変条件が効かなくなる=「経路によって画面の法が変わる」状態が復活する。
 *   存在の断言では片方だけ壊す変異を通すため【数で断言】する
 *   ([[wiring-test-must-assert-counts-2026-08-04]])。
 */
describe('会場の鏡受け入れは関所を通る', () => {
  it('★acceptLaneMirrorSnapshot の出現は3回(定義1 + 受け入れ点2)', () => {
    const hits = venueSrc.match(/acceptLaneMirrorSnapshot\(/g) || [];
    expect(hits.length).toBe(3);
  });

  it('★catch-up 経路(bag?.[KEY_LANE_MIRROR])が関所を通る', () => {
    // アンカーを前後まで固定する。緩めると別の代入に化けても素通りする
    // ([[mutation-test-needs-anchored-regex-2026-08-05]])。
    expect(venueSrc).toMatch(
      /const snap = acceptLaneMirrorSnapshot\(bag\?\.\[KEY_LANE_MIRROR\]\);/
    );
  });

  it('★onChanged 経路(mirrorChange.newValue)が関所を通る', () => {
    expect(venueSrc).toMatch(
      /const accepted = acceptLaneMirrorSnapshot\(mirrorChange\.newValue\);/
    );
  });

  it('★関所は契約モジュールの sanitize を呼ぶ(自前判定に化けていない)', () => {
    expect(venueSrc).toContain("from '../lib/laneMirrorContract.js'");
    expect(venueSrc).toMatch(/const r = sanitizeLaneMirrorForRead\(rawSnap\);/);
  });
});

describe('UIの嘘をやめる配線', () => {
  it('★fallback のときだけ gift 段の空文言を差し替える(mirror では従来どおり)', () => {
    /*
     * ★三項の【向き】まで固定する。逆にすると「鏡があるのに①未接続」と逆の嘘をつく。
     *   当初 regex は改行を \s* で緩く受けており、向きを逆にした変異を素通りさせた
     *   (2026-08-06 に実際に素通りを観測)。真(mirror)側が undefined であることを
     *   1つの塊として固定し、さらに逆パターンが存在しないことも併せて断言する。
     */
    expect(venueSrc).toContain(
      'emptyTextOverrides: isLaneMirrorPaintMode\n            ? undefined\n            : { gift: VENUE_FALLBACK_GIFT_EMPTY_HTML },'
    );
    // 逆向き(mirror のときに差し替える)が存在しないこと。
    expect(venueSrc).not.toMatch(
      /isLaneMirrorPaintMode\s*\n?\s*\?\s*\{ gift: VENUE_FALLBACK_GIFT_EMPTY_HTML \}/
    );
  });

  it('★差し替え文言は①③と同じ正本ファイル由来(会場でHTMLを手書きしない)', () => {
    expect(venueSrc).toContain("buildVenueFallbackGiftEmptyNoteHtml");
    expect(venueSrc).toContain("from '../lib/storyUserLaneGuideHtml.js'");
  });

  it('★共有 renderer は overrides が無ければ従来の文言を使う(①③のDOM不変)', () => {
    // 既定側(buildStoryUserLaneEmptyNoteGiftHtml)へのフォールバックが残っていること。
    expect(renderSrc).toMatch(
      /emptyOverrides && typeof emptyOverrides\.gift === 'string'\n\s*\? emptyOverrides\.gift\n\s*: buildStoryUserLaneEmptyNoteGiftHtml\(\)/
    );
  });

  it('★鏡の鮮度を見出しに併記している(古さを隠さない)', () => {
    expect(venueSrc).toContain('venueMirrorAgeNotice(');
    // 値が変わったときだけ書く(paint毎のDOM書き込みを増やさない)。
    expect(venueSrc).toMatch(/if \(_venueTitleLastText !== nextTitle\) \{/);
  });
});
