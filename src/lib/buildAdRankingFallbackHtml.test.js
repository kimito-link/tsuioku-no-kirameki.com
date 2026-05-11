/**
 * buildAdRankingFallbackHtml の単体テスト。
 *
 * 2026-05-11 kimito さん診断 (lv350507546 こひめろさん) で確認された
 * 「adRankingMirrorHtml が null だが adContributionRanking 5 件 → popup 空白」
 * 回帰の修正。structured items から最小限の HTML を組み立てる。
 */
import { describe, it, expect } from 'vitest';
import { buildAdRankingFallbackHtml } from './buildAdRankingFallbackHtml.js';

describe('buildAdRankingFallbackHtml', () => {
  it('null / undefined / 空配列 → null', () => {
    expect(buildAdRankingFallbackHtml(null)).toBeNull();
    expect(buildAdRankingFallbackHtml(undefined)).toBeNull();
    expect(buildAdRankingFallbackHtml([])).toBeNull();
  });

  it('Array でない (object / string) → null', () => {
    expect(buildAdRankingFallbackHtml({})).toBeNull();
    expect(buildAdRankingFallbackHtml('not-array')).toBeNull();
  });

  it('全 item が完全に空 → null', () => {
    expect(buildAdRankingFallbackHtml([{}, {}, {}])).toBeNull();
  });

  it('1 件 (rank + name + contribution) → 1 行 HTML', () => {
    const items = [{ rank: 1, name: 'おはぎ', contribution: 14000, isAnonymous: false }];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toBeTruthy();
    expect(html).toContain('<ol class="nl-ad-fallback">');
    expect(html).toContain('おはぎ');
    expect(html).toContain('14,000');
    expect(html).toContain('貢');
    expect(html).toContain('<span class="nl-ad-fallback-row__rank">1</span>');
  });

  it('5 件 → 5 行 HTML', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      rank: i + 1,
      name: `ユーザー${i + 1}`,
      contribution: 100 - i * 10,
      isAnonymous: false
    }));
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toBeTruthy();
    for (let i = 1; i <= 5; i++) {
      expect(html).toContain(`ユーザー${i}`);
      expect(html).toContain(`>${i}</span>`);
    }
  });

  it('6 件以上は 5 件で truncate (FALLBACK_MAX_ROWS)', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      name: `User${i + 1}`,
      contribution: 1000 - i,
      isAnonymous: false
    }));
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('User1');
    expect(html).toContain('User5');
    expect(html).not.toContain('User6');
    expect(html).not.toContain('User10');
  });

  it('isAnonymous: true → 「名無し」+ anon クラス', () => {
    const items = [{ rank: 1, name: 'foo', contribution: 100, isAnonymous: true }];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('名無し');
    expect(html).toContain('nl-ad-fallback-row__name--anon');
    expect(html).not.toContain('>foo<'); // 元の name は出ない (匿名扱い)
  });

  it('name が "名無し" 文字列でも anon 扱い', () => {
    const items = [{ rank: 1, name: '名無し', contribution: 100, isAnonymous: false }];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('nl-ad-fallback-row__name--anon');
  });

  it('name 欠落 (null / 空文字列) でも anon として「名無し」描画', () => {
    const items = [
      { rank: 1, name: null, contribution: 100 },
      { rank: 2, name: '', contribution: 80 }
    ];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('名無し');
    expect(html).toContain('100 貢');
    expect(html).toContain('80 貢');
  });

  it('contribution が null でも他のフィールドがあれば row が出る', () => {
    const items = [{ rank: 1, name: 'foo', contribution: null }];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('foo');
    expect(html).not.toContain('貢'); // contribution span 自体は出ない
  });

  it('rank が null だと rank span 空、それでも row 出る', () => {
    const items = [{ rank: null, name: 'foo', contribution: 100 }];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('foo');
    expect(html).toContain('100 貢');
    expect(html).not.toContain('<span class="nl-ad-fallback-row__rank">');
  });

  it('contribution が大きな数字でも 3 桁区切りで表示 (en-US カンマ)', () => {
    const items = [{ rank: 1, name: 'top', contribution: 12345678, isAnonymous: false }];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('12,345,678 貢');
  });

  it('XSS: name 中の HTML タグはエスケープされる', () => {
    const items = [
      { rank: 1, name: '<script>alert(1)</script>', contribution: 100 }
    ];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('XSS: name 中の & " \' もエスケープ', () => {
    const items = [
      { rank: 1, name: 'foo & "bar" \'baz\'', contribution: 100 }
    ];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
  });

  it('input を mutate しない (純関数)', () => {
    const items = [{ rank: 1, name: 'foo', contribution: 100 }];
    const snapshot = JSON.stringify(items);
    buildAdRankingFallbackHtml(items);
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it('note 文字列が含まれる (鏡 HTML 取得待ちの旨を表示)', () => {
    const items = [{ rank: 1, name: 'foo', contribution: 100 }];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toContain('構造化値を表示中');
    expect(html).toContain('鏡');
  });

  it('実機シナリオ (lv350507546): 5 件・top1 匿名 14000 貢', () => {
    const items = [
      { rank: 1, name: '名無し', contribution: 85000, isAnonymous: true, thumbnailUrl: '' },
      { rank: 2, name: 'なぎ', contribution: 18005, isAnonymous: false },
      { rank: 3, name: 'おはぎ', contribution: 14000, isAnonymous: false },
      { rank: 4, name: '受賞しまくり人生', contribution: 5000, isAnonymous: false },
      { rank: 5, name: 'sansirou', contribution: 1000, isAnonymous: false }
    ];
    const html = buildAdRankingFallbackHtml(items);
    expect(html).toBeTruthy();
    expect(html).toContain('85,000 貢');
    expect(html).toContain('18,005 貢');
    expect(html).toContain('14,000 貢');
    expect(html).toContain('nl-ad-fallback-row__name--anon'); // top1 anon
    expect(html).toContain('なぎ');
    expect(html).toContain('おはぎ');
    expect(html).toContain('受賞しまくり人生');
  });
});
