import { describe, it, expect } from 'vitest';
import {
  buildOverviewText,
  buildLiveBlockText,
  formatElapsed,
  formatAgo
} from './statusFormat.js';

describe('formatElapsed', () => {
  it('h:mm:ss を 1 時間以上で出す', () => {
    expect(formatElapsed(3661)).toBe('1:01:01');
  });
  it('m:ss を 1 時間未満で出す', () => {
    expect(formatElapsed(125)).toBe('2:05');
  });
  it('不正値は ?', () => {
    expect(formatElapsed(null)).toBe('?');
    expect(formatElapsed(-1)).toBe('?');
    expect(formatElapsed(NaN)).toBe('?');
  });
});

describe('formatAgo', () => {
  it('60秒未満は秒', () => {
    expect(formatAgo(5000)).toBe('5秒');
  });
  it('1時間未満は分', () => {
    expect(formatAgo(120_000)).toBe('2分');
  });
  it('1時間以上は時間', () => {
    expect(formatAgo(7_200_000)).toBe('2時間');
  });
  it('不正値は ?', () => {
    expect(formatAgo(null)).toBe('?');
    expect(formatAgo(-1)).toBe('?');
  });
});

describe('buildOverviewText', () => {
  it('空配列は空文字', () => {
    expect(buildOverviewText([])).toBe('');
  });
  it('記録中行 + 公式累計行(取得率)', () => {
    const lives = [
      { recordedCount: 100, officialCommentCount: 80 },
      { recordedCount: 50, officialCommentCount: 70 }
    ];
    expect(buildOverviewText(lives)).toBe(
      '記録中 2 配信 / 累計 記録 150 件\n公式累計 150 件 (取得率 100%)'
    );
  });
  it('公式が 0 のときは公式行を出さない', () => {
    const lives = [{ recordedCount: 10, officialCommentCount: 0 }];
    expect(buildOverviewText(lives)).toBe('記録中 1 配信 / 累計 記録 10 件');
  });
});

describe('buildLiveBlockText', () => {
  it('全項目そろったブロック', () => {
    const live = {
      lv: 'lv123',
      broadcasterName: 'だるまくん',
      title: 'カレー準備',
      elapsedSec: 3661,
      recordedCount: 5255,
      officialCommentCount: 5205,
      officialRatePct: 101,
      watchCount: 3234,
      adPoints: 19400,
      giftPoints: 6020,
      lastIngestAgoMs: 5000
    };
    expect(buildLiveBlockText(live)).toBe(
      '[lv123] だるまくん ・ 経過 1:01:01\n' +
        '  「カレー準備」\n' +
        '  記録 5,255 / 公式 5,205 (取得率 101%)\n' +
        '  来場 3,234 人\n' +
        '  広告 19,400pt / ギフト 6,020pt\n' +
        '  最終取り込み 5秒前'
    );
  });
  it('配信者名が無いときは (配信者名 不明)', () => {
    const live = { lv: 'lv9', broadcasterName: '', recordedCount: 1 };
    expect(buildLiveBlockText(live)).toBe('[lv9] (配信者名 不明)\n  記録 1');
  });
});
