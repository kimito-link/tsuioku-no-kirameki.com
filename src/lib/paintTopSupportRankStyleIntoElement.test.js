/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { renderTopSupportRankStripInto } from './paintTopSupportRankStyleIntoElement.js';

/**
 * ★churn 根治(v0.1.1038)の回帰防止。
 *   応援ランキング系レーンは diff-skip(前回と同一なら DOM を触らない)を持つが、freshnessNote は
 *   相対経過("3秒前"→"6秒前")で毎 paint 変わる。これを diff-skip キーに含めると rows 同一でも
 *   毎回 list を貼り替え churn していた(既知地雷 v1022)。本テストは「rows 同一 + freshness 変化」で
 *   本体 list が貼り替わらない(=churn しない)こと、freshness だけ in-place 更新されることを固定する。
 */

const ROOMS = [
  { userKey: 'a:AAA', nickname: '匿名A', count: 5, avatarUrl: '' },
  { userKey: '12345', nickname: '太郎', count: 3, avatarUrl: 'https://cdn/1.jpg' }
];

function paint(el, rooms, freshnessNote) {
  renderTopSupportRankStripInto(el, rooms, {
    noteText: 'テスト注記',
    unitSuffix: '貢',
    ariaLabel: '広告ランキング',
    freshnessNote,
    defaultThumbSrc: 'yukkuri.png',
    anonymousFallbackThumbSrc: 'blank.png'
  });
}

describe('renderTopSupportRankStripInto — churn 根治(freshness を diff-skip から分離)', () => {
  it('rows 同一で freshness だけ変わっても本体 list を貼り替えない(churn しない)', () => {
    const el = document.createElement('div');
    paint(el, ROOMS, '最終更新: 3秒前・自動更新中');
    const listBefore = el.querySelector('.nl-top-support-rank__list');
    const firstLineBefore = el.querySelector('[role="listitem"]');
    expect(listBefore).toBeTruthy();

    // freshness だけ変えて再 paint(rows は同一参照)。
    paint(el, ROOMS, '最終更新: 6秒前・自動更新中');
    const listAfter = el.querySelector('.nl-top-support-rank__list');
    const firstLineAfter = el.querySelector('[role="listitem"]');

    // ★本体 list の DOM ノードが同一=貼り替えていない(churn ゼロ)。
    expect(listAfter).toBe(listBefore);
    expect(firstLineAfter).toBe(firstLineBefore);
  });

  it('本体不変時でも freshness テキストは in-place で更新される', () => {
    const el = document.createElement('div');
    paint(el, ROOMS, '最終更新: 3秒前・自動更新中');
    const freshBefore = el.querySelector('.nl-top-support-rank__freshness');
    expect(freshBefore?.textContent).toBe('🕒 最終更新: 3秒前・自動更新中');

    paint(el, ROOMS, '最終更新: 6秒前・自動更新中');
    const freshAfter = el.querySelector('.nl-top-support-rank__freshness');
    // 同じ <p> ノードのまま textContent だけ更新(list churn なしで時刻は生きる)。
    expect(freshAfter).toBe(freshBefore);
    expect(freshAfter?.textContent).toBe('🕒 最終更新: 6秒前・自動更新中');
    expect(freshAfter?.getAttribute('aria-live')).toBe('polite');
  });

  it('rows が実際に変わったら本体 list を貼り替える(新データは反映)', () => {
    const el = document.createElement('div');
    paint(el, ROOMS, '最終更新: 3秒前');
    const listBefore = el.querySelector('.nl-top-support-rank__list');

    const rooms2 = [{ userKey: 'a:BBB', nickname: '匿名B', count: 9, avatarUrl: '' }];
    paint(el, rooms2, '最終更新: 3秒前');
    const listAfter = el.querySelector('.nl-top-support-rank__list');
    // 本体が変わったので貼り替わる(別ノード)。
    expect(listAfter).not.toBe(listBefore);
    expect(el.querySelectorAll('[role="listitem"]').length).toBe(1);
  });

  it('freshnessNote が空なら freshness の <p> を出さない/除去する', () => {
    const el = document.createElement('div');
    paint(el, ROOMS, '最終更新: 3秒前');
    expect(el.querySelector('.nl-top-support-rank__freshness')).toBeTruthy();
    // 空 note で再 paint(rows 同一)→ freshness を除去(list は不変)。
    paint(el, ROOMS, '');
    expect(el.querySelector('.nl-top-support-rank__freshness')).toBeNull();
  });

  it('XSS: freshnessNote は textContent 経由でエスケープされる(HTML として解釈されない)', () => {
    const el = document.createElement('div');
    paint(el, ROOMS, '最終更新: 3秒前');
    // 本体不変で in-place 更新経路に <script> を流す。
    paint(el, ROOMS, '<img src=x onerror=alert(1)>');
    const fresh = el.querySelector('.nl-top-support-rank__freshness');
    expect(fresh?.querySelector('img')).toBeNull(); // HTML 化されない
    expect(fresh?.textContent).toBe('🕒 <img src=x onerror=alert(1)>');
  });
});
