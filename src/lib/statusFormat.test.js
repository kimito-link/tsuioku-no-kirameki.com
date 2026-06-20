import { describe, it, expect } from 'vitest';
import {
  buildOverviewText,
  buildLiveBlockText,
  buildBackfillProgressLine,
  buildCaptureRateLine,
  buildLaneStatusLine,
  sumRecordedFromLives,
  formatElapsed,
  formatAgo
} from './statusFormat.js';

describe('buildLaneStatusLine (v0.1.766 概要にレーン状況)', () => {
  it('出ているレーンは ✅件数、取得中は ⏳、無し(no_event/no_program_gift)は省く', () => {
    const lanes = {
      '1_貢献度ランキング': { state: 'ok', count: 10 },
      '+α_広告ランキング': { state: 'ok', count: 0, foundCountLifetime: 0 },
      '2_ギフト履歴': { state: 'no_program_gift', count: 0 },
      '4_番組累計ポイント': { state: 'ok', ndgrValue: 3350 },
      '3_イベント累計スコア': { state: 'no_event', value: null },
      '5_イベント現在順位': { state: 'iframe_unrendered', value: null }
    };
    const line = buildLaneStatusLine(lanes);
    expect(line).toContain('公式値レーン:');
    expect(line).toContain('貢献度:✅10');
    expect(line).toContain('番組pt:✅3350');
    expect(line).toContain('E順位:⏳取得中');
    expect(line).toContain('広告:空'); // ok だが 0=空
    // この配信に無し(no_event/no_program_gift)はノイズにせず省く。
    expect(line).not.toContain('ギフト履歴');
    expect(line).not.toContain('Eスコア');
  });

  it('全部「この配信に無し」なら空文字(概要を散らかさない)', () => {
    const lanes = {
      '3_イベント累計スコア': { state: 'no_event' },
      '5_イベント現在順位': { state: 'no_event' },
      '2_ギフト履歴': { state: 'no_program_gift' }
    };
    expect(buildLaneStatusLine(lanes)).toBe('');
  });

  it('レーンが「取得中」で揃っている=出ていない時が一目で分かる', () => {
    const lanes = {
      '1_貢献度ランキング': { state: 'iframe_unrendered' },
      '+α_広告ランキング': { state: 'iframe_unrendered' }
    };
    const line = buildLaneStatusLine(lanes);
    expect(line).toBe('公式値レーン: 貢献度:⏳取得中 / 広告:⏳取得中');
  });

  it('null/不正/空オブジェクトは空文字(fail-safe)', () => {
    expect(buildLaneStatusLine(null)).toBe('');
    expect(buildLaneStatusLine(undefined)).toBe('');
    expect(buildLaneStatusLine({})).toBe('');
    expect(buildLaneStatusLine('x')).toBe('');
  });

  it('想定外の state はそのまま ⚠ 付きで出す(気づけるように)', () => {
    const line = buildLaneStatusLine({ '1_貢献度ランキング': { state: 'weird_new_state' } });
    expect(line).toContain('貢献度:⚠weird_new_state');
  });

  it('v0.1.844: apiRows(Koken/Nicoad実数)を最優先=DOM空でも API取得済なら ✅件数(「空」誤報の根治)', () => {
    // 実機 lv350792705: autoOpen 未発火で DOM bundle 長(count)=0 だが Koken API は13行取得済。
    // 旧実装は count/foundCountLifetime しか見ず ✅0→「空」と誤報した。apiRows を n に入れて実数表示。
    const lanes = {
      '1_貢献度ランキング': { state: 'ok', count: 0, apiRows: 13, foundCountLifetime: 0 },
      '+α_広告ランキング': { state: 'ok', count: 0, apiRows: 10, foundCountLifetime: 0 }
    };
    const line = buildLaneStatusLine(lanes);
    expect(line).toContain('貢献度:✅13');
    expect(line).toContain('広告:✅10');
    expect(line).not.toContain('空');
  });

  it('v0.1.844: apiRows も count も 0 なら従来どおり「空」(API も DOM も来ていない)', () => {
    const line = buildLaneStatusLine({
      '1_貢献度ランキング': { state: 'ok', count: 0, apiRows: 0, foundCountLifetime: 0 }
    });
    expect(line).toBe('公式値レーン: 貢献度:空');
  });
});

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

  // v0.1.804: enumerate の一瞬の揺れで累計だけが後退するのを床(recordedSumFloor)で止める。
  it('opts.recordedSumFloor が実合算より大きいとき累計を床で据え置く', () => {
    const lives = [{ recordedCount: 40, officialCommentCount: 0 }];
    // 実合算 40 だが直近の床 150 → 累計は 150 のまま据え置き(後退させない)。
    expect(buildOverviewText(lives, { recordedSumFloor: 150 })).toBe(
      '記録中 1 配信 / 累計 記録 150 件'
    );
  });
  it('実合算が床を上回れば実値を出す(床は伸びる側には効かない)', () => {
    const lives = [{ recordedCount: 200, officialCommentCount: 0 }];
    expect(buildOverviewText(lives, { recordedSumFloor: 150 })).toBe(
      '記録中 1 配信 / 累計 記録 200 件'
    );
  });
  it('床は取得率の分母(公式)には影響しない=取得率は実合算ベース', () => {
    const lives = [{ recordedCount: 40, officialCommentCount: 80 }];
    // 累計表示は床 100 に据え置くが、取得率は床込みの 100/80 で計算する(表示の一貫性)。
    const text = buildOverviewText(lives, { recordedSumFloor: 100 });
    expect(text).toContain('累計 記録 100 件');
    expect(text).toContain('公式累計 80 件');
  });
  it('opts 省略は従来どおり(後方互換・床なし)', () => {
    const lives = [{ recordedCount: 10, officialCommentCount: 0 }];
    expect(buildOverviewText(lives)).toBe('記録中 1 配信 / 累計 記録 10 件');
  });
});

describe('sumRecordedFromLives (v0.1.804 累計床の計算用純関数)', () => {
  it('recordedCount を合算する', () => {
    expect(
      sumRecordedFromLives([{ recordedCount: 7 }, { recordedCount: 88 }])
    ).toBe(95);
  });
  it('recordedCount 欠落・null 要素は 0 扱い', () => {
    expect(sumRecordedFromLives([{ recordedCount: 5 }, {}, null])).toBe(5);
  });
  it('非配列/空は 0', () => {
    expect(sumRecordedFromLives([])).toBe(0);
    expect(sumRecordedFromLives(null)).toBe(0);
    expect(sumRecordedFromLives(undefined)).toBe(0);
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

  it('v0.1.791: 放送中(endedAt無し)の40%未満は ⏳ 追いつき中(過去ログ取得中の正常状態)', () => {
    // 配信中の低%は、過去ログを遡って取得中(バックフィル)の途中=異常でない。
    expect(
      buildCaptureRateLine({ recordedCount: 97, officialCommentCount: 557, officialRatePct: 17 })
    ).toBe('⏳ 追いつき中 17% (記録 97 / 公式 557)・過去のコメントを取得中');
  });

  it('🔴退行検出: 放送終了済み(endedAtあり)の40%未満は 🔴 取得中(本当の取りこぼし)', () => {
    expect(
      buildCaptureRateLine({
        recordedCount: 1469,
        officialCommentCount: 9390,
        officialRatePct: 16,
        endedAt: 1781631782697
      })
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

  // v0.1.794: 進捗キーが null(走行中/完走前)でも記録中なら「取り込み中…」を出すフォールバック。
  it('bp=null でも catchingUp=true なら「取り込み中…」を出す（status と popup の対称化）', () => {
    expect(buildBackfillProgressLine(null, { catchingUp: true })).toBe(
      '過去ログ取得: 取り込み中…（過去のコメントをさかのぼって取得しています）'
    );
    expect(buildBackfillProgressLine(undefined, { catchingUp: true })).toBe(
      '過去ログ取得: 取り込み中…（過去のコメントをさかのぼって取得しています）'
    );
  });

  it('bp=null で catchingUp=false なら従来どおり空（記録していない時に湧かせない）', () => {
    expect(buildBackfillProgressLine(null, { catchingUp: false })).toBe('');
    expect(buildBackfillProgressLine(null, {})).toBe('');
    expect(buildBackfillProgressLine(null)).toBe(''); // opts 省略=後方互換
  });

  it('実 bp があれば catchingUp に関係なく実 bp の行を優先（フォールバックに化けない）', () => {
    expect(
      buildBackfillProgressLine({ lid: 'lv5', rows: 99, done: 0 }, { catchingUp: true })
    ).toBe('過去ログ取得: [lv5] 取得中・取得99件');
  });
});
