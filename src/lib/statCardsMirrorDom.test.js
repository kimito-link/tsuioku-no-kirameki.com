/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { paintStatCardsMirrorValues } from './statCardsMirrorDom.js';

/**
 * P0 退行ガード(characterization): status-entry.js#renderStatCardsMirror の【値セット部分】を
 * src/lib へ無挙動変更で切り出す前に、現挙動を固定する。
 *   - setVal: テキスト + is-placeholder トグル
 *   - setSub: テキスト有なら表示・空なら hidden
 *   - official=null で公式チップが全て '—' + is-placeholder に戻る(ネガコン)
 * status.html:1051-1132 と同じ id のDOMを happy-dom で組み、painter を当てて検証する。
 */

// status.html の statCardsMirror セクションと同じ id の最小DOMを作る。
function buildDom() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div id="statCardsMirror">
      <div id="liveStatComments"></div>
      <div id="liveStatCommentsOfficial"></div>
      <div id="liveStatCommentsBreakdown"></div>
      <div id="liveStatCommentsIngest"></div>
      <div id="watchConcurrentEst"></div>
      <div id="watchConcurrentSub"></div>
      <div id="watchViewerDom"></div>
      <div id="officialStatNicoViewers"></div>
      <div id="officialStatNicoComments"></div>
      <div id="officialStatNicoStreamAge"></div>
      <div id="officialStatNicoAdPts"></div>
      <div id="officialStatNicoGiftPts"></div>
    </div>`;
  document.body.replaceChildren(root);
  return root;
}
const $ = (id) => document.getElementById(id);

const FULL_SNAP = {
  recordsText: '1,962',
  recordsIsPlaceholder: false,
  recordsOfficialLine: '公式 1,939',
  recordsBreakdownLine: '内訳: 通常 1,385',
  recordsIngestLine: '最終取り込み 3秒前',
  concurrent: { estText: '~361', estIsPlaceholder: false, subText: '26人×12.6 + 滞留31%' },
  visitor: { text: '1,293', isPlaceholder: false },
  official: {
    viewers: { text: '1,293', isPlaceholder: false },
    comments: { text: '1,557', isPlaceholder: false },
    streamAge: { text: '1時間29分', isPlaceholder: false },
    adPts: { text: '10,200', isPlaceholder: false },
    giftPts: { text: '6,650', isPlaceholder: false }
  }
};

describe('paintStatCardsMirrorValues', () => {
  it('記録カードの値+3つの sub 行を本物の値で入れる', () => {
    buildDom();
    paintStatCardsMirrorValues(document, FULL_SNAP);
    expect($('liveStatComments').textContent).toBe('1,962');
    expect($('liveStatComments').classList.contains('is-placeholder')).toBe(false);
    expect($('liveStatCommentsOfficial').textContent).toBe('公式 1,939');
    expect($('liveStatCommentsOfficial').hidden).toBe(false);
    expect($('liveStatCommentsBreakdown').textContent).toBe('内訳: 通常 1,385');
    expect($('liveStatCommentsIngest').textContent).toBe('最終取り込み 3秒前');
  });

  it('推定同接・来場の値とサブを入れる', () => {
    buildDom();
    paintStatCardsMirrorValues(document, FULL_SNAP);
    expect($('watchConcurrentEst').textContent).toBe('~361');
    expect($('watchConcurrentSub').textContent).toBe('26人×12.6 + 滞留31%');
    expect($('watchViewerDom').textContent).toBe('1,293');
  });

  it('公式統計チップ5つを本物の値で入れる', () => {
    buildDom();
    paintStatCardsMirrorValues(document, FULL_SNAP);
    expect($('officialStatNicoViewers').textContent).toBe('1,293');
    expect($('officialStatNicoComments').textContent).toBe('1,557');
    expect($('officialStatNicoStreamAge').textContent).toBe('1時間29分');
    expect($('officialStatNicoAdPts').textContent).toBe('10,200');
    expect($('officialStatNicoGiftPts').textContent).toBe('6,650');
    expect($('officialStatNicoViewers').classList.contains('is-placeholder')).toBe(false);
  });

  it('空 sub 行は hidden になる(setSub の畳み方)', () => {
    buildDom();
    paintStatCardsMirrorValues(document, { ...FULL_SNAP, recordsOfficialLine: '', recordsBreakdownLine: '' });
    expect($('liveStatCommentsOfficial').hidden).toBe(true);
    expect($('liveStatCommentsBreakdown').hidden).toBe(true);
    expect($('liveStatCommentsIngest').hidden).toBe(false); // 残りは表示
  });

  // ネガティブコントロール: official=null で全チップが '—' + is-placeholder に戻る(退化でなく仕様)。
  it('ネガコン: official=null で公式チップ全て「—」+ is-placeholder', () => {
    buildDom();
    paintStatCardsMirrorValues(document, { ...FULL_SNAP, official: null });
    for (const id of ['officialStatNicoViewers', 'officialStatNicoComments', 'officialStatNicoStreamAge', 'officialStatNicoAdPts', 'officialStatNicoGiftPts']) {
      expect($(id).textContent).toBe('—');
      expect($(id).classList.contains('is-placeholder')).toBe(true);
    }
  });

  it('ネガコン: isPlaceholder=true の値は is-placeholder クラスが付く', () => {
    buildDom();
    paintStatCardsMirrorValues(document, { ...FULL_SNAP, recordsText: '—', recordsIsPlaceholder: true });
    expect($('liveStatComments').textContent).toBe('—');
    expect($('liveStatComments').classList.contains('is-placeholder')).toBe(true);
  });

  it('要素が無くても投げない(DOM 一部欠落に耐える)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div id="liveStatComments"></div>';
    document.body.replaceChildren(root);
    expect(() => paintStatCardsMirrorValues(document, FULL_SNAP)).not.toThrow();
    expect($('liveStatComments').textContent).toBe('1,962');
  });
});
