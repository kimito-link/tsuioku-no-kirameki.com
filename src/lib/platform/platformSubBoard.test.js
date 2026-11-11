import { describe, it, expect } from 'vitest';
import {
  normalizeSubBoardPayload,
  subBoardToNicoadApiValue,
  subBoardLaneWording,
  subBoardCelebrationWording,
  subBoardSig,
} from './platformSubBoard.js';

describe('normalizeSubBoardPayload', () => {
  it('壊れた行だけ捨て、順位を詰め直す', () => {
    const b = normalizeSubBoardPayload({
      title: 'ギフトサブ ランキング',
      unit: 'サブ',
      period: 'week',
      rows: [{ name: 'a', xp: 10 }, { name: '', xp: 5 }, { name: 'b', xp: 0 }, { name: 'c', xp: 3, iconUrl: 'javascript:x' }],
    });
    expect(b).toEqual({
      title: 'ギフトサブ ランキング',
      unit: 'サブ',
      period: 'WEEK',
      rows: [
        { rank: 1, name: 'a', xp: 10, iconUrl: '' },
        { rank: 2, name: 'c', xp: 3, iconUrl: '' },
      ],
    });
  });
  it('題が無い・行が無いときは置かない', () => {
    expect(normalizeSubBoardPayload({ rows: [{ name: 'a', xp: 1 }] })).toBeNull();
    expect(normalizeSubBoardPayload({ title: 'x', rows: [] })).toBeNull();
    expect(normalizeSubBoardPayload(null)).toBeNull();
  });
});

describe('subBoardToNicoadApiValue', () => {
  it('popup の広告ランキングの読みの形(数字IDなし・数はそのまま)', () => {
    const v = subBoardToNicoadApiValue(
      { capturedAt: 5, rows: [{ rank: 1, name: 'a', xp: 12, iconUrl: '' }] },
      'LV900000000001',
      (n) => (n === 'a' ? 'https://x/a.png' : ''),
    );
    expect(v).toEqual({
      liveId: 'lv900000000001',
      capturedAt: 5,
      lastOk: true,
      lastStatus: 200,
      source: 'platform-sub-board',
      rows: [{ rank: 1, name: 'a', contribution: 12, isAnonymous: false, thumbnailUrl: 'https://x/a.png' }],
    });
    expect(v?.rows[0]).not.toHaveProperty('userPageUrl');
  });
  it('行が無ければ null', () => {
    expect(subBoardToNicoadApiValue({ rows: [] }, 'lv1')).toBeNull();
    expect(subBoardToNicoadApiValue(undefined, 'lv1')).toBeNull();
  });
});

describe('subBoardLaneWording', () => {
  const p = { name: 'Twitch' };
  const board = { title: 'ギフトサブ ランキング', unit: 'サブ', period: 'WEEK' };
  it('見出し・説明・数の単位をその順位表の言葉に', () => {
    expect(subBoardLaneWording('広告ランキング', p, board)).toBe('ギフトサブ ランキング');
    expect(subBoardLaneWording('ニコニ広告の貢献度ランキングです（ギフト貢献度とは別系統）。', p, board)).toBe(
      'Twitch 公式のギフトサブ ランキングです（今週・Twitch のページと同じ値）。',
    );
    expect(
      subBoardLaneWording('ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります', p, board),
    ).toBe('Twitch 公式のギフトサブ ランキング（今週）。数は Twitch が出している値そのままです');
    expect(subBoardLaneWording('ニコニ広告の貢献度ランキングです（Bits ランキングとは別系統）。', p, board)).toBe(
      'Twitch 公式のギフトサブ ランキングです（今週・Twitch のページと同じ値）。',
    );
    expect(subBoardLaneWording('1234貢', p, board)).toBe('1,234 サブ');
    expect(subBoardLaneWording('一覧の「貢」合計', p, board)).toBe('一覧の合計');
  });
  it('関係ない文字(人の名前など)は変えない', () => {
    expect(subBoardLaneWording('しお漬け', p, board)).toBe('しお漬け');
    expect(subBoardLaneWording('貢献', p, board)).toBe('貢献');
  });
});

describe('subBoardCelebrationWording', () => {
  it('広告主のお祝いを順位表の言葉に', () => {
    const b = { title: 'ギフトサブ ランキング' };
    expect(subBoardCelebrationWording('最初の広告主さんがランキングに登場！', b)).toBe('ギフトサブ ランキングに最初の人が登場！');
    expect(subBoardCelebrationWording('広告主 10 人目がランキングに！', b)).toBe('ギフトサブ ランキングに 10 人目が登場！');
    expect(subBoardCelebrationWording('こんにちは', b)).toBe('こんにちは');
  });
});

describe('subBoardSig', () => {
  it('中身が同じなら同じ印', () => {
    const a = { title: 't', unit: 'u', period: '', rows: [{ name: 'a', xp: 1 }] };
    expect(subBoardSig(a)).toBe(subBoardSig({ ...a }));
    expect(subBoardSig(a)).not.toBe(subBoardSig({ ...a, rows: [{ name: 'a', xp: 2 }] }));
  });
});
