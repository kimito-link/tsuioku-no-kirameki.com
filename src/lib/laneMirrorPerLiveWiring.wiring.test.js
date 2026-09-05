import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const popupSrc = read('extension/popup-entry.js');
const venueSrc = read('extension/venueBar.js');

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
 * ★v0.1.1300: 配信ごと鏡キー(v2)+受領証の配線を固定する。
 *
 * ■ 守りたい不変条件
 *   1. 書き手は【1箇所のまま】(publishLaneMirror 内から呼ぶ)=単一書き手の契約を壊さない
 *   2. 配信ごとキーは【合流バッファを通さない】
 *      (mirrorBundleFlushScheduler は全 section を毎回同梱するので、
 *       配信が変わると前の配信の lane を再同梱して巻き戻す=助言の穴3)
 *   3. 旧キーへの書き込みは【残す】(既存 reader 無変更・rollback の保険)
 *   4. 会場は v2 を【優先】し、旧キーへは fallback する
 */
describe('配信ごと鏡キー(v2)の配線', () => {
  const publishBody = fnBody(popupSrc, 'function publishLaneMirror(input)');
  // ★storage I/O グルーは lib へ抽出済み(popup-entry.js の max-lines ラチェット遵守)。
  const perLiveBody = fnBody(read('lib/laneMirrorPerLivePublish.js'), 'export function publishLaneMirrorPerLive(');

  it('publishLaneMirror / publishLaneMirrorPerLive の本体が取れている(前提)', () => {
    expect(publishBody.length).toBeGreaterThan(200);
    expect(perLiveBody.length).toBeGreaterThan(200);
  });

  it('★旧キーへの合流(mergeAndScheduleFlush)は残っている(rollback の保険)', () => {
    expect(publishBody).toMatch(/\n {4}mergeAndScheduleFlush\('lane', snap, snap && snap\.liveId, now\);\n/);
  });

  it('★配信ごと publish は無条件に呼ばれる文である', () => {
    /*
     * ★文字列の存在だけでは `if (false)` 前置を検知できない
     *   ([[wiring-test-mutation-check-2026-08-01]])。行頭インデントまで固定する。
     */
    // storage は注入で渡す(chrome I/O は呼び手側に残す)。
    expect(publishBody).toMatch(/\n {4}publishLaneMirrorPerLive\(snap, now, \{\n/);
  });

  it('★配信ごとキーは合流バッファ(mergeAndScheduleFlush)を通さない', () => {
    // 穴3(古い section の再同梱で巻き戻る)を構造的に避ける。
    expect(perLiveBody).not.toContain('mergeAndScheduleFlush');
    // storage へ直接書く。
    // storage は【注入】で受け取る(chrome を直接触らない=テスト可能)。
    expect(perLiveBody).not.toContain('chrome.');
    expect(perLiveBody).toContain('storage.set(');
  });

  it('★鏡と受領証を同じ set で書く(片方だけ新しい状態を作らない)', () => {
    expect(perLiveBody).toMatch(/storage\.set\(\{ \[mirrorKey\]: snap, \[receiptKey\]: receipt \}\);/);
  });

  it('★liveId を名乗れないときは書かない(どの配信か不明な値を残さない)', () => {
    expect(perLiveBody).toMatch(/if \(!mirrorKey \|\| !receiptKey\) \{/);
  });

  it('★書き手は増えていない(popup 側の呼び出しは1箇所だけ)', () => {
    // import 1 + 呼び出し1 = 2。3以上なら書き手が増えている=単一書き手の契約違反。
    const calls = popupSrc.match(/publishLaneMirrorPerLive\b/g) || [];
    expect(calls.length).toBe(2);
  });
});

describe('会場(reader)は配信ごとキーを優先する', () => {
  it('★catch-up で v2 を先に試し、無ければ旧キーへ落ちる', () => {
    expect(venueSrc).toMatch(
      /const snap =\s*\n\s*\(_mirrorKey \? acceptLaneMirrorSnapshot\(bag\?\.\[_mirrorKey\]\) : null\) \|\|\s*\n\s*acceptLaneMirrorSnapshot\(bag\?\.\[KEY_LANE_MIRROR\]\);/
    );
  });

  it('★onChanged も v2 を優先する(旧キーは他配信も書くので後回し)', () => {
    expect(venueSrc).toMatch(/const mirrorChange = perLiveChange \|\| changes\[KEY_LANE_MIRROR\];/);
  });

  it('★受領証は別キーで受け取る(データ本体と混ぜない)', () => {
    expect(venueSrc).toContain('laneReceiptKeyFor');
    expect(venueSrc).toMatch(/_laneReceiptFromPopup = /);
  });

  it('★関所(acceptLaneMirrorSnapshot)は v2 経路でも必ず通る', () => {
    // 契約: 読み口は必ず関所を通す。v2 を素通しさせない。
    expect(venueSrc).toMatch(/acceptLaneMirrorSnapshot\(bag\?\.\[_mirrorKey\]\)/);
  });
});
