import { describe, it, expect } from 'vitest';
import { ytWording } from './ytWording.js';

describe('ytWording', () => {
  it('rewrites the gift-contribution lane for YouTube top fans', () => {
    expect(ytWording('公式の貢献度ランキング（niconico の表示に準拠）')).toBe('YouTube 公式のトップファン（XP の順位）');
    expect(ytWording('ギフト貢献度')).toBe('トップファン');
    expect(ytWording('410貢')).toBe('410 XP');
    expect(ytWording('1,250 貢')).toBe('1,250 XP');
    expect(ytWording('ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。')).toMatch(/^YouTube のトップファン/);
  });
  it('leaves other text alone', () => {
    expect(ytWording('ニコニコ大好き')).toBe('ニコニコ大好き');
    expect(ytWording('こんにちは')).toBe('こんにちは');
    expect(ytWording('')).toBe('');
  });
});

describe('ytWording のスパチャ合計順', () => {
  it('トップファンが無いときは XP でなく pt にする', async () => {
    const { ytWording } = await import('./ytWording.js');
    expect(ytWording('15800貢', { topFans: false })).toBe('15800 pt');
    expect(ytWording('ギフト貢献度', { topFans: false })).toBe('スパチャの合計順');
    expect(ytWording('15800貢')).toBe('15800 XP');
  });
});

describe('ytWordingTopFanToSuperChatRank', () => {
  it('トップファンの言葉をスパチャの合計順に戻す', async () => {
    const { ytWordingTopFanToSuperChatRank } = await import('./ytWording.js');
    expect(ytWordingTopFanToSuperChatRank('トップファン')).toBe('スパチャの合計順');
    expect(ytWordingTopFanToSuperChatRank('15800 XP')).toBe('15800 pt');
    expect(ytWordingTopFanToSuperChatRank('こんにちは')).toBe('こんにちは');
  });
});

describe('niconico だけの文', () => {
  it('ニコ を含まなくても直す', async () => {
    const { ytWording } = await import('./ytWording.js');
    expect(ytWording('サムネ・名前は数値ID時のみ niconico ユーザーページへリンクします(共有モードでは非表示)。')).toBe('サムネ・名前は YouTube のチャンネルへリンクします(共有モードでは非表示)。');
  });
});
