/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildChikuranHeaderDom } from './chikuranHeaderDom.js';
import { buildChikuranCardModel } from './chikuranCard.js';

/**
 * P2(配信者カード): status-entry.js#buildChikuranHeaderEl の DOM 生成を src/lib へ無挙動抽出する前に、
 * 現挙動を固定する(characterization)。入力は buildChikuranCardModel(live) の戻り(ChikuranCardModel)。
 *   - サムネ有り → img[src]+referrerPolicy=no-referrer / 無し → 🎥 プレースホルダ
 *   - ended → 配信者名に ⏹ プレフィクス / 配信者名空 → (配信者名 不明)
 *   - メトリクス(経過/来場/コメント/ギフト)は取れた値だけ・千区切り
 */

const FULL_LIVE = {
  lv: 'lv350824633',
  broadcasterName: 'サボり学生',
  title: '学校行けなかった',
  thumbnailUrl: 'https://cdn.example/thumb.jpg',
  elapsedSec: 5280, // 1:28:00
  watchCount: 1167,
  recordedCount: 1552,
  giftPoints: 6650,
  adPoints: 10200,
  endedAt: null
};

function render(live) {
  return buildChikuranHeaderDom(buildChikuranCardModel(live));
}

describe('buildChikuranHeaderDom', () => {
  it('サムネ有り: img[src] + referrerPolicy=no-referrer + lazy', () => {
    const head = render(FULL_LIVE);
    const img = head.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://cdn.example/thumb.jpg');
    expect(img.referrerPolicy).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('配信者名・タイトルが出る', () => {
    const head = render(FULL_LIVE);
    expect(head.textContent).toContain('サボり学生');
    expect(head.textContent).toContain('学校行けなかった');
  });

  it('メトリクス: 経過/来場/コメント/ギフトが千区切りで出る', () => {
    const head = render(FULL_LIVE);
    const t = head.textContent;
    expect(t).toContain('1:28:00');   // 経過
    expect(t).toContain('1,167');     // 来場
    expect(t).toContain('1,552');     // コメント(recordedCount)
    expect(t).toContain('6,650');     // ギフト
  });

  it('サムネ無し: 🎥 プレースホルダ(img は無い)', () => {
    const head = render({ ...FULL_LIVE, thumbnailUrl: '' });
    expect(head.querySelector('img')).toBeNull();
    expect(head.textContent).toContain('🎥');
  });

  it('ended: 配信者名に ⏹ プレフィクス', () => {
    const head = render({ ...FULL_LIVE, endedAt: '2026-06-25T09:02:00Z' });
    expect(head.textContent).toContain('⏹');
    expect(head.textContent).toContain('サボり学生');
  });

  it('配信者名空: (配信者名 不明)', () => {
    const head = render({ ...FULL_LIVE, broadcasterName: '' });
    expect(head.textContent).toContain('配信者名 不明');
  });

  it('ギフト0: ギフトメトリクスを出さない(空欄を0と偽らない)', () => {
    const head = render({ ...FULL_LIVE, giftPoints: 0 });
    expect(head.textContent).not.toContain('🎁');
  });

  // ネガコン: model=null で空の head(投げない)。
  it('ネガコン: model=null で空 head(投げない)', () => {
    const head = buildChikuranHeaderDom(null);
    expect(head).toBeTruthy();
    expect(head.querySelector('img')).toBeNull();
    expect(head.textContent.trim()).toBe('');
  });

  // ネガコン: 取れない値は出さない(全部 null でメトリクス行が空)。
  it('ネガコン: 値が全部 null ならメトリクス行を作らない', () => {
    const head = buildChikuranHeaderDom({
      lv: 'lv1', broadcasterName: 'x', title: '', thumbnailUrl: '',
      elapsedText: null, watchCount: null, commentCount: null, giftPoints: null, adPoints: null, ended: false
    });
    expect(head.textContent).not.toContain('👤');
    expect(head.textContent).not.toContain('💬');
    expect(head.textContent).not.toContain('⏱');
  });
});
