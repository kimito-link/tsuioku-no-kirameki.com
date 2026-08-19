import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines
} from './storyUserLaneRenderProbe.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★popup 側 DOM census が「採取 → スナップショット → 表示」まで通っていることを固定する。
 *
 * ■ このリポの前科([[fastdiag-lite-is-the-printer-subset]])
 *   v0.1.1124 の `hostMoveDiag` は作ったのに印字経路へ通しておらず、
 *   **実機のコピペに永久に出なかった**。
 *   ★計器は「作った」ではなく「**出力に現れた**」で完成
 *   ([[verify-output-appears-before-shipping-2026-08-09]])。
 */
describe('★popup DOM census が採取から表示まで配線されている', () => {
  it('★popup-entry が段ごと＋全体を採取している', () => {
    const src = read('src/extension/popup-entry.js');
    expect(src, 'summarizePopupDomCensus を import していない')
      .toContain("from '../lib/popupDomCensus.js'");
    expect(src, '採取していない').toContain('snap.popupDomCensus = summarizePopupDomCensus({');
    // ★5段すべてを数える(たぬ姉だけだと偏る)
    for (const id of ['sceneStoryUserLaneLink', 'sceneStoryUserLaneKonta',
      'sceneStoryUserLaneTanu', 'sceneStoryUserLaneGift', 'sceneStoryUserLaneAd']) {
      expect(src, `${id} を数えていない`).toContain(id);
    }
  });

  it('★計器自身が重くならない採取をしている(live コレクションの length)', () => {
    /*
     * ★[[instrument-can-kill-the-page-it-measures-2026-08-16]]:
     *   read を1本増やすだけで体感が壊れた前科がある。
     *   querySelectorAll は配列を生成するので、総数を数えるだけなら使わない。
     */
    const src = read('src/extension/popup-entry.js');
    const i = src.indexOf('snap.popupDomCensus = summarizePopupDomCensus({');
    const block = src.slice(i - 1200, i + 600);
    expect(block).toContain("getElementsByTagName('*').length");
    expect(block).toContain("getElementsByClassName('nl-story-userlane-cell')");
    // ★storage を触っていない(計器が症状を作らない)
    expect(block).not.toMatch(/storage\.(local|sync)\.(get|set)/);
  });

  it('★★diag を通る(通さないとコピペに出ない)', () => {
    /*
     * ★実際の経路: popup が snap に載せる
     *   → buildStoryUserLaneRenderDiag が diag へ通す
     *   → formatStoryUserLaneRenderDiagLines が行にする。
     *   ★私は最初 `snapshotStoryUserLaneRenderProbe` を通ると思って書いて赤にした
     *     = 通し先を実ファイルで確認せず推測した。
     */
    const diag = buildStoryUserLaneRenderDiag(
      { popupDomCensus: { level: 'bad', total: 13682, line: 'パネルの部品数: 13682個' } },
      {}
    );
    expect(diag?.popupDomCensus, 'diag に通っていない').toBeTruthy();
    expect(diag.popupDomCensus.total).toBe(13682);
  });

  it('★★状態速報の行に現れる', () => {
    const diag = buildStoryUserLaneRenderDiag(
      { popupDomCensus: { level: 'bad', total: 13682, line: 'パネルの部品数: 13682個 🔴推奨の3倍超' } },
      {}
    );
    const text = formatStoryUserLaneRenderDiagLines(diag, {}).join('\n');
    expect(text, '速報に出ていない=ユーザーが読めない').toContain('13682');
    expect(text).toContain('パネルの部品数');
  });

  it('★計器が無い入力でも壊れない(古いビルド/採取失敗)', () => {
    const diag = buildStoryUserLaneRenderDiag({}, {});
    expect(diag.popupDomCensus).toBeNull();
    expect(() => formatStoryUserLaneRenderDiagLines(diag, {})).not.toThrow();
  });

  it('★台帳(instrumentSpec)に dom-nodes@popup が宣言されている', async () => {
    const { INSTRUMENT_SPEC } = await import('./instrumentSpec.js');
    const row = INSTRUMENT_SPEC.find((r) => r.id === 'dom-nodes' && r.doc === 'popup');
    expect(row, '台帳に無い計器を実装した=宣言と実装がズレる').toBeTruthy();
    expect(row.unit).toBe('elements');
  });
});
