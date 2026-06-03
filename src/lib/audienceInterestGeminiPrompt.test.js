import { describe, it, expect } from 'vitest';
import {
  AUDIENCE_INTEREST_SAMPLE_MAX,
  selectAudienceInterestSampleComments,
  buildAudienceInterestGeminiPrompt,
  parseAudienceInterestResult
} from './audienceInterestGeminiPrompt.js';

describe('selectAudienceInterestSampleComments', () => {
  it('空・極端に短い本文を除外し、重複を1件に圧縮する', () => {
    const out = selectAudienceInterestSampleComments([
      { text: 'ゲームうまい' },
      { text: 'ゲームうまい' },
      { text: 'w' },
      { text: '' },
      { text: '   ' },
      { text: '音楽いいね' }
    ]);
    expect(out).toEqual(['ゲームうまい', '音楽いいね']);
  });

  it('PII（nickname/userId）は出力に含めず本文だけ返す', () => {
    const out = selectAudienceInterestSampleComments([
      { text: '配信楽しい', userId: '123', nickname: 'たろう' }
    ]);
    expect(out).toEqual(['配信楽しい']);
    expect(JSON.stringify(out)).not.toContain('123');
    expect(JSON.stringify(out)).not.toContain('たろう');
  });

  it('最大件数で打ち切る', () => {
    const many = Array.from({ length: AUDIENCE_INTEREST_SAMPLE_MAX + 20 }, (_, i) => ({
      text: `コメント番号${i}`
    }));
    const out = selectAudienceInterestSampleComments(many);
    expect(out.length).toBe(AUDIENCE_INTEREST_SAMPLE_MAX);
  });

  it('長すぎる本文は省略記号付きで切り詰める', () => {
    const long = 'あ'.repeat(200);
    const [only] = selectAudienceInterestSampleComments([{ text: long }], {
      maxCharsPerComment: 10
    });
    expect(only.length).toBe(10);
    expect(only.endsWith('…')).toBe(true);
  });
});

describe('buildAudienceInterestGeminiPrompt', () => {
  it('system に「推定」と PII を出さない制約が含まれる', () => {
    const { system } = buildAudienceInterestGeminiPrompt({ sampleComments: ['x'] });
    expect(system).toContain('推定');
    expect(system).toMatch(/性別・年齢/);
    expect(system).toContain('タグ:');
  });

  it('user にサンプル本文と件数が入る', () => {
    const { user } = buildAudienceInterestGeminiPrompt({
      liveId: 'lv123',
      sampleComments: ['ゲーム楽しい', '音楽好き'],
      totalComments: 1000,
      uniqueUsers: 42
    });
    expect(user).toContain('lv123');
    expect(user).toContain('ゲーム楽しい');
    expect(user).toContain('音楽好き');
    expect(user).toContain('1,000');
    expect(user).toContain('42');
  });

  it('サンプル無しのときは推定不可を促す', () => {
    const { user } = buildAudienceInterestGeminiPrompt({ sampleComments: [] });
    expect(user).toContain('推定不可');
  });
});

describe('parseAudienceInterestResult', () => {
  it('タグ行と客層メモ行を構造化する', () => {
    const r = parseAudienceInterestResult(
      'タグ: ゲーム好き, 雑談・癒し系, 実況ネタ\n客層メモ: ゲーム実況を楽しむ常連が中心（推定）'
    );
    expect(r.tags).toEqual(['ゲーム好き', '雑談・癒し系', '実況ネタ']);
    expect(r.note).toContain('（推定）');
  });

  it('全角コロン・読点ゆらぎにも寛容', () => {
    const r = parseAudienceInterestResult('タグ：音楽、アニメ・声優');
    expect(r.tags).toEqual(['音楽', 'アニメ・声優']);
  });

  it('推定不可は除外し最大6個に丸める', () => {
    const r = parseAudienceInterestResult('タグ: 推定不可, a, b, c, d, e, f, g');
    expect(r.tags).not.toContain('推定不可');
    expect(r.tags.length).toBeLessThanOrEqual(6);
  });

  it('空入力で安全に空を返す', () => {
    expect(parseAudienceInterestResult('')).toEqual({ tags: [], note: '' });
  });
});
