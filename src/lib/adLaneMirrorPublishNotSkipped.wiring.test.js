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
 * ★v0.1.1297: 広告レーンの「行がある経路は必ず鏡へ積む」を固定する。
 *
 * ■ 何が起きていたか(2026-08-08 実機 lv351133074 の状態速報で確定)
 *   状態速報が「🔴 北極星 広告: 拡張3 ≠ 鏡0(鏡が空なのに拡張に3件=鏡publishの取りこぼし)」。
 *   refreshNorthStarAdRankingLane には描画経路が3本あるが、publish していたのは2本だけだった。
 *
 *     1. bundle.adContributionRanking(行)      → publish する
 *     2. bundle.adRankingMirrorHtml(HTML文字列) → ★publish せずに return ← 穴
 *     3. nls_nicoad_api_ranking_<lv> 直読み(行)  → publish する
 *
 *   経路2が【経路3より前】にあったため、鏡HTMLが取れている配信では経路3の行に到達せず、
 *   ①POP には広告が描けているのに③WEB鏡だけ空(0)になった。
 *
 * ■ なぜ経路2では publish できないか
 *   mirrorHtml は scrape した DOM の HTML 文字列であって、northStarMirror が要求する
 *   row 配列ではない。空配列で publish すると直近の正しい鏡を消してしまう
 *   (mergeNorthStarMirrorLanes は「与えたレーンだけ更新・未指定は温存」なので触らないのが正しい)。
 *   → 修正は「積めない経路を最後に回す」。行が取れる2経路を先に試し、
 *     どちらも行が無いときだけ装飾的な鏡HTMLで描く。
 *
 * ■ この検査が守るもの
 *   「行が取れる経路より前に、publish しない経路を置かない」という順序の不変条件。
 */
describe('広告レーン: 行が取れる経路は鏡publishを飛ばさない', () => {
  const body = fnBody(popupSrc, 'async function refreshNorthStarAdRankingLane(');

  it('refreshNorthStarAdRankingLane の本体が取れている(前提)', () => {
    expect(body.length).toBeGreaterThan(1000);
  });

  it('★鏡HTML経路(publishしない)は nicoad API 直読み経路(publishする)より後ろにある', () => {
    const apiPublishAt = body.indexOf('publishNorthStarMirror({ liveId: lid, adRanking: nicoadApiRows');
    const mirrorHtmlAt = body.indexOf('bundle?.adRankingMirrorHtml');
    expect(apiPublishAt).toBeGreaterThan(-1);
    expect(mirrorHtmlAt).toBeGreaterThan(-1);
    // 鏡HTMLが先に来ると、行があっても publish せず return してしまう(これが実機の🔴)。
    expect(apiPublishAt).toBeLessThan(mirrorHtmlAt);
  });

  it('★行を持つ経路は2本とも publish する(bundle 由来 / API 直読み)', () => {
    const bundlePublishAt = body.indexOf('publishNorthStarMirror({ liveId: lid, adRanking: adRows');
    const apiPublishAt = body.indexOf('publishNorthStarMirror({ liveId: lid, adRanking: nicoadApiRows');
    expect(bundlePublishAt).toBeGreaterThan(-1);
    expect(apiPublishAt).toBeGreaterThan(-1);
    expect(bundlePublishAt).toBeLessThan(apiPublishAt);
  });

  it('★この関数の publish 呼び出しはちょうど2回(行を持つ経路の数と一致)', () => {
    /*
     * ★数で断言する([[wiring-test-must-assert-counts-2026-08-04]])。
     *   1回に減れば経路の publish が落ちた・3回に増えれば行を持たない経路から
     *   空配列を積んでいる疑い(直近の正しい鏡を消す)。
     */
    const calls = body.match(/publishNorthStarMirror\(\{/g) || [];
    expect(calls.length).toBe(2);
  });

  it('★2つの publish はどちらも条件で無効化されていない(無条件に実行される文である)', () => {
    /*
     * ★文字列の存在だけでは `if (false)` 前置を検知できない
     *   ([[wiring-test-mutation-check-2026-08-01]])。
     *   行頭のインデントと直後の引数までアンカーして、条件節へ押し込む変異を弾く。
     */
    expect(body).toMatch(
      /\n {4}publishNorthStarMirror\(\{ liveId: lid, adRanking: adRows, deferWrite: true \}\);\n/
    );
    expect(body).toMatch(
      /\n {4}publishNorthStarMirror\(\{ liveId: lid, adRanking: nicoadApiRows, deferWrite: true \}\);\n/
    );
  });

  it('★鏡HTML経路は行を積まない(空配列で正しい鏡を上書きしない)', () => {
    // 鏡HTML の分岐内で publish していないこと=分岐以降に publish が現れない。
    const mirrorHtmlAt = body.indexOf('bundle?.adRankingMirrorHtml');
    expect(mirrorHtmlAt).toBeGreaterThan(-1);
    const afterMirrorHtml = body.slice(mirrorHtmlAt);
    expect(afterMirrorHtml).not.toContain('publishNorthStarMirror(');
  });
});
