import { describe, it, expect } from 'vitest';
import {
  detectNegativeKeyword,
  analyzeNegativeSuggests,
  getOverallRiskLevel,
  isInNeutralContext,
  NEGATIVE_KEYWORDS,
  NEUTRAL_CONTEXT_PATTERNS
} from './broadcasterReputationKeywords.js';

describe('detectNegativeKeyword', () => {
  it('high リスク語を検出する', () => {
    expect(detectNegativeKeyword('〇〇 詐欺')).toEqual({ level: 'high', keyword: '詐欺' });
    expect(detectNegativeKeyword('配信者 逮捕').level).toBe('high');
    expect(detectNegativeKeyword('パワハラ 告発').level).toBe('high');
  });

  it('medium リスク語を検出する', () => {
    expect(detectNegativeKeyword('〇〇 評判悪い')).toEqual({ level: 'medium', keyword: '評判悪い' });
    expect(detectNegativeKeyword('ステマ疑惑').level).not.toBe(null);
  });

  it('low リスク語を検出する', () => {
    expect(detectNegativeKeyword('〇〇 やめとけ')).toEqual({ level: 'low', keyword: 'やめとけ' });
  });

  it('ネガティブ語が無ければ null', () => {
    expect(detectNegativeKeyword('〇〇 配信 神回')).toEqual({ level: null, keyword: null });
    expect(detectNegativeKeyword('〇〇 歌枠 最高')).toEqual({ level: null, keyword: null });
  });

  it('high が medium/low より優先される', () => {
    // '詐欺'(high) と '評判悪い'(medium) 両方含む → high
    expect(detectNegativeKeyword('詐欺 評判悪い').level).toBe('high');
  });

  it('不正な入力は安全に null を返す', () => {
    expect(detectNegativeKeyword('')).toEqual({ level: null, keyword: null });
    expect(detectNegativeKeyword(null)).toEqual({ level: null, keyword: null });
    expect(detectNegativeKeyword(undefined)).toEqual({ level: null, keyword: null });
    expect(detectNegativeKeyword(123)).toEqual({ level: null, keyword: null });
  });
});

describe('中立文脈の誤検知対策 (dns-osint v8.4.29 実績ケース)', () => {
  it('「迷惑メール対策」は NG 判定しない', () => {
    expect(detectNegativeKeyword('迷惑メール対策の方法')).toEqual({ level: null, keyword: null });
  });

  it('「電話番号」は NG 判定しない', () => {
    expect(detectNegativeKeyword('〇〇 電話番号 案内')).toEqual({ level: null, keyword: null });
  });

  it('「失敗しない選び方」は NG 判定しない', () => {
    expect(detectNegativeKeyword('失敗しない選び方')).toEqual({ level: null, keyword: null });
  });

  it('「裏技」「裏メニュー」は NG 判定しない', () => {
    expect(detectNegativeKeyword('〇〇 裏技 まとめ')).toEqual({ level: null, keyword: null });
    expect(detectNegativeKeyword('〇〇 裏メニュー')).toEqual({ level: null, keyword: null });
  });

  it('「クレーム対応」「苦情処理」は NG 判定しない', () => {
    expect(detectNegativeKeyword('クレーム対応の仕事')).toEqual({ level: null, keyword: null });
    expect(detectNegativeKeyword('苦情処理マニュアル')).toEqual({ level: null, keyword: null });
  });

  it('中立フレーズの外側に強NG語があれば NG 維持', () => {
    // 「迷惑メール対策」(中立) + 「詐欺」(強NG) → 詐欺で NG 維持
    const r = detectNegativeKeyword('迷惑メール対策 詐欺被害多発');
    expect(r.level).toBe('high');
  });

  it('複合語「迷惑電話」は中立化されず high のまま', () => {
    // 「迷惑電話」は high 語。「電話番号」中立ルールに引っかからない
    expect(detectNegativeKeyword('〇〇 迷惑電話').level).toBe('high');
  });
});

describe('isInNeutralContext', () => {
  it('中立フレーズ + 該当NG語なら true', () => {
    expect(isInNeutralContext('迷惑メール対策', '迷惑')).toBe(true);
  });
  it('中立フレーズが無ければ false', () => {
    expect(isInNeutralContext('詐欺被害', '詐欺')).toBe(false);
  });
  it('外側に強NG語があれば false (NG維持)', () => {
    expect(isInNeutralContext('迷惑メール対策 詐欺', '迷惑')).toBe(false);
  });
});

describe('analyzeNegativeSuggests', () => {
  it('サジェスト配列を解析して各要素に level/keyword を付ける', () => {
    const result = analyzeNegativeSuggests(['〇〇 歌枠', '〇〇 詐欺', '〇〇 評判悪い']);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: '〇〇 歌枠', level: null, keyword: null });
    expect(result[1].level).toBe('high');
    expect(result[2].level).toBe('medium');
  });

  it('配列でなければ空配列', () => {
    expect(analyzeNegativeSuggests(null)).toEqual([]);
    expect(analyzeNegativeSuggests('foo')).toEqual([]);
  });
});

describe('getOverallRiskLevel', () => {
  it('high が1つでもあれば high', () => {
    expect(getOverallRiskLevel([{ level: 'low' }, { level: 'high' }, { level: null }])).toBe('high');
  });
  it('high無し medium有りなら medium', () => {
    expect(getOverallRiskLevel([{ level: 'medium' }, { level: 'low' }])).toBe('medium');
  });
  it('low だけなら low', () => {
    expect(getOverallRiskLevel([{ level: 'low' }, { level: null }])).toBe('low');
  });
  it('全部 null / 空 / 非配列なら safe', () => {
    expect(getOverallRiskLevel([{ level: null }, { level: null }])).toBe('safe');
    expect(getOverallRiskLevel([])).toBe('safe');
    expect(getOverallRiskLevel(null)).toBe('safe');
  });
});

describe('移植の健全性 (会議結論の遵守)', () => {
  it('NEGATIVE_DOMAINS は移植されていない (誹謗中傷サイト誘導を持ち込まない)', async () => {
    const mod = await import('./broadcasterReputationKeywords.js');
    expect(mod.NEGATIVE_DOMAINS).toBeUndefined();
    expect(mod.checkNegativeDomain).toBeUndefined();
  });

  it('辞書は配列として存在し空でない', () => {
    expect(NEGATIVE_KEYWORDS.high.length).toBeGreaterThan(0);
    expect(NEGATIVE_KEYWORDS.medium.length).toBeGreaterThan(0);
    expect(NEGATIVE_KEYWORDS.low.length).toBeGreaterThan(0);
    expect(NEUTRAL_CONTEXT_PATTERNS.length).toBeGreaterThan(0);
  });
});
