import { describe, it, expect } from 'vitest';
import {
  resolveReputationCharacter,
  buildReputationViewModel,
  buildReputationAlertHtml,
  REPUTATION_CHARACTERS
} from './broadcasterReputationView.js';

describe('resolveReputationCharacter', () => {
  it('safe → りんく(褒め)', () => {
    expect(resolveReputationCharacter('safe').name).toBe('りんく');
  });
  it('low / medium → こん太(助言)', () => {
    expect(resolveReputationCharacter('low').name).toBe('こん太');
    expect(resolveReputationCharacter('medium').name).toBe('こん太');
  });
  it('high → たぬ姉(警告)', () => {
    expect(resolveReputationCharacter('high').name).toBe('たぬ姉');
  });
  it('未知/欠落は safe(りんく) に倒す', () => {
    expect(resolveReputationCharacter('???').name).toBe('りんく');
    expect(resolveReputationCharacter(null).name).toBe('りんく');
    expect(resolveReputationCharacter(undefined).name).toBe('りんく');
  });
  it('各キャラに画像と色がある', () => {
    for (const level of ['safe', 'low', 'medium', 'high']) {
      const c = resolveReputationCharacter(level);
      expect(typeof c.img).toBe('string');
      expect(c.img.length).toBeGreaterThan(0);
      expect(typeof c.color).toBe('string');
    }
  });
});

describe('buildReputationViewModel', () => {
  it('safe: 危険ヒット0件・りんくの褒めトーン・hits空', () => {
    const analyzed = [
      { text: 'A 歌枠', level: null, keyword: null },
      { text: 'A 神回', level: null, keyword: null }
    ];
    const vm = buildReputationViewModel({ query: 'A', analyzed });
    expect(vm.overall).toBe('safe');
    expect(vm.character.name).toBe('りんく');
    expect(vm.hits).toEqual([]);
    expect(vm.query).toBe('A');
  });

  it('high: 危険語を hits に集約しレベル降順で並べる', () => {
    const analyzed = [
      { text: 'A 歌枠', level: null, keyword: null },
      { text: 'A やめとけ', level: 'low', keyword: 'やめとけ' },
      { text: 'A 詐欺', level: 'high', keyword: '詐欺' },
      { text: 'A 評判悪い', level: 'medium', keyword: '評判悪い' }
    ];
    const vm = buildReputationViewModel({ query: 'A', analyzed });
    expect(vm.overall).toBe('high');
    expect(vm.character.name).toBe('たぬ姉');
    // hits は null を除き、high→medium→low の順
    expect(vm.hits.map((h) => h.level)).toEqual(['high', 'medium', 'low']);
    expect(vm.hits.map((h) => h.text)).toEqual(['A 詐欺', 'A 評判悪い', 'A やめとけ']);
  });

  it('analyzed が空/非配列でも safe で壊れない', () => {
    expect(buildReputationViewModel({ query: 'A', analyzed: [] }).overall).toBe('safe');
    expect(buildReputationViewModel({ query: 'A', analyzed: null }).overall).toBe('safe');
    expect(buildReputationViewModel({}).overall).toBe('safe');
  });

  it('total と negativeCount を数える', () => {
    const analyzed = [
      { text: 'A 歌枠', level: null },
      { text: 'A 詐欺', level: 'high', keyword: '詐欺' },
      { text: 'A 評判悪い', level: 'medium', keyword: '評判悪い' }
    ];
    const vm = buildReputationViewModel({ query: 'A', analyzed });
    expect(vm.total).toBe(3);
    expect(vm.negativeCount).toBe(2);
  });
});

describe('buildReputationAlertHtml', () => {
  it('safe はりんくの褒めメッセージを含む', () => {
    const vm = buildReputationViewModel({ query: 'テスト配信者', analyzed: [{ text: 'x', level: null }] });
    const html = buildReputationAlertHtml(vm);
    expect(html).toContain('りんく');
    expect(html).toContain('テスト配信者');
  });

  it('high は危険語を列挙する', () => {
    const analyzed = [{ text: 'A 詐欺', level: 'high', keyword: '詐欺' }];
    const vm = buildReputationViewModel({ query: 'A', analyzed });
    const html = buildReputationAlertHtml(vm);
    expect(html).toContain('たぬ姉');
    expect(html).toContain('詐欺');
  });

  it('XSS: query と text を必ずエスケープする', () => {
    const analyzed = [{ text: '<img src=x onerror=alert(1)>詐欺', level: 'high', keyword: '詐欺' }];
    const vm = buildReputationViewModel({ query: '<script>alert(1)</script>', analyzed });
    const html = buildReputationAlertHtml(vm);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('会議結論の遵守: 営業CTA/誹謗中傷サイト誘導を含まない', () => {
    const analyzed = [{ text: 'A 詐欺', level: 'high', keyword: '詐欺' }];
    const vm = buildReputationViewModel({ query: 'A', analyzed });
    const html = buildReputationAlertHtml(vm);
    // dns-osint 固有の営業/誘導文言・URLが混入していないこと
    expect(html).not.toContain('リバースハック');
    expect(html).not.toContain('lin.ee');
    expect(html).not.toContain('5ch');
    expect(html).not.toContain('爆サイ');
    expect(html).not.toContain('@reph');
  });

  it('vm が無くても空文字で安全に返す', () => {
    expect(buildReputationAlertHtml(null)).toBe('');
    expect(buildReputationAlertHtml(undefined)).toBe('');
  });
});

describe('REPUTATION_CHARACTERS', () => {
  it('4レベル分のキャラ定義がある', () => {
    expect(REPUTATION_CHARACTERS.safe.name).toBe('りんく');
    expect(REPUTATION_CHARACTERS.high.name).toBe('たぬ姉');
  });
});
