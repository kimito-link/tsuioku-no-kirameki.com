import { describe, it, expect } from 'vitest';
import {
  summarizeCommentRecordBreakdown,
  formatCommentRecordBreakdownLine
} from './commentRecordBreakdown.js';

describe('summarizeCommentRecordBreakdown', () => {
  it('空配列は total:0 を返す', () => {
    const r = summarizeCommentRecordBreakdown([]);
    expect(r).toEqual({
      total: 0,
      normal: 0,
      interestArrival: 0,
      followNotice: 0,
      otherSystem: 0
    });
  });

  it('null / undefined を寛容に扱う', () => {
    const r1 = summarizeCommentRecordBreakdown(/** @type {any} */ (null));
    const r2 = summarizeCommentRecordBreakdown(/** @type {any} */ (undefined));
    expect(r1.total).toBe(0);
    expect(r2.total).toBe(0);
  });

  it('通常コメントだけなら normal === total', () => {
    const r = summarizeCommentRecordBreakdown([
      { text: 'こんばんは' },
      { text: '888' },
      { text: 'おつ' }
    ]);
    expect(r).toEqual({
      total: 3,
      normal: 3,
      interestArrival: 0,
      followNotice: 0,
      otherSystem: 0
    });
  });

  it('興味タグ来場を正しく interestArrival にカウントする', () => {
    const r = summarizeCommentRecordBreakdown([
      { text: 'こんばんは' },
      { text: '「料理」が好きな1人が来場しました' },
      { text: '「雑談」が好きな3人が来場しました' }
    ]);
    expect(r.normal).toBe(1);
    expect(r.interestArrival).toBe(2);
  });

  it('commentType=generalSystemMessage を otherSystem にカウント', () => {
    const r = summarizeCommentRecordBreakdown([
      { text: '普通コメ' },
      { text: '運営: 5分後に終了します', commentType: 'generalSystemMessage' },
      { text: '何か', isSystem: true }
    ]);
    expect(r.normal).toBe(1);
    expect(r.otherSystem).toBe(2);
  });

  it('text 欠落 / 非object も寛容に skip', () => {
    const r = summarizeCommentRecordBreakdown(/** @type {any} */ ([
      null,
      undefined,
      'just a string',
      {},
      { text: 'ok' }
    ]));
    // 配列長は 5 だが、object として処理されるのは {} と { text: 'ok' } の 2件
    expect(r.total).toBe(5); // 配列長は素直に
    expect(r.normal).toBe(2); // {text:''}.normal + {text:'ok'}.normal
  });
});

describe('formatCommentRecordBreakdownLine', () => {
  it('total=0 で空文字', () => {
    expect(
      formatCommentRecordBreakdownLine({
        total: 0,
        normal: 0,
        interestArrival: 0,
        followNotice: 0,
        otherSystem: 0
      })
    ).toBe('');
  });

  it('全部 normal でも「内訳: 通常 N」を表示する(v0.1.628 設計変更・ユーザー納得性)', () => {
    expect(
      formatCommentRecordBreakdownLine({
        total: 100,
        normal: 100,
        interestArrival: 0,
        followNotice: 0,
        otherSystem: 0
      })
    ).toBe('内訳: 通常 100');
  });

  it('興味来場のみ', () => {
    expect(
      formatCommentRecordBreakdownLine({
        total: 5,
        normal: 3,
        interestArrival: 2,
        followNotice: 0,
        otherSystem: 0
      })
    ).toBe('内訳: 通常 3 / 興味来場 2');
  });

  it('全カテゴリ含む', () => {
    expect(
      formatCommentRecordBreakdownLine({
        total: 1001,
        normal: 950,
        interestArrival: 28,
        followNotice: 0,
        otherSystem: 23
      })
    ).toBe('内訳: 通常 950 / 興味来場 28 / システム 23');
  });

  it('1000以上は ja-JP ロケール区切り', () => {
    const line = formatCommentRecordBreakdownLine({
      total: 1500,
      normal: 1450,
      interestArrival: 50,
      followNotice: 0,
      otherSystem: 0
    });
    expect(line).toContain('1,450');
  });

  it('broadcasterCount>0 で「配信者 N」を末尾に表示', () => {
    expect(
      formatCommentRecordBreakdownLine(
        { total: 596, normal: 596, interestArrival: 0, followNotice: 0, otherSystem: 0 },
        { broadcasterCount: 25 }
      )
    ).toBe('内訳: 通常 596 / 配信者 25');
  });

  it('broadcasterCount=0 のとき「配信者」を表示しない', () => {
    expect(
      formatCommentRecordBreakdownLine(
        { total: 100, normal: 100, interestArrival: 0, followNotice: 0, otherSystem: 0 },
        { broadcasterCount: 0 }
      )
    ).toBe('内訳: 通常 100');
  });
});
