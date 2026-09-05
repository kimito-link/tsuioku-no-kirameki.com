import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 応援レーン鏡 publish 計器の配線テスト。
 *
 * ★文字列スキャンだけの配線テストは `if (false)` を前置する変異を素通しする
 *   ([[wiring-test-mutation-check]])。v1286/v1287 はこの穴で4回「直した」と誤宣言した。
 *   そこで「カウンタが【その return の直前で】無条件に加算される」ことを
 *   前後のアンカーごと固定する。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const popupSrc = fs.readFileSync(
  path.resolve(__dirname, '../extension/popup-entry.js'),
  'utf8'
);
const laneMirrorSrc = fs.readFileSync(path.resolve(__dirname, './laneMirror.js'), 'utf8');

describe('応援レーン鏡 publish 計器の配線', () => {
  it('正本(lanePublishSkipDiag)を import している', () => {
    expect(popupSrc).toMatch(
      /import\s*\{\s*snapshotLanePublishSkipDiag\s*\}\s*from\s*'\.\.\/lib\/lanePublishSkipDiag\.js'/
    );
  });

  /*
   * ★加算行が【文の先頭】にあることを行単位で固定する。
   *   `[\s\S]{0,400}?` のような緩いギャップを挟むと `if (false) ` を吸収してしまい、
   *   変異テストが素通りする(実際に一度素通りさせた)。
   *   行頭=インデントのみ、を `^\s*` + m フラグで縛るのが肝。
   */
  it('★els無しの return 直前で【無条件に】noEls を数える', () => {
    // 行頭が「インデント + _lanePublishSkipDiag.noEls += 1;」であること(前置なし)
    expect(popupSrc).toMatch(/^\s*_lanePublishSkipDiag\.noEls \+= 1;$/m);
    // かつ、その加算が if (!els) ブロックの中にあること
    const blockIdx = popupSrc.indexOf('const els = getStoryUserLaneEls();\n  if (!els) {');
    expect(blockIdx).toBeGreaterThan(0);
    const block = popupSrc.slice(blockIdx, blockIdx + 500);
    expect(block).toMatch(/^\s*_lanePublishSkipDiag\.noEls \+= 1;$/m);
    expect(block).toContain('return;');
  });

  it('★供給空の return より前で【無条件に】entriesEmpty を数える', () => {
    expect(popupSrc).toMatch(/^\s*_lanePublishSkipDiag\.entriesEmpty \+= 1;$/m);
    const blockIdx = popupSrc.indexOf('if (!entries.length) {');
    expect(blockIdx).toBeGreaterThan(0);
    const block = popupSrc.slice(blockIdx, blockIdx + 500);
    expect(block).toMatch(/^\s*_lanePublishSkipDiag\.entriesEmpty \+= 1;$/m);
  });

  it('★publish 到達時刻を publishLaneMirror の【直前】に刻む', () => {
    expect(popupSrc).toMatch(/^\s*_lanePublishSkipDiag\.lastPublishAt = Date\.now\(\);$/m);
    expect(popupSrc).toMatch(
      /^\s*_lanePublishSkipDiag\.lastPublishAt = Date\.now\(\);\n\s*publishLaneMirror\(\{$/m
    );
  });

  it('popup 診断 JSON に lanePublishSkip を載せている(状態速報に出る)', () => {
    // ★載せ忘れると計器を作っても状態速報に永久に出ない
    //   ([[fastdiag-lite-is-the-printer-subset]] と同型の穴)。
    expect(popupSrc).toMatch(
      /^\s*lanePublishSkip: snapshotLanePublishSkipDiag\(_lanePublishSkipDiag, Date\.now\(\)\),$/m
    );
  });

  it('★鏡 snapshot に writer を刻む(誰が最後に書いたか)', () => {
    // 将来 content 側の書き手を足したとき、静かな上書き劣化に気づけるようにするための印。
    expect(laneMirrorSrc).toMatch(/writer: String\(opts\?\.writer \|\| 'popup'\)/);
  });

  it('計器の加算が3種そろっている(数え漏れの防止)', () => {
    // noEls / entriesEmpty / lastPublishAt の3つが揃って初めて
    // 「止まっているか・何で止まったか」を1行で言い分けられる。
    expect((popupSrc.match(/_lanePublishSkipDiag\.noEls \+= 1;/g) || []).length).toBe(1);
    expect((popupSrc.match(/_lanePublishSkipDiag\.entriesEmpty \+= 1;/g) || []).length).toBe(1);
    expect((popupSrc.match(/_lanePublishSkipDiag\.lastPublishAt = Date\.now\(\);/g) || []).length).toBe(1);
  });
});
