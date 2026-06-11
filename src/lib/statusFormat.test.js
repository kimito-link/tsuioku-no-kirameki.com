import { describe, it, expect } from 'vitest';
import {
  buildOverviewText,
  buildLiveBlockText,
  buildBackfillProgressLine,
  buildCaptureRateLine,
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
        '  ✅ 取得完了 101% (記録 5,255 / 公式 5,205)\n' +
        '  来場 3,234 人\n' +
        '  広告 19,400pt / ギフト 6,020pt\n' +
        '  最終取り込み 5秒前'
    );
  });
  it('配信者名が無いときは (配信者名 不明)', () => {
    const live = { lv: 'lv9', broadcasterName: '', recordedCount: 1 };
    expect(buildLiveBlockText(live)).toBe('[lv9] (配信者名 不明)\n  記録 1');
  });
  it('endedAt があると見出しに ⚠ 終了 が付く', () => {
    const live = { lv: 'lv9', broadcasterName: 'A', recordedCount: 1, endedAt: 1700 };
    expect(buildLiveBlockText(live)).toBe('⚠ 終了 [lv9] A\n  記録 1');
  });
});

describe('buildCaptureRateLine（%主役・状態ラベル）', () => {
  it('100%以上は ✅ 取得完了', () => {
    expect(
      buildCaptureRateLine({ recordedCount: 7104, officialCommentCount: 7050, officialRatePct: 101 })
    ).toBe('✅ 取得完了 101% (記録 7,104 / 公式 7,050)');
    expect(
      buildCaptureRateLine({ recordedCount: 100, officialCommentCount: 100, officialRatePct: 100 })
    ).toBe('✅ 取得完了 100% (記録 100 / 公式 100)');
  });

  it('80〜99%は 🟢 ほぼ取得', () => {
    expect(
      buildCaptureRateLine({ recordedCount: 85, officialCommentCount: 100, officialRatePct: 85 })
    ).toBe('🟢 ほぼ取得 85% (記録 85 / 公式 100)');
  });

  it('40〜79%は 🟡 取得中', () => {
    expect(
      buildCaptureRateLine({ recordedCount: 50, officialCommentCount: 100, officialRatePct: 50 })
    ).toBe('🟡 取得中 50% (記録 50 / 公式 100)');
  });

  it('🔴退行検出: 40%未満は 🔴 取得中(公式16%等が赤く目立つ)', () => {
    expect(
      buildCaptureRateLine({ recordedCount: 1469, officialCommentCount: 9390, officialRatePct: 16 })
    ).toBe('🔴 取得中 16% (記録 1,469 / 公式 9,390)');
  });

  it('取得率が無い(公式未取得)ときは件数のみ', () => {
    expect(buildCaptureRateLine({ recordedCount: 5 })).toBe('記録 5');
    expect(
      buildCaptureRateLine({ recordedCount: 5, officialCommentCount: 100, officialRatePct: null })
    ).toBe('記録 5 / 公式 100');
  });
});

describe('buildBackfillProgressLine（v0.1.692 過去ログ取得の診断行）', () => {
  it('lid が無ければ空文字（行を出さない）', () => {
    expect(buildBackfillProgressLine(null)).toBe('');
    expect(buildBackfillProgressLine(undefined)).toBe('');
    expect(buildBackfillProgressLine({})).toBe('');
    expect(buildBackfillProgressLine({ lid: '' })).toBe('');
  });

  it('取得中(done=0)・停止理由なしは従来どおりの行', () => {
    expect(buildBackfillProgressLine({ lid: 'lv123', rows: 42, done: 0 })).toBe(
      '過去ログ取得: [lv123] 取得中・取得42件'
    );
  });

  it('完了+停止理由は併記（v0.1.659 従来表示と同一）', () => {
    expect(
      buildBackfillProgressLine({ lid: 'lv123', rows: 0, done: 1, stopReason: 'aborted' })
    ).toBe('過去ログ取得: [lv123] 完了・取得0件・停止理由=aborted');
  });

  it('errMsg があれば「・エラー: ...」を追記（aborted 真因の見える化）', () => {
    expect(
      buildBackfillProgressLine({
        lid: 'lv123',
        rows: 0,
        done: 1,
        stopReason: 'aborted',
        errMsg: 'TypeError: Failed to fetch'
      })
    ).toBe(
      '過去ログ取得: [lv123] 完了・取得0件・停止理由=aborted・エラー: TypeError: Failed to fetch'
    );
  });

  it('errMsg が空文字なら追記しない', () => {
    expect(
      buildBackfillProgressLine({ lid: 'lv9', rows: 5, done: 1, stopReason: 'reached_start', errMsg: '' })
    ).toBe('過去ログ取得: [lv9] 完了・取得5件・停止理由=reached_start');
  });
});
