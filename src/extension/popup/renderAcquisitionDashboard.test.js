/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { renderAcquisitionDashboard } from './renderAcquisitionDashboard.js';

/**
 * ★Phase 2 の最初の実抽出(popup-entry.js → src/extension/popup/)の回帰。
 *
 * 抽出前はこの関数に単体テストが無かった(popup-entry.js 内の私有関数だったため
 * 呼び出せなかった)。切り出したことで初めて挙動を直接固定できる。
 * = 抽出の副産物として【テスト可能性】が増える、という効果の実証でもある。
 */

/** 実 DOM 要素を使う(happy-dom)。モックだと instanceof HTMLElement の分岐を通れない。 */
function fakeHost() {
  return document.createElement('div');
}

const BASE = {
  liveId: 'lv351125898',
  displayCount: 100,
  storageCount: 120,
  officialCount: 200,
  avatarStats: null
};

describe('renderAcquisitionDashboard(抽出後も同じ挙動)', () => {
  it('★要素が無ければ何もしない(落ちない)', () => {
    expect(() => renderAcquisitionDashboard(BASE, { getEl: () => null })).not.toThrow();
  });

  it('★liveId が空なら「watch を開いて」の案内を描く', () => {
    const host = fakeHost();
    renderAcquisitionDashboard({ ...BASE, liveId: '' }, { getEl: () => host });
    expect(host.innerHTML).toContain('nl-acquisition--empty');
    expect(host.innerHTML).toContain('ニコ生 watch を開いた状態');
  });

  it('★liveId があれば取得率チャートを描く', () => {
    const host = fakeHost();
    renderAcquisitionDashboard(BASE, { getEl: () => host });
    expect(host.innerHTML).toContain('nl-acquisition');
    expect(host.innerHTML).not.toContain('nl-acquisition--empty');
    expect(host.innerHTML.length).toBeGreaterThan(200);
  });

  it('★要素取得器は注入される(popup-entry のローカル関数に依存しない)', () => {
    /*
     * 抽出の肝。呼び手が要素取得器を渡すので、この関数は
     * popup-entry.js の $ に直接依存しない=単体で動かせる。
     */
    const asked = [];
    renderAcquisitionDashboard(BASE, {
      getEl: (id) => {
        asked.push(id);
        return fakeHost();
      }
    });
    expect(asked).toContain('devMonitorAcquisition');
  });

  it('数値が欠けていても落ちない(空状態と同じく fail-safe)', () => {
    const host = fakeHost();
    expect(() =>
      renderAcquisitionDashboard(
        { liveId: 'lv1', displayCount: null, storageCount: null, officialCount: null },
        { getEl: () => host }
      )
    ).not.toThrow();
  });
});
